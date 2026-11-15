"""카탈로그 대조 (남은 작업 1·2·3): 착륙지 좌표, 미션 필드, 착륙선 제원을 출처 표와 맞춰 본다.

여기서는 비교 표만 만든다. 카탈로그 값을 바꾸는 일은 s70 이 이 표의 '채택' 결과를 읽어서 한다.
허용 오차를 새로 정하지 않는다. 좌표 일치 판정은 출처가 밝힌 위치 불확도(LROC UNCERTAIN, CSV published_sigma)만 쓴다.
"""

from __future__ import annotations

import io
import json
import math
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from luna.constants import R_MOON_KM
from luna.geo.frames import great_circle_km, norm_lon
from luna.geo.polar import aeqd_forward, aeqd_inverse
from luna.io.tables import read_csv

# ── 출처 자료 이름 ──
LROC_OBJECTS_ZIP = "Raw_Data/Additional_Global_Science/Mission_History/ANTHROPOGENIC_OBJECTS_180.ZIP"
WUELLER_ZIP = "Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip"
SITE_COORDS_CSV = "Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv"

#: 착륙지 id → LROC 인공물 OBJECT_ID (Wagner et al. 2017 + 갱신, 2026-08-14판). 이름으로 손수 맞춘 표.
LROC_OBJECT_OF = {
    "apollo11": "A11_LM", "apollo15": "A15_LM", "apollo17": "A17_LM",
    "change3": "ChangE3", "change4": "ChangE4", "change5": "ChangE5", "change6": "ChangE6",
    "beresheet": "Beresheet", "chandrayaan2_vikram": "Vikram1", "chandrayaan3": "Vikram2",
    "hakuto_r_m1": "HakutoR1", "luna25": "Luna25", "slim": "SLIM",
    "im1_odysseus": "IM1", "im2_athena": "IM2", "blue_ghost_m1": "BlueGhost1",
    "lcross_cabeus": "LCROSS",
}

#: 아르테미스 후보 착륙지 id → Wueller et al. (2026) 후보점의 지역 코드 (2022년 13지역 + 2024년 추가 지역 이름).
#: 이름으로 맞춘 것이다. 지역 경계가 아니라 그 지역 안에서 저자가 고른 착륙 후보점들이다.
WUELLER_REGION_OF = {
    "connecting_ridge": "CR", "peak_near_shackleton": "PNS", "de_gerlache_rim": "dGR1", "faustini_rim_a": "FRA",
    "haworth": "HW", "malapert_massif": "MMA", "nobile_rim_1": "NR1", "mons_mouton": "MMP", "amundsen_rim": "AR",
    "mons_mouton_2024": "MMO", "nobile_rim_2": "NR2", "peak_near_cabeus_b": "PCB", "slater_plain": "SP",
    "de_gerlache_rim_2": "dGR2",
}


def _shp_from_zip(z: zipfile.ZipFile, stem: str):
    import shapefile

    names = {n.upper(): n for n in z.namelist()}

    def part(ext):
        n = names.get(f"{stem}.{ext}".upper())
        return io.BytesIO(z.read(n)) if n else None

    return shapefile.Reader(shp=part("shp"), dbf=part("dbf"), shx=part("shx"))


def load_lroc_objects(path: Path) -> pd.DataFrame:
    """LROC 인공물 점 목록. 위치는 도형 좌표(−180~180)를 쓰고 속성 LATITUDE/LONGITUDE 와 같은지 확인한다."""
    with zipfile.ZipFile(path) as z:
        prj = z.read(next(n for n in z.namelist() if n.upper().endswith(".PRJ"))).decode("utf-8", "replace")
        if "Moon" not in prj:
            raise ValueError(f"LROC 인공물 좌표계가 달 기준이 아니다: {prj[:80]}")
        r = _shp_from_zip(z, "ANTHROPOGENIC_OBJECTS_180")
        rows = []
        for sr in r.iterShapeRecords():
            d = sr.record.as_dict()
            lon, lat = sr.shape.points[0]
            if abs(lat - float(d["LATITUDE"])) > 1e-6 or abs(norm_lon(lon) - norm_lon(float(d["LONGITUDE"]))) > 1e-6:
                raise ValueError(f"LROC {d['OBJECT_ID']}: 도형 좌표와 속성 좌표가 다르다")
            rows.append({"object_id": d["OBJECT_ID"], "mission": d["MISSION"], "object": d["OBJECT"], "lat_deg": float(lat),
                         "lon_deg": float(norm_lon(lon)), "uncertainty_m": float(d["UNCERTAIN"]), "coord_src": d["COORD_SRC"],
                         "date": str(d["DATE"]), "references": d["REFERENCES"]})
    return pd.DataFrame(rows)


