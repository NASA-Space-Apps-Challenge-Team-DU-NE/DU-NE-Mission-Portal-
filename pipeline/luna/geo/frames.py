"""MOON_ME 위경도·벡터·국지 좌표계, 경도 범위 통일, PA → ME 변환 (CLAUDE.md 4.6, 8.2)."""

from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np

from luna.constants import R_MOON_KM


def norm_lon(lon):
    """경도 → (−180, 180]. 스칼라·배열 모두."""
    a = np.asarray(lon, dtype=float)
    out = (a + 180.0) % 360.0 - 180.0
    out = np.where(out == -180.0, 180.0, out)
    return float(out) if np.ndim(out) == 0 else out


def detect_lon_convention(lons) -> str:
    a = np.asarray(lons, dtype=float)
    a = a[np.isfinite(a)]
    if a.size == 0:
        return "unknown"
    if a.min() >= 0 and a.max() > 180:
        return "0..360"
    if a.min() < 0:
        return "-180..180"
    return "0..180 (모호)"


def latlon_to_unit(lat, lon):
    p = np.radians(lat)
    l = np.radians(lon)
    return np.stack([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)], axis=-1)


def unit_to_latlon(v):
    v = np.asarray(v, dtype=float)
    r = np.linalg.norm(v, axis=-1)
    lat = np.degrees(np.arcsin(np.clip(v[..., 2] / r, -1, 1)))
    lon = norm_lon(np.degrees(np.arctan2(v[..., 1], v[..., 0])))
    return lat, lon


def local_frame(lat: float, lon: float, elevation_m: float = 0.0, observer_height_m: float = 0.0):
    """(p, u, e, n): 위치 km, 천정, 동, 북."""
    p_, l_ = math.radians(lat), math.radians(lon)
    sp, cp, sl, cl = math.sin(p_), math.cos(p_), math.sin(l_), math.cos(l_)
    u = np.array([cp * cl, cp * sl, sp])
    r = R_MOON_KM + (elevation_m + observer_height_m) / 1000.0
    e = np.array([-sl, cl, 0.0])
    n = np.array([-sp * cl, -sp * sl, cp])
    return u * r, u, e, n


def destination(lat, lon, bearing_deg, dist_km):
    """구면 위 출발점에서 방위·거리만큼 간 점 (배열 가능)."""
    d = np.asarray(dist_km, dtype=float) / R_MOON_KM
    b = np.radians(bearing_deg)
    p1, l1 = math.radians(lat), math.radians(lon)
    sp2 = math.sin(p1) * np.cos(d) + math.cos(p1) * np.sin(d) * np.cos(b)
    p2 = np.arcsin(np.clip(sp2, -1, 1))
    l2 = l1 + np.arctan2(np.sin(b) * np.sin(d) * math.cos(p1), np.cos(d) - math.sin(p1) * sp2)
    return np.degrees(p2), norm_lon(np.degrees(l2))


def great_circle_km(lat1, lon1, lat2, lon2):
    a = latlon_to_unit(lat1, lon1)
    b = latlon_to_unit(lat2, lon2)
    return R_MOON_KM * np.arccos(np.clip(np.sum(a * b, axis=-1), -1, 1))


# ───────── PA → ME (SPICE 프레임 커널에서 각도를 읽는다) ─────────
def read_tk_frame(tf_path: Path, frame_name: str = "MOON_ME") -> tuple[list[float], list[int], str, str]:
    """SPICE TK 프레임 커널에서 frame_name 의 (각도, 축, 단위, 기준 프레임 이름)을 읽는다.

    숫자를 기억으로 쓰지 않으려고 Drive 의 moon_de440_250416.tf 에서 직접 읽는다.
    """
    text = tf_path.read_text(encoding="latin-1")
    body = "\n".join(re.findall(r"\\begindata(.*?)(?:\\begintext|\Z)", text, re.S))

    def val(key: str) -> str:
        m = re.search(rf"{re.escape(key)}\s*=\s*(\([^)]*\)|'[^']*'|\S+)", body)
        if not m:
            raise KeyError(key)
        return m.group(1)

    code = val(f"FRAME_{frame_name}").strip()
    # MOON_ME 가 다른 프레임(MOON_ME_DE440_ME421 등)의 별칭이면 따라간다
    try:
        rel = val(f"TKFRAME_{code}_RELATIVE").strip("'")
        spec = val(f"TKFRAME_{code}_SPEC").strip("'")
        if spec.upper() == "MATRIX":
            # moon_de440_250416.tf: MOON_ME(31001) = 단위행렬 MATRIX → MOON_ME_DE440_ME421(31009, ANGLES)
            vals = [float(x.replace("D", "E")) for x in re.findall(r"[-+0-9.ED]+", val(f"TKFRAME_{code}_MATRIX"))]
            if len(vals) != 9 or not np.allclose(np.array(vals).reshape(3, 3), np.eye(3)):
                raise ValueError(f"{frame_name}: 단위행렬이 아닌 MATRIX 프레임은 지원하지 않는다")
            return read_tk_frame(tf_path, rel)
        angles = [float(x.replace("D", "E")) for x in re.findall(r"[-+0-9.ED]+", val(f"TKFRAME_{code}_ANGLES"))]
        axes = [int(x) for x in re.findall(r"\d", val(f"TKFRAME_{code}_AXES"))]
        units = val(f"TKFRAME_{code}_UNITS").strip("'")
        return angles, axes, units, rel
    except KeyError:
        alias_rel = val(f"TKFRAME_{code}_RELATIVE").strip("'")
        return read_tk_frame(tf_path, alias_rel)


def _rot(axis: int, ang: float) -> np.ndarray:
    c, s = math.cos(ang), math.sin(ang)
    if axis == 1:
        return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
    if axis == 2:
        return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def tk_matrix(angles: list[float], axes: list[int], units: str) -> np.ndarray:
    """M = [a1]_ax1 · [a2]_ax2 · [a3]_ax3 (SPICE frames.req 의 TK 각도 규칙).

    방향(기준→정의 프레임인지 그 반대인지)은 s80 이 spiceypy.pxform('MOON_PA', 'MOON_ME') 결과와 대조해
    docs/validation.md 에 기록한다. spiceypy 가 있으면 s80·검증은 pxform 을 우선 쓴다.
    """
    k = {"ARCSECONDS": math.pi / (180 * 3600), "DEGREES": math.pi / 180, "RADIANS": 1.0}[units.upper()]
    m = np.eye(3)
    for a, ax in zip(angles, axes):
        m = m @ _rot(ax, a * k)
    return m


def pa_to_me_matrix(tf_path: Path) -> tuple[np.ndarray, str]:
    """PA(주축) 벡터 → MOON_ME 벡터 행렬과 설명 문자열. 기준 프레임이 PA 가 아니면 예외."""
    angles, axes, units, rel = read_tk_frame(tf_path, "MOON_ME")
    if "PA" not in rel.upper():
        raise ValueError(f"MOON_ME 기준 프레임이 PA 가 아니다: {rel}")
    # tk_matrix 의 곱은 정의 프레임(MOON_ME) → 기준 프레임(PA) 방향이다. SpiceyPy pxform('MOON_PA','MOON_ME') 와
    # 정확히 전치 관계임을 s80 에서 확인했다 (2026-11-15) → PA → ME 는 전치.
    return tk_matrix(angles, axes, units).T, f"TK {rel}→MOON_ME angles={angles} {units} axes={axes} (전치)"
