"""s70 catalogs: sites·missions·landers·stations·power_refs 정규화 (출처·verified 포함).

기억으로 숫자를 채우지 않는다. 원본에 없는 값은 None 이고 화면이 "자료 없음"으로 표시한다.
"""

from __future__ import annotations

import pandas as pd

from luna import log
from luna.catalogs import MOUNT, _code, _get, load_missions, load_sites, slug
from luna.contracts import Antenna, Envelope, Lander, Mission, PowerRef, Site, Station
from luna.geo.frames import norm_lon
from luna.io.tables import read_csv, read_json
from luna.stages.common import Ctx, write_envelope

NAME = "s70"
REF = "Reference_Tables/NASA_Gap_Collection_2026-11-14"


def sites(ctx: Ctx) -> int:
    seed = ctx.data.first("Catalogs/sites.json")
    if not seed:
        log.warn(NAME, "Catalogs/sites.json 없음")
        return 0
    rows, conv = load_sites(seed)
    checks = {c.id: c for c in _site_checks(ctx, rows)}
    out = []
    for s in rows:
        mask = ctx.out / "masks" / f"{s['id']}.json"
        terrain = "site" if mask.exists() else ("grid" if s["lat_deg"] <= ctx.settings.grid.lat_limit_deg else "flat")
        elev = s.get("elevation_m")
        if mask.exists():
            # 지면 고도는 지평선 마스크를 만든 DEM 값(같은 좌표)으로 맞춘다 (작업 1 '고도')
            mj = read_json(mask)["data"]
            if abs(mj["lat_deg"] - s["lat_deg"]) < 1e-6 and abs(mj["lon_deg"] - s["lon_deg"]) < 1e-6:
                elev = round(float(mj["ground_elev_m"]), 1)
            else:
                log.warn(NAME, f"{s['id']}: 마스크 좌표가 카탈로그와 다르다 → 지형 재계산 필요 (s30)")
        c = checks.get(s["id"])
        ev = "none"
        if c:
            ev = "inside_official_region" if (c.verdict == "region_point" and "면적 중심" not in str(s.get("note"))) else c.evidence
        out.append(Site(
            id=s["id"], name=s["name"], name_en=s.get("name_en"), category=s["category"], lat_deg=s["lat_deg"], lon_deg=s["lon_deg"],
            elevation_m=elev, terrain=terrain, mask=f"masks/{s['id']}.json" if mask.exists() else None,
            source_keys=["drive_catalog"] + (["nasa_artemis_2024"] if s["category"] == "artemis" else []) + (["wueller_2026"] if c and c.coord_kind == "candidate_point" else []),
            verified=s["verified"], note=s.get("note"),
            coord_kind=c.coord_kind if c else "unknown", coord_evidence=ev,
            coord_source_url=(c.ref_url if c else None) or s.get("source"),
            coord_uncertainty_m=max([x for x in (c.ref_uncertainty_m, c.lroc_uncertainty_m) if x is not None], default=None) if c else None,
        ))
    write_envelope(ctx, "catalog/sites.json", Envelope("luna.sites.v1", out, [ctx.prov(seed, "sites", lon_convention=conv, source_crs="위경도 표")],
                   notes=["아르테미스 후보 목록 기준은 팀 결정 대기 (CLAUDE.md 1.2-2)", "좌표 대조 표: validation/catalog_sites.json (2026-11-15)"]))
    log.info(NAME, f"착륙지 {len(out)}곳 (verified {sum(s.verified for s in out)})")
    return len(out)


def _site_checks(ctx: Ctx, rows: list[dict]):
    from luna import reconcile as R

    d = ctx.data
    need = [d.path(p) for p in (R.SITE_COORDS_CSV, R.LROC_OBJECTS_ZIP, R.WUELLER_ZIP, ARTEMIS_ZIP)]
    if not all(p.exists() for p in need):
        log.warn(NAME, "좌표 대조 자료 일부 없음 → 대조 생략")
        return []
    checks = R.check_sites(rows, R.read_site_coords(need[0]), R.load_lroc_objects(need[1]), R.load_artemis_polygons(need[3]),
                           R.load_wueller_sites(need[2]), {"im1_odysseus", "im2_athena", "blue_ghost_m1"})
    df = R.site_checks_frame(checks).astype(object)
    df = df.where(df.notna(), None)
    write_envelope(ctx, "validation/catalog_sites.json", Envelope("luna.validation.catalog_sites.v1", df.to_dict("records"),
                   [ctx.prov(p, "site_reference", allow_unlisted=True) for p in need], quality="REFERENCE_ONLY",
                   notes=["일치 판정은 출처의 위치 불확도만 쓴다. 허용 오차를 새로 정하지 않음"]))
    return checks


