"""광물 자원 레이어 입력 (작업 5·6·7): JAXA MI TiO₂, LROC WAC TiO₂ 품질 규칙, 낙석·단층애 목록.

품질 코드는 광물 묶음 resource_catalog.json 과 같다:
0 자료 없음 · 1 정량값 · 2 검출 한계 미만(WAC) · 3 물리 범위 밖/이상치 · 4 보간 전용 · 5 고위도 주의.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from luna.geo.frames import norm_lon

#: WAC TiO₂ (Sato et al. 2017) 공식 README: 원본 값 1 = 검출 한계(2 wt%) 미만 표식, 15 wt% 초과는 신뢰할 수 없음
WAC_BELOW_DETECTION_MARK = 1.0
TIO2_DETECTION_LIMIT_WT = 2.0
TIO2_MAX_RELIABLE_WT = 15.0


def wac_tio2_quality(values: np.ndarray) -> np.ndarray:
    """WAC TiO₂ 원본 값 → 품질 코드. 값을 잘라 15 로 만들지 않고 코드로만 가른다.

    0: 결측(NaN·비유한) · 2: 원본 값 1 (검출 한계 미만 표식, 수치 아님) · 3: 15 wt% 초과 또는 음수 · 1: 2–15 wt% 정량값.
    2 미만인데 1 이 아닌 값(예: 1.5)은 공식 정의 밖이라 3 으로 둔다.
    """
    v = np.asarray(values, dtype=np.float64)
    q = np.zeros(v.shape, dtype=np.uint8)
    fin = np.isfinite(v)
    q[fin & (v == WAC_BELOW_DETECTION_MARK)] = 2
    q[fin & (v >= TIO2_DETECTION_LIMIT_WT) & (v <= TIO2_MAX_RELIABLE_WT)] = 1
    q[fin & (q == 0)] = 3
    return q


def tio2_numeric(values: np.ndarray, quality: np.ndarray) -> np.ndarray:
    """품질 코드 1 만 수치로 남긴다. 나머지는 NaN (코드 2 는 화면에서 '2 wt% 미만'으로 따로 표시)."""
    return np.where(quality == 1, values, np.nan)


def jaxa_tio2_south(tif: Path, qtif: Path, lat_max: float) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """JAXA MI TiO₂ 16 ppd (경위도, 북 85°→남 −85°) 에서 lat ≤ lat_max 행만 읽는다.

    반환: (값, 공급자 품질, 위도, 경도) 1차원 배열. 공급자 품질 1 이 아니면 NaN (실제 0 은 유지).
    """
    import rasterio
    from rasterio.windows import Window

    with rasterio.open(tif) as ds, rasterio.open(qtif) as dq:
        if ds.crs is None or "104903" not in ds.crs.to_string():
            raise ValueError(f"{tif.name}: 예상한 달 경위도 CRS(ESRI:104903)가 아니다: {ds.crs}")
        T = ds.transform
        r0 = int(np.floor((T.f - lat_max) / -T.e))
        h = ds.height - r0
        v = ds.read(1, window=Window(0, r0, ds.width, h)).astype(np.float64)
        q = dq.read(1, window=Window(0, r0, ds.width, h))
    rows = r0 + np.arange(h) + 0.5
    cols = np.arange(v.shape[1]) + 0.5
    lat = T.f + rows * T.e
    lon = T.c + cols * T.a
    LON, LAT = np.meshgrid(lon, lat)
    v = np.where(q == 1, v, np.nan)
    return v.ravel(), q.ravel(), LAT.ravel(), norm_lon(LON.ravel())


def read_points_shp(zip_path: Path, stem: str) -> pd.DataFrame:
    """점 shapefile (ZIP 안) → 도형 좌표 기준 위경도. 속성 LON 이 0–360 이면 도형과 같은 점인지 확인한다."""
    import shapefile

    with zipfile.ZipFile(zip_path) as z:
        names = {n.upper(): n for n in z.namelist()}
        prj = z.read(names[f"{stem}.PRJ".upper()]).decode("utf-8", "replace")
        if "Moon" not in prj:
            raise ValueError(f"{zip_path.name}: 좌표계가 달 기준이 아니다: {prj[:80]}")
        r = shapefile.Reader(shp=io.BytesIO(z.read(names[f"{stem}.SHP".upper()])), dbf=io.BytesIO(z.read(names[f"{stem}.DBF".upper()])))
        rows = []
        for sr in r.iterShapeRecords():
            lon, lat = sr.shape.points[0]
            d = sr.record.as_dict()
            if "LON" in d and d["LON"] is not None and abs(norm_lon(float(d["LON"])) - norm_lon(lon)) > 1e-6:
                raise ValueError(f"{zip_path.name} {d.get('NAME')}: 도형 경도 {lon} ≠ 속성 LON {d['LON']}")
            rows.append({**{k: d[k] for k in d}, "lat_deg": float(lat), "lon_deg": float(norm_lon(lon))})
    return pd.DataFrame(rows)


def rockfalls_south(csv: Path, lat_max: float) -> tuple[pd.DataFrame, dict]:
    """Bickel et al. (2020) 낙석 목록에서 lat ≤ lat_max 만. 완전히 같은 행만 지운다 (거리 묶기는 하지 않음)."""
    df = pd.read_csv(csv)
    df.columns = [str(c).strip() for c in df.columns]
    n_all = len(df)
    dup = int(df.duplicated().sum())
    df = df.drop_duplicates()
    s = df[df["C_LAT"] <= lat_max].copy()
    s["lat_deg"] = s["C_LAT"].astype(float)
    s["lon_deg"] = norm_lon(s["C_LON"].astype(float).to_numpy())
    return s, {"rows_total": n_all, "exact_duplicates_removed": dup, "rows_south": int(len(s)), "rows_south_of_80S": int((s["lat_deg"] < -80).sum())}
