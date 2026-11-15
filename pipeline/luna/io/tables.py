"""CSV·JSON 표 읽기와 열 이름 맞추기.

Drive 표의 열 이름은 파일마다 다를 수 있다. 후보 이름 목록으로 찾고, 못 찾으면 있는 열을 보여 주며 멈춘다
(열 이름을 추측해서 값을 채우지 않는다). 새 이름은 COLUMN_ALIASES 에 추가한다.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from luna.geo.frames import detect_lon_convention, norm_lon

COLUMN_ALIASES: dict[str, list[str]] = {
    "lat": ["lat_deg", "lat", "latitude", "Latitude", "LAT", "center_lat", "lat_center", "Lat (deg)", "Latitude (N)", "C_LAT"],
    "lon": ["lon_deg", "lon", "longitude", "Longitude", "LON", "east_lon", "lon_east", "center_lon", "lon_center", "Lon (deg)", "Longitude (E)", "C_LON"],
    "value": ["value", "ppm", "hydrogen_ppm", "h_ppm", "feo_wt", "FeO", "FeO_wt", "tio2_wt", "TiO2", "TiO2_wt", "wt_pct", "abundance"],
    "id": ["id", "ID", "name", "Name", "site_id", "mission_id", "feature_id"],
}


class ColumnError(KeyError):
    pass


def find_col(df: pd.DataFrame, kind: str, extra: list[str] | None = None) -> str:
    cands = (extra or []) + COLUMN_ALIASES.get(kind, [])
    lower = {c.lower(): c for c in df.columns}
    for c in cands:
        if c in df.columns:
            return c
        if c.lower() in lower:
            return lower[c.lower()]
    raise ColumnError(f"'{kind}' 열을 찾지 못했다. 있는 열: {list(df.columns)} — luna/io/tables.py COLUMN_ALIASES 에 추가")


def read_csv(path: Path) -> pd.DataFrame:
    for enc in ("utf-8-sig", "utf-8", "cp949", "latin-1"):
        try:
            return pd.read_csv(path, encoding=enc, comment=None)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("csv", b"", 0, 1, f"인코딩을 알 수 없다: {path}")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def latlon_points(df: pd.DataFrame, lat_col: str | None = None, lon_col: str | None = None):
    """(lat, lon(−180..180], 원래 경도 규칙)."""
    la = lat_col or find_col(df, "lat")
    lo = lon_col or find_col(df, "lon")
    lat = pd.to_numeric(df[la], errors="coerce").to_numpy(float)
    lon_raw = pd.to_numeric(df[lo], errors="coerce").to_numpy(float)
    conv = detect_lon_convention(lon_raw)
    return lat, norm_lon(lon_raw), conv


def bin_lookup(lat_bins: np.ndarray, lon_bins: np.ndarray, values: np.ndarray, step_deg: float, lat_q: np.ndarray, lon_q: np.ndarray) -> np.ndarray:
    """칸 중심 좌표 표(위경도 격자)에서 질의 점이 속한 칸 값. 칸 크기가 질의 칸보다 커서 면적 가중 = 포함 칸 값."""
    key = lambda la, lo: (np.round(la / step_deg).astype(np.int64) * 100000 + np.round(norm_lon(lo) / step_deg).astype(np.int64))  # noqa: E731
    table = dict(zip(key(lat_bins, lon_bins).tolist(), values.tolist()))
    # 질의 점을 칸 중심으로 맞춘다 (칸 중심 = (k + 0.5)·step 인지 k·step 인지 자동 판별)
    frac = np.nanmedian(np.abs(lat_bins / step_deg - np.round(lat_bins / step_deg)))
    off = 0.5 if frac > 0.25 else 0.0
    qa = (np.floor(lat_q / step_deg - off + 0.5) + off) * step_deg
    qo = (np.floor(norm_lon(lon_q) / step_deg - off + 0.5) + off) * step_deg
    ks = key(qa, qo)
    return np.array([table.get(k, np.nan) for k in ks.tolist()], dtype=float)


EDGE_ALIASES = {
    "south": ["south_lat_deg", "south_deg", "lat_min", "min_lat"],
    "north": ["north_lat_deg", "north_deg", "lat_max", "max_lat"],
    "west": ["west_lon_deg_east", "west_deg", "lon_min", "min_lon"],
    "east": ["east_lon_deg_east", "east_deg", "lon_max", "max_lon"],
}


def bin_edges(df: pd.DataFrame):
    """칸 경계 열(남·북·서·동)이 있으면 (south, north, west, east) 배열, 없으면 None."""
    out = []
    for k, cands in EDGE_ALIASES.items():
        hit = next((c for c in cands if c in df.columns), None)
        if hit is None:
            return None
        out.append(pd.to_numeric(df[hit], errors="coerce").to_numpy(float))
    return tuple(out)


def bin_contains(edges, lat_q: np.ndarray, lon_q: np.ndarray, values: np.ndarray) -> np.ndarray:
    """질의 점이 들어 있는 칸의 값 (칸이 질의 칸보다 크므로 면적 가중 = 포함 칸 값).

    경도 경계는 −180..180 또는 0..360 어느 쪽이든 질의 경도를 같은 범위로 맞춰 비교한다.
    """
    s, n, w, e = edges
    out = np.full(lat_q.shape, np.nan)
    lon360 = (lon_q + 360.0) % 360.0
    use360 = np.nanmax(e) > 180.0
    lq = lon360 if use360 else lon_q
    for i in range(s.size):
        if not np.isfinite(values[i]):
            continue
        m = (lat_q >= s[i]) & (lat_q < n[i]) & (lq >= w[i]) & (lq < e[i]) & np.isnan(out)
        if m.any():
            out[m] = values[i]
    return out