def missions(ctx: Ctx) -> int:
    seed = ctx.data.first("Catalogs/missions.json")
    coords = ctx.data.first(f"{REF}/LUNA_HISTORICAL_SITE_COORDINATES_16.csv")
    rows, notes = load_missions(seed, coords)
    prov = [ctx.prov(p, r) for p, r in ((seed, "missions_seed"), (coords, "mission_coords")) if p]
    from dataclasses import asdict as _asdict

    from luna import reconcile as R

    ev, rc = ctx.data.first(R.MISSION_EVIDENCE_CSV), ctx.data.first(R.MISSION_RECON_CSV)
    adopt: dict = {}
    if ev:
        fields, adopt = R.check_missions(rows, read_csv(ev), read_csv(rc) if rc else None)
        write_envelope(ctx, "validation/catalog_missions.json", Envelope("luna.validation.catalog_missions.v1", [_asdict(f) for f in fields],
                       [ctx.prov(p, "mission_evidence", allow_unlisted=True) for p in (ev, rc) if p], quality="REFERENCE_ONLY"))
        prov.append(ctx.prov(ev, "mission_evidence"))
    coord_ids = set()
    if coords:
        cdf = read_csv(coords)
        coord_ids = {slug(x) for x in cdf["mission_id"]}
    out = []
    for m in rows:
        a = adopt.get(m["id"], {})
        core = a.get("_core", {})
        # verified = 착륙 시각(분 이상)·좌표·결과가 모두 근거 있음 (사용자 승인 기준 2026-11-15)
        m["verified"] = bool(core.get("landing_utc") and core.get("outcome") and m["id"] in coord_ids)
        eph = ctx.out / "ephemeris" / "missions" / f"{m['id']}.json"
        out.append(Mission(
            id=m["id"], name=m["name"], agency=m["agency"], landing_utc=m["landing_utc"], lat_deg=m["lat_deg"], lon_deg=m["lon_deg"],
            duration_h=m["duration_h"], outcome=m["outcome"] if m["outcome"] in ("success", "partial", "failure") else "partial",
            outcome_reason=m["outcome_reason"] or "", power=m["power"], comm=m["comm"], approach=m["approach"],
            source_keys=["drive_catalog"] + (["mission_evidence"] if a else []), verified=m["verified"], site_id=m.get("site_id"),
            ephemeris=f"ephemeris/missions/{m['id']}.json" if eph.exists() else None,
            lighting_related=a.get("lighting_related", "unknown"), lighting_evidence=a.get("lighting_evidence"),
            landing_precision=a.get("landing_precision", "unknown"), evidence=a.get("evidence", {}),
        ))
    write_envelope(ctx, "catalog/missions.json", Envelope("luna.missions.v1", out, prov, notes=notes))
    log.info(NAME, f"과거 미션 {len(out)}개")
    return len(out)


def landers(ctx: Ctx) -> int:
    seed = ctx.data.first("Catalogs/landers.json")
    if not seed:
        log.warn(NAME, "Catalogs/landers.json 없음 → 착륙선 프리셋 자료 없음")
        return 0
    raw = read_json(seed)
    items = raw.get("data", raw) if isinstance(raw, dict) else raw
    out = []

    def num(x, *keys):
        v = _get(x, *keys)  # 없으면 None — 기본값을 주지 않는다 (작업 3)
        return None if v is None else float(v)

    for x in items:
        out.append(Lander(
            id=slug(_get(x, "id", "name")), name=str(_get(x, "name")),
            panel_area_m2=num(x, "panel_area_m2"), efficiency=num(x, "panel_efficiency", "efficiency"),
            mount=_code(_get(x, "panel_mount", "mount", default=""), MOUNT, "vertical_fixed"), panel_azimuth_deg=_get(x, "panel_azimuth_deg"),
            battery_wh=num(x, "battery_capacity_wh", "battery_wh"), battery_min_fraction=num(x, "battery_min_fraction"),
            load_active_w=num(x, "power_active_w", "load_active_w"), load_idle_w=num(x, "power_idle_w", "load_idle_w"),
            load_survival_w=num(x, "power_survival_w", "load_survival_w"), rate_kbps=num(x, "downlink_rate_kbps", "rate_kbps"),
            source_keys=["lander_specs"],
        ))
    specs = ctx.data.first(f"{REF}/LUNA_LANDER_TECHNICAL_SPECS.csv")
    prov = [ctx.prov(seed, "landers_seed")] + ([ctx.prov(specs, "lander_specs")] if specs else [])
    write_envelope(ctx, "catalog/landers.json", Envelope("luna.landers.v1", out, prov, kind="approx",
                   notes=["대표 유형 프리셋. 제원 근거표(LUNA_LANDER_TECHNICAL_SPECS.csv)에 대응하는 행이 없어 숫자 필드는 모두 null — 화면에서 입력 (2026-11-15 대조)"]))
    log.info(NAME, f"착륙선 프리셋 {len(out)}종")
    return len(out)


