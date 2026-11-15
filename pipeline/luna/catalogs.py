"""카탈로그 시드 읽기 (s10·s30·s70 공용).

Drive 의 공식 기록 대조본(Reference_Tables/…)을 우선 쓰고, 없으면 Catalogs/*.json(이전 앱 형식)을 쓴다.
열 이름을 찾지 못하면 멈추고 있는 열을 보여 준다 — 값을 추측해서 채우지 않는다.
좌표 경도는 모두 (−180, 180] 로 바꾸고 원래 규칙을 기록한다 (CLAUDE.md 4.6).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd

from luna.geo.frames import detect_lon_convention, norm_lon
from luna.io.tables import ColumnError, find_col, read_csv, read_json

CATEGORY_MAP = {
    "apollo": "apollo", "clps": "clps", "international": "international", "intl": "international",
    "artemis": "artemis", "other": "other", "custom": "other",
}


def category_of(raw) -> str:
    """Drive 카탈로그 분류(한국어·영어 섞임) → 표준 분류."""
    c = str(raw or "").strip().lower()
    for key, val in (("artemis", "artemis"), ("아르테미스", "artemis"), ("apollo", "apollo"), ("아폴로", "apollo"), ("clps", "clps"),
                     ("타국", "international"), ("international", "international"), ("다른 나라", "international")):
        if key in c:
            return val
    return CATEGORY_MAP.get(c, "other")


def slug(s: str) -> str:
    s = re.sub(r"[^0-9a-zA-Z]+", "_", str(s).strip().lower()).strip("_")
    return s or "item"


def _get(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def load_sites(seed_json: Path) -> tuple[list[dict[str, Any]], str]:
    """Catalogs/sites.json → 표준 dict 목록. (이전 앱 v3 형식과 느슨하게 호환)"""
    raw = read_json(seed_json)
    items = raw.get("data", raw) if isinstance(raw, dict) else raw
    if isinstance(items, dict):
        items = items.get("sites", [])
    lons = [float(_get(x, "lon_deg", "lon", "longitude", default="nan")) for x in items]
    conv = detect_lon_convention(lons)
    out = []
    for x in items:
        lat = float(_get(x, "lat_deg", "lat", "latitude"))
        lon = float(norm_lon(float(_get(x, "lon_deg", "lon", "longitude"))))
        name = str(_get(x, "name", "name_en", "id"))
        cat = category_of(_get(x, "category", default="other"))
        src = _get(x, "source_url", "source_urls", "source", default=None)
        out.append({
            "id": slug(_get(x, "id", default=name)),
            "name": name,
            "name_en": _get(x, "name_en", default=None),
            "category": cat,
            "lat_deg": lat,
            "lon_deg": lon,
            "elevation_m": _get(x, "elevation_m", default=None),
            "verified": bool(_get(x, "verified", default=False)),
            "source": src,
            "note": _get(x, "note", default=None),
        })
    return out, conv


MISSION_COLS = {
    "id": ["mission_id", "id", "mission"],
    "name": ["mission_name", "name", "mission"],
    # 공식 대조본(LUNA_HISTORICAL_SITE_COORDINATES_16.csv): verified_* 우선, 없으면 catalog_*
    "lat": ["verified_lat_deg", "catalog_lat_deg", "lat_deg", "latitude", "lat"],
    "lon": ["verified_lon_east_deg_signed", "catalog_lon_east_deg", "lon_deg", "longitude", "lon", "east_longitude"],
    "landing_utc": ["landing_utc", "landing_time_utc", "touchdown_utc", "landing_time"],
}


def load_mission_coords(csv: Path) -> tuple[pd.DataFrame, dict[str, str], str]:
    df = read_csv(csv)
    cols = {}
    for k, cands in MISSION_COLS.items():
        try:
            cols[k] = find_col(df, k, cands)
        except ColumnError:
            if k in ("lat", "lon", "id"):
                raise
    conv = detect_lon_convention(pd.to_numeric(df[cols["lon"]], errors="coerce"))
    return df, cols, conv


def load_missions(seed_json: Path | None, coords_csv: Path | None) -> tuple[list[dict[str, Any]], list[str]]:
    """미션 목록. 좌표는 공식 대조본(coords_csv) 우선, 나머지 필드는 seed JSON."""
    notes: list[str] = []
    seed: dict[str, dict] = {}
    if seed_json and seed_json.exists():
        raw = read_json(seed_json)
        items = raw.get("data", raw) if isinstance(raw, dict) else raw
        for x in items:
            seed[slug(_get(x, "id", "name"))] = x
    coords: dict[str, dict] = {}
    if coords_csv and coords_csv.exists():
        df, cols, conv = load_mission_coords(coords_csv)
        notes.append(f"미션 좌표: {coords_csv.name} (경도 원래 규칙 {conv})")
        for _, r in df.iterrows():
            mid = slug(r[cols["id"]])
            coords[mid] = {
                "lat_deg": float(r[cols["lat"]]),
                "lon_deg": float(norm_lon(float(r[cols["lon"]]))),
                "landing_utc": str(r[cols["landing_utc"]]) if "landing_utc" in cols and pd.notna(r[cols["landing_utc"]]) else None,
                "name": str(r[cols["name"]]) if "name" in cols else None,
            }
    ids = list(dict.fromkeys(list(coords) + list(seed)))
    out = []
    for mid in ids:
        s, c = seed.get(mid, {}), coords.get(mid, {})
        # 착륙 시각: seed(분 단위 시각) 우선. 대조본은 날짜만 있다
        landing = _get(s, "landing_utc") or c.get("landing_utc")
        lat = c.get("lat_deg", _get(s, "lat_deg"))
        lon = c.get("lon_deg", _get(s, "lon_deg"))
        if landing is None or lat is None or lon is None:
            notes.append(f"미션 {mid}: 착륙 시각·좌표가 없어 제외")
            continue
        out.append({
            "id": mid,
            "name": c.get("name") or _get(s, "name", default=mid),
            "agency": _get(s, "agency", default="unknown"),
            "landing_utc": normalize_utc(str(landing)),
            "lat_deg": float(lat),
            "lon_deg": float(norm_lon(float(lon))),
            "duration_h": _get(s, "actual_duration_h", "duration_h", "planned_duration_h", default=None),
            "outcome": _code(_get(s, "outcome", default=""), OUTCOME, "partial"),
            "outcome_reason": " · ".join(str(x) for x in (_get(s, "failure_cause"), _get(s, "outcome_reason", "summary")) if x and x != "없음"),
            "power": _code(_get(s, "power", "power_type", default=""), POWER, "unknown"),
            "comm": _code(_get(s, "comm", "comm_type", default=""), COMM, "unknown"),
            "approach": _code(_get(s, "approach", "approach_tag", default=""), APPROACH, "unknown"),
            "site_id": _get(s, "site_id", default=None),
            "verified": bool(c) or bool(_get(s, "verified", default=False)),
        })
    return out, notes


OUTCOME = [("부분", "partial"), ("partial", "partial"), ("실패", "failure"), ("fail", "failure"), ("성공", "success"), ("success", "success")]
POWER = [("rtg", "rtg"), ("원자력", "rtg"), ("히터", "solar_heater"), ("heater", "solar_heater"), ("태양", "solar"), ("solar", "solar"), ("배터리", "battery"), ("battery", "battery")]
COMM = [("중계", "relay"), ("relay", "relay"), ("직접", "dte"), ("dte", "dte")]
APPROACH = [("궤도", "lunar_orbit"), ("orbit", "lunar_orbit"), ("직접", "direct"), ("direct", "direct")]
MOUNT = [("추적", "vertical_tracking"), ("tracking", "vertical_tracking"), ("수직", "vertical_fixed"), ("vertical", "vertical_fixed"), ("수평", "horizontal"), ("horizontal", "horizontal")]


def _code(raw, table, default: str) -> str:
    """Drive 카탈로그의 한국어·영어 분류 → 표준 코드 (앞에 있는 규칙이 우선)."""
    c = str(raw or "").strip().lower()
    for key, val in table:
        if key in c:
            return val
    return default


def normalize_utc(s: str) -> str:
    t = pd.Timestamp(s)
    if t.tzinfo is None:
        t = t.tz_localize("UTC")
    return t.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
