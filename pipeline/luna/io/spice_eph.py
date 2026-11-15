"""SPICE 로 달 중심 MOON_ME 기준 태양·지구 방향 표 만들기 (남은 작업 4).

- 커널 5개: de440s.bsp(행성), moon_pa_de440_200625.bpc(달 자세, PA), moon_de440_250416.tf(MOON_ME 프레임 정의),
  naif0012.tls(윤초), pck00011.tpc. MOON_ME 는 .tf 가 PA 에 고정 회전을 더해 정의한다 (PA 를 그대로 쓰지 않는다).
- 광행차 보정 LT+S: 프로토타입 SPICE 기준표(Reference_Tables/spice_*.csv)와 같은 설정.
- 표의 기간은 커널 기간에서 직접 읽은 교집합 안이어야 한다 (파일 이름의 날짜를 믿지 않는다).
웹 형식(luna.ephemeris.v1)과 같은 행: (sun_lon, sun_lat, sun_dist_km, earth_lon, earth_lat, earth_dist_km), 경도 (−180, 180].
"""

from __future__ import annotations

import contextlib
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

KERNELS = ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
ABCORR = "LT+S"
FRAME = "MOON_ME"


@contextlib.contextmanager
def _in_dir(d: Path):
    """CSPICE 는 ASCII 가 아닌 경로(예: '바탕 화면')를 열지 못한다 → 커널 폴더로 옮겨 상대 이름으로 연다."""
    prev = os.getcwd()
    os.chdir(d)
    try:
        yield
    finally:
        os.chdir(prev)


class SpiceEphemeris:
    def __init__(self, kernel_dir: Path):
        import spiceypy as sp

        self.sp = sp
        self.dir = kernel_dir
        sp.kclear()
        with _in_dir(kernel_dir):
            for k in KERNELS:
                if not (kernel_dir / k).exists():
                    raise FileNotFoundError(f"SPICE 커널 없음: {kernel_dir / k}")
                sp.furnsh(k)
        if sp.namfrm(FRAME) == 0:
            raise RuntimeError("MOON_ME 프레임이 정의되지 않았다 (moon_de440_250416.tf 확인)")

    def coverage(self) -> dict[str, tuple[str, str]]:
        sp = self.sp

        def win(cell):
            return [sp.wnfetd(cell, i) for i in range(sp.wncard(cell))]

        with _in_dir(self.dir):
            return self._coverage(sp, win)

    def _coverage(self, sp, win) -> dict[str, tuple[str, str]]:
        out = {}
        for body, name in ((10, "sun"), (399, "earth"), (301, "moon")):
            c = sp.cell_double(2000)
            r = sp.spkcov("de440s.bsp", body, c)
            c = r if r is not None else c
            w = win(c)
            out[f"de440s:{name}"] = (w[0][0], w[-1][1])
        ids = sp.cell_int(100)
        r = sp.pckfrm("moon_pa_de440_200625.bpc", ids)
        ids = r if r is not None else ids
        for f in ids:
            c = sp.cell_double(2000)
            r = sp.pckcov("moon_pa_de440_200625.bpc", int(f), c)
            c = r if r is not None else c
            w = win(c)
            out[f"moon_pa_bpc:{int(f)}"] = (w[0][0], w[-1][1])
        return {k: (sp.et2utc(a, "ISOC", 0), sp.et2utc(b, "ISOC", 0)) for k, (a, b) in out.items()}

    def common_window_et(self) -> tuple[float, float]:
        sp = self.sp
        cov = self.coverage()
        lo = max(sp.str2et(a) for a, _ in cov.values())
        hi = min(sp.str2et(b) for _, b in cov.values())
        return lo, hi

    def rows(self, times_utc: list[str]) -> np.ndarray:
        sp = self.sp
        lo, hi = self.common_window_et()
        out = np.empty((len(times_utc), 6))
        for i, t in enumerate(times_utc):
            et = sp.str2et(t.replace("Z", ""))
            if not (lo <= et <= hi):
                raise ValueError(f"{t}: 커널 공통 기간 밖")
            for j, body in enumerate(("SUN", "EARTH")):
                p, _ = sp.spkpos(body, et, FRAME, ABCORR, "MOON")
                r, lon, lat = sp.reclat(p)
                lon_d = math.degrees(lon)
                lon_d = lon_d - 360.0 if lon_d > 180.0 else (lon_d + 360.0 if lon_d <= -180.0 else lon_d)
                out[i, j * 3:(j + 1) * 3] = (lon_d, math.degrees(lat), r)
        return out


def hourly_times(start_utc: str, stop_utc: str, step_h: float) -> list[str]:
    a = datetime.strptime(start_utc.replace("Z", ""), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    b = datetime.strptime(stop_utc.replace("Z", ""), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    out, t = [], a
    while t <= b:
        out.append(t.strftime("%Y-%m-%dT%H:%M:%SZ"))
        t += timedelta(hours=step_h)
    return out


def angular_diff_deg(lon1, lat1, lon2, lat2) -> np.ndarray:
    l1, p1, l2, p2 = map(np.radians, (lon1, lat1, lon2, lat2))
    c = np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(l1 - l2)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))