def load_wueller_sites(path: Path) -> pd.DataFrame:
    """Wueller et al. (2026) 착륙 후보점 130개 (Zenodo 10.5281/zenodo.17084058, CC BY 4.0). ZIP 안의 ZIP 을 메모리에서 읽는다."""
    with zipfile.ZipFile(path) as z:
        inner = zipfile.ZipFile(io.BytesIO(z.read("Landing_Sites.zip")))
        prj = inner.read("LandingSites.prj").decode("utf-8", "replace")
        if "Moon" not in prj:
            raise ValueError(f"Wueller 후보점 좌표계가 달 기준이 아니다: {prj[:80]}")
        r = _shp_from_zip(inner, "LandingSites")
        rows = [{"name": rec["Name"], "region": rec["Landing_Re"], "lat_deg": float(rec["Latitude"]), "lon_deg": float(norm_lon(rec["Longitude"]))}
                for rec in r.records()]
    return pd.DataFrame(rows)


def load_artemis_polygons(path: Path) -> list[dict[str, Any]]:
    """USGS/QuickMap 2024 후보 9지역 경계. 남극 AEQD 평면(직선 변)으로 바꿔 포함 판정에 쓴다."""
    from shapely.geometry import Polygon

    with zipfile.ZipFile(path) as z:
        gj = json.loads(z.read(next(n for n in z.namelist() if n.endswith(".geojson"))).decode("utf-8"))
    out = []
    for f in gj["features"]:
        g = f["geometry"]
        ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
        lon = np.array([p[0] for p in ring], float)
        lat = np.array([p[1] for p in ring], float)
        x, y = aeqd_forward(lat, lon)
        poly = Polygon(list(zip(x, y)))
        c = poly.centroid
        clat, clon = aeqd_inverse(c.x, c.y)
        out.append({"code": str(f["properties"].get("RegionCode") or ""), "name": str(f["properties"]["Region"]), "poly": poly,
                    "centroid_lat": float(clat), "centroid_lon": float(clon)})
    return out


@dataclass
class SiteCheck:
    id: str
    name: str
    category: str
    lat_now: float
    lon_now: float
    verdict: str                      # match | replace | region_point | named_region_only | no_source
    coord_kind: str                   # landing_point | region_point | unknown
    evidence: str                     # official | peer_reviewed | none
    lat_ref: float | None = None
    lon_ref: float | None = None
    diff_m: float | None = None
    ref_uncertainty_m: float | None = None
    ref_source: str | None = None
    ref_url: str | None = None
    lroc_diff_m: float | None = None
    lroc_uncertainty_m: float | None = None
    lroc_object: str | None = None
    region_2024: str | None = None
    region_2024_centroid_m: float | None = None
    wueller_region: str | None = None
    wueller_nearest: str | None = None
    wueller_nearest_m: float | None = None
    coordinate_reference: str | None = None
    notes: list[str] = field(default_factory=list)


def _m(lat1, lon1, lat2, lon2) -> float:
    return float(great_circle_km(lat1, lon1, lat2, lon2) * 1000.0)


def _sigma_m(sigma: str | None, lat: float) -> float | None:
    """'lat 0.0001; lon 0.0001 deg' → 지표 거리(m, 두 성분 중 큰 값)."""
    if not sigma or (isinstance(sigma, float) and math.isnan(sigma)):
        return None
    vals = {}
    for part in str(sigma).split(";"):
        bits = part.replace("deg", "").split()
        if len(bits) >= 2:
            try:
                vals[bits[0].strip().lower()] = float(bits[1])
            except ValueError:
                pass
    if not vals:
        return None
    k = math.radians(1.0) * R_MOON_KM * 1000.0
    return max(vals.get("lat", 0) * k, vals.get("lon", 0) * k * math.cos(math.radians(lat)))