def stations(ctx: Ctx) -> int:
    """지상국: Catalogs/stations.json(대표 위치) + DSN 안테나 ITRF93 좌표 + 안테나별 수신 지평선 마스크."""
    coords = ctx.data.first(f"{REF}/DSN_ITRF93_ANTENNA_COORDINATES.csv")
    masks = ctx.data.first(f"{REF}/DSN_HORIZON_MASKS_301O.csv")
    seed = ctx.data.first("Catalogs/stations.json")
    out: list[Station] = []
    prov = []
    mask_by: dict[str, dict] = {}
    if masks:
        df = read_csv(masks)
        df.columns = [str(c).strip() for c in df.columns]
        if {"station_sheet", "azimuth_deg", "receive_deg"} <= set(df.columns):
            for a, g in df.groupby("station_sheet"):
                g = g.assign(az=pd.to_numeric(g["azimuth_deg"], errors="coerce"), el=pd.to_numeric(g["receive_deg"], errors="coerce")).dropna(subset=["az", "el"]).sort_values("az")
                if len(g) < 2:
                    continue
                step = float(g["az"].diff().dropna().median())
                if abs(len(g) * step - 360) > step:  # 360° 를 덮지 않으면 쓰지 않는다
                    continue
                mask_by[str(a).strip()] = {"az_step_deg": step, "elevation_deg": [float(v) for v in g["el"]]}
            prov.append(ctx.prov(masks, "dsn_masks", source_crs="지상국 지평 좌표 (방위·수신 고도각)"))
        else:
            log.warn(NAME, f"DSN 마스크 열이 예상과 다르다: {list(df.columns)}")
    if seed:
        raw = read_json(seed)
        items = raw.get("data", raw) if isinstance(raw, dict) else raw
        for x in items:
            sid = slug(_get(x, "id", "name"))
            net = str(_get(x, "network", default="other"))
            out.append(Station(sid, str(_get(x, "name")), net, float(_get(x, "lat_deg")),
                               float(norm_lon(float(_get(x, "lon_deg")))), float(_get(x, "altitude_m", "height_m", default=0)), [],
                               float(_get(x, "min_elevation_deg", "min_elev_deg", default=10)), ["dsn" if "DSN" in net else "kari_kdsa"],
                               bool(_get(x, "verified", default=False))))
        prov.append(ctx.prov(seed, "stations_seed"))
    if coords:
        df = read_csv(coords)
        df.columns = [str(c).strip() for c in df.columns]
        need = {"antenna", "complex_id", "planetodetic_lat_deg", "east_lon_deg"}
        if need <= set(df.columns):
            prov.append(ctx.prov(coords, "dsn_coords", source_crs="ITRF93 측지 위경도 (NAIF earth_topo_260814)", lon_convention="-180..180"))
            for s_ in out:
                rows = df[df["complex_id"].astype(str).str.lower() == s_.id]
                ants = []
                for _, r in rows.iterrows():
                    aid = str(r["antenna"]).strip()
                    ants.append(Antenna(aid, float(r["diameter_m"]) if "diameter_m" in df.columns and pd.notna(r["diameter_m"]) else None,
                                        float(r["planetodetic_lat_deg"]), float(norm_lon(float(r["east_lon_deg"]))),
                                        float(r["ellipsoidal_height_m"]) if "ellipsoidal_height_m" in df.columns else None, mask_by.get(aid)))
                # 대표 안테나(맨 앞): 지평선 마스크가 있고 지름이 큰 것
                ants.sort(key=lambda a: (a.horizon_mask is None, -(a.diameter_m or 0)))
                s_.antennas = ants
                if ants:
                    s_.verified = True
        else:
            log.warn(NAME, f"DSN 좌표 열이 예상과 다르다: {list(df.columns)}")
    write_envelope(ctx, "catalog/stations.json", Envelope("luna.stations.v1", out, prov,
                   notes=["대표 안테나의 수신 지평선 마스크가 있으면 그것 우선, 없으면 최소 고도각 (CLAUDE.md 8.7)", "여주 좌표 출처 확정 필요 (CLAUDE.md 18절)"]))
    log.info(NAME, f"지상국 {len(out)}곳, 안테나 {sum(len(s.antennas) for s in out)}개, 마스크 {sum(1 for s in out if s.antennas and s.antennas[0].horizon_mask)}곳")
    return len(out)


