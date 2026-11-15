"""s50 북극·전역 정적 레이어 (전역 확장 안 B, 2026-11-15).

남극 s50(s50_layers.py)과 같은 레이어 이름·형식을 grid_north/·grid_global/ 아래에 쓴다.
원본이 덮지 않는 칸은 NaN(자료 없음). 합성 값으로 메우지 않는다.

| 레이어 | 북극 (75–90°N, 5 km) | 전역 (75°S–75°N, 15 km) |
| --- | --- | --- |
| elev_m | ldem_80n_80m → ldem_75n_240m (칸 중심 쌍선형) | ldem_128 |
| slope_mean/p90_deg | LOLA LDSM 75N 120 m (PDS 경사 제품) | SLDEM2015 경사 128 화소/도 (imbrium.mit.edu). 60–90° 는 LDSM·남극 경사·DEM 계산값과 교차검증 |
| illum_avg·earth_vis_avg·psr_frac | PGDA69 85N 60 m + 75N 120 m | PGDA69 65N/65S 240 m (|위도| ≥ 55.2°만) |
| psr_dist_km | psr_frac > 0 칸까지 대권 거리 | 같음. 영구음영 자료 범위 밖은 NaN |
| h_ppm | LP 중성자 Hydrogen_low 2° 등면적 | 같음 |
| feo_wt·tio2_wt_lp·tio2_lp_sigma | LP GRS 2° 등면적 (lp_9001) | 같음 |
| scarp_dist_km | LROC 극지 단층애 점 (북쪽) | LROC 단층애 선(60°S–60°N) + 극지 단층애 점 |
| rockfall_density·coverage | Bickel 2020 신뢰도 0.6 (80°N 까지) | 같음 |
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from luna import log
from luna.constants import R_MOON_KM
from luna.contracts import Envelope, LayerMeta, Provenance, lowest_quality
from luna.geo.frames import norm_lon
from luna.geo.polar import NORTH, BandGridSpec, GridSpec, aeqd_forward
from luna.io.pds import PolarPdsSampler, read_pds_image, sampler_for
from luna.io.tables import bin_contains
from luna.preview import save_gray
from luna.stages.common import Ctx, write_bin, write_envelope
from luna.stages.s50_layers import SCHEMA, MeanAgg, Out, _check_frac

DEM_N = "Raw_Data/LOLA_DEM_North_2026-11-15"
DEM_G = "Raw_Data/LOLA_DEM_Global_PDS_2026-11-15"
SLOPE = "Raw_Data/LOLA_Slope_2026-11-15"
PGDA_N = "Raw_Data/PGDA69_North_2026-11-15"
PGDA65 = "Raw_Data/PGDA69_65deg_2026-11-15"
SLDEM = "Raw_Data/SLDEM2015_Slope_2026-11-15"
SLDEM_STEM = "SLDEM2015_128_SL_90S_90N_000_360"
LP_GRS2 = "Raw_Data/LP_GRS_2deg_2026-11-15/lpgrs_high1_elem_abundance_2deg.tab"
LP_FMT = "Raw_Data/LP_GRS_2deg_2026-11-15/lpgrs_elem_abundance.fmt"
LP_H = "Raw_Data/Lunar_Prospector_Global/hydrogenlow.txt"
SCARPS = "Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps"
ROCKFALLS = "Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv"

OUTDIR = {"north": "grid_north", "global": "grid_global"}
LONG = "장기 평균(PGDA69, 약 18.6년). 특정 날짜 값 아님"
#: 경사 분위수 히스토그램: 0–60°, 0.25° 간격. 60° 이상은 마지막 칸 (p90 이 60° 를 넘는 칸은 없다고 가정, 보고서에 개수 기록)
SLOPE_HI, SLOPE_STEP = 60.0, 0.25


class Cells:
    """지역 격자 칸 (s40 과 같은 번호). index(lat, lon) → 칸 순번 (−1 = 밖)."""

    def __init__(self, ctx: Ctx, region: str):
        g = ctx.settings.grid
        self.region = region
        self.cells = np.fromfile(ctx.out / OUTDIR[region] / "cells.u32", dtype="<u4")
        if region == "north":
            self.spec = GridSpec(g.cell_km, g.north_lat_limit_deg)
            size = self.spec.n * self.spec.n
        else:
            self.spec = BandGridSpec(g.global_cell_km, g.global_lat_max_deg)
            size = self.spec.n_cells
        self.lut = np.full(size, -1, dtype=np.int64)
        self.lut[self.cells] = np.arange(self.cells.size)
        self.lat, self.lon = (np.asarray(a, dtype=float) for a in self.spec.latlon(self.cells))
        self.n = self.cells.size
        self.cell_km = self.spec.cell_km
        self.xyz = _unit(self.lat, self.lon)

    def index(self, lat, lon) -> np.ndarray:
        lat = np.asarray(lat, dtype=float)
        lon = np.asarray(lon, dtype=float)
        out = np.full(lat.shape, -1, dtype=np.int64)
        fin = np.isfinite(lat) & np.isfinite(lon)
        if self.region == "north":
            s = self.spec
            x, y = aeqd_forward(lat[fin], lon[fin], pole=NORTH)
            col = np.floor((x - s.x0_km) / s.cell_km).astype(np.int64)
            row = np.floor((s.y0_km - y) / s.cell_km).astype(np.int64)
            ok = (col >= 0) & (row >= 0) & (col < s.n) & (row < s.n)
            r = np.full(col.shape, -1, dtype=np.int64)
            r[ok] = self.lut[row[ok] * s.n + col[ok]]
        else:
            ids = self.spec.locate(lat[fin], lon[fin])
            r = np.where(ids >= 0, self.lut[np.maximum(ids, 0)], -1)
        out[fin] = r
        return out

    def nearest_km(self, lat: np.ndarray, lon: np.ndarray, chunk: int = 512, pchunk: int = 16384) -> np.ndarray:
        """칸 중심에서 점 집합까지 최소 대권 거리 (km). 칸·점 양쪽을 나눠 블록 메모리를 작게 (약 64 MB)."""
        out = np.full(self.n, np.nan)
        if lat.size == 0:
            return out
        p = _unit(lat, lon)
        best = np.full(self.n, -1.0)
        for i in range(0, self.n, chunk):
            q = self.xyz[i:i + chunk]
            for j in range(0, len(p), pchunk):
                best[i:i + chunk] = np.maximum(best[i:i + chunk], (q @ p[j:j + pchunk].T).max(axis=1))
        return R_MOON_KM * np.arccos(np.clip(best, -1, 1))

    def count_within(self, lat: np.ndarray, lon: np.ndarray, r_km: float, chunk: int = 512, pchunk: int = 16384) -> np.ndarray:
        out = np.zeros(self.n)
        if lat.size == 0:
            return out
        p = _unit(lat, lon)
        c = np.cos(r_km / R_MOON_KM)
        for i in range(0, self.n, chunk):
            q = self.xyz[i:i + chunk]
            for j in range(0, len(p), pchunk):
                out[i:i + chunk] += (q @ p[j:j + pchunk].T >= c).sum(axis=1)
        return out


def _unit(lat, lon) -> np.ndarray:
    la, lo = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


class SlopeAgg:
    """칸별 경사 평균과 히스토그램 분위수 (bincount 로 누적, 메모리 = 칸 × 240 × 4 B)."""

    def __init__(self, n: int):
        self.n = n
        self.nb = int(round(SLOPE_HI / SLOPE_STEP))
        self.h = np.zeros(n * self.nb, dtype=np.int64)
        self.s = np.zeros(n)
        self.c = np.zeros(n)
        self.over = 0

    def add(self, idx: np.ndarray, v: np.ndarray) -> None:
        ok = (idx >= 0) & np.isfinite(v)
        i, v = idx[ok], v[ok]
        self.over += int((v >= SLOPE_HI).sum())
        b = np.minimum((v / SLOPE_STEP).astype(np.int64), self.nb - 1)
        self.h += np.bincount(i * self.nb + b, minlength=self.h.size)
        self.s += np.bincount(i, weights=v, minlength=self.n)
        self.c += np.bincount(i, minlength=self.n)

    def mean(self) -> np.ndarray:
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.c > 0, self.s / self.c, np.nan)

    def quantile(self, q: float) -> np.ndarray:
        h = self.h.reshape(self.n, self.nb)
        tot = h.sum(axis=1)
        k = np.argmax(np.cumsum(h, axis=1) >= (q * tot)[:, None], axis=1)
        return np.where(tot > 0, (k + 0.5) * SLOPE_STEP, np.nan)


# ───────── 원본 읽기 도우미 ─────────

def _pds_dn(img, rows: slice) -> np.ndarray:
    """PDS 화소 행 묶음 → 물리값 (라벨 배율). 정수 결측(−32768)·실수 특수값은 NaN."""
    a = np.asarray(img.data[rows], dtype=np.float64)
    miss = img.label.get("IMAGE", {}).get("MISSING_CONSTANT")
    if img.data.dtype.kind == "i":
        a[a == np.iinfo(img.data.dtype).min] = np.nan
    else:
        a[a < -1e30] = np.nan
    if miss is not None:
        try:
            a[a == float(str(miss).split()[0].strip('"'))] = np.nan
        except ValueError:
            pass
    return a * img.scale + img.offset


def _ldsm(img, rows: slice) -> np.ndarray:
    """LDSM 경사 (°). LDSM_75N_240M 은 DN 0(=45.000°)이 화소의 약 26% 를 차지해 결측으로 본다 (120 m 판에는 DN 0 이 없다)."""
    v = _pds_dn(img, rows)
    v[np.asarray(img.data[rows]) == 0] = np.nan
    return v


def _polar_pixels(img, rows_per: int = 512):
    """극 투영 PDS 영상의 (값, 위도, 경도) 행 묶음."""
    s = PolarPdsSampler(img)
    lines, samples = img.data.shape
    cols = np.arange(samples, dtype=float)
    for r0 in range(0, lines, rows_per):
        r1 = min(lines, r0 + rows_per)
        C, R = np.meshgrid(cols, np.arange(r0, r1, dtype=float))
        lat, lon = s.pix_to_latlon(R, C)
        yield _pds_dn(img, slice(r0, r1)), lat, lon


def _stereo_k(lat_deg: np.ndarray) -> np.ndarray:
    """극 입체 투영 축척 계수 (극에서 1): 화소 한 칸의 지표 길이 = MAP_SCALE / k."""
    return 2.0 / (1.0 + np.sin(np.radians(np.abs(lat_deg))))


def _slope_from_polar_dem(img, r0: int, r1: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """극 입체 DEM 의 행 [r0, r1) 경사(°) — 중앙차분, 지표 화소 길이 = MAP_SCALE/k. 가장자리 화소는 NaN."""
    s = PolarPdsSampler(img)
    lines, samples = img.data.shape
    a0, a1 = max(0, r0 - 1), min(lines, r1 + 1)
    z = _pds_dn(img, slice(a0, a1))
    C, R = np.meshgrid(np.arange(samples, dtype=float), np.arange(r0, r1, dtype=float))
    lat, lon = s.pix_to_latlon(R, C)
    px_m = s.scale_km * 1000.0 / _stereo_k(lat)
    o = r0 - a0
    zc = z[o:o + (r1 - r0)]
    up = z[o - 1:o - 1 + (r1 - r0)] if o >= 1 else np.full_like(zc, np.nan)
    dn = z[o + 1:o + 1 + (r1 - r0)] if o + 1 + (r1 - r0) <= z.shape[0] else np.vstack([z[o + 1:], np.full((1, samples), np.nan)])
    dzdy = (up - dn) / (2 * px_m)
    dzdx = np.full_like(zc, np.nan)
    dzdx[:, 1:-1] = (zc[:, 2:] - zc[:, :-2]) / (2 * px_m[:, 1:-1])
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))), lat, lon


def _read_lp_table(tab: Path, fmt: Path) -> pd.DataFrame:
    import re

    names = re.findall(r'NAME\s*=\s*"([^"]+)"', fmt.read_text(encoding="latin-1"))
    df = pd.read_csv(tab, sep=r"\s+", header=None, engine="python")
    if df.shape[1] != len(names):
        raise ValueError(f"{tab.name}: 열 {df.shape[1]}개 ≠ fmt 열 {len(names)}개")
    df.columns = names
    return df


def _read_lp_hydrogen(p: Path) -> tuple[tuple[np.ndarray, ...], np.ndarray]:
    rows = []
    for line in p.read_text(encoding="latin-1").splitlines():
        if line.lstrip().startswith("#") or not line.strip():
            continue
        v = [float(x) for x in line.replace(",", " ").split()]
        if len(v) == 5:
            rows.append(v)
    a = np.array(rows)
    return (a[:, 0], a[:, 1], a[:, 2], a[:, 3]), a[:, 4]


def _polyline_vertices(zip_path: Path, stem: str, step_km: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """선 shapefile 정점 → 선분을 step_km 간격으로 촘촘히 한 위경도 점."""
    import io
    import zipfile

    import shapefile

    with zipfile.ZipFile(zip_path) as z:
        names = {n.upper(): n for n in z.namelist()}
        prj = z.read(names[f"{stem}.PRJ"]).decode("utf-8", "replace")
        # 이름이 없는 타원체도 있다 (LOBATE_SCARPS_180: "unnamed ellipse"). 지리 좌표 + 반지름 1737.4 km 구 + 도 단위로 판정
        import re

        sph = re.search(r'SPHEROID\["[^"]*",\s*([0-9.]+),\s*([0-9.]+)', prj)
        if not (prj.lstrip().startswith("GEOGCS") and sph and abs(float(sph.group(1)) - R_MOON_KM * 1000) < 1 and float(sph.group(2)) == 0 and '"Degree"' in prj):
            raise ValueError(f"{zip_path.name}: 달 지리 좌표계(1737.4 km 구, 도)가 아니다: {prj[:80]}")
        r = shapefile.Reader(shp=io.BytesIO(z.read(names[f"{stem}.SHP"])), dbf=io.BytesIO(z.read(names[f"{stem}.DBF"])))
        la, lo = [], []
        for sh in r.iterShapes():
            pts = np.asarray(sh.points, float)
            if pts.size == 0:
                continue
            for k in range(len(pts) - 1):
                (x0, y0), (x1, y1) = pts[k], pts[k + 1]
                d = np.hypot((x1 - x0) * np.cos(np.radians((y0 + y1) / 2)), y1 - y0) * np.pi / 180 * R_MOON_KM
                n = max(1, int(np.ceil(d / step_km)))
                t = np.linspace(0, 1, n, endpoint=False)
                lo.append(x0 + (x1 - x0) * t)
                la.append(y0 + (y1 - y0) * t)
            lo.append(pts[-1:, 0])
            la.append(pts[-1:, 1])
    return np.concatenate(la), norm_lon(np.concatenate(lo))


def _cyl_rows(img, lat_hi: float, lat_lo: float) -> tuple[int, int]:
    """단순 원통 영상에서 위도 [lat_lo, lat_hi] 를 덮는 행 범위."""
    s = sampler_for(img)
    lines = img.data.shape[0]
    a, _ = s.latlon_to_pix(np.array([lat_hi]), np.array([0.0]))
    b, _ = s.latlon_to_pix(np.array([lat_lo]), np.array([0.0]))
    return max(0, int(np.floor(a[0]))), min(lines, int(np.ceil(b[0])) + 1)


def _cyl_iter(img, r0: int, r1: int, step: int = 512):
    """단순 원통 영상 행 [r0, r1) 의 (값, 위도, 경도) 묶음."""
    s = sampler_for(img)
    cols = np.arange(img.data.shape[1], dtype=float)
    for a in range(r0, r1, step):
        b = min(r1, a + step)
        Cc, Rr = np.meshgrid(cols, np.arange(a, b, dtype=float))
        lat, lon = s.pix_to_latlon(Rr, Cc)
        yield _pds_dn(img, slice(a, b)), lat, lon


def _dem_cyl_slope(img, a: int, b: int) -> np.ndarray:
    """단순 원통 DEM 행 [a, b) 의 경사(°): 중앙차분, 동서 간격 R·cosφ·Δλ, 남북 R·Δφ (경도 방향은 이어 붙임)."""
    s = sampler_for(img)
    z = _pds_dn(img, slice(a - 1, b + 1))
    lat_rows, _ = s.pix_to_latlon(np.arange(a, b, dtype=float), np.zeros(b - a))
    r_m = R_MOON_KM * 1000.0
    dang = np.radians(1.0 / s.res)
    dx = r_m * dang * np.cos(np.radians(lat_rows))[:, None]
    zc = z[1:-1]
    dzdx = (np.roll(zc, -1, axis=1) - np.roll(zc, 1, axis=1)) / (2 * dx)
    dzdy = (z[:-2] - z[2:]) / (2 * r_m * dang)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def _cmp(a: np.ndarray, b: np.ndarray) -> dict:
    m = np.isfinite(a) & np.isfinite(b)
    if m.sum() < 3:
        return {"n": int(m.sum())}
    d = a[m] - b[m]
    return {"n": int(m.sum()), "corr": round(float(np.corrcoef(a[m], b[m])[0, 1]), 4), "mean_diff_deg": round(float(d.mean()), 3),
            "median_abs_diff_deg": round(float(np.median(np.abs(d))), 3), "p95_abs_diff_deg": round(float(np.percentile(np.abs(d), 95)), 3),
            "a_median_deg": round(float(np.median(a[m])), 3), "b_median_deg": round(float(np.median(b[m])), 3)}


def slope_cross_check(ctx: Ctx) -> dict | None:
    """60–90° 경사 교차검증: SLDEM2015 경사(128 화소/도) vs 극지 경사 제품·DEM 계산값.

    1) 북극 5 km 칸: SLDEM 칸 평균·90분위 vs 북극 레이어(LDSM 75N 120 m)
    2) 남극 5 km 칸: SLDEM vs 남극 레이어(LOLA 경사 80/240 m)
    3) 전역 띠 60–75° 칸: SLDEM vs ldem_128 중앙차분 (같은 화소 크기). 참고로 55–60° 도
    4) 화소: SLDEM 을 LDSM_75N_240M 화소 중심에서 쌍선형 표본 vs LDSM 240 m
    차이를 기록만 한다 (허용 오차는 팀이 정함).
    """
    from luna.stages.s50_layers import Binner

    d = ctx.data
    lbl = d.first(f"{SLDEM}/{SLDEM_STEM}.LBL")
    if not lbl:
        return None
    sl = read_pds_image(lbl)
    out: dict = {"source": SLDEM_STEM, "note": "a = SLDEM2015, b = 비교 대상. 차이 = a − b"}

    def layer(dirname: str, nm: str, n: int):
        p = ctx.out / dirname / "layers" / f"{nm}.f32"
        return np.fromfile(p, dtype="<f4").astype(float) if p.exists() and p.stat().st_size == 4 * n else None

    # 1) 북극
    if (ctx.out / "grid_north" / "cells.u32").exists():
        Cn = Cells(ctx, "north")
        agg = SlopeAgg(Cn.n)
        r0, r1 = _cyl_rows(sl, 90.0, Cn.spec.lat_limit_deg - 0.1)
        for v, lat, lon in _cyl_iter(sl, r0, r1):
            agg.add(Cn.index(lat.ravel(), lon.ravel()), v.ravel())
        mn, p9 = layer("grid_north", "slope_mean_deg", Cn.n), layer("grid_north", "slope_p90_deg", Cn.n)
        out["north_cells_vs_ldsm_75n_120m"] = {"mean": _cmp(agg.mean(), mn) if mn is not None else None, "p90": _cmp(agg.quantile(0.9), p9) if p9 is not None else None}
    # 2) 남극
    if (ctx.out / "grid" / "cells.u32").exists():
        g = ctx.settings.grid
        cells = np.fromfile(ctx.out / "grid" / "cells.u32", dtype="<u4")
        B = Binner(GridSpec(g.cell_km, g.lat_limit_deg), cells)
        agg = SlopeAgg(B.n_cells)
        r0, r1 = _cyl_rows(sl, g.lat_limit_deg + 0.1, -90.0)
        for v, lat, lon in _cyl_iter(sl, r0, r1):
            agg.add(B.index(lat.ravel(), lon.ravel()), v.ravel())
        mn, p9 = layer("grid", "slope_mean_deg", B.n_cells), layer("grid", "slope_p90_deg", B.n_cells)
        out["south_cells_vs_lola_slope_80_240m"] = {"mean": _cmp(agg.mean(), mn) if mn is not None else None, "p90": _cmp(agg.quantile(0.9), p9) if p9 is not None else None}
    # 3) 55–75° 띠 (북·남) vs ldem_128 중앙차분
    dl = d.first(f"{DEM_G}/ldem_128.lbl")
    if dl and (ctx.out / "grid_global" / "cells.u32").exists():
        dem = read_pds_image(dl)
        if dem.data.shape != sl.data.shape:
            out["band_error"] = f"크기 다름 {dem.data.shape} vs {sl.data.shape}"
        else:
            Cg = Cells(ctx, "global")
            a_s, a_d = SlopeAgg(Cg.n), SlopeAgg(Cg.n)
            s_sl = sampler_for(sl)
            cols = np.arange(sl.data.shape[1], dtype=float)
            for hi, lo in ((75.1, 54.9), (-54.9, -75.1)):
                r0, r1 = _cyl_rows(sl, hi, lo)
                for a in range(max(1, r0), min(sl.data.shape[0] - 1, r1), 512):
                    b = min(r1, a + 512, sl.data.shape[0] - 1)
                    Cc, Rr = np.meshgrid(cols, np.arange(a, b, dtype=float))
                    lat, lon = s_sl.pix_to_latlon(Rr, Cc)
                    idx = Cg.index(lat.ravel(), lon.ravel())
                    a_s.add(idx, _pds_dn(sl, slice(a, b)).ravel())
                    a_d.add(idx, _dem_cyl_slope(dem, a, b).ravel())
            band = np.abs(Cg.lat)
            ms, md = a_s.mean(), a_d.mean()
            hi_ = band >= 60
            mid = (band >= 55) & (band < 60)
            out["band_60_75_cells_vs_ldem128_central_diff"] = _cmp(np.where(hi_, ms, np.nan), np.where(hi_, md, np.nan))
            out["band_55_60_cells_vs_ldem128_central_diff"] = _cmp(np.where(mid, ms, np.nan), np.where(mid, md, np.nan))
    # 4) 화소 단위 (북극 LDSM 240 m)
    rl = d.first(f"{SLOPE}/ldsm_75n_240m.lbl")
    if rl:
        ref = read_pds_image(rl)
        s_ref, s_sl = PolarPdsSampler(ref), sampler_for(sl)
        lines, samples = ref.data.shape
        a_all, b_all = [], []
        for r0 in range(16, lines - 16, max(1, lines // 40)):
            Cc, Rr = np.meshgrid(np.arange(samples, dtype=float), np.arange(r0, r0 + 8, dtype=float))
            lat, lon = s_ref.pix_to_latlon(Rr, Cc)
            a_all.append(s_sl(lat.ravel(), lon.ravel()))
            b_all.append(_ldsm(ref, slice(r0, r0 + 8)).ravel())
        out["north_pixels_vs_ldsm_75n_240m"] = _cmp(np.concatenate(a_all), np.concatenate(b_all))
    return out


# ───────── 지역 실행 ─────────

def run_region(ctx: Ctx, region: str) -> int:
    name = f"s50_{region}"
    if not (ctx.out / OUTDIR[region] / "manifest.json").exists():
        log.warn(name, "s40 --regions 먼저 실행")
        return 1
    C = Cells(ctx, region)
    man = json.loads((ctx.out / OUTDIR[region] / "manifest.json").read_text(encoding="utf-8"))["data"]
    if man["n_cells"] != C.n:
        log.warn(name, f"cells.u32 {C.n} ≠ manifest n_cells {man['n_cells']}")
        return 1
    d = ctx.data
    outs: list[Out] = []
    report: dict = {"region": region, "cells": C.n}

    def prov(p: Path, role: str, crs: str, transform: str, lon_convention: str | None = None) -> Provenance:
        return ctx.prov(p, role, allow_unlisted=True, source_crs=crs, transform=transform, lon_convention=lon_convention)

    def safe(label: str, fn) -> None:
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            log.warn(name, f"{label} 실패 → 레이어 생략: {e}")
            report.setdefault("failed", {})[label] = str(e)

    # 1. 고도 (칸 중심 쌍선형, 가까운 고해상도 DEM 우선)
    def elev():
        stems = [f"{DEM_N}/ldem_80n_80m", f"{DEM_N}/ldem_75n_240m"] if region == "north" else [f"{DEM_G}/ldem_128"]
        z = np.full(C.n, np.nan)
        pv = []
        for st in stems:
            lbl = d.first(f"{st}.lbl")
            if not lbl:
                continue
            img = read_pds_image(lbl)
            v = sampler_for(img)(C.lat, C.lon)
            z = np.where(np.isfinite(z), z, v)
            pv.append(prov(d.first(f"{st}.img") or lbl, Path(st).name, img.crs.summary(), "PDS 라벨 → 칸 중심 쌍선형"))
        if pv:
            outs.append(Out("elev_m", z, "m", "real", "칸 중심 고도 (" + " → ".join(Path(s).name for s in stems) + ", 쌍선형)", ["lola_dem_north" if region == "north" else "lola_dem_global"], pv))
    safe("elev_m", elev)

    # 2. 경사
    def slope_north():
        lbl = d.first(f"{SLOPE}/ldsm_75n_120m.lbl")
        if not lbl:
            log.warn(name, f"{SLOPE}/ldsm_75n_120m 없음 → 경사 생략")
            return
        img = read_pds_image(lbl)
        agg = SlopeAgg(C.n)
        for v, lat, lon in _polar_pixels(img):
            agg.add(C.index(lat.ravel(), lon.ravel()), v.ravel())
        report["slope"] = {"source": "LDSM_75N_120M", "pixels_ge_60deg": agg.over}
        pv = [prov(d.first(f"{SLOPE}/ldsm_75n_120m.img") or lbl, "ldsm_75n_120m", img.crs.summary(), "PDS 극 입체 화소 → 북극 AEQD 칸")]
        outs.append(Out("slope_mean_deg", agg.mean(), "deg", "real", "칸 안 경사 평균 (LOLA LDSM 120 m)", ["lola_slope_north"], pv))
        outs.append(Out("slope_p90_deg", agg.quantile(0.9), "deg", "real", "칸 안 경사 90분위 (LOLA LDSM 120 m)", ["lola_slope_north"], pv))

    def slope_global():
        lbl = d.first(f"{SLDEM}/{SLDEM_STEM}.LBL")
        if not lbl:
            log.warn(name, f"{SLDEM}/{SLDEM_STEM} 없음 → 경사 생략")
            return
        img = read_pds_image(lbl)
        agg = SlopeAgg(C.n)
        r0, r1 = _cyl_rows(img, C.spec.lat_max_deg + 0.1, -C.spec.lat_max_deg - 0.1)
        for v, lat, lon in _cyl_iter(img, r0, r1):
            agg.add(C.index(lat.ravel(), lon.ravel()), v.ravel())
        report["slope"] = {"source": SLDEM_STEM, "rows": [r0, r1], "pixels_ge_60deg": agg.over}
        pv = [prov(d.first(f"{SLDEM}/{SLDEM_STEM}.IMG") or lbl, "sldem2015_slope_128", img.crs.summary(), "PDS 단순 원통 128 화소/도 → 위도 띠 칸")]
        cau = "SLDEM2015 경사 (LOLA+Kaguya TC, 약 237 m). 60° 보다 높은 위도는 LOLA 단독. 착륙 규모(수 m) 경사보다 작게 나온다"
        outs.append(Out("slope_mean_deg", agg.mean(), "deg", "real", "칸 안 경사 평균 (SLDEM2015 경사 128 화소/도)", ["sldem2015_slope"], pv, cau))
        outs.append(Out("slope_p90_deg", agg.quantile(0.9), "deg", "real", "칸 안 경사 90분위 (SLDEM2015 경사 128 화소/도)", ["sldem2015_slope"], pv, cau))

    safe("slope", slope_north if region == "north" else slope_global)

    # 3. PGDA69 장기 평균 조명·지구 가시·영구음영
    def pgda():
        if region == "north":
            def tif_mean(fine: str, coarse: str, fn=None) -> tuple[np.ndarray, list[Provenance]]:
                from luna.geo.crs import from_geotiff
                from luna.io.geotiff import iter_blocks

                res, pv = np.full(C.n, np.nan), []
                for f in (coarse, fine):
                    p = d.first(f"{PGDA_N}/{f}")
                    if not p:
                        continue
                    agg = MeanAgg(C.n)
                    for a, lat, lon in iter_blocks(p):
                        agg.add(C.index(lat.ravel(), lon.ravel()), (fn(a) if fn else a).ravel())
                    r = agg.result()
                    res = np.where(np.isfinite(r), r, res) if f == fine else r
                    pv.append(prov(p, f.split(".")[0], from_geotiff(p).summary(), "GeoTIFF CRS → 달 위경도(pyproj) → 북극 AEQD 칸"))
                return res, pv

            stat = "칸 평균 (85°N 이북 60 m, 밖 120 m)"
            for nm, fine, coarse, fn, cau, st in (
                ("illum_avg", "AVGVISIB_85N_060M_201608.TIF", "AVGVISIB_75N_120M_201608.TIF", None, LONG, stat),
                ("earth_vis_avg", "AVGVISIB_85N_060M_201608_EARTH.TIF", "AVGVISIB_75N_120M_201608_EARTH.TIF", None, LONG, stat),
                ("psr_frac", "LPSR_85N_060M_201608.TIF", "LPSR_75N_120M_201608.TIF", lambda a: np.where(np.isfinite(a), (a > 0.5).astype(float), np.nan), "영구음영 비율. 얼음 검출 아님", "칸 안 영구음영 화소 비율"),
            ):
                a, pv = tif_mean(fine, coarse, fn)
                if pv:
                    outs.append(Out(nm, _check_frac(nm, a), "frac", "real", st, ["pgda69"], pv, cau))
        else:
            def img_mean(stems: list[str], fn=None) -> tuple[np.ndarray, list[Provenance]]:
                agg, pv = MeanAgg(C.n), []
                for st in stems:
                    lbl = d.first(f"{PGDA65}/{st}.LBL")
                    if not lbl:
                        continue
                    img = read_pds_image(lbl)
                    for v, lat, lon in _polar_pixels(img):
                        agg.add(C.index(lat.ravel(), lon.ravel()), (fn(v) if fn else v).ravel())
                    pv.append(prov(d.first(f"{PGDA65}/{st}.IMG") or lbl, st, img.crs.summary(), "PDS 극 입체 화소 → 위도 띠 칸"))
                return agg.result(), pv

            stat = "칸 평균 (65°N·65°S 240 m 제품, |위도| ≥ 55.2° 만. 그보다 낮은 위도는 자료 없음)"
            for nm, sfx, fn, cau, st in (
                ("illum_avg", "", None, LONG + ". 55.2° 보다 낮은 위도는 장기 평균 제품이 없어 NaN", stat),
                ("earth_vis_avg", "_EARTH", None, LONG + ". 55.2° 보다 낮은 위도는 장기 평균 제품이 없어 NaN", stat),
            ):
                a, pv = img_mean([f"AVGVISIB_65N_240M_201608{sfx}", f"AVGVISIB_65S_240M_201608{sfx}"], fn)
                if pv:
                    outs.append(Out(nm, _check_frac(nm, a), "frac", "real", st, ["pgda69"], pv, cau))
            # LPSR 65°: 라벨 "binary, permanent shadow (1) or not (0)" (DN=+20000 → 1). 북극 TIF 와 같은 규칙 (> 0.5 = 영구음영)
            a, pv = img_mean(["LPSR_65N_240M_201608", "LPSR_65S_240M_201608"], lambda v: np.where(np.isfinite(v), (v > 0.5).astype(float), np.nan))
            if pv:
                outs.append(Out("psr_frac", _check_frac("psr_frac", a), "frac", "real", "칸 안 영구음영 화소 비율 (65° 240 m 제품, |위도| ≥ 55.2°)", ["pgda69"], pv, "영구음영 비율. 얼음 검출 아님. 55.2° 보다 낮은 위도는 NaN"))
    safe("pgda69", pgda)

    # 4. 영구음영 칸까지 거리 (자료 범위 밖 칸은 NaN)
    psr = next((o for o in outs if o.name == "psr_frac"), None)
    if psr is not None:
        m = np.isfinite(psr.arr) & (psr.arr > 0)
        dist = C.nearest_km(C.lat[m], C.lon[m])
        dist[m] = 0.0
        dist[~np.isfinite(psr.arr)] = np.nan
        report["psr_cells"] = int(m.sum())
        outs.append(Out("psr_dist_km", dist, "km", "real", f"영구음영 칸까지 최소 대권 거리 ({C.cell_km:g} km 칸 해상도)", ["pgda69"], psr.prov, "얼음 가능성 지표 · 검출 아님. 영구음영 자료가 없는 칸은 NaN"))

    # 5. Lunar Prospector (2° 등면적, 원 셀 값 그대로)
    def lp():
        tab, fmt = d.first(LP_GRS2), d.first(LP_FMT)
        if tab and fmt:
            df = _read_lp_table(tab, fmt)
            e = tuple(df[c].to_numpy(float) for c in ("MIN_LAT", "MAX_LAT", "MIN_LON", "MAX_LON"))
            pv = [prov(tab, "lp_grs_2deg", "위경도 표 (2° 등면적 셀 경계, −180..180)", "칸 중심이 들어 있는 2° 셀 값 (보간 없음)", "-180..180")]
            cau = "Lunar Prospector GRS 2° 등면적 셀(약 60 km) 지역 조성. 착륙지 규모의 값이 아님. 추정 분포"
            outs.append(Out("feo_wt", bin_contains(e, C.lat, C.lon, df["W_FEO"].to_numpy(float) * 100), "wt%", "real", "칸 중심이 들어 있는 LP GRS 2° 셀 값 (W_FEO × 100)", ["lp_grs"], pv, cau))
            outs.append(Out("tio2_wt_lp", bin_contains(e, C.lat, C.lon, df["TIO2"].to_numpy(float) * 100), "wt%", "real", "칸 중심이 들어 있는 LP GRS 2° 셀 값 (TIO2 × 100)", ["lp_grs"], pv, cau))
            sig = np.sqrt(np.clip(df["E[4,4]"].to_numpy(float), 0, None)) * 100
            outs.append(Out("tio2_lp_sigma", bin_contains(e, C.lat, C.lon, sig), "wt%", "real", "같은 셀의 1σ (√E[4,4] × 100)", ["lp_grs"], pv, "셀 불확도"))
        hp = d.first(LP_H)
        if hp:
            e, v = _read_lp_hydrogen(hp)
            report["h_negative_cells"] = int((v < 0).sum())
            pv = [prov(hp, "lp_hydrogen_low", "위경도 표 (2° 등면적 셀 경계, −180..180)", "칸 중심이 들어 있는 셀 값", "-180..180")]
            outs.append(Out("h_ppm", bin_contains(e, C.lat, C.lon, v), "ppm", "real", "칸 중심이 들어 있는 LP Hydrogen_low 2° 셀 값", ["lp_grs"], pv,
                            "얼음 가능성 지표 · 검출 아님 (중성자 기반 추정, 음수 추정값 포함, 남극 0.5° 제품보다 거침)"))
    safe("lunar_prospector", lp)

    # 6. 지질: 단층애 거리, 낙석 밀도
    def geo():
        from luna.io.minerals import read_points_shp

        la_all, lo_all, pv, srcs = [], [], [], []
        pz = d.first(f"{SCARPS}/POLAR_SCARP_LOCATIONS_180.ZIP")
        if pz:
            pts = read_points_shp(pz, "POLAR_SCARP_LOCATIONS_180")
            sel = pts[pts["lat_deg"] > 0] if region == "north" else pts
            la_all.append(sel["lat_deg"].to_numpy(float))
            lo_all.append(sel["lon_deg"].to_numpy(float))
            pv.append(prov(pz, "scarps_polar", "GCS_Moon_2000 (−180..180)", "점 → 대권 거리", "-180..180"))
            srcs.append(f"극지 단층애 점 {len(sel)}개")
        if region == "global":
            lz = d.first(f"{SCARPS}/LOBATE_SCARPS_180.ZIP")
            if lz:
                la, lo = _polyline_vertices(lz, "LOBATE_SCARPS_180")
                la_all.append(la)
                lo_all.append(lo)
                pv.append(prov(lz, "scarps_lobate", "GCS_Moon_2000 (−180..180)", "선 정점을 1 km 간격으로 촘촘히 → 대권 거리", "-180..180"))
                srcs.append(f"LROC 단층애 선 (60°S–60°N, 정점 {la.size}개)")
        if la_all:
            la, lo = np.concatenate(la_all), np.concatenate(lo_all)
            report["scarps"] = srcs
            outs.append(Out("scarp_dist_km", C.nearest_km(la, lo), "km", "real", "알려진 단층애까지 최소 거리 (" + ", ".join(srcs) + ")", ["lroc_scarps"], pv,
                            "목록에 없는 곳이 단층이 없다는 뜻은 아님. 60° 보다 높은 위도는 점 목록이라 거리가 길게 나올 수 있다"))
        rf = d.first(ROCKFALLS)
        if rf:
            df = pd.read_csv(rf)
            df.columns = [str(c).strip() for c in df.columns]
            df = df.drop_duplicates()
            la, lo = df["C_LAT"].to_numpy(float), norm_lon(df["C_LON"].to_numpy(float))
            Rk = 10.0
            cnt = C.count_within(la, lo, Rk)
            cov = np.abs(C.lat) <= 80.0
            dens = np.where(cov | (cnt > 0), cnt / (np.pi * Rk * Rk), np.nan)
            report["rockfalls"] = {"rows": int(len(df)), "cells_with_detection": int((cnt > 0).sum()), "cells_no_data": int((~np.isfinite(dens)).sum())}
            pv = [prov(rf, "rockfalls", "위경도 표 (C_LAT·C_LON, −180..180)", "반경 10 km 대권 안 검출 수", "-180..180")]
            outs.append(Out("rockfall_density", dens, "1/km2", "real", "반경 10 km 안 낙석 검출 수 / 면적 (신뢰도 0.6 이상)", ["bickel_rockfalls"], pv,
                            "검출 수이지 낙석 발생 확률이 아님. 80° 보다 높은 위도는 검출 범위 밖이라 검출 없는 칸은 자료 없음. 0 은 '검출 없음'"))
            outs.append(Out("rockfall_coverage", cov.astype(float), "flag", "real", "1 = 공식 검출 범위(|위도| ≤ 80°) 안", ["bickel_rockfalls"], pv, None))
    safe("geology", geo)

    # 쓰기
    od = OUTDIR[region]
    lat_rng = [C.spec.lat_limit_deg, 90] if region == "north" else [-C.spec.lat_max_deg, C.spec.lat_max_deg]
    metas = []
    for o in outs:
        write_bin(ctx, f"{od}/layers/{o.name}.f32", o.arr.astype(np.float32), "<f4")
        fin = np.isfinite(o.arr)
        q = lowest_quality([p.quality for p in o.prov]) if o.prov else "VALIDATED"
        metas.append(LayerMeta(o.name, f"layers/{o.name}.f32", o.unit, o.kind, q, o.stat, o.source_keys, {"valid_cells": int(fin.sum()), "lat_range_deg": lat_rng}, o.caution))
        _preview(C, o, ctx.build_path(f"preview/layers_{region}/{o.name}.png"))
        log.info(name, f"{o.name:<16} 유효 칸 {int(fin.sum()):>6}/{C.n}  품질 {q}")
    write_envelope(ctx, f"{od}/layers.json", Envelope(SCHEMA, metas, [p for o in outs for p in o.prov], notes=["원본에 없는 칸은 NaN", f"{region} 격자 레이어 (s50_regions)"]))
    ctx.build_path(f"s50_{region}/report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return 0 if outs else 1


def _preview(C: Cells, o: Out, path: Path) -> None:
    if C.region == "north":
        n = C.spec.n
        img = np.full(n * n, np.nan)
        img[C.cells] = o.arr
        save_gray(img.reshape(n, n), path)
    else:
        la, lo = np.meshgrid(np.linspace(74.9, -74.9, 300), np.linspace(-179.9, 179.9, 720), indexing="ij")
        i = C.index(la.ravel(), lo.ravel())
        v = np.where(i >= 0, o.arr[np.maximum(i, 0)], np.nan).reshape(la.shape)
        save_gray(v, path)


def slope_method_check(ctx: Ctx) -> dict | None:
    """전역 경사 계산법 대조: 북극 ldem_75n_240m 에서 같은 중앙차분으로 구한 경사 vs PDS LDSM_75N_240M (화소 단위, 표본 행)."""
    d = ctx.data
    dl, sl = d.first(f"{DEM_N}/ldem_75n_240m.lbl"), d.first(f"{SLOPE}/ldsm_75n_240m.lbl")
    if not (dl and sl):
        return None
    dem, ref = read_pds_image(dl), read_pds_image(sl)
    if dem.data.shape != ref.data.shape:
        return {"error": f"크기 다름 {dem.data.shape} vs {ref.data.shape}"}
    lines = dem.data.shape[0]
    ours, theirs = [], []
    for r0 in range(64, lines - 64, max(1, lines // 24)):
        sl_, _, _ = _slope_from_polar_dem(dem, r0, r0 + 32)
        rv = _ldsm(ref, slice(r0, r0 + 32))
        ours.append(sl_.ravel())
        theirs.append(rv.ravel())
    a, b = np.concatenate(ours), np.concatenate(theirs)
    m = np.isfinite(a) & np.isfinite(b)
    diff = a[m] - b[m]
    return {"pixels": int(m.sum()), "corr": float(np.corrcoef(a[m], b[m])[0, 1]), "mean_diff_deg": float(diff.mean()), "median_abs_diff_deg": float(np.median(np.abs(diff))),
            "p95_abs_diff_deg": float(np.percentile(np.abs(diff), 95)), "ours_mean_deg": float(a[m].mean()), "ldsm_mean_deg": float(b[m].mean()),
            "note": "LDSM 240 m 의 DN 0 화소는 결측으로 제외"}