def check_sites(sites: list[dict[str, Any]], coords_csv: pd.DataFrame | None, lroc: pd.DataFrame | None,
                regions: list[dict[str, Any]] | None, wueller: pd.DataFrame | None, clps_ids: set[str]) -> list[SiteCheck]:
    """착륙지마다 기준 좌표를 찾아 현재 값과의 차이를 낸다 (작업 1 절차 2·3)."""
    by_site = {}
    if coords_csv is not None:
        for _, r in coords_csv.iterrows():
            by_site[str(r["site_id"]).strip()] = r
    lroc_by = {r.object_id: r for r in lroc.itertuples()} if lroc is not None else {}
    out: list[SiteCheck] = []
    for s in sites:
        sid, lat, lon = s["id"], float(s["lat_deg"]), float(s["lon_deg"])
        c = SiteCheck(sid, s["name"], s["category"], lat, lon, "no_source", "unknown", "none")
        # LROC 교차 확인 (둘째 출처)
        lo = lroc_by.get(LROC_OBJECT_OF.get(sid, ""))
        if lo is not None:
            c.lroc_object, c.lroc_uncertainty_m = lo.object_id, lo.uncertainty_m
            c.lroc_diff_m = _m(lat, lon, lo.lat_deg, lo.lon_deg)
        # 1차 기준: 공식 기록 대조본(16곳)
        r = by_site.get(sid)
        if r is not None:
            rl, ro = float(r["verified_lat_deg"]), float(norm_lon(float(r["verified_lon_east_deg_signed"])))
            c.lat_ref, c.lon_ref = rl, ro
            c.diff_m = _m(lat, lon, rl, ro)
            c.ref_source, c.ref_url = str(r["coordinate_source_file"]), str(r["coordinate_source_url"])
            c.coordinate_reference = str(r["coordinate_reference"])
            c.ref_uncertainty_m = _sigma_m(r.get("published_sigma"), rl)
            c.coord_kind, c.evidence = "landing_point", "official"
            tol = max(x for x in (c.ref_uncertainty_m, c.lroc_uncertainty_m, 0.0) if x is not None)
            if sid in clps_ids:
                # CLPS 3곳은 SPICE 착륙 지점 커널 값을 이미 쓴다. 재확인만 하고 값은 바꾸지 않는다.
                c.verdict = "match"
                c.notes.append(f"현재 값은 CLPS SPICE 착륙 지점 커널. 대조본과 {c.diff_m:.1f} m 차이(커널 원점과 반사경·영상 위치의 차이일 수 있음, 원인 미확인)")
            else:
                c.verdict = "match" if c.diff_m <= tol else "replace"
            if "ME" not in c.coordinate_reference:
                c.notes.append("대조본 좌표계 표기가 ME 로 명시되지 않음 (NSSDCA/LROC 영상 기준)")
            if c.lroc_diff_m is None and sid != "lcross_cabeus":
                c.notes.append("LROC 인공물 목록에 없음 → 교차 확인 없음")
        elif lo is not None:
            # 대조본에 없지만 LROC 목록에 있는 곳 (LCROSS)
            c.lat_ref, c.lon_ref, c.diff_m = lo.lat_deg, lo.lon_deg, c.lroc_diff_m
            c.ref_source, c.ref_url = "ANTHROPOGENIC_OBJECTS_180 (Wagner et al. 2017, 2026-08-14판)", str(lo.references).split(";")[0].strip() or None
            c.ref_uncertainty_m = lo.uncertainty_m
            c.coordinate_reference = "IAU Moon 2000 GCS (LROC, 경위도)"
            c.coord_kind, c.evidence = "landing_point", "official"
            c.verdict = "match" if c.diff_m <= lo.uncertainty_m else "replace"
            c.notes.append(f"LROC 좌표 출처: {lo.coord_src}")
        # 아르테미스: 2024 경계 포함, Wueller 후보점
        if s["category"] == "artemis":
            from shapely.geometry import Point

            x, y = aeqd_forward(lat, lon)
            pt = Point(float(x), float(y))
            for g in regions or []:
                if g["poly"].covers(pt):
                    c.region_2024 = g["name"]
                    c.region_2024_centroid_m = _m(lat, lon, g["centroid_lat"], g["centroid_lon"])
            code = WUELLER_REGION_OF.get(sid)
            if wueller is not None and len(wueller):
                d = great_circle_km(lat, lon, wueller["lat_deg"].to_numpy(), wueller["lon_deg"].to_numpy()) * 1000.0
                sub = wueller.assign(d=d)
                if code:
                    sub = sub[sub["region"] == code]
                    c.wueller_region = code
                if len(sub):
                    best = sub.loc[sub["d"].idxmin()]
                    c.wueller_nearest, c.wueller_nearest_m = str(best["name"]), float(best["d"])
            if code and c.wueller_nearest_m is not None and c.wueller_nearest_m < 1.0:
                # 이미 Wueller 후보점 좌표로 바뀐 곳 (2026-11-15 교체)
                c.verdict, c.coord_kind, c.evidence = "match", "candidate_point", "peer_reviewed"
                c.lat_ref, c.lon_ref, c.diff_m = lat, lon, c.wueller_nearest_m
                c.ref_source, c.ref_url = f"Wueller et al. (2026) 착륙 후보점 {c.wueller_nearest}", "https://doi.org/10.5281/zenodo.17084058"
                c.notes.append(f"동료 심사 논문의 착륙 후보점 (지역 {code}). 공식 착륙점 아님")
            elif c.region_2024:
                c.verdict, c.coord_kind, c.evidence = "region_point", "region_point", "official"
                c.notes.append(f"2024 후보 지역 '{c.region_2024}' 경계 안 (남극 AEQD 평면의 직선 변, 경계선 포함). 지역 대표점이며 착륙점이 아님")
            elif code:
                c.verdict, c.coord_kind = "named_region_only", "region_point"
                c.evidence = "peer_reviewed" if c.wueller_nearest else "none"
                c.notes.append(f"2024 9지역 밖. 이름은 Wueller et al. (2026) 지역 코드 {code} 와 맞음. 지역 경계 자료는 없음 → 좌표 출처 없음")
            else:
                c.notes.append("2024 9지역 밖, 2022 지역 이름에도 없음 → 좌표 출처 없음")
        out.append(c)
    return out


