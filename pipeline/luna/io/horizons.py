"""JPL Horizons API 클라이언트 (관측자 표, 캐시).

요청: 대상 달(301), 관측자 지구 중심(500@399), 1 h 간격.
  QUANTITIES 14 = 관측자(지구) 직하점 경·위도, 15 = 태양 직하점 경·위도, 19 = 태양–달 거리 r, 20 = 지구–달 거리 delta.
직하점 경위도는 Horizons 의 달 고정 프레임 기준이다. 응답 머리말에서 좌표계 표기를 읽어 provenance 에 남기고,
ME(평균 지구-극) 이 아니면 s10 이 멈춘다 (CLAUDE.md 4.6). 경도 방향도 머리말로 확인한다.
API 문서: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from luna.constants import AU_KM

API = "https://ssd.jpl.nasa.gov/api/horizons.api"


@dataclass
class HorizonsTable:
    times_utc: list[str]
    sun_lon: np.ndarray
    sun_lat: np.ndarray
    sun_dist_km: np.ndarray
    earth_lon: np.ndarray
    earth_lat: np.ndarray
    earth_dist_km: np.ndarray
    header: str
    frame_note: str
    lon_note: str


def build_params(start: str, stop: str, step: str) -> dict[str, str]:
    return {
        "format": "json",
        "COMMAND": "'301'",
        "CENTER": "'500@399'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'14,15,19,20'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "CAL_FORMAT": "'CAL'",
        "TIME_DIGITS": "'MINUTES'",
        "TIME_TYPE": "'UT'",
        "EXTRA_PREC": "'YES'",
        "OBJ_DATA": "'NO'",
    }


def fetch(params: dict[str, str], cache_dir: Path, retries: int = 3) -> str:
    import requests

    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:24]
    f = cache_dir / f"horizons_{key}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))["result"]
    last = None
    for i in range(retries):
        try:
            r = requests.get(API, params=params, timeout=120)
            r.raise_for_status()
            js = r.json()
            if "error" in js:
                raise RuntimeError(js["error"])
            f.write_text(json.dumps({"params": params, "result": js["result"]}), encoding="utf-8")
            return js["result"]
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"Horizons 요청 실패: {last}")


def _num(s: str) -> float:
    s = s.strip()
    return float(s) if s and s.lower() not in ("n.a.", "n/a") else np.nan


def parse_result(text: str) -> HorizonsTable:
    if "$$SOE" not in text:
        raise ValueError("Horizons 응답에 $$SOE 가 없다 (요청 오류일 수 있음):\n" + text[:800])
    head, rest = text.split("$$SOE", 1)
    body = rest.split("$$EOE", 1)[0]
    # 열 이름 줄: $$SOE 바로 위의 CSV 머리줄
    hdr_line = [ln for ln in head.strip().splitlines() if "Date" in ln and "," in ln][-1]
    cols = [c.strip() for c in hdr_line.split(",")]

    def idx(pattern: str) -> int:
        for i, c in enumerate(cols):
            if re.search(pattern, c, re.I):
                return i
        raise KeyError(f"열 '{pattern}' 없음: {cols}")

    i_t = idx(r"^Date")
    i_olon, i_olat = idx(r"ObsSub-?LON"), idx(r"ObsSub-?LAT")
    i_slon, i_slat = idx(r"SunSub-?LON"), idx(r"SunSub-?LAT")
    i_r, i_d = idx(r"^r$"), idx(r"^delta$")
    t, ol, ob, sl, sb, rr, dd = [], [], [], [], [], [], []
    for ln in body.strip().splitlines():
        p = [x.strip() for x in ln.split(",")]
        if len(p) < len(cols) - 1:
            continue
        t.append(p[i_t])
        ol.append(_num(p[i_olon])); ob.append(_num(p[i_olat]))
        sl.append(_num(p[i_slon])); sb.append(_num(p[i_slat]))
        rr.append(_num(p[i_r])); dd.append(_num(p[i_d]))
    # 예: "Target pole/equ : MOON_ME  {East-longitude positive}"
    tp = re.search(r"Target pole/equ\s*:\s*(\S+)\s*(\{[^}]*\})?", head)
    frame = tp.group(1) if tp else " ".join(sorted(set(re.findall(r"[^\n]*(?:mean[- ]Earth|ME frame|IAU_MOON|principal[- ]axis)[^\n]*", head, re.I))))[:400]
    lon_note = (tp.group(2) or "").strip("{}") if tp else " ".join(sorted(set(re.findall(r"[^\n]*(?:east-longitude positive|west-longitude positive)[^\n]*", head, re.I))))[:400]
    return HorizonsTable(
        times_utc=t,
        sun_lon=np.array(sl), sun_lat=np.array(sb), sun_dist_km=np.array(rr) * AU_KM,
        earth_lon=np.array(ol), earth_lat=np.array(ob), earth_dist_km=np.array(dd) * AU_KM,
        header=head[-3000:], frame_note=frame, lon_note=lon_note,
    )


def horizons_time_to_iso(s: str) -> str:
    """'2026-Nov-01 00:00' → '2026-11-01T00:00:00Z'."""
    from datetime import datetime

    s = s.strip().lstrip("b").strip()
    for fmt in ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    raise ValueError(f"시각 형식 모름: {s}")