def power_refs(ctx: Ctx) -> int:
    p = ctx.data.first(f"{REF}/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv")
    if not p:
        return 0
    df = read_csv(p)
    df.columns = [str(c).strip() for c in df.columns]
    out = []
    for _, r in df.iterrows():
        try:
            v = float(r["value"])
        except (KeyError, TypeError, ValueError):
            continue
        name = " · ".join(str(r[c]) for c in ("concept", "parameter") if c in df.columns and pd.notna(r[c]))
        out.append(PowerRef(slug(name), name, v, str(r.get("unit", "") or ""), ["power_concepts"], str(r.get("note", "") or "") or None))
    write_envelope(ctx, "catalog/power_refs.json", Envelope("luna.power_refs.v1", out, [ctx.prov(p, "power_refs")]))
    log.info(NAME, f"전력 비교 단위 {len(out)}개")
    return len(out)


ARTEMIS_ZIP = "Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip"


def artemis_regions(ctx: Ctx) -> int:
    """USGS 2024 Artemis III 후보 9지역 경계(경위도 폴리곤) → catalog/artemis_regions.json.

    좌표계는 동봉 .prj 의 GCS_Moon_2000 (R=1737.4 km, 동경 +). 원본 ZIP 은 풀지 않고 GeoJSON 만 읽는다.
    """
    import json
    import zipfile

    src = ctx.data.path(ARTEMIS_ZIP)
    if not src.exists():
        log.warn(NAME, f"{ARTEMIS_ZIP} 없음 → 아르테미스 경계는 대표점 반경 근사로 남는다")
        return 0
    with zipfile.ZipFile(src) as z:
        gj_name = next(n for n in z.namelist() if n.endswith(".geojson"))
        prj = next((z.read(n).decode("utf-8", "replace") for n in z.namelist() if n.endswith(".prj")), "")
        gj = json.loads(z.read(gj_name).decode("utf-8"))
    if "Moon" not in prj:
        raise ValueError(f"경계 좌표계가 달 기준이 아니다: {prj[:80]}")
    out = []
    for f in gj["features"]:
        p, g = f["properties"], f["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [poly[0] for poly in g["coordinates"]]
        for ring in rings:
            for lon, lat in ring:
                if not (-90 <= lat <= -80 and -180 <= lon <= 180):
                    raise ValueError(f"{p.get('Region')}: 좌표 범위 밖 ({lon}, {lat})")
        out.append({
            "id": slug(str(p["Region"])), "name": str(p["Region"]), "code": str(p.get("RegionCode") or ""),
            "area_km2": float(p.get("Area_km2") or 0), "rings": [[[float(x), float(y)] for x, y in r] for r in rings],
        })
    env = Envelope("luna.artemis_regions.v1", out, [ctx.prov(src, "artemis_regions", allow_unlisted=True, source_crs="GCS_Moon_2000 R=1737.4 km")],
                   notes=["USGS 2024 Artemis III 후보 9지역 (DOI 10.5066/P1MEQ6UK). 팀 확인으로 공식 경계 사용",
                          "NASA 2026 계획(Artemis III=2027 지구궤도 시험, IV=2028 착륙)과 다른 2024년 판"])
    write_envelope(ctx, "catalog/artemis_regions.json", env)
    log.info(NAME, f"아르테미스 후보 지역 경계 {len(out)}곳")
    return len(out)


def run(ctx: Ctx) -> int:
    failed = []
    for fn in (sites, missions, landers, stations, power_refs, artemis_regions):
        try:
            fn(ctx)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"{fn.__name__} 실패: {e}")
            failed.append(fn.__name__)
    if failed:
        log.warn(NAME, f"카탈로그 실패 {len(failed)}종: {', '.join(failed)} (이전 산출물이 남아 있을 수 있음)")
        return 1
    return 0