def site_checks_frame(checks: list[SiteCheck]) -> pd.DataFrame:
    rows = []
    for c in checks:
        d = asdict(c)
        d["notes"] = " / ".join(c.notes)
        rows.append(d)
    return pd.DataFrame(rows)


def read_site_coords(path: Path) -> pd.DataFrame:
    return read_csv(path)


# ───────────────────────── 작업 2: 미션 필드 ─────────────────────────

MISSION_EVIDENCE_CSV = "Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_MISSION_FIELD_EVIDENCE.csv"
MISSION_RECON_CSV = "Workspace/Codex_Data_Collection/00_Existing_Audit/LANDING_MISSION_RECONCILIATION.csv"

#: 미션 id 별칭 (근거표는 im1/im2/chandrayaan2, 카탈로그 id 도 같다)
#: 착륙 시각에 쓸 근거 필드: 근거표 field 이름 → 시각 정밀도
TIME_FIELDS = [("landing_utc", None), ("first_ground_contact_utc", "second")]
LEVEL_PRECISION = {"published_event": "second", "published_minute": "minute", "source_reported_minute": "minute",
                   "approximate": "minute", "date_only": "date"}

#: 조명 관련 판정 근거 (근거표 문장을 그대로 인용). 근거 문장이 조명·일몰·태양전지 방향을 직접 말할 때만 yes,
#: 조명과 무관한 원인을 말할 때만 no. 나머지는 unknown. (작업 2 절차 3)
LIGHTING_RULES: dict[str, tuple[str, str, str]] = {
    # mission_id: (값, 근거표 field, 판단 이유)
    "slim": ("yes", "postlanding_solar_panel_orientation", "태양전지가 서쪽을 향해 착륙 직후 발전하지 못함 (태양전지 방향)"),
    "im2": ("yes", "imaging_payload_or_lander_power_cause", "옆으로 누운 자세·태양전지 방향·조명·분화구 저온으로 배터리 소진"),
    "chandrayaan3": ("yes", "design_life", "설계 수명이 달의 낮 1일 (일몰로 운용 종료되는 설계)"),
    "blue_ghost_m1": ("yes", "actual_duration_h", "운용 346 h 는 낮 동안만 센 값, 달의 밤 진입 뒤 몇 시간 더 동작"),
    "hakuto_r_m1": ("no", "failure_cause", "고도 추정값 기각 → 추진제 소진 → 충돌 (항법)"),
}


@dataclass
class FieldCheck:
    mission_id: str
    field: str
    current: Any
    evidence: Any
    verdict: str            # match | replace | no_evidence | conflict | derived
    level: str | None = None
    source_url: str | None = None
    note: str | None = None


def _ts(s) -> pd.Timestamp | None:
    try:
        t = pd.Timestamp(str(s).replace("~", "").strip())
    except (ValueError, TypeError):
        return None
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


