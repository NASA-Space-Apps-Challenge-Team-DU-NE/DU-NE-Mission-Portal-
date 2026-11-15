"""PDS3 라벨(.lbl)·이미지(.img) 읽기와 극평사 DEM 표본기."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from luna.constants import R_MOON_M
from luna.geo.crs import CrsInfo, from_pds_label
from luna.geo.polar import stereo_forward, stereo_inverse

_UNIT = re.compile(r"^(.*?)\s*<([^>]*)>\s*$")


def _parse_value(v: str):
    v = v.strip()
    if v.startswith('"') and v.endswith('"'):
        return v[1:-1].strip()
    if v.startswith("(") and v.endswith(")"):
        return [_parse_value(x) for x in v[1:-1].split(",")]
    m = _UNIT.match(v)
    if m:
        num = _parse_value(m.group(1))
        return {"value": num, "unit": m.group(2).strip().upper()} if isinstance(num, (int, float)) else num
    try:
        if re.fullmatch(r"[-+]?\d+", v):
            return int(v)
        return float(v)
    except ValueError:
        return v.strip("'")


def parse_label(text: str) -> dict:
    """KEY = VALUE, OBJECT/GROUP 중첩, 여러 줄 값(괄호·따옴표)을 지원하는 간단한 PDS3 파서."""
    root: dict = {}
    stack = [root]
    lines = text.replace("\r", "").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].split("/*", 1)[0].rstrip()
        i += 1
        if not line.strip() or "=" not in line:
            if line.strip() == "END":
                break
            continue
        key, val = (s.strip() for s in line.split("=", 1))
        # 여러 줄 값
        while (val.count('"') % 2 == 1) or (val.count("(") > val.count(")")):
            if i >= len(lines):
                break
            val += " " + lines[i].strip()
            i += 1
        if key in ("OBJECT", "GROUP"):
            child: dict = {}
            name = val.strip()
            cur = stack[-1]
            if name in cur:  # 같은 이름 객체가 여러 개면 목록으로
                if not isinstance(cur[name], list):
                    cur[name] = [cur[name]]
                cur[name].append(child)
            else:
                cur[name] = child
            stack.append(child)
        elif key in ("END_OBJECT", "END_GROUP"):
            if len(stack) > 1:
                stack.pop()
        else:
            stack[-1][key] = _parse_value(val)
    return root


def num(v) -> float:
    return float(v["value"]) if isinstance(v, dict) else float(v)


def unit(v) -> str:
    return v.get("unit", "") if isinstance(v, dict) else ""


@dataclass
class PdsImage:
    label: dict
    data: np.ndarray  # 원래 DN (memmap)
    scale: float
    offset: float
    crs: CrsInfo

    def heights_m(self, rows, cols) -> np.ndarray:
        dn = self.data[rows, cols].astype(np.float64)
        return dn * self.scale + self.offset


def _find_object(d: dict, name: str) -> tuple[dict | None, dict]:
    """중첩 OBJECT 안의 IMAGE 도 찾는다 (예: UNCOMPRESSED_FILE 안의 IMAGE). (객체, 그 객체를 담은 dict)"""
    if isinstance(d.get(name), dict):
        return d[name], d
    for v in d.values():
        if isinstance(v, dict):
            o, h = _find_object(v, name)
            if o is not None:
                return o, h
    return None, d


def _sibling(label_path: Path, name: str) -> Path:
    """라벨에 적힌 파일 이름(대문자일 수 있음)을 실제 파일과 대소문자 무시로 맞춘다."""
    p = label_path.with_name(name)
    if p.exists():
        return p
    for q in label_path.parent.iterdir():
        if q.name.lower() == name.lower():
            return q
    return p


def read_pds_image(label_path: Path, image_path: Path | None = None) -> PdsImage:
    with label_path.open("rb") as fh:  # 라벨이 이미지에 붙어 있는 경우를 위해 앞부분만 읽는다
        head = fh.read(256 * 1024).decode("latin-1")
    label = parse_label(head.split("\nEND\r\n", 1)[0].split("\nEND\n", 1)[0])
    img, holder = _find_object(label, "IMAGE")
    if not isinstance(img, dict):
        raise ValueError(f"IMAGE 객체가 없다: {label_path.name}")
    lines_, samples = int(img["LINES"]), int(img["LINE_SAMPLES"])
    bits = int(img.get("SAMPLE_BITS", 16))
    stype = str(img.get("SAMPLE_TYPE", "LSB_INTEGER")).upper()
    if "REAL" in stype or "FLOAT" in stype:
        dtype = np.dtype("<f4" if bits == 32 else "<f8") if "PC" in stype or "LSB" in stype else np.dtype(">f4")
    else:
        signed = "UNSIGNED" not in stype
        base = {8: "i1", 16: "i2", 32: "i4"}[bits]
        base = base if signed else base.replace("i", "u")
        dtype = np.dtype(("<" if ("LSB" in stype or "PC" in stype) else ">") + base)
    ptr = holder.get("^IMAGE", label.get("^IMAGE"))
    offset_bytes = 0
    if isinstance(ptr, list):
        fname, rec = ptr[0], ptr[1]
        offset_bytes = (num(rec) - 1) * int(label.get("RECORD_BYTES", 1)) if unit(rec) != "BYTES" else num(rec) - 1
        image_path = image_path or _sibling(label_path, str(fname))
    elif isinstance(ptr, str):
        image_path = image_path or _sibling(label_path, ptr)
    elif isinstance(ptr, (int, float, dict)):
        offset_bytes = (num(ptr) - 1) * int(label.get("RECORD_BYTES", 1)) if unit(ptr) != "BYTES" else num(ptr) - 1
        image_path = image_path or label_path
    if image_path is None:
        raise ValueError("^IMAGE 포인터를 해석하지 못했다")
    data = np.memmap(image_path, dtype=dtype, mode="r", offset=int(offset_bytes), shape=(lines_, samples))
    scale = float(img.get("SCALING_FACTOR", 1.0))
    off = num(img.get("OFFSET", 0.0))
    # LOLA: OFFSET 이 반지름(1737400 m)이면 DN·scale 자체가 구면 기준 고도
    if abs(off - R_MOON_M) < 1.0:
        off = 0.0
    return PdsImage(label, data, scale, off, from_pds_label(label))


class PolarPdsSampler:
    """극평사 PDS DEM 쌍선형 표본기. 범위 밖은 NaN.

    픽셀 ↔ 평면 규칙 (PDS 극평사 관례, P01b 에서 라벨 주석과 대조):
        x = (sample − SAMPLE_PROJECTION_OFFSET − 1)·scale,  y = (1 − line + LINE_PROJECTION_OFFSET)·scale  (1 기준)
        경도 = CENTER_LONGITUDE + atan2(x, y)
    """

    def __init__(self, img: PdsImage):
        mp = img.label["IMAGE_MAP_PROJECTION"]
        self.img = img
        self.r_km = num(mp["A_AXIS_RADIUS"])
        if unit(mp["A_AXIS_RADIUS"]) in ("M", "METER", "METERS"):
            self.r_km /= 1000.0
        s = num(mp["MAP_SCALE"])
        u = unit(mp["MAP_SCALE"])
        # MAP_SCALE 단위: <m/pix>, <METERS/PIXEL>, <KM/PIXEL> 등
        self.scale_km = s if u.startswith("KM") else s / 1000.0 if u.startswith("M") else s
        self.s0 = num(mp["SAMPLE_PROJECTION_OFFSET"])
        self.l0 = num(mp["LINE_PROJECTION_OFFSET"])
        self.lon0 = num(mp["CENTER_LONGITUDE"])
        self.lines, self.samples = img.data.shape

    def latlon_to_pix(self, lat, lon):
        x, y = stereo_forward(lat, lon, self.lon0, self.r_km)
        col = x / self.scale_km + self.s0  # 0 기준 = sample − 1
        row = self.l0 - y / self.scale_km  # 0 기준 = line − 1
        return row, col

    def pix_to_latlon(self, row, col):
        x = (np.asarray(col) - self.s0) * self.scale_km
        y = (self.l0 - np.asarray(row)) * self.scale_km
        return stereo_inverse(x, y, self.lon0, self.r_km)

    def __call__(self, lat, lon) -> np.ndarray:
        row, col = self.latlon_to_pix(np.asarray(lat, float), np.asarray(lon, float))
        r0 = np.floor(row).astype(np.int64)
        c0 = np.floor(col).astype(np.int64)
        ok = (r0 >= 0) & (c0 >= 0) & (r0 < self.lines - 1) & (c0 < self.samples - 1)
        out = np.full(np.shape(row), np.nan)
        if ok.any():
            rr, cc = r0[ok], c0[ok]
            fr, fc = row[ok] - rr, col[ok] - cc
            h = self.img.heights_m
            v = (h(rr, cc) * (1 - fr) * (1 - fc) + h(rr + 1, cc) * fr * (1 - fc) + h(rr, cc + 1) * (1 - fr) * fc + h(rr + 1, cc + 1) * fr * fc)
            out[ok] = v
        return out
