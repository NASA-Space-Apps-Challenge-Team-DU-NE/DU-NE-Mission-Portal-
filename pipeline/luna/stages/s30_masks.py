"""s30 masks: 착륙지 1° 지평선 마스크 (관측 높이 2 m, 마스트 높이별) + Drive Horizon_Masks 대조."""

from __future__ import annotations

import csv
import json

import numpy as np

from luna import log
from luna.catalogs import load_sites
from luna.contracts import Envelope, HorizonMask
from luna.horizon import compute_mask
from luna.preview import save_mask_plot
from luna.stages.common import Ctx, write_envelope
from luna.terrain import Terrain

NAME = "s30"
SCHEMA = "luna.mask.v1"


def drive_mask(ctx: Ctx, site_id: str) -> tuple[np.ndarray | None, str | None]:
    """Drive Horizon_Masks/<id>*.json 의 고도 배열 (형식이 다르면 None). 방위 기준(북 0°, 시계)이 같다고 가정하지 않고 기록한다."""
    f = ctx.data.first(f"Horizon_Masks/{site_id}*.json")
    if f is None:
        return None, None
    js = json.loads(f.read_text(encoding="utf-8"))
    d = js.get("data", js)
    for k in ("elevation_deg", "horizon_deg", "elev_deg", "mask"):
        if k in d and isinstance(d[k], list):
            return np.asarray(d[k], dtype=float), ctx.data.rel(f)
    log.warn(NAME, f"Drive 마스크 형식 모름: {f.name} (키 {list(d)[:8]})")
    return None, ctx.data.rel(f)


def run(ctx: Ctx) -> int:
    meta = ctx.build / "terrain" / "meta.json"
    if not meta.exists():
        log.warn(NAME, "s20 먼저 실행")
        return 1
    seed = ctx.data.first("Catalogs/sites.json")
    if seed is None:
        log.warn(NAME, "Catalogs/sites.json 이 없다")
        return 1
    sites, conv = load_sites(seed)
    cfg = ctx.settings.mask
    key = ctx.stamp_key(NAME, [meta, seed] + ctx.data.glob("Horizon_Masks/*.json"), {"cfg": cfg.__dict__, "only": ctx.only, "code": 2})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0
    terr = Terrain(meta)
    dem_prov = json.loads(meta.read_text(encoding="utf-8"))["provenance"]
    seed_prov = ctx.prov(seed, "site_seed", lon_convention=conv, source_crs="위경도 표 (Catalogs/sites.json)")
    rows = []
    south = [s for s in sites if s["lat_deg"] <= ctx.settings.grid.lat_limit_deg and (not ctx.only or s["id"] in ctx.only)]
    log.info(NAME, f"남극권 착륙지 {len(south)}곳")
    failed: list[str] = []
    for s in south:
        try:
            smp = terr.site_samplers(s["lat_deg"], s["lon_deg"], cfg.max_range_km)
            res = compute_mask(smp, s["lat_deg"], s["lon_deg"], cfg.observer_height_m, cfg.az_step_deg, cfg.max_range_km, near_exclude_km=cfg.near_exclude_km, ground_radius_km=cfg.ground_radius_km)
        except ValueError as e:
            log.warn(NAME, f"{s['id']}: {e}")
            failed.append(s["id"])
            continue
        ref, ref_rel = drive_mask(ctx, s["id"])
        cmp = None
        if ref is not None and ref.size == res["elevation_deg"].size:
            dd = res["elevation_deg"] - ref
            cmp = {"rms_deg": float(np.sqrt(np.mean(dd**2))), "max_deg": float(np.max(np.abs(dd)))}
            rows.append([s["id"], ref_rel, cmp["rms_deg"], cmp["max_deg"]])
        hm = HorizonMask(
            site_id=s["id"], lat_deg=s["lat_deg"], lon_deg=s["lon_deg"], ground_elev_m=res["ground_elev_m"],
            observer_height_m=cfg.observer_height_m, az_step_deg=cfg.az_step_deg,
            elevation_deg=[round(float(x), 4) for x in res["elevation_deg"]], terrain="site",
            max_range_km=[round(float(x), 2) for x in res["max_range_km"]], dem_used=res["dem_used"], compare_drive=cmp,
        )
        from luna.contracts import Provenance

        prov = [Provenance(**p) for p in dem_prov] + [seed_prov]
        if cmp is not None and ref_rel:
            ctx.record_input(ctx.data.path(ref_rel), "mask_comparison_reference")
            prov += [p for p in ctx._inputs.values() if p.drive_path == ref_rel and p.role == "mask_comparison_reference"]
        write_envelope(ctx, f"masks/{s['id']}.json", Envelope(SCHEMA, hm, prov, notes=[f"관측 높이 {cfg.observer_height_m} m, 최대 {cfg.max_range_km} km", f"근거리 {cfg.near_exclude_km * 1000:.0f} m 안 제외, 지면 고도는 반경 {cfg.ground_radius_km * 1000:.0f} m 평균"]))
        save_mask_plot(res["az_deg"], res["elevation_deg"], ctx.build_path(f"preview/masks/{s['id']}.png"), ref)

        # P3-01 마스트 높이별 (근사식 금지 → 같은 계산을 높이만 바꿔 반복)
        hs = []
        for h in cfg.mast_heights_m:
            r = compute_mask(smp, s["lat_deg"], s["lon_deg"], h, cfg.az_step_deg, cfg.max_range_km, near_exclude_km=cfg.near_exclude_km, ground_radius_km=cfg.ground_radius_km)
            hs.append(HorizonMask(s["id"], s["lat_deg"], s["lon_deg"], r["ground_elev_m"], h, cfg.az_step_deg, [round(float(x), 4) for x in r["elevation_deg"]], "site", dem_used=r["dem_used"]))
        write_envelope(ctx, f"masks/heights/{s['id']}.json", Envelope("luna.mast_masks.v1", {"site_id": s["id"], "heights_m": list(cfg.mast_heights_m), "masks": hs}, prov))
        log.info(NAME, f"{s['id']}: 지면 {res['ground_elev_m']:.0f} m, 지평선 최고 {res['elevation_deg'].max():.2f}°" + (f", Drive 대조 RMS {cmp['rms_deg']:.3f}°" if cmp else ""))
    with ctx.build_path("s30/compare_drive.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["site_id", "drive_file", "rms_deg", "max_deg"])
        w.writerows(rows)
    if failed:
        # 성공한 착륙지만 썼고 도장은 찍지 않는다 → 다음 실행에서 다시 시도
        log.warn(NAME, f"마스크 생성 실패 {len(failed)}곳: {', '.join(failed)}")
        return 1
    ctx.mark_done(NAME, key)
    return 0