def check_missions(missions: list[dict[str, Any]], ev: pd.DataFrame, recon: pd.DataFrame | None) -> tuple[list[FieldCheck], dict[str, dict]]:
    """미션 × 핵심 필드 비교. 반환: (필드 표, 미션별 채택안)."""
    rows: list[FieldCheck] = []
    adopt: dict[str, dict] = {}
    ev = ev.copy()
    ev["mission_id"] = ev["mission_id"].astype(str).str.strip()
    rc = recon.copy() if recon is not None else pd.DataFrame(columns=["mission_id", "field", "source_value", "source_url", "comparison", "notes"])
    rc["mission_id"] = rc["mission_id"].astype(str).str.strip()

    def ev_row(mid, field):
        g = ev[(ev.mission_id == mid) & (ev.field == field)]
        return g.iloc[0] if len(g) else None

    def rc_row(mid, field):
        g = rc[(rc.mission_id == mid) & (rc.field == field)]
        return g.iloc[0] if len(g) else None

    for m in missions:
        mid = m["id"]
        a: dict[str, Any] = {"evidence": {}}
        # ── 착륙 시각 ──
        cur = _ts(m["landing_utc"])
        r = ev_row(mid, "landing_utc")
        g = rc_row(mid, "first_ground_contact_utc")
        alt = ev_row(mid, "alternative_published_landing_utc")
        d = ev_row(mid, "surface_event_date")
        if g is not None and _ts(g["source_value"]) is not None:
            t = _ts(g["source_value"])
            rows.append(FieldCheck(mid, "landing_utc", m["landing_utc"], t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                   "match" if cur == t else "replace", "source_second", str(g["source_url"]), "첫 접지 시각 (원본 대조)"))
            a["landing_utc"], a["landing_precision"] = t.strftime("%Y-%m-%dT%H:%M:%SZ"), "second"
            a["evidence"]["landing_utc"] = {"level": "source_second", "source_url": str(g["source_url"])}
        elif r is not None and _ts(r["official_value"]) is not None:
            t = _ts(r["official_value"])
            prec = LEVEL_PRECISION.get(str(r["verification_level"]), "minute")
            same = cur is not None and (cur == t if prec == "second" else cur.floor("min") == t.floor("min"))
            note = str(r["notes"]) if pd.notna(r["notes"]) else None
            if alt is not None:
                note = f"{note or ''} 다른 출처: {alt['official_value']} ({alt['source_url']})".strip()
            rows.append(FieldCheck(mid, "landing_utc", m["landing_utc"], r["official_value"], "match" if same else "replace",
                                   str(r["verification_level"]), str(r["source_url"]), note))
            a["landing_utc"] = t.strftime("%Y-%m-%dT%H:%M:%SZ")
            a["landing_precision"] = prec
            a["evidence"]["landing_utc"] = {"level": str(r["verification_level"]), "source_url": str(r["source_url"])}
        elif d is not None:
            same = cur is not None and cur.strftime("%Y-%m-%d") == str(d["official_value"])
            rows.append(FieldCheck(mid, "landing_utc", m["landing_utc"], d["official_value"], "match" if same else "conflict",
                                   "date_only", str(d["source_url"]), "날짜만 확인. 시·분은 근거 없음 (기존 값 유지, 정밀도 '날짜')"))
            a["landing_utc"], a["landing_precision"] = m["landing_utc"], "date"
            a["evidence"]["landing_utc"] = {"level": "date_only", "source_url": str(d["source_url"])}
        else:
            rows.append(FieldCheck(mid, "landing_utc", m["landing_utc"], None, "no_evidence"))
            a["landing_precision"] = "unknown"
        # ── 운용 기간 ──
        r = ev_row(mid, "actual_duration_h")
        if r is not None:
            ov = r["official_value"]
            try:
                v = float(ov)
                if math.isnan(v):
                    raise ValueError("빈칸")
                rows.append(FieldCheck(mid, "duration_h", m.get("duration_h"), round(v, 4), "match" if m.get("duration_h") is not None and abs(float(m["duration_h"]) - v) < 0.05 else "replace",
                                       str(r["verification_level"]), str(r["source_url"]), str(r["notes"]) if pd.notna(r["notes"]) else None))
                a["duration_h"] = round(v, 4)
                a["evidence"]["duration_h"] = {"level": str(r["verification_level"]), "source_url": str(r["source_url"])}
            except (TypeError, ValueError):
                # 숫자가 아닌 근거 ("approximately seven days", "346 daylight…") 또는 빈칸(근거 없음)
                if pd.isna(ov) or str(ov).strip() == "":
                    rows.append(FieldCheck(mid, "duration_h", m.get("duration_h"), None, "no_evidence", str(r["verification_level"]), str(r["source_url"]),
                                           "근거표가 이 값을 운용 기간 근거로 인정하지 않음 → 빈칸"))
                    a["duration_h"] = None
                else:
                    txt = str(ov)
                    num = None
                    if "seven days" in txt:
                        num = 168.0
                    elif txt.split()[0].replace(".", "").isdigit():
                        num = float(txt.split()[0])
                    rows.append(FieldCheck(mid, "duration_h", m.get("duration_h"), num, "replace" if num != m.get("duration_h") else "match",
                                           str(r["verification_level"]), str(r["source_url"]), f"원문 '{txt}' → {num} h (근사)"))
                    a["duration_h"] = num
                    a["evidence"]["duration_h"] = {"level": str(r["verification_level"]), "source_url": str(r["source_url"]), "approx": True}
        # 운용 종료 시각이 공개된 미션: 착륙~종료로 유도
        end = ev_row(mid, "surface_mission_end_utc")
        if end is not None and a.get("landing_utc"):
            h = (_ts(end["official_value"]) - _ts(a["landing_utc"])).total_seconds() / 3600
            rows.append(FieldCheck(mid, "duration_h", m.get("duration_h"), round(h, 2), "derived", str(end["verification_level"]), str(end["source_url"]),
                                   f"착륙 {a['landing_utc']} ~ 운용 종료 {end['official_value']} 로 유도"))
            a["duration_h"] = round(h, 2)
            a["evidence"]["duration_h"] = {"level": "derived_from_published_events", "source_url": str(end["source_url"])}
        # ── 전원 ──
        r = ev_row(mid, "power_type")
        if r is not None:
            ov = str(r["official_value"]).lower()
            code = "battery" if "batter" in ov and "solar" not in ov else ("solar" if "solar" in ov else None)
            rows.append(FieldCheck(mid, "power", m.get("power"), r["official_value"], "match" if code == m.get("power") else "replace",
                                   str(r["verification_level"]), str(r["source_url"]), str(r["notes"]) if pd.notna(r["notes"]) else None))
            if code:
                a["power"] = code
                a["evidence"]["power"] = {"level": str(r["verification_level"]), "source_url": str(r["source_url"])}
        # ── 결과 ──
        r = ev_row(mid, "outcome")
        fc = ev_row(mid, "failure_cause")
        if r is not None:
            rows.append(FieldCheck(mid, "outcome", m.get("outcome"), r["official_value"], "match" if m.get("outcome") == "failure" else "conflict",
                                   str(r["verification_level"]), str(r["source_url"]), str(r["notes"]) if pd.notna(r["notes"]) else None))
            a["evidence"]["outcome"] = {"level": str(r["verification_level"]), "source_url": str(r["source_url"])}
        elif fc is not None:
            rows.append(FieldCheck(mid, "outcome", m.get("outcome"), fc["official_value"], "match" if m.get("outcome") == "failure" else "conflict",
                                   str(fc["verification_level"]), str(fc["source_url"]), "실패 원인 기록으로 결과(실패) 확인"))
            a["evidence"]["outcome"] = {"level": str(fc["verification_level"]), "source_url": str(fc["source_url"])}
        else:
            rows.append(FieldCheck(mid, "outcome", m.get("outcome"), None, "no_evidence", note="근거표에 결과 항목 없음"))
        # ── 조명 관련 ──
        rule = LIGHTING_RULES.get(mid)
        if rule:
            val, fld, why = rule
            src = ev_row(mid, fld)
            src = src if src is not None else rc_row(mid, fld)
            quote = None
            url = None
            if src is not None:
                quote = str(src.get("official_value", src.get("source_value", "")))
                url = str(src["source_url"])
            rows.append(FieldCheck(mid, "lighting_related", None, val, "replace", "quoted_evidence", url, f"{why} · 근거: '{quote}'"))
            a["lighting_related"], a["lighting_evidence"] = val, {"quote": quote, "reason": why, "source_url": url}
        else:
            rows.append(FieldCheck(mid, "lighting_related", None, "unknown", "no_evidence", note="조명과의 관련을 말하는 근거 문장 없음"))
            a["lighting_related"], a["lighting_evidence"] = "unknown", None
        # 미션 verified: 착륙 시각(분 이상 정밀)·좌표·결과가 모두 근거 있음 (사용자 승인 기준, 2026-11-15)
        a["_core"] = {
            "landing_utc": a.get("landing_precision") in ("second", "minute"),
            "outcome": "outcome" in a["evidence"],
        }
        adopt[mid] = a
    return rows, adopt


