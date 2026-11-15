"""s50 layers: 칸별 정적 레이어 (CLAUDE.md 8.5). 원본에 없는 칸은 NaN.

장기 평균(PGDA69) 레이어는 이름·caution 으로 "장기 평균"임을 표시한다 (원칙 4).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

from luna import log
from luna.contracts import Envelope, LayerMeta, Provenance
from luna.geo.frames import detect_lon_convention, norm_lon
from luna.geo.polar import GridSpec, aeqd_forward
import pandas as pd

from luna.io.tables import ColumnError, bin_contains, bin_edges, find_col, read_csv
from luna.preview import save_gray
from luna.stages.common import Ctx, write_bin, write_envelope

NAME = "s50"
#: PDS 32비트 실수 특수값(NULL·포화)은 모두 −3.4e38 근처. 이보다 작으면 결측
PDS_FLOAT_SPECIAL_MAX = -1e30
SCHEMA = "luna.layers.v1"


class Binner:
    """위경도 → 유효 칸 번호 (−1 = 격자 밖)."""

    def __init__(self, spec: GridSpec, cells: np.ndarray):
        self.spec = spec
        self.n_cells = cells.size
        self.lut = np.full(spec.n * spec.n, -1, dtype=np.int64)
        self.lut[cells] = np.arange(cells.size)
        X, Y = spec.centers()
        self.cx = X.ravel()[cells]
        self.cy = Y.ravel()[cells]

    def index(self, lat, lon) -> np.ndarray:
        x, y = aeqd_forward(lat, lon)
        col = np.floor((x - self.spec.x0_km) / self.spec.cell_km).astype(np.int64)
        row = np.floor((self.spec.y0_km - y) / self.spec.cell_km).astype(np.int64)
        ok = (col >= 0) & (row >= 0) & (col < self.spec.n) & (row < self.spec.n)
        out = np.full(np.shape(x), -1, dtype=np.int64)
        out[ok] = self.lut[row[ok] * self.spec.n + col[ok]]
        return out


class MeanAgg:
    def __init__(self, n: int):
        self.s = np.zeros(n)
        self.c = np.zeros(n)

    def add(self, idx: np.ndarray, v: np.ndarray) -> None:
        ok = (idx >= 0) & np.isfinite(v)
        self.s += np.bincount(idx[ok], weights=v[ok], minlength=self.s.size)
        self.c += np.bincount(idx[ok], minlength=self.c.size)

    def result(self) -> np.ndarray:
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.c > 0, self.s / self.c, np.nan)


class HistAgg:
    """칸별 히스토그램으로 분위수 (경사 0–90°, 0.25° 간격)."""

    def __init__(self, n: int, lo: float = 0.0, hi: float = 90.0, step: float = 0.25):
        self.lo, self.step = lo, step
        self.nb = int(round((hi - lo) / step))
        self.h = np.zeros((n, self.nb), dtype=np.int32)

    def add(self, idx: np.ndarray, v: np.ndarray) -> None:
        ok = (idx >= 0) & np.isfinite(v)
        b = np.clip(((v[ok] - self.lo) / self.step).astype(np.int64), 0, self.nb - 1)
        np.add.at(self.h, (idx[ok], b), 1)

    def quantile(self, q: float) -> np.ndarray:
        tot = self.h.sum(axis=1)
        cum = np.cumsum(self.h, axis=1)
        k = np.argmax(cum >= (q * tot)[:, None], axis=1)
        return np.where(tot > 0, self.lo + (k + 0.5) * self.step, np.nan)

    def count(self) -> np.ndarray:
        return self.h.sum(axis=1)


def raster_mean(ctx: Ctx, binner: Binner, paths: list[Path], scale_fn: Callable[[np.ndarray], np.ndarray] | None = None) -> np.ndarray:
    from luna.io.geotiff import iter_blocks

    agg = MeanAgg(binner.n_cells)
    for p in paths:
        for a, lat, lon in iter_blocks(p):
            v = scale_fn(a) if scale_fn else a
            agg.add(binner.index(lat.ravel(), lon.ravel()), v.ravel())
    return agg.result()


def nearest_km(binner: Binner, px: np.ndarray, py: np.ndarray, chunk: int = 2048) -> np.ndarray:
    """칸 중심에서 점 집합까지 최소 거리 (AEQD 평면 km)."""
    out = np.full(binner.n_cells, np.nan)
    if px.size == 0:
        return out
    for i in range(0, binner.n_cells, chunk):
        dx = binner.cx[i:i + chunk, None] - px[None, :]
        dy = binner.cy[i:i + chunk, None] - py[None, :]
        out[i:i + chunk] = np.sqrt((dx * dx + dy * dy).min(axis=1))
    return out


def nearest_value(binner: Binner, lat: np.ndarray, lon: np.ndarray, val: np.ndarray, max_km: float) -> np.ndarray:
    ok = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(val)
    px, py = aeqd_forward(lat[ok], lon[ok])
    v = val[ok]
    out = np.full(binner.n_cells, np.nan)
    for i in range(0, binner.n_cells, 1024):
        dx = binner.cx[i:i + 1024, None] - px[None, :]
        dy = binner.cy[i:i + 1024, None] - py[None, :]
        d2 = dx * dx + dy * dy
        k = d2.argmin(axis=1)
        dmin = np.sqrt(d2[np.arange(k.size), k])
        out[i:i + 1024] = np.where(dmin <= max_km, v[k], np.nan)
    return out


def table_layer(ctx: Ctx, path: Path, binner: Binner, value_cols: list[str], max_km: float):
    df = read_csv(path)
    df.columns = [str(c).strip() for c in df.columns]
    edges = bin_edges(df)
    if edges is not None:
        # 칸 경계가 있는 표(LP 0.5°, GRS 원 격자): 칸 중심이 들어 있는 칸의 값
        vc = next((c for c in value_cols if c in df.columns), None)
        if vc is None:
            raise ColumnError(f"{path.name}: 값 열을 정하지 못했다. 있는 열 {list(df.columns)} — s50 value_cols 에 추가")
        from luna.geo.polar import aeqd_inverse

        lat_q, lon_q = aeqd_inverse(binner.cx, binner.cy)
        vals = pd.to_numeric(df[vc], errors="coerce").to_numpy(float)
        conv = "-180..180" if np.nanmax(edges[3]) <= 180 else "0..360"
        return bin_contains(edges, np.asarray(lat_q), np.asarray(lon_q), vals), f"칸 경계 {conv}", vc
    la, lo = find_col(df, "lat"), find_col(df, "lon")
    try:
        vc = find_col(df, "value", value_cols)
    except ColumnError:
        nums = [c for c in df.columns if c not in (la, lo) and np.issubdtype(df[c].dtype, np.number)]
        if len(nums) != 1:
            raise ColumnError(f"{path.name}: 값 열을 정하지 못했다. 후보 {nums} — s50 value_cols 에 이름 추가")
        vc = nums[0]
    lat = df[la].to_numpy(float)
    lon_raw = df[lo].to_numpy(float)
    conv = detect_lon_convention(lon_raw)
    vals = df[vc].to_numpy(float)
    return nearest_value(binner, lat, norm_lon(lon_raw), vals, max_km), conv, vc


@dataclass
class Out:
    name: str
    arr: np.ndarray
    unit: str
    kind: str
    stat: str
    source_keys: list[str]
    prov: list[Provenance]
    caution: str | None = None


def _check_frac(name: str, a: np.ndarray) -> np.ndarray:
    """비율 레이어 범위 검사 (0–1). 밖이면 배율을 잘못 읽은 것이므로 멈춘다.

    예전에는 블록마다 "최댓값 > 1.5 면 퍼센트" 로 추측해 블록별로 다르게 나눴다 → 버그.
    이제 배율은 GeoTIFF 밴드 scale/offset(band_scale)·PDS 라벨에서만 정한다.
    """
    fin = a[np.isfinite(a)]
    if fin.size and (fin.min() < -1e-6 or fin.max() > 1.0 + 1e-6):
        raise ValueError(f"{name}: 비율 레이어가 0–1 밖 ({fin.min():.4g}–{fin.max():.4g}) — 배율 확인 필요")
    return a


MIN_DIR = "Web_Derived/Mineral_Resources_3D_2026-11-15"
KAGUYA_RAW = "Raw_Data/Gap_Supplements_2026-11-14/science/Kaguya_SP_LOLA_v2"


class CellStats:
    """칸별 화소 수·유효 화소 수·유효 값 합 (+ 유효 값 목록은 중앙값용으로 선택)."""

    def __init__(self, n: int, keep_values: bool = False):
        self.total = np.zeros(n)
        self.valid = np.zeros(n)
        self.s = np.zeros(n)
        self.extra: dict[str, np.ndarray] = {}
        self.keep = keep_values
        self._idx: list[np.ndarray] = []
        self._val: list[np.ndarray] = []

    def add(self, idx: np.ndarray, v: np.ndarray, valid: np.ndarray, **flags: np.ndarray) -> None:
        inside = idx >= 0
        self.total += np.bincount(idx[inside], minlength=self.total.size)
        ok = inside & valid
        self.valid += np.bincount(idx[ok], minlength=self.total.size)
        self.s += np.bincount(idx[ok], weights=v[ok], minlength=self.total.size)
        for k, f in flags.items():
            self.extra.setdefault(k, np.zeros(self.total.size))
            self.extra[k] += np.bincount(idx[inside & f], minlength=self.total.size)
        if self.keep:
            self._idx.append(idx[ok])
            self._val.append(v[ok])

    def mean(self) -> np.ndarray:
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.valid > 0, self.s / self.valid, np.nan)

    def frac(self, num: np.ndarray | None = None, den: np.ndarray | None = None) -> np.ndarray:
        num = self.valid if num is None else num
        den = self.total if den is None else den
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(den > 0, num / den, np.nan)

    def median(self) -> np.ndarray:
        out = np.full(self.total.size, np.nan)
        if not self._idx:
            return out
        idx = np.concatenate(self._idx)
        val = np.concatenate(self._val)
        order = np.lexsort((val, idx))
        idx, val = idx[order], val[order]
        starts = np.flatnonzero(np.r_[True, idx[1:] != idx[:-1]])
        ends = np.r_[starts[1:], idx.size]
        for s, e in zip(starts, ends):
            m = (e - s) // 2
            out[idx[s]] = val[s + m] if (e - s) % 2 else 0.5 * (val[s + m - 1] + val[s + m])
        return out


def _corr(a: np.ndarray, b: np.ndarray) -> float | None:
    m = np.isfinite(a) & np.isfinite(b)
    if m.sum() < 3 or np.std(a[m]) == 0 or np.std(b[m]) == 0:
        return None
    return float(np.corrcoef(a[m], b[m])[0, 1])


def kaguya_feo(ctx: Ctx, binner: Binner, prior: list[Out], report: dict) -> list[Out]:
    """작업 5: Kaguya SP+LOLA v2 남극 FeO (약 1 km). 정규화된 COG 를 주 입력으로, 원본 ZIP 어댑터로 교차 확인."""
    import rasterio

    from luna.io.archives import restore_bundle_members
    from luna.io.geotiff import _transformer
    from luna.io.kaguya import feo_values, read_raw_zip
    from luna.provenance import sha256_file

    d = ctx.data
    man = d.path(f"{MIN_DIR}/DOWNLOAD_AND_INSTALL.json")
    if not man.exists():
        log.warn(NAME, "광물 묶음 매니페스트 없음 → Kaguya FeO 생략")
        return []
    feo_m, cls_m = "numeric/kaguya/kaguya_south_feo_wtpct.tif", "numeric/kaguya/kaguya_south_support_class.tif"
    files = restore_bundle_members(man, "NATIVE_NUMERIC_KAGUYA.zip", [feo_m, cls_m], ctx.build)
    for member in (feo_m, cls_m):
        ctx.record_input(files[member], "kaguya_validation_cog_input")
    with rasterio.open(files[feo_m]) as ds, rasterio.open(files[cls_m]) as dq:
        v = ds.read(1).astype(np.float64)
        q = dq.read(1)
        T, crs = ds.transform, ds.crs
        n_r, n_c = ds.height, ds.width
    wkt = crs.to_wkt()
    if "Stereographic_South_Pole" not in wkt or "1737400" not in wkt:
        raise ValueError(f"Kaguya COG CRS 가 인계 문서(달 남극 평사도법 R=1737.4 km)와 다르다: {wkt[:120]}")
    if abs(T.a - 1002.350336) > 1e-3 or abs(T.c + 1267472) > 1 or abs(T.f - 1267472) > 1:
        raise ValueError(f"Kaguya COG 변환이 인계 문서 값과 다르다: {tuple(T)[:6]}")
    inv = _transformer(crs, inverse=True)
    cols = np.arange(n_c) + 0.5
    st = CellStats(binner.n_cells)
    st_flip = CellStats(binner.n_cells)  # 방향 확인용: 행을 뒤집었다고 가정한 배치
    for r0 in range(0, n_r, 256):
        rows = np.arange(r0, min(n_r, r0 + 256)) + 0.5
        C, R = np.meshgrid(cols, rows)
        X, Y = T.c + C * T.a, T.f + R * T.e
        lon, lat = inv.transform(X, Y)
        idx = binner.index(np.asarray(lat).ravel(), np.asarray(lon).ravel())
        vv, qq = v[r0:r0 + rows.size].ravel(), q[r0:r0 + rows.size].ravel()
        st.add(idx, vv, (qq == 1) & np.isfinite(vv), interp=(qq == 4))
        lon2, lat2 = inv.transform(X, -Y)
        st_flip.add(binner.index(np.asarray(lat2).ravel(), np.asarray(lon2).ravel()), vv, (qq == 1) & np.isfinite(vv), interp=(qq == 4))
    feo = st.mean()
    vfrac = st.frac()
    # ── 원본 ZIP 어댑터 대조 (좌표 해석의 독립 확인) ──
    rep: dict = {"cog_crs": crs.to_string()[:200], "cog_transform": list(tuple(T)[:6])}
    rz, cz = d.path(f"{KAGUYA_RAW}/gridded_feo_mosaic_south_pole.tif.zip"), d.path(f"{KAGUYA_RAW}/gridded_spectral_profiler_counts_south_pole.tif.zip")
    prov_list = [ctx.prov(man, "kaguya_feo_bundle_manifest", allow_unlisted=True,
                          source_crs="Moon_2000 남극 평사도법 R=1737.4 km, 1002.35 m (저자 v2 메타데이터에서 복원한 COG)",
                          transform="품질 1 화소만 → 달 위경도(pyproj) → AEQD 칸 평균")]
    prov_list[0].transform += f" · COG {feo_m} SHA-256 {sha256_file(files[feo_m])[:16]}…"
    if rz.exists() and cz.exists():
        ctx.record_input(cz, "kaguya_validation_counts")
        raw, cnt = read_raw_zip(rz), read_raw_zip(cz)
        rv, rq = feo_values(raw, cnt.data)
        both = np.isfinite(rv) & np.isfinite(v)
        Xc = raw.x0_m + (np.arange(n_c) + 0.5) * raw.cell_m
        Yc = raw.y0_m - (np.arange(n_r) + 0.5) * raw.cell_m
        rho = np.hypot(*np.meshgrid(Xc, Yc))
        lat_px = np.degrees(2 * np.arctan(rho / (2 * 1737400.0))) - 90.0
        diff_q = rq != q
        rep["raw_adapter"] = {
            "corner_raw_m": [raw.x0_m, raw.y0_m, raw.cell_m], "corner_cog_m": [T.c, T.f, T.a],
            "rows_flipped_from_tiff": raw.flipped,
            "both_valid_pixels": int(both.sum()), "max_abs_diff_wt": float(np.abs(rv[both] - v[both]).max()) if both.any() else None,
            "quality_code_mismatch_pixels": int(diff_q.sum()),
            "quality_mismatch_lat_range": [float(lat_px[diff_q].min()), float(lat_px[diff_q].max())] if diff_q.any() else None,
            "note": "불일치 화소는 모두 COG 공칭 범위(남위 50° 이남) 밖 모서리 — COG 가 범위로 자른 것",
            "feo_missing_marker_pixels": int(np.isclose(raw.data, -10.0).sum()),
        }
        prov_list.append(ctx.prov(rz, "kaguya_feo_raw", allow_unlisted=True, source_crs="TIFF 에 CRS 없음 · .aux.xml ESRI 기준점 4개(÷해상도 100)"))
    # ── 방향 확인: 보간 전용(관측 수 0) 화소 비율 ↔ 영구음영 비율 (분광 관측은 그늘에서 비어 있다) ──
    psr = next((o.arr for o in prior if o.name == "psr_frac"), None)
    if psr is not None:
        rep["orientation_check"] = {
            "corr_interp_frac_vs_psr_frac": _corr(st.frac(st.extra["interp"]), psr),
            "corr_if_rows_flipped": _corr(st_flip.frac(st_flip.extra["interp"]), psr),
            "note": "보간 전용 화소(관측 수 0)는 영구음영 같은 그늘에 몰린다. 지금 배치의 상관이 뒤집은 배치보다 높아야 방향이 맞다",
        }
    # ── Lunar Prospector FeO (0.5°) 와 대조: 같은 0.5° 칸 단위 평균 ──
    lp = d.first("SouthPolar_75S_90S_v1/Regional/Composition/LP_ironhd_75S90S_0p5deg.csv")
    if lp:
        ctx.record_input(lp, "kaguya_validation_lp_reference")
        df = read_csv(lp)
        df.columns = [str(c).strip() for c in df.columns]
        s_, w_ = df["south_lat_deg"].to_numpy(float), df["west_lon_deg_east"].to_numpy(float)
        key_lp = np.round((s_ + 90) / 0.5).astype(int) * 10000 + np.round((w_ + 180) / 0.5).astype(int)
        # Kaguya 품질 1 화소를 0.5° 칸으로
        C, R = np.meshgrid(cols, np.arange(n_r) + 0.5)
        lon, lat = inv.transform(T.c + C * T.a, T.f + R * T.e)
        lat, lon = np.asarray(lat).ravel(), norm_lon(np.asarray(lon).ravel())
        ok = (q.ravel() == 1) & np.isfinite(v.ravel()) & (lat <= -75)
        kk = np.floor((lat[ok] + 90) / 0.5).astype(int) * 10000 + np.floor((lon[ok] + 180) / 0.5).astype(int)
        uk, inv_k = np.unique(kk, return_inverse=True)
        kmean = np.bincount(inv_k, weights=v.ravel()[ok]) / np.bincount(inv_k)
        lpv = dict(zip(key_lp, df["FeO_weight_percent"].to_numpy(float)))
        pairs = np.array([(kmean[i], lpv[k]) for i, k in enumerate(uk) if k in lpv and np.isfinite(lpv[k])])
        if len(pairs):
            dlt = pairs[:, 0] - pairs[:, 1]
            rep["vs_lp_0p5deg"] = {"bins": int(len(pairs)), "kaguya_minus_lp_mean": float(dlt.mean()), "median": float(np.median(dlt)),
                                   "p05_p95": [float(np.percentile(dlt, 5)), float(np.percentile(dlt, 95))], "corr": _corr(pairs[:, 0], pairs[:, 1]),
                                   "note": "측정 방식이 달라(가시·근적외 분광 모델 vs 감마선) 같을 필요는 없다"}
    report["feo_kaguya"] = rep
    cau = "모델 추정값(Lemelin 외 2022, Zenodo 7108163, CC BY 4.0). 원래 해상도 1002 m. 관측 수 0(보간) 칸·−10 결측 제외. 매장량 아님"
    return [
        Out("feo_wt_kaguya", feo, "wt%", "real", "칸 안 유효(품질 1) 화소 평균 · 원래 해상도 약 1 km", ["kaguya_sp_lola"], prov_list, cau),
        Out("feo_kaguya_valid_frac", vfrac, "frac", "real", "칸 안 화소 중 유효(품질 1) 비율", ["kaguya_sp_lola"], prov_list, "낮을수록 칸 값이 적은 화소에 기댄다"),
    ]


def jaxa_tio2_research(ctx: Ctx, binner: Binner, prior: list[Out], report: dict) -> list[Out]:
    """작업 6 (계획서 2026-11-15 결정): JAXA MI TiO₂ 75~85°S 는 정량 사용 보류 → 연구용 레이어만.

    - 대표값(평균·절단 평균·2~15 wt% 만 남긴 값·중앙값)을 만들지 않는다. 칸 중심에 가장 가까운 원래 화소 값을 그대로 싣는다
      (source_estimate). 0~2 wt% 는 보존하고 15 wt% 초과도 자르지 않는다. 공급자 마스크가 결측인 곳만 NaN.
    - 플래그(비트): 1 provider_valid · 2 upper_tail_suspect(원래 값 > 15 wt%, 진단용) · 4 near_missing(결측에서 Chebyshev 3 화소 이내).
      원인·물리적 불가능을 뜻하지 않는다. scientific_status 는 레이어 전체가 "polar_quantitative_unvalidated".
    - 이 레이어는 점수·필터·순위·내보내기에 연결하지 않는다 (웹). 85°S 이남은 자료 없음.
    """

    return _jaxa_research(ctx, binner, report)


def _near_missing(valid: np.ndarray, k: int = 3) -> np.ndarray:
    """결측(공급자 무효)에서 Chebyshev 거리 k 화소 이내인 화소. 경도 방향은 원형으로 잇는다."""
    miss = ~valid
    pad = np.concatenate([miss[:, -k:], miss, miss[:, :k]], axis=1)
    out = np.zeros_like(pad)
    for dr in range(-k, k + 1):
        sh = np.roll(pad, dr, axis=0)
        if dr > 0:
            sh[:dr] = False
        elif dr < 0:
            sh[dr:] = False
        for dc in range(-k, k + 1):
            out |= np.roll(sh, dc, axis=1)
    return out[:, k:-k]


def _jaxa_research(ctx: Ctx, binner: Binner, report: dict) -> list[Out]:
    import rasterio
    from rasterio.windows import Window

    from luna.io.archives import restore_bundle_members
    from luna.provenance import sha256_file

    man = ctx.data.path(f"{MIN_DIR}/DOWNLOAD_AND_INSTALL.json")
    if not man.exists():
        return []
    tm, qm = "numeric/alternatives/jaxa_mi_tio2_wt_percent_16ppd.tif", "numeric/alternatives/jaxa_mi_tio2_quality_16ppd.tif"
    files = restore_bundle_members(man, "NATIVE_NUMERIC_ALTERNATIVES.zip", [tm, qm], ctx.build)
    for member in (tm, qm):
        ctx.record_input(files[member], "jaxa_validation_cog_input")
    lat_max = ctx.settings.grid.lat_limit_deg + 0.5
    with rasterio.open(files[tm]) as ds, rasterio.open(files[qm]) as dq:
        if ds.crs is None or "104903" not in ds.crs.to_string():
            raise ValueError(f"JAXA MI CRS 가 예상(ESRI:104903)과 다르다: {ds.crs}")
        T = ds.transform
        r0 = max(0, int(np.floor((T.f - lat_max) / -T.e)) - 3)  # 근접 결측 판정용 여유 3행
        v = ds.read(1, window=Window(0, r0, ds.width, ds.height - r0)).astype(np.float64)
        q = dq.read(1, window=Window(0, r0, ds.width, ds.height - r0))
    valid = (q == 1) & np.isfinite(v)
    near = _near_missing(valid, 3)
    lat_rows = T.f + (r0 + np.arange(v.shape[0]) + 0.5) * T.e
    lon_cols = T.c + (np.arange(v.shape[1]) + 0.5) * T.a
    # 위도대별 점검 표 (분모: 15 wt% 를 빼기 전 유효값, 픽셀 기준)
    bands = []
    for lo in range(-85, int(np.floor(lat_max)), 1):
        m = (lat_rows >= lo) & (lat_rows < lo + 1)
        if not m.any():
            continue
        vv, ok = v[m], valid[m]
        n = ok.sum()
        bands.append({"band": f"{-lo - 1}–{-lo}°S", "provider_valid_frac": float(n / ok.size),
                      "over15_of_valid": float((ok & (vv > 15)).sum() / n) if n else None,
                      "below2_of_valid": float((ok & (vv < 2)).sum() / n) if n else None})
    # 칸 중심 → 가장 가까운 원래 화소 (집계하지 않는다)
    from luna.geo.polar import aeqd_inverse

    clat, clon = aeqd_inverse(binner.cx, binner.cy)
    clat, clon = np.asarray(clat), np.asarray(clon)
    ri = np.floor((T.f - clat) / -T.e).astype(np.int64) - r0
    ci = np.floor((clon - T.c) / T.a).astype(np.int64) % v.shape[1]
    inside = (clat >= -85.0) & (ri >= 0) & (ri < v.shape[0])
    est = np.full(binner.n_cells, np.nan)
    flags = np.zeros(binner.n_cells)
    rr, cc = ri[inside], ci[inside]
    pv = valid[rr, cc]
    est[np.flatnonzero(inside)[pv]] = v[rr, cc][pv]
    f = pv.astype(float) * 1 + (pv & (v[rr, cc] > 15)).astype(float) * 2 + (pv & near[rr, cc]).astype(float) * 4
    flags[inside] = f
    report["tio2_jaxa_mi"] = {
        "decision": "75~85°S 정량 사용 보류 (계획서 작업 6, 독립 검토 JAXA_MI_TIO2_POLAR_REVIEW_DEVELOPER_2026-11-15_0409)",
        "scientific_status": "polar_quantitative_unvalidated", "detection_limit_wt_percent": None,
        "latitude_bands": bands, "cells_provider_valid": int(np.isfinite(est).sum()),
        "cells_upper_tail_suspect": int(((flags.astype(int) & 2) > 0).sum()), "cells_near_missing": int(((flags.astype(int) & 4) > 0).sum()),
        "south_of_85S": "공급자 유효 범위(±85°) 밖 → 자료 없음",
        "sampling": "칸 중심에 가장 가까운 원래 16 ppd 화소 (평균·중앙값 등 대표값 아님)",
    }
    prov = [ctx.prov(man, "jaxa_mi_tio2_bundle_manifest", allow_unlisted=True, source_crs="달 경위도 ESRI:104903, 16 ppd (공식 128 ppd 서비스의 최근접 내보내기)",
                     transform="칸 중심 최근접 원래 화소, 값 변경 없음")]
    prov[0].transform += f" · {tm} SHA-256 {sha256_file(files[tm])[:16]}…"
    cau = "JAXA MI TiO₂ 추정값 — 남극 고위도 정량 미검증. 연구용 보기 전용(점수·필터·순위·내보내기에 쓰지 않음). 칸 중심의 원래 화소 값이며 칸 대표값이 아님. ISAS Data Policy. 85°S 이남 자료 없음"
    return [
        Out("tio2_jaxa_mi_research", est, "wt%", "real", "source_estimate: 칸 중심 최근접 원래 화소 (16 ppd, 약 1.9 km)", ["jaxa_mi_tio2"], prov, cau),
        Out("tio2_jaxa_mi_flags", flags, "bits", "real", "1 provider_valid · 2 upper_tail_suspect(>15 wt%, 진단용) · 4 near_missing(결측 3화소 이내)", ["jaxa_mi_tio2"], prov,
            "검토 플래그. 원인이나 물리적 불가능을 뜻하지 않는다"),
    ]


def lp_tio2(ctx: Ctx, binner: Binner, report: dict) -> list[Out]:
    """작업 6: LP GRS TiO₂ 를 남극 지역 조성 레이어로. 원래 2° 등면적 셀(약 60 km) 경계 그대로, 셀 1σ 함께. 다른 셀 크기로 메우지 않는다."""
    from luna.geo.polar import aeqd_inverse

    p = ctx.data.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/LP_GRS_TiO2_native_75S90S.csv")
    if not p:
        return []
    df = read_csv(p)
    df.columns = [str(c).strip() for c in df.columns]
    df = df[pd.to_numeric(df["grid_deg"], errors="coerce") == 2]
    if df.empty:
        ctx.record_input(p, "tio2_lp_no_2deg_rows", "위경도 표 (셀 경계)")
        report["tio2_lp"] = {"cells_2deg": 0, "grid_cells_with_value": 0,
                             "grid_cells_without_2deg_cell": int(binner.cx.size), "status": "NO_DATA", "reason": "no_2deg_rows"}
        log.warn(NAME, "LP TiO₂ 2° 셀 없음 → 선택 레이어 생략 (다른 셀 크기로 메우지 않음)")
        return []
    edges = tuple(pd.to_numeric(df[c], errors="coerce").to_numpy(float) for c in ("south_deg", "north_deg", "west_deg", "east_deg"))
    lat_q, lon_q = aeqd_inverse(binner.cx, binner.cy)
    lat_q, lon_q = np.asarray(lat_q), np.asarray(lon_q)
    val = bin_contains(edges, lat_q, lon_q, pd.to_numeric(df["TiO2_wt_pct"], errors="coerce").to_numpy(float))
    sig = bin_contains(edges, lat_q, lon_q, pd.to_numeric(df["TiO2_1sigma_wt_pct"], errors="coerce").to_numpy(float))
    report["tio2_lp"] = {"cells_2deg": int(len(df)), "grid_cells_with_value": int(np.isfinite(val).sum()), "grid_cells_without_2deg_cell": int((~np.isfinite(val)).sum())}
    pv = [ctx.prov(p, "tio2_lp", source_crs="위경도 표 (2° 등면적 셀 경계)", lon_convention="-180..180", transform="격자 칸 중심이 들어 있는 2° 셀 값 (보간 없음)")]
    cau = "Lunar Prospector GRS 2° 등면적 셀(약 60 km) 지역 조성. 착륙지 규모의 값이 아님. 추정 분포"
    return [
        Out("tio2_wt_lp", val, "wt%", "real", "칸 중심이 들어 있는 LP 2° 셀 값 (TiO2_wt_pct)", ["lp_grs"], pv, cau),
        Out("tio2_lp_sigma", sig, "wt%", "real", "같은 셀의 1σ (TiO2_1sigma_wt_pct)", ["lp_grs"], pv, "셀 불확도"),
    ]


def geology(ctx: Ctx, binner: Binner, report: dict) -> list[Out]:
    """작업 7: Bickel 낙석 전역 목록(신뢰도 0.6) 남극 추출, LROC 극지 단층애 48점의 남쪽 점."""
    from luna.io.minerals import read_points_shp, rockfalls_south

    d = ctx.data
    out: list[Out] = []
    sz = d.first("Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP")
    if sz:
        pts = read_points_shp(sz, "POLAR_SCARP_LOCATIONS_180")
        south = pts[pts["lat_deg"] < 0]
        x, y = aeqd_forward(south["lat_deg"].to_numpy(), south["lon_deg"].to_numpy())
        out.append(Out("scarp_dist_km", nearest_km(binner, x, y), "km", "real", f"알려진 단층애 지점까지 최소 거리 (남쪽 {len(south)}점)", ["lroc_scarps"],
                       [ctx.prov(sz, "scarps", allow_unlisted=True, source_crs="GCS_Moon_2000 (도형 −180..180, 속성 LON 0..360 → 도형 기준)", lon_convention="-180..180")],
                       "알려진 단층애 지점까지의 거리. 점 자료라 단층선까지 거리보다 길게 나온다. 목록에 없는 곳이 단층이 없다는 뜻은 아님"))
        report["scarps"] = {"points_total": int(len(pts)), "points_south": int(len(south)), "points_south_75S": int((south["lat_deg"] <= -75).sum()),
                            "names_south": south["NAME"].tolist(), "previous_input": "LROC_Polar_Lobate_Scarps_75S90S.csv (3곳)"}
    rf = d.first("Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv")
    if rf:
        lat_lim = ctx.settings.grid.lat_limit_deg
        s, info = rockfalls_south(rf, lat_lim)
        x, y = aeqd_forward(s["lat_deg"].to_numpy(), s["lon_deg"].to_numpy())
        R = 10.0
        cnt = np.zeros(binner.n_cells)
        for i in range(0, binner.n_cells, 2048):
            dx = binner.cx[i:i + 2048, None] - x[None, :]
            dy = binner.cy[i:i + 2048, None] - y[None, :]
            cnt[i:i + 2048] = ((dx * dx + dy * dy) <= R * R).sum(axis=1)
        from luna.geo.polar import aeqd_inverse

        clat, _ = aeqd_inverse(binner.cx, binner.cy)
        # 공식 README: 검출은 80°S 까지만 (입사각 10–80° 영상). 범위 밖에서 검출이 없는 칸은 0 이 아니라 자료 없음.
        in_cov = np.asarray(clat) >= -80.0
        dens = cnt / (np.pi * R * R)
        dens = np.where(in_cov | (cnt > 0), dens, np.nan)
        # 이전 추출본과 같은지 확인
        old = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Bickel_Rockfalls_75S90S_06.csv")
        if old is not None:
            ctx.record_input(old, "rockfall_validation_previous_extract")
            o = read_csv(old)
            o.columns = [str(c).strip() for c in o.columns]
            same = len(o) == len(s) and len(o.merge(s[o.columns.tolist()], how="inner")) == len(o)
            info["same_rows_as_previous_extract"] = bool(same)
        x2 = np.c_[x, y] * 1000.0
        near = {}
        for t in (25, 50, 100):
            dd = np.hypot(x2[:, None, 0] - x2[None, :, 0], x2[:, None, 1] - x2[None, :, 1])
            np.fill_diagonal(dd, np.inf)
            near[f"pairs_within_{t}m"] = int((dd < t).sum() // 2)
        info["near_duplicates_not_merged"] = near
        info["readme_vs_data"] = f"README 는 80°S 까지라고 적었으나 80°S 이남 검출 {info['rows_south_of_80S']}개가 목록에 있다 → 검출 있는 칸은 값, 검출 없는 칸은 자료 없음"
        info["cells_no_data"] = int((~np.isfinite(dens)).sum())
        rf8 = d.first("Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_08.csv")
        if rf8:
            ctx.record_input(rf8, "rockfall_validation_confidence_08")
            s8, i8 = rockfalls_south(rf8, lat_lim)
            x8, y8 = aeqd_forward(s8["lat_deg"].to_numpy(), s8["lon_deg"].to_numpy())
            c8 = np.zeros(binner.n_cells)
            for i in range(0, binner.n_cells, 2048):
                dx = binner.cx[i:i + 2048, None] - x8[None, :]
                dy = binner.cy[i:i + 2048, None] - y8[None, :]
                c8[i:i + 2048] = ((dx * dx + dy * dy) <= R * R).sum(axis=1)
            k6 = s[["NAC_ID", "C_LON", "C_LAT"]].astype(str).agg("|".join, axis=1)
            k8 = s8[["NAC_ID", "C_LON", "C_LAT"]].astype(str).agg("|".join, axis=1)
            info["confidence_0p8_sensitivity"] = {"rows_south": int(len(s8)), "subset_of_0p6_rows": int(k8.isin(set(k6)).sum()),
                                                  "cells_with_detection_0p6": int((cnt > 0).sum()), "cells_with_detection_0p8": int((c8 > 0).sum()),
                                                  "density_corr": _corr(cnt, c8), "note": "신뢰도 기준을 0.8 로 올렸을 때 (레이어는 0.6 목록)"}
        report["rockfalls"] = info
        pv = [ctx.prov(rf, "rockfalls", allow_unlisted=True, source_crs="위경도 표 (C_LAT·C_LON, −180..180)", lon_convention="-180..180")]
        out.append(Out("rockfall_density", dens, "1/km2", "real", "반경 10 km 안 낙석 검출 수 / 면적 (신뢰도 0.6 이상)", ["bickel_rockfalls"], pv,
                       "검출 수이지 낙석 발생 확률이 아님. 80°S 이남은 검출 범위 밖이라 검출 없는 칸은 자료 없음. 0 은 '검출 없음'"))
        out.append(Out("rockfall_coverage", in_cov.astype(float), "flag", "real", "1 = 공식 검출 범위(80°S 북쪽) 안", ["bickel_rockfalls"], pv, None))
    return out


def _poly_reader(read_bytes, stem: str):
    """ZIP·7z 안의 shapefile → (shapefile.Reader, prj 문자열)."""
    import io

    import shapefile

    prj = read_bytes(f"{stem}.prj").decode("utf-8", "replace")
    r = shapefile.Reader(shp=io.BytesIO(read_bytes(f"{stem}.shp")), dbf=io.BytesIO(read_bytes(f"{stem}.dbf")))
    return r, prj


def _stereo_polys_to_aeqd(r, prj: str):
    """남극 평사도법(m) 폴리곤 → 남극 AEQD(km) shapely 폴리곤 목록. 좌표계 확인 실패면 멈춘다."""
    from pyproj import CRS, Transformer
    from shapely.geometry import Polygon
    from shapely.validation import make_valid

    from luna.constants import MOON_GEOG_PROJ4

    if "Stereographic_South_Pole" not in prj or "1737400" not in prj:
        raise ValueError(f"폴리곤 좌표계가 달 남극 평사도법(R=1737.4 km)이 아니다: {prj[:100]}")
    tr = Transformer.from_crs(CRS.from_wkt(prj), CRS.from_proj4(MOON_GEOG_PROJ4), always_xy=True)
    out = []
    for sh in r.shapes():
        parts = list(sh.parts) + [len(sh.points)]
        rings = []
        for a, b in zip(parts[:-1], parts[1:]):
            pts = np.asarray(sh.points[a:b], float)
            lon, lat = tr.transform(pts[:, 0], pts[:, 1])
            x, y = aeqd_forward(np.asarray(lat), np.asarray(lon))
            rings.append(list(zip(x, y)))
        if not rings or len(rings[0]) < 3:
            continue
        poly = Polygon(rings[0], rings[1:])
        out.append(poly if poly.is_valid else make_valid(poly))
    return out, tr


def extra_south(ctx: Ctx, binner: Binner, report: dict) -> list[Out]:
    """남극 보조 레이어 (2026-11-15 미연결 자료): 영구음영 폴리곤 거리, 극지 평원 비율, 섀클턴 바위 수, WAC 시간가중 조명률."""
    import zipfile

    from shapely import STRtree
    from shapely.geometry import Point, box

    d = ctx.data
    out: list[Out] = []
    # ── 영구음영 폴리곤 (LOLA PSR, 75–90°S): 칸 중심에서 가장 가까운 폴리곤까지 거리, 안이면 0 ──
    pz = d.first("Workspace/Codex_Data_Collection/01_NASA_Downloads/Illumination/NAC_POLE_PSR_SOUTH/LOLA_PSR_75S90S_complete_features.zip")
    if pz:
        try:
            with zipfile.ZipFile(pz) as z:
                r, prj = _poly_reader(lambda n: z.read(f"LOLA_PSR_75S90S_complete_features{n[n.index('.'):]}"), "LOLA_PSR_75S90S_complete_features")
            polys, _ = _stereo_polys_to_aeqd(r, prj)
            tree = STRtree(polys)
            pts = [Point(x, y) for x, y in zip(binner.cx, binner.cy)]
            idx = tree.query_nearest(pts, all_matches=False)
            dist = np.array([polys[j].distance(pts[i]) for i, j in zip(*idx)])
            arr = np.full(binner.n_cells, np.nan)
            arr[idx[0]] = dist
            ras = np.fromfile(ctx.out / "grid" / "layers" / "psr_dist_km.f32", dtype="<f4").astype(float) if (ctx.out / "grid" / "layers" / "psr_dist_km.f32").exists() else None
            rep = {"polygons": len(polys), "area_km2_min": float(min(r.record(i)["area"] for i in range(len(r)))),
                   "note": "폴리곤 경계까지 거리(5 km 칸 중심 기준). PGDA69 래스터 기반 psr_dist_km 과 별도 레이어"}
            if ras is not None:
                m = np.isfinite(ras) & np.isfinite(arr)
                dd = arr[m] - ras[m]
                rep["vs_raster_psr_dist"] = {"cells": int(m.sum()), "mean_diff_km": float(dd.mean()), "median_diff_km": float(np.median(dd)),
                                             "p95_abs_km": float(np.percentile(np.abs(dd), 95)), "corr": _corr(arr[m], ras[m]),
                                             "note": "폴리곤은 일정 면적 이상의 영구음영만 담는다 → 래스터(작은 그늘 포함)보다 거리가 길게 나오는 것이 정상"}
            report["psr_polygons"] = rep
            out.append(Out("psr_poly_dist_km", arr, "km", "real", "LOLA 영구음영 폴리곤 경계까지 최소 거리 (안은 0)", ["lola_psr_polygons"],
                           [ctx.prov(pz, "psr_polygons", allow_unlisted=True, source_crs="남극 평사도법 R=1737.4 km (.prj)", transform="폴리곤 → 위경도 → AEQD, 칸 중심 거리")],
                           "얼음 가능성 지표 · 검출 아님. 일정 면적 이상의 영구음영만"))
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"영구음영 폴리곤 실패: {e}")
    # ── 극지 평원 지질도 (PolarPlains_Mapping.7z): 칸 면적 중 평원 비율. 매핑 범위(평사 ±304 km 정사각) 밖은 자료 없음 ──
    pp = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/PolarPlains_Mapping.7z")
    if pp:
        try:
            import py7zr

            with py7zr.SevenZipFile(pp) as z:
                files = {k: (v.read() if hasattr(v, "read") else v) for k, v in z.readall().items()}
            r, prj = _poly_reader(lambda n: files[n], "PolarPlains_Mapping")
            polys, tr = _stereo_polys_to_aeqd(r, prj)
            from pyproj import CRS, Transformer

            from luna.constants import MOON_GEOG_PROJ4
            from luna.geo.polar import aeqd_inverse

            fwd = Transformer.from_crs(CRS.from_proj4(MOON_GEOG_PROJ4), CRS.from_wkt(prj), always_xy=True)
            ext = r.bbox  # 매핑 범위 (데이터 경계가 정확히 ±304,000 m)
            clat, clon = aeqd_inverse(binner.cx, binner.cy)
            sx, sy = fwd.transform(np.asarray(clon), np.asarray(clat))
            inside = (sx >= ext[0]) & (sx <= ext[2]) & (sy >= ext[1]) & (sy <= ext[3])
            tree = STRtree(polys)
            half = binner.spec.cell_km / 2
            frac = np.full(binner.n_cells, np.nan)
            for i in np.flatnonzero(inside):
                cell = box(binner.cx[i] - half, binner.cy[i] - half, binner.cx[i] + half, binner.cy[i] + half)
                hits = tree.query(cell)
                frac[i] = sum(polys[j].intersection(cell).area for j in hits) / cell.area if len(hits) else 0.0
            frac = np.clip(frac, 0, 1)
            report["polar_plains"] = {"polygons": len(polys), "mapped_extent_m": list(ext), "cells_in_extent": int(inside.sum()),
                                      "cells_with_plains": int((frac > 0).sum())}
            out.append(Out("plains_frac", frac, "frac", "real", "칸 면적 중 극지 평원 폴리곤 비율", ["polar_plains"],
                           [ctx.prov(pp, "polar_plains", allow_unlisted=True, source_crs="남극 평사도법 R=1737.4 km (.prj)", transform="폴리곤 → 위경도 → AEQD, 칸 사각형과 교차 면적")],
                           "지질 단위(평원) 지도. 착륙 안전을 뜻하지 않는다. 매핑 범위 밖은 자료 없음"))
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"극지 평원 실패: {e}")
    # ── 섀클턴 바위 위치 (Gawronska & Boazman 2025): 칸별 개수. 매핑 범위 정의가 없어 0 인 칸은 자료 없음 ──
    bx = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Boulder_locations_in_shackleton_Gawronska_Boazman_2025.xlsx")
    if bx:
        try:
            df = pd.read_excel(bx)
            qa = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Lunar_Geologic_Catalog_Coordinate_QA.csv")
            dropped = 0
            if qa:
                ctx.record_input(qa, "boulder_coordinate_qa")
                q = read_csv(qa)
                q = q[q["filename"].astype(str).str.startswith("Boulder_locations")]
                bad = set(zip(q["latitude_deg"].round(4), q["longitude_deg"].round(4)))
                keep = ~pd.Series(list(zip(df["Latitude"].round(4), df["Longitude"].round(4)))).isin(bad).to_numpy()
                dropped = int((~keep).sum())
                df = df[keep]
            lat, lon = df["Latitude"].to_numpy(float), norm_lon(df["Longitude"].to_numpy(float))
            ii = binner.index(lat, lon)
            cnt = np.bincount(ii[ii >= 0], minlength=binner.n_cells).astype(float)
            report["boulders_shackleton"] = {"points": int(len(df) + dropped), "dropped_by_coordinate_qa": dropped, "points_used": int((ii >= 0).sum()),
                                             "cells_with_boulders": int((cnt > 0).sum()), "lat_range": [float(lat.min()), float(lat.max())]}
            out.append(Out("boulder_count", np.where(cnt > 0, cnt, np.nan), "count", "real", "칸 안 매핑된 바위 수 (섀클턴 분화구)", ["shackleton_boulders"],
                           [ctx.prov(bx, "boulders", allow_unlisted=True, source_crs="위경도 표 (Latitude·Longitude)", lon_convention="-180..180")],
                           "섀클턴 연구 범위만. 매핑 범위 경계가 없어 바위가 없는 칸은 0 이 아니라 자료 없음. 좌표 QA 이상치 제외"))
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"섀클턴 바위 실패: {e}")
    # ── WAC 시간가중 조명률 (88–90°S) ──
    tw = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_TWI_SOUTH_100M.IMG")
    if tw:
        try:
            from luna.io.pds import PolarPdsSampler, read_pds_image

            im = read_pds_image(tw, tw)
            smp = PolarPdsSampler(im)
            agg = MeanAgg(binner.n_cells)
            for r0 in range(0, smp.lines, 512):
                rows = np.arange(r0, min(smp.lines, r0 + 512))
                R, C = np.meshgrid(rows, np.arange(smp.samples), indexing="ij")
                lat, lon = smp.pix_to_latlon(R.ravel(), C.ravel())
                v = im.data[r0:r0 + rows.size].astype(float).ravel()
                v[v < PDS_FLOAT_SPECIAL_MAX] = np.nan
                agg.add(binner.index(lat, lon), v * im.scale + im.offset)
            # README: 관측 중 조명된 비율(%) — 시간가중(관측 공백은 앞뒤 관측으로 선형 보간)
            out.append(Out("wac_ill_twi", _check_frac("wac_ill_twi", np.clip(agg.result() / 100.0, 0, None)), "frac", "real", "칸 평균 (WAC 시간가중 실측)", ["lroc_wac_ill"],
                           [ctx.prov(tw, "wac_ill_twi", allow_unlisted=True, source_crs=im.crs.summary())], "88–90°S 만. 관측 공백을 보간한 판"))
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"WAC 시간가중 조명률 실패: {e}")
    return out


def run(ctx: Ctx) -> int:
    """남극(기존) → 북극·전역 (--regions). 남극을 빼면 북극·전역만 다시 만든다."""
    rc = 0
    if "south" in ctx.regions:
        rc |= _south(ctx)
    for region in ("north", "global"):
        if region in ctx.regions:
            from luna.stages.s50_regions import run_region, slope_cross_check, slope_method_check

            rc |= run_region(ctx, region)
            if region == "global":
                # 교차검증 (차이만 기록, 합격 판정 없음): 중앙차분법 자체 vs LDSM, SLDEM2015 vs 60–90° 경사
                for fn, fname in ((slope_method_check, "slope_method_check"), (slope_cross_check, "slope_cross_check")):
                    try:
                        chk = fn(ctx)
                    except Exception as e:  # noqa: BLE001
                        chk = {"error": str(e)}
                    if chk is not None:
                        log.info(NAME, f"{fname}: {json.dumps(chk, ensure_ascii=False, default=str)}")
                        ctx.build_path(f"s50_global/{fname}.json").write_text(json.dumps(chk, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return rc


def _south(ctx: Ctx) -> int:
    ctx._inputs = {}
    gm = ctx.out / "grid" / "manifest.json"
    if not gm.exists():
        log.warn(NAME, "s40 먼저 실행")
        return 1
    g = ctx.settings.grid
    spec = GridSpec(g.cell_km, g.lat_limit_deg)
    cells = np.fromfile(ctx.out / "grid" / "cells.u32", dtype="<u4")
    binner = Binner(spec, cells)
    d = ctx.data
    outs: list[Out] = []
    SP = "SouthPolar_75S_90S_v1/Regional"

    def prov(paths: list[Path], role: str, **kw) -> list[Provenance]:
        res = []
        for p in paths:
            crs = None
            try:
                from luna.geo.crs import from_geotiff

                crs = from_geotiff(p).summary() if p.suffix.lower() in (".tif", ".tiff", ".vrt") else None
            except Exception:  # noqa: BLE001
                crs = None
            res.append(ctx.prov(p, role, source_crs=crs or kw.get("source_crs"), transform=kw.get("transform", "파일 CRS → 달 위경도(pyproj) → AEQD 칸"), lon_convention=kw.get("lon_convention")))
        return res

    # 고도 (s40 이 칸 중심에서 찍은 값)
    ev = ctx.build / "s40" / "elev_m.npy"
    prev_elev = ctx.out / "grid" / "layers" / "elev_m.f32"
    if ev.exists():
        outs.append(Out("elev_m", np.load(ev).astype(float), "m", "real", "칸 중심 고도 (80/240 m DEM 쌍선형)", ["lola_dem_80m", "lola_dem_240m"], []))
    elif prev_elev.exists() and prev_elev.stat().st_size == 4 * binner.n_cells:
        # s40 중간물(build/)이 없는 PC: 이전 s40 결과를 그대로 유지한다 (다시 계산하지 않음)
        outs.append(Out("elev_m", np.fromfile(prev_elev, dtype="<f4").astype(float), "m", "real", "칸 중심 고도 (80/240 m DEM 쌍선형)", ["lola_dem_80m", "lola_dem_240m"], []))
        log.info(NAME, "build/s40/elev_m.npy 없음 → 기존 elev_m 레이어 유지")

    # 경사: 80 m 타일 우선, 없는 칸은 240 m
    s80 = d.glob(f"{SP}/Terrain/slope_80s_80m_*.tif")
    s240 = d.glob(f"{SP}/Terrain/slope_75s_240m.tif")
    try:
        from luna.io.geotiff import iter_blocks

        h80, h240 = HistAgg(binner.n_cells), HistAgg(binner.n_cells)
        m80, m240 = MeanAgg(binner.n_cells), MeanAgg(binner.n_cells)
        for paths, h, m in ((s80, h80, m80), (s240, h240, m240)):
            for p in paths:
                for a, lat, lon in iter_blocks(p):
                    idx = binner.index(lat.ravel(), lon.ravel())
                    h.add(idx, a.ravel())
                    m.add(idx, a.ravel())
        use80 = h80.count() > 0
        p90 = np.where(use80, h80.quantile(0.9), h240.quantile(0.9))
        mean = np.where(use80, m80.result(), m240.result())
        pv = prov(s80, "slope80") + prov(s240, "slope240")
        outs.append(Out("slope_mean_deg", mean, "deg", "real", "칸 안 경사 평균 (80 m, 밖은 240 m)", ["lola_slope"], pv))
        outs.append(Out("slope_p90_deg", p90, "deg", "real", "칸 안 경사 90분위 (80 m, 밖은 240 m)", ["lola_slope"], pv))

        # 장기 평균 조명 (PGDA69): 85°S 60 m 가 있으면 그 칸은 60 m 우선
        def two_res(role: str, coarse: str, fine: str, caution: str, name: str, unit: str, stat: str, transform=None):
            pc, pf = d.glob(f"{SP}/Illumination/{coarse}"), d.glob(f"{SP}/Illumination/{fine}")
            if not pc and not pf:
                log.warn(NAME, f"{name}: 원본 없음 → 레이어 생략")
                return
            a = raster_mean(ctx, binner, pc, transform) if pc else np.full(binner.n_cells, np.nan)
            if pf:
                b = raster_mean(ctx, binner, pf, transform)
                a = np.where(np.isfinite(b), b, a)
            if unit == "frac":
                a = _check_frac(name, a)
            outs.append(Out(name, a, unit, "real", stat, ["pgda69"], prov(pc + pf, role), caution))

        LONG = "장기 평균(PGDA69, 약 18.6년). 특정 날짜 값 아님"
        two_res("illum", "solar_illumination_75s_120m.tif", "solar_illumination_85s_60m.tif", LONG, "illum_avg", "frac", "칸 평균 (85°S 이남 60 m, 밖 120 m)")
        two_res("earthvis", "earth_visibility_75s_120m.tif", "earth_visibility_85s_60m.tif", LONG, "earth_vis_avg", "frac", "칸 평균 (85°S 이남 60 m, 밖 120 m)")
        two_res("psr", "permanent_shadow_75s_120m.tif", "permanent_shadow_85s_60m.tif", "영구음영 비율. 얼음 검출 아님", "psr_frac", "frac", "칸 안 영구음영 화소 비율", lambda a: (a > 0.5).astype(float) * np.where(np.isfinite(a), 1, np.nan))
        sky = d.glob(f"{SP}/Illumination/sky_visibility_75s_240m.tif")
        if sky:
            outs.append(Out("sky_sr", raster_mean(ctx, binner, sky), "sr", "real", "칸 평균 하늘 입체각", ["pgda69"], prov(sky, "sky_vis")))
    except ImportError:
        log.warn(NAME, "rasterio·pyproj 가 없어 GeoTIFF 레이어(경사·PGDA69)를 만들지 못했다 → pip install -r requirements.txt")

    # PSR 까지 거리 (psr_frac > 0 인 칸 중심까지)
    psr = next((o for o in outs if o.name == "psr_frac"), None)
    if psr is not None:
        m = np.isfinite(psr.arr) & (psr.arr > 0)
        dist = nearest_km(binner, binner.cx[m], binner.cy[m])
        dist[m] = 0.0
        outs.append(Out("psr_dist_km", dist, "km", "real", "영구음영 칸까지 최소 거리 (5 km 칸 해상도)", ["pgda69"], psr.prov, "얼음 가능성 지표 · 검출 아님"))

    # 실측 조명률 (WAC, 88–90°S)
    wac = d.first("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_PCT_SOUTH_100M.IMG")
    if wac:
        from luna.io.pds import PolarPdsSampler, read_pds_image

        try:
            im = read_pds_image(wac, wac)
            smp = PolarPdsSampler(im)
            agg = MeanAgg(binner.n_cells)
            for r0 in range(0, smp.lines, 512):
                rows = np.arange(r0, min(smp.lines, r0 + 512))
                R, C = np.meshgrid(rows, np.arange(smp.samples), indexing="ij")
                lat, lon = smp.pix_to_latlon(R.ravel(), C.ravel())
                v = im.data[r0:r0 + rows.size].astype(float).ravel()
                v[v < PDS_FLOAT_SPECIAL_MAX] = np.nan  # CORE_NULL 등 특수값 (16#FF7FFFFB# ≈ −3.4e38)
                v = v * im.scale + im.offset
                agg.add(binner.index(lat, lon), v)
            # 라벨: 관측 중 조명된 비율(%) → 0–1
            outs.append(Out("wac_ill_pct", _check_frac("wac_ill_pct", agg.result() / 100.0), "frac", "real", "칸 평균 (WAC 실측)", ["lroc_wac_ill"], [ctx.prov(wac, "wac_ill", source_crs=im.crs.summary())], "88–90°S 만"))
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"WAC 조명률 실패: {e}")

    # 조성 CSV (최근접 칸 중심)
    for name, pattern, cols, max_km, caution in (
        ("h_ppm", f"{SP}/Composition/LP_hydrogenhd_75S90S_0p5deg.csv", ["H_ppm_by_weight", "hydrogen_ppm", "h_ppm", "ppm", "H_ppm"], 25.0, "얼음 가능성 지표 · 검출 아님 (0.5° 격자, 음수 추정값 포함 — QA)"),
        ("feo_wt", f"{SP}/Composition/LP_ironhd_75S90S_0p5deg.csv", ["FeO_weight_percent", "feo_wt", "FeO", "FeO_wt", "feo"], 25.0, "원 격자 0.5°, 해상도 거침"),
    ):
        p = d.first(pattern)
        if not p:
            continue
        try:
            arr, conv, vc = table_layer(ctx, p, binner, cols, max_km)
            if name == "h_ppm":
                arr = np.where(arr < 0, np.nan, arr)  # QA: 음수 추정값은 결측 처리
            outs.append(Out(name, arr, "ppm" if name == "h_ppm" else "wt%", "real", f"최근접 원본 칸 값 (열 {vc})", ["lp_grs"], [ctx.prov(p, name, source_crs="위경도 표", lon_convention=conv, transform="경도 통일 → 격자 칸 중심이 들어 있는 원본 칸 (경계 없는 표는 AEQD 최근접)")], caution))
        except ColumnError as e:
            log.warn(NAME, str(e))

    # 광물: LP TiO₂ 2° 셀(지역 조성), Kaguya FeO 약 1 km (작업 5), JAXA MI TiO₂ 연구용 (작업 6, 정량 보류)
    report: dict = {}
    outs += lp_tio2(ctx, binner, report)
    for fn in (kaguya_feo, jaxa_tio2_research):
        try:
            outs += fn(ctx, binner, outs, report)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"{fn.__name__} 실패 → 레이어 생략: {e}")

    outs += extra_south(ctx, binner, report)

    # 지질: 단층애 거리, 낙석 밀도 (작업 7: 새 목록)
    try:
        outs += geology(ctx, binner, report)
    except Exception as e:  # noqa: BLE001
        log.warn(NAME, f"지질 레이어 실패: {e}")
    if report:
        write_envelope(ctx, "validation/layers_minerals.json", Envelope("luna.validation.minerals.v1", report, list(ctx._inputs.values()), quality="REVIEW_REQUIRED",
                       notes=["대조 결과는 차이를 기록할 뿐 합격·불합격을 판정하지 않는다 (허용 오차는 팀이 정함)"]))

    # 쓰기
    metas = []
    for o in outs:
        write_bin(ctx, f"grid/layers/{o.name}.f32", o.arr.astype(np.float32), "<f4")
        fin = np.isfinite(o.arr)
        from luna.contracts import lowest_quality

        q = lowest_quality([p.quality for p in o.prov]) if o.prov else "VALIDATED"
        metas.append(LayerMeta(o.name, f"layers/{o.name}.f32", o.unit, o.kind, q, o.stat, o.source_keys, {"valid_cells": int(fin.sum()), "lat_range_deg": [-90, g.lat_limit_deg]}, o.caution))
        img = np.full(spec.n * spec.n, np.nan)
        img[cells] = o.arr
        save_gray(img.reshape(spec.n, spec.n), ctx.build_path(f"preview/layers/{o.name}.png"))
        log.info(NAME, f"{o.name:<16} 유효 칸 {int(fin.sum()):>6}  품질 {q}")
    all_prov = [p for o in outs for p in o.prov]
    write_envelope(ctx, "grid/layers.json", Envelope(SCHEMA, metas, all_prov, notes=["원본에 없는 칸은 NaN"]))
    (ctx.build_path("s50/summary.json")).write_text(json.dumps([m.name for m in metas]), encoding="utf-8")
    return 0