# ───────────────────────── 작업 3: 착륙선 프리셋 ─────────────────────────

LANDER_SPECS_CSV = "Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_LANDER_TECHNICAL_SPECS.csv"

#: 프리셋 필드 → 근거표에서 받아들일 field 이름과 단위. 단위가 다른 값은 환산하지 않는다 (작업 3 절차 2).
LANDER_FIELD_RULES = {
    "panel_area_m2": ("panel_area", "m2"), "efficiency": ("panel_efficiency", "fraction"),
    "battery_wh": ("battery_capacity", "Wh"), "battery_min_fraction": ("battery_min_fraction", "fraction"),
    "load_active_w": ("power_active", "W"), "load_idle_w": ("power_idle", "W"), "load_survival_w": ("power_survival", "W"),
    "rate_kbps": ("downlink_rate", "kbps"),
}
#: 대응시키지 않은 근거표 행과 그 이유 (보고용)
LANDER_NON_MATCH = {
    "primary_battery_count": "배터리 개수 — 용량이 아님",
    "battery_count": "배터리 개수 — 용량이 아님",
    "nominal_capacity_per_pack": "Ah 단위 — 전압 없이 Wh 로 환산하지 않음",
    "nominal_total_charge": "Ah 단위 — 환산하지 않음",
    "delivered_charge": "실제 사용량(Ah) — 용량 아님",
    "power_generation": "실제 착륙선(찬드라얀 3호)의 발전 출력 — 대표 유형의 패널 면적·효율이 아님",
    "payload_power": "탑재체 전력 제공 범위 — 착륙선 소비 전력이 아님",
}


def check_landers(landers: list[dict[str, Any]], specs: pd.DataFrame) -> list[dict[str, Any]]:
    out = []
    fields = set(specs["field"].astype(str))
    for l in landers:
        for k, (want, unit) in LANDER_FIELD_RULES.items():
            hit = specs[(specs["field"].astype(str) == want) & (specs["unit"].astype(str) == unit)]
            out.append({"lander": l.get("id"), "field": k, "current": l.get(k, l.get({"efficiency": "panel_efficiency", "battery_wh": "battery_capacity_wh"}.get(k, k))),
                        "verdict": "evidence" if len(hit) else "no_evidence", "source_url": hit.iloc[0]["source_url"] if len(hit) else None})
    unmatched = [{"field": f, "reason": LANDER_NON_MATCH.get(f, "프리셋 필드와 대응 없음 (구성·자세·상태 서술)")} for f in sorted(fields)]
    return out + [{"lander": "(근거표)", **u} for u in unmatched]


# ───────────────────────── 승인된 대조 결과를 시드(Drive Catalogs/*.json)에 반영 ─────────────────────────
# 사용자 확인(관문 G1, 2026-11-15): 미션 착륙지 9곳 교체, 2022 지역 이름만 있는 아르테미스 5곳은 같은 지역의
# Wueller 후보점 중 가장 가까운 점으로 교체, 미션 필드 전부 반영, 착륙선 숫자 8개 null·먼지 필드 비움.
# Drive 규칙상 필드 이름은 바꾸지 않고 값만 고친다. 새 필드(근거 수준 등)는 파이프라인 산출물에만 싣는다.

def updated_site_seed(items: list[dict], checks: list[SiteCheck], wueller: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    by = {c.id: c for c in checks}
    out, changes = [], []
    for x in items:
        y = dict(x)
        c = by.get(str(x.get("id")))
        if c is None:
            out.append(y)
            continue
        if c.verdict == "replace" and c.lat_ref is not None:
            y["lat_deg"], y["lon_deg"] = round(c.lat_ref, 6), round(c.lon_ref, 6)
            y["source_url"] = c.ref_url
            y["verified"] = True
            y["note"] = f"좌표: {c.ref_source} ({c.coordinate_reference}). 이전 값과 {c.diff_m:.0f} m 차이 (2026-11-15 대조)"
            changes.append({"id": c.id, "field": "lat/lon", "before": [c.lat_now, c.lon_now], "after": [y["lat_deg"], y["lon_deg"]], "diff_m": round(c.diff_m, 1), "source": c.ref_url})
        elif c.verdict == "match" and c.coord_kind == "landing_point" and not x.get("verified"):
            y["verified"] = True
            y["source_url"] = c.ref_url or x.get("source_url")
            y["note"] = f"좌표: {c.ref_source} 와 일치 ({c.diff_m:.1f} m, 2026-11-15 대조)"
            changes.append({"id": c.id, "field": "verified", "before": False, "after": True, "source": c.ref_url})
        elif c.verdict == "named_region_only" and c.wueller_region and c.wueller_nearest:
            w = wueller[(wueller["region"] == c.wueller_region) & (wueller["name"] == c.wueller_nearest)].iloc[0]
            y["lat_deg"], y["lon_deg"] = round(float(w["lat_deg"]), 6), round(float(w["lon_deg"]), 6)
            y["source_url"] = "https://doi.org/10.5281/zenodo.17084058"
            y["verified"] = True
            y["note"] = (f"좌표: Wueller 외 (2026, JGR Planets, doi:10.1029/2025JE009434) 착륙 후보점 {c.wueller_nearest} (지역 {c.wueller_region}, CC BY 4.0). "
                         f"이전 근사값(출처 없음)에서 가장 가까운 같은 지역 후보점으로 교체, {c.wueller_nearest_m:.0f} m 이동. 공식 착륙점 아님")
            changes.append({"id": c.id, "field": "lat/lon", "before": [c.lat_now, c.lon_now], "after": [y["lat_deg"], y["lon_deg"]], "diff_m": round(c.wueller_nearest_m, 1), "source": y["source_url"]})
        elif c.verdict == "no_source":
            y["verified"] = False
            y["note"] = "좌표 출처 없음 (2024 9지역 밖, 2022 지역 이름에도 없음). 대표 지점 근사값"
        elif c.verdict == "region_point":
            y["note"] = (x.get("note") or "") if "면적 중심" in str(x.get("note")) else f"2024 후보 지역 '{c.region_2024}' 경계 안의 대표점 (좌표 자체는 출처 없음). 착륙점 아님"
        # 지형 자료 밖(75°S 북쪽)인 곳의 고도 0 은 '값 없음' 이었다 → null
        if y.get("elevation_m") == 0 and float(y["lat_deg"]) > -75:
            y["elevation_m"] = None
            changes.append({"id": c.id, "field": "elevation_m", "before": 0, "after": None, "source": "지형 자료 밖 — 값 없음"})
        out.append(y)
    return out, changes


POWER_KO = {"battery": "배터리", "solar": "태양전지"}


def updated_mission_seed(items: list[dict], adopt: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    out, changes = [], []
    for x in items:
        y = dict(x)
        a = adopt.get(str(x.get("id")))
        if a is None:
            out.append(y)
            continue

        def put(k, v):
            if y.get(k) != v:
                changes.append({"id": x["id"], "field": k, "before": y.get(k), "after": v})
                y[k] = v

        if a.get("landing_utc"):
            put("landing_utc", a["landing_utc"])
        if "duration_h" in a:
            put("actual_duration_h", a["duration_h"])
        if a.get("power"):
            put("power_type", POWER_KO.get(a["power"], a["power"]))
        lr = a.get("lighting_related")
        put("lighting_related", True if lr == "yes" else False if lr == "no" else None)
        urls = list(x.get("source_urls") or [])
        for ev in a["evidence"].values():
            u = ev.get("source_url")
            if u and u not in urls:
                urls.append(u)
        y["source_urls"] = urls
        out.append(y)
    return out, changes


LANDER_NUMERIC_SEED = ["panel_area_m2", "panel_efficiency", "battery_capacity_wh", "battery_min_fraction", "power_active_w", "power_idle_w",
                       "power_survival_w", "downlink_rate_kbps", "dust_radius_km"]


def updated_lander_seed(items: list[dict]) -> tuple[list[dict], list[dict]]:
    out, changes = [], []
    for x in items:
        y = dict(x)
        for k in LANDER_NUMERIC_SEED:
            if y.get(k) is not None:
                changes.append({"id": x["id"], "field": k, "before": y[k], "after": None})
                y[k] = None
        out.append(y)
    return out, changes
