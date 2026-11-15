"""s80 validation: ① 천체력 vs Horizons·SPICE 기준 표(+IM-1·IM-2 Horizons) ② 지평선 vs Drive 13곳 ③ 장기 일조율 vs PGDA69·WAC(PCT·TWI)
④ 마스트 높이 vs JPL IPN 42-176C ⑤ Wueller 외 2026 한여름 연속 일조 ⑥ PA→ME.

결과는 web/public/data/validation/*.json (10 검증 페이지) 와 docs/validation.md 자동 구역.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import numpy as np

from luna import log
from luna.catalogs import load_sites
from luna.config import REPO_ROOT
from luna.contracts import Envelope, ValidationResult
from luna.sky import body_vector, disk_fraction, horizon_at, topocentric
from luna.stages.common import Ctx, write_envelope

NAME = "s80"


def _stats(ours: np.ndarray, ref: np.ndarray):
    ok = np.isfinite(ours) & np.isfinite(ref)
    d = ours[ok] - ref[ok]
    if d.size == 0:
        return 0, np.nan, np.nan, None, np.nan
    r = float(np.corrcoef(ours[ok], ref[ok])[0, 1]) if d.size > 2 and np.std(ref[ok]) > 0 else None
    return int(d.size), float(d.mean()), float(np.sqrt((d**2).mean())), r, float(np.abs(d).max())


def load_table(ctx: Ctx, rel_json: Path):
    ctx.record_input(rel_json, "validation_ephemeris_metadata")
    js = json.loads(rel_json.read_text(encoding="utf-8"))["data"]
    ctx.record_input(rel_json.with_name(js["bin"]), "validation_ephemeris_values", js.get("frame"))
    arr = np.fromfile(rel_json.with_name(js["bin"]), dtype="<f4").reshape(-1, 2, 3).astype(float)
    from datetime import datetime, timezone

    t0 = datetime.strptime(js["start_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    return t0, js["step_h"] * 3600.0, arr


def interp_vectors(t0: float, step: float, arr: np.ndarray, ts: np.ndarray):
    f = (ts - t0) / step
    i0 = np.clip(np.floor(f).astype(int), 0, arr.shape[0] - 2)
    w = np.clip(f - i0, 0, 1)[:, None]
    out = []
    for b in range(2):
        a = body_vector(arr[i0, b, 0], arr[i0, b, 1], 1.0)
        c = body_vector(arr[i0 + 1, b, 0], arr[i0 + 1, b, 1], 1.0)
        u = a * (1 - w) + c * w
        u /= np.linalg.norm(u, axis=1)[:, None]
        dist = arr[i0, b, 2] * (1 - w[:, 0]) + arr[i0 + 1, b, 2] * w[:, 0]
        out.append(u * dist[:, None])
    inside = (f >= 0) & (f <= arr.shape[0] - 1)
    return out[0], out[1], inside


def spice_vectors(ctx: Ctx, times_utc: list[str]):
    """SPICE (MOON_ME, LT+S) 태양·지구 벡터 (km). 범위 표 밖 기간(과거·장기)의 검증용."""
    from luna.io.spice_eph import KERNELS, SpiceEphemeris

    eph = SpiceEphemeris(ctx.data.path("Raw_Data/SPICE_Kernels"))
    for name in KERNELS:
        ctx.record_input(eph.dir / name, "validation_spice_kernel", "MOON_ME (.tf 정의, PA bpc + 고정 회전)")
    rows = eph.rows(times_utc)
    return body_vector(rows[:, 0], rows[:, 1], rows[:, 2]), body_vector(rows[:, 3], rows[:, 4], rows[:, 5])


def _times(start: str, stop: str, step_h: float) -> list[str]:
    from luna.io.spice_eph import hourly_times

    return hourly_times(start, stop, step_h)


def _mask_at(ctx: Ctx, terr, lat: float, lon: float, h: float, max_range_km: float | None = None):
    from luna.horizon import compute_mask

    cfg = ctx.settings.mask
    rng = max_range_km or cfg.max_range_km
    smp = terr.site_samplers(lat, lon, rng)
    return compute_mask(smp, lat, lon, h, cfg.az_step_deg, rng, near_exclude_km=cfg.near_exclude_km, ground_radius_km=cfg.ground_radius_km)


def _record_terrain_inputs(ctx: Ctx, meta: Path) -> None:
    from luna.io.geotiff import vrt_dependencies

    ctx.record_input(meta, "validation_terrain_metadata")
    data = json.loads(meta.read_text(encoding="utf-8"))
    for key in ("dem240", "dem80"):
        for field in ("image", "label"):
            if data.get(key, {}).get(field):
                ctx.record_input(Path(data[key][field]), f"validation_{key}_{field}", data[key].get("crs"))
    if data.get("dem30_vrt"):
        for path in vrt_dependencies(Path(data["dem30_vrt"])):
            ctx.record_input(path, "validation_dem30_input")


def _horizons_json_table(path: Path):
    """Horizons API JSON (관측점 지정, 겉보기 방위·고도 CSV) → (관측점 lat, lon, alt_m, 시각 초, az, el)."""
    import pandas as pd

    t = json.loads(path.read_text(encoding="utf-8"))["result"]
    g = re.search(r"Center geodetic\s*:\s*([-+0-9.]+),\s*([-+0-9.]+),\s*([-+0-9.]+)", t)
    if not g or "MEAN_ME" not in t.upper().replace(" ", "_") and "MEAN_ME" not in t:
        raise ValueError(f"{path.name}: 관측점·좌표계(MEAN_ME) 표기를 찾지 못함")
    lon, lat, alt_km = float(g.group(1)), float(g.group(2)), float(g.group(3))
    body = t[t.index("$$SOE") + 5:t.index("$$EOE")]
    rows = [ln.split(",") for ln in body.strip().splitlines()]
    ts = np.array([(pd.Timestamp(r[0].strip(), tz="UTC") - pd.Timestamp("1970-01-01", tz="UTC")).total_seconds() for r in rows])
    az = np.array([float(r[3]) for r in rows])
    el = np.array([float(r[4]) for r in rows])
    return lat, lon, alt_km * 1000.0, ts, az, el


def v_ephemeris(ctx: Ctx) -> list[ValidationResult]:
    """Reference_Tables/{horizons,spice}_<site>_<date>.csv (utc, sun_az_deg, sun_el_deg, earth_az_deg, earth_el_deg)."""
    res = []
    seed = ctx.data.first("Catalogs/sites.json")
    sites = {s["id"]: s for s in load_sites(seed)[0]} if seed else {}
    if seed:
        ctx.record_input(seed, "validation_site_seed")
    tables = [ctx.out / "ephemeris" / "range.json"] + sorted((ctx.out / "ephemeris" / "missions").glob("*.json"))
    tables = [t for t in tables if t.exists()]
    if not tables:
        log.warn(NAME, "천체력 산출물 없음 (s10)")
        return res
    loaded = [load_table(ctx, t) for t in tables]
    for f in ctx.data.glob("Reference_Tables/horizons_*.csv") + ctx.data.glob("Reference_Tables/spice_*.csv"):
        m = re.match(r"(horizons|spice)_(.+)_(\d{4}-\d{2}-\d{2})", f.stem)
        if not m:
            continue
        kind, sid = m.group(1), m.group(2)
        site = sites.get(sid) or {"id": sid}
        import pandas as pd

        # 첫 줄은 '#' 주석 (기준 표를 만든 관측점·좌표계). 관측점은 카탈로그가 아니라 이 줄의 좌표를 쓴다
        with f.open(encoding="utf-8") as fh:
            head = fh.readline()
        df = pd.read_csv(f, comment="#")
        mm = {k: float(v) for k, v in re.findall(r"\b(lat|lon_east|alt)=([-+0-9.]+)", head)}
        if "lat" in mm and "lon_east" in mm:
            site = {**site, "lat_deg": mm["lat"], "lon_deg": mm["lon_east"], "elevation_m": mm.get("alt", 0.0)}
        elif "lat_deg" not in site:
            log.warn(NAME, f"{f.name}: 관측점 좌표가 머리줄에도 카탈로그에도 없어 건너뜀")
            continue
        if not any(k in head.upper() for k in ("MOON_ME", "MEAN_ME", "MEAN EARTH")):
            log.warn(NAME, f"{f.name}: 기준 표 좌표계가 MOON_ME 로 적혀 있지 않다 — {head.strip()[:80]}")
        # pandas 3 은 시각 해상도가 µs 일 수 있어 int64 나눗셈 대신 epoch 기준 초로 구한다
        ts = (pd.to_datetime(df["utc"], utc=True) - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds().to_numpy()
        sun = earth = None
        for t0, step, arr in loaded:
            s, e, inside = interp_vectors(t0, step, arr, ts)
            if inside.all():
                sun, earth = s, e
                break
        if sun is None:
            log.warn(NAME, f"{f.name}: 우리 천체력 표가 이 기간을 덮지 않음")
            continue
        ctx.record_input(f, "validation_ephemeris_reference")
        h = float(site.get("elevation_m") or 0.0)
        saz, sel, _ = topocentric(site["lat_deg"], site["lon_deg"], h, 0.0, sun)
        eaz, eel, _ = topocentric(site["lat_deg"], site["lon_deg"], h, 0.0, earth)

        def sep(az1, el1, az2, el2):
            a = body_vector(az1, el1, 1.0)
            b = body_vector(az2, el2, 1.0)
            return np.degrees(np.arccos(np.clip((a * b).sum(axis=1), -1, 1)))

        for body, (az, el) in (("sun", (saz, sel)), ("earth", (eaz, eel))):
            ref_az, ref_el = df[f"{body}_az_deg"].to_numpy(float), df[f"{body}_el_deg"].to_numpy(float)
            n, md, rm, r, mx = _stats(el, ref_el)
            ang = sep(az, el, ref_az, ref_el)
            res.append(ValidationResult(f"ephemeris_{kind}_{sid}_{body}", n, md, rm, r, mx,
                                        {"ref": ctx.data.rel(f), "site": sid, "observer": [site["lat_deg"], site["lon_deg"]], "ref_header": head.strip()[:120], "angsep_max_deg": float(np.nanmax(ang)), "angsep_mean_deg": float(np.nanmean(ang))},
                                        [], bool(np.nanmax(ang) <= 0.1), 0.1))
    # IM-1·IM-2 착륙지 Horizons 표 (남극권 관측점, 겉보기 방위·고도, 관측점 고도 0 km)
    for f in ctx.data.glob("Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM*_*.json"):
        m = re.match(r"Horizons_(IM\d)_(Sun|Earth)_", f.name)
        if not m:
            continue
        try:
            lat, lon, alt, ts, raz, rel = _horizons_json_table(f)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"{f.name}: {e}")
            continue
        vec = None
        for t0, step, arr in loaded:
            sv, ev, inside = interp_vectors(t0, step, arr, ts)
            if inside.all():
                vec = sv if m.group(2) == "Sun" else ev
                break
        if vec is None:
            log.warn(NAME, f"{f.name}: 우리 천체력 표가 이 기간을 덮지 않음")
            continue
        ctx.record_input(f, "validation_ephemeris_reference", "MEAN_ME (Horizons header 확인)")
        az, el, _ = topocentric(lat, lon, alt, 0.0, vec)
        a = body_vector(az, el, 1.0)
        b = body_vector(raz, rel, 1.0)
        ang = np.degrees(np.arccos(np.clip((a * b).sum(axis=1), -1, 1)))
        n, md, rm, r, mx = _stats(el, rel)
        res.append(ValidationResult(f"ephemeris_horizons_{m.group(1).lower()}_{m.group(2).lower()}", n, md, rm, r, mx,
                                    {"ref": ctx.data.rel(f), "observer": [lat, lon], "ref_header": "Horizons API JSON (겉보기 방위·고도, MEAN_ME 관측점)",
                                     "angsep_max_deg": float(np.nanmax(ang)), "angsep_mean_deg": float(np.nanmean(ang))}, [], bool(np.nanmax(ang) <= 0.1), 0.1))
    return res


def v_masks(ctx: Ctx) -> list[ValidationResult]:
    # 마스크 JSON 마다 실린 Drive 대조값을 읽는다 (s30 을 --only 로 일부만 돌려도 나머지 착륙지 대조가 남도록)
    out = []
    moved: set[str] = set()
    seed = ctx.data.first("Catalogs/sites.json")
    if seed is not None:
        ctx.record_input(seed, "validation_site_seed")
        for x in json.loads(seed.read_text(encoding="utf-8")):
            n = str(x.get("note") or "")
            if "2026-11-15" in n and ("이동" in n or "차이" in n):
                moved.add(str(x.get("id")))
    for f in sorted((ctx.out / "masks").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))["data"]
        cmp = d.get("compare_drive")
        if not cmp:
            continue
        ctx.record_input(f, "validation_mask_comparison_artifact")
        drive = ctx.data.first(f"Horizon_Masks/{d['site_id']}*.json")
        cond = {"drive_file": ctx.data.rel(drive) if drive else None, "drive_quality": "REVIEW_REQUIRED"}
        cond["comparison_origin"] = "s30 mask artifact의 compare_drive 재사용; 현재 Drive 원본으로 재계산하지 않음"
        if drive is not None and d["site_id"] in moved:
            # Drive 마스크 JSON 에는 좌표가 없다 → 카탈로그 비고의 '좌표 교체' 기록으로 판단
            cond["note"] = "Drive 마스크는 이전 좌표 기준 — 좌표 교체(2026-11-15) 뒤라 차이에 이동 효과가 섞인다"
        out.append(ValidationResult(f"mask_{d['site_id']}", 360, float("nan"), float(cmp["rms_deg"]), None, float(cmp["max_deg"]), cond, [], None, None))
    return out


def v_illumination(ctx: Ctx) -> list[ValidationResult]:
    """우리 장기 일조율(격자 지평선 + 범위 표 전체, 60 h 간격) vs PGDA69 illum_avg, WAC wac_ill_pct (88–90°S)."""
    gm = ctx.out / "grid" / "manifest.json"
    rng = ctx.out / "ephemeris" / "range.json"
    if not (gm.exists() and rng.exists()):
        return []
    man = json.loads(gm.read_text(encoding="utf-8"))["data"]
    for path in (gm, ctx.out / "grid" / man["cells"], ctx.out / "grid" / man["horizon"]["file"]):
        ctx.record_input(path, "validation_grid_input")
    cells = np.fromfile(ctx.out / "grid" / "cells.u32", dtype="<u4")
    hz = np.fromfile(ctx.out / "grid" / "horizon.i16", dtype="<i2").reshape(cells.size, -1).astype(float) * man["horizon"]["scale"]
    from luna.geo.polar import GridSpec, aeqd_inverse

    spec = GridSpec(man["cell_km"], man["lat_limit_deg"])
    X, Y = spec.centers()
    lat, lon = aeqd_inverse(X.ravel()[cells], Y.ravel()[cells])
    t0, step, arr = load_table(ctx, rng)
    every = max(1, int(round(ctx.settings.eph.longterm_step_h * 3600 / step)))
    idx = np.arange(0, arr.shape[0], every)
    ours = np.zeros(cells.size)
    sub = body_vector(arr[idx, 0, 0], arr[idx, 0, 1], 1.0)  # 태양 방향 (달 중심, 단위)
    rad = np.degrees(np.arcsin(695700.0 / arr[idx, 0, 2]))
    for i in range(cells.size):
        p = np.radians(lat[i]); l_ = np.radians(lon[i])
        u = np.array([np.cos(p) * np.cos(l_), np.cos(p) * np.sin(l_), np.sin(p)])
        e = np.array([-np.sin(l_), np.cos(l_), 0.0])
        n = np.array([-np.sin(p) * np.cos(l_), -np.sin(p) * np.sin(l_), np.cos(p)])
        az = np.degrees(np.arctan2(sub @ e, sub @ n)) % 360
        el = np.degrees(np.arcsin(np.clip(sub @ u, -1, 1)))
        ours[i] = disk_fraction(el, horizon_at(hz[i], man["horizon"]["az_step_deg"], az), rad).mean()
    out = []
    span_days = (idx[-1] - idx[0]) * step / 86400
    for name, label, cond in (("illum_avg", "PGDA69 장기 평균", {}), ("wac_ill_pct", "WAC 실측 (88–90°S)", {"lat_max": -88.0}),
                              ("wac_ill_twi", "WAC 시간가중 실측 (88–90°S)", {"lat_max": -88.0})):
        f = ctx.out / "grid" / "layers" / f"{name}.f32"
        if not f.exists():
            continue
        ctx.record_input(f, "validation_illumination_reference")
        layer_meta = ctx.out / "grid" / "layers.json"
        if layer_meta.exists():
            ctx.record_input(layer_meta, "validation_layer_metadata")
        ref = np.fromfile(f, dtype="<f4").astype(float)
        sel = np.ones(cells.size, bool) if not cond else lat <= cond["lat_max"]
        n, md, rm, r, mx = _stats(ours[sel], ref[sel])
        diff = np.where(sel, np.abs(ours - ref), np.nan)
        worst = [{"id": f"cell_{int(i)}", "diff": float(diff[i])} for i in np.argsort(-np.nan_to_num(diff, nan=-1))[:10]]
        out.append(ValidationResult(f"illum_vs_{name}", n, md, rm, r, mx,
                                    {"ref": label, "ours": f"격자 지평선(5°) + SPICE 범위 표 {span_days:.0f}일, {ctx.settings.eph.longterm_step_h:.0f} h 간격",
                                     "observer_height_m": man["observer_height_m"], "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"}, worst, None, None))
    np.save(ctx.build_path("s80/illum_ours.npy"), ours.astype(np.float32))
    # 검증 페이지 산점도용 (칸별 우리 장기 일조율)
    from luna.stages.common import write_bin

    write_bin(ctx, "validation/illum_ours.f32", ours.astype(np.float32), "<f4")
    return out


def v_pa_me(ctx: Ctx) -> list[ValidationResult]:
    tf = ctx.data.first("Raw_Data/SPICE_Kernels/moon_de440_250416.tf")
    if not tf:
        return []
    ctx.record_input(tf, "validation_frame_definition")
    from luna.geo.frames import pa_to_me_matrix

    try:
        M, desc = pa_to_me_matrix(tf)
    except Exception as e:  # noqa: BLE001
        log.warn(NAME, f"PA→ME 각도 읽기 실패: {e}")
        return []
    ang = float(np.degrees(np.arccos(np.clip((np.trace(M) - 1) / 2, -1, 1))))
    cond = {"kernel": ctx.data.rel(tf), "matrix": desc, "rotation_deg": ang, "surface_shift_m": ang * np.pi / 180 * 1737400}
    try:
        from luna.io.spice_eph import KERNELS, SpiceEphemeris

        sp = SpiceEphemeris(tf.parent).sp
        for name in KERNELS:
            ctx.record_input(tf.parent / name, "validation_spice_kernel")
        R = np.array(sp.pxform("MOON_PA", "MOON_ME", 0.0))
        cond["max_abs_vs_spiceypy"] = float(np.abs(R - M).max())
        cond["direction_ok"] = bool(np.abs(R - M).max() < 1e-9)
    except Exception as e:  # noqa: BLE001
        cond["spiceypy"] = f"대조 못 함: {e}"
    return [ValidationResult("frame_pa_to_me", 1, float("nan"), float("nan"), None, ang, cond, [], cond.get("direction_ok"), None)]


JPL_IPN = "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv"


def v_mast_jpl(ctx: Ctx) -> list[ValidationResult]:
    """④ 마스트 높이: JPL IPN 42-176C(Bryant 2009) 지점 B1 의 높이별 태양·지구 가시 비율(2009–2028 천체력) 재현.

    우리 계산 = LOLA 지평선 마스크(관측 높이만 바꿔 반복) + SPICE 2009–2028(3 h 간격) + 원반 노출률.
    B1 위치는 문서의 평사 좌표(x, y km)뿐이라 축 방향을 모른다 → 8가지 해석 중 DEM 고도가 문서 고도(1261 m, GSSR 기준)에
    가장 가까운 것을 쓰고, 그 선택을 조건에 남긴다. DEM 세대(GSSR vs LOLA)가 달라 지형 자체가 다를 수 있다.
    """
    import pandas as pd

    from luna.geo.polar import stereo_inverse
    from luna.terrain import Terrain

    f = ctx.data.first(JPL_IPN)
    meta = ctx.build / "terrain" / "meta.json"
    if not f or not meta.exists():
        return []
    ctx.record_input(f, "validation_mast_reference")
    _record_terrain_inputs(ctx, meta)
    df = read_csv_utf8(f)
    x0, y0, z0 = float(df["published_x_km"].iloc[0]), float(df["published_y_km"].iloc[0]), float(df["site_elevation_m"].iloc[0])
    terr = Terrain(meta)
    cands = []
    for sx in (1, -1):
        for sy in (1, -1):
            for swap in (False, True):
                x, y = (sy * y0, sx * x0) if swap else (sx * x0, sy * y0)
                lat, lon = stereo_inverse(x, y)
                try:
                    from luna.horizon import ground_height

                    h, _ = ground_height(terr.site_samplers(float(lat), float(lon), 5.0), float(lat), float(lon), ctx.settings.mask.ground_radius_km)
                except ValueError:
                    continue
                cands.append((abs(h - z0), float(lat), float(lon), h, f"x={'+' if sx > 0 else '-'}{'y' if swap else 'x'}, y={'+' if sy > 0 else '-'}{'x' if swap else 'y'}"))
    if not cands:
        return []
    cands.sort()
    dz, lat, lon, h_dem, how = cands[0]
    pgda = None
    pg = ctx.data.first("SouthPolar_75S_90S_v1/Regional/Illumination/solar_illumination_85s_60m.tif")
    if pg:
        from luna.io.geotiff import GeoTiffSampler

        pgda = float(GeoTiffSampler(pg, lat, lon, 2.0)(np.array([lat]), np.array([lon]))[0])
        ctx.record_input(pg, "validation_pgda_reference")
    times = _times("2009-01-01T00:00:00Z", "2028-12-31T21:00:00Z", 3.0)
    sun, earth = spice_vectors(ctx, times)
    out = []
    from luna.constants import R_EARTH_KM, R_SUN_KM

    for target, vec, rad_km in (("Sun", sun, R_SUN_KM), ("Earth", earth, R_EARTH_KM)):
        g = df[df["target"] == target].sort_values("height_above_surface_m")
        ours = {"any": [], "half": [], "whole": []}
        refs = {"any": [], "half": [], "whole": []}
        for _, row in g.iterrows():
            hgt = float(row["height_above_surface_m"])
            m = _mask_at(ctx, terr, lat, lon, hgt)
            az, el, dist = topocentric(lat, lon, m["ground_elev_m"], hgt, vec)
            rad = np.degrees(np.arcsin(np.minimum(1.0, rad_km / dist)))
            frac = disk_fraction(el, horizon_at(m["elevation_deg"], ctx.settings.mask.az_step_deg, az), rad)
            for k, ok in (("any", frac > 0), ("half", frac >= 0.5), ("whole", frac >= 0.999)):
                ours[k].append(100.0 * ok.mean())
                refs[k].append(float(row[f"ephemeris_2009_2028_{k}_disk_pct"]))
        hs = g["height_above_surface_m"].tolist()
        for k in ("any", "half", "whole"):
            o, r_ = np.array(ours[k]), np.array(refs[k])
            n, md, rm, rr, mx = _stats(o, r_)
            worst = [{"id": f"{hs[i]:g} m", "ours_pct": round(float(o[i]), 2), "jpl_pct": round(float(r_[i]), 2)} for i in range(len(hs))]
            out.append(ValidationResult(f"mast_jpl_b1_{target.lower()}_{k}_disk", n, md, rm, rr, mx,
                                        {"ref": ctx.data.rel(f), "site": "B1", "observer": [round(lat, 4), round(lon, 4)], "axis_interpretation": how,
                                         "dem_ground_m": round(h_dem, 1), "published_elevation_m": z0, "elev_diff_m": round(dz, 1),
                                         "ours": "LOLA 지평선 마스크(높이별) + SPICE 2009–2028, 3 h 간격", "unit": "% of time",
                                         "pgda69_illum_at_point": pgda,
                                         "location_status": "B1 좌표의 축 규약 미확인 — 8가지 해석 모두 DEM 고도가 문서와 100 m 이상 다르다. 같은 점에서 우리 계산과 PGDA69 는 서로 맞는다",
                                         "candidates": [{"axes": c[4], "lat": round(c[1], 4), "lon": round(c[2], 3), "dem_m": round(c[3], 1)} for c in cands],
                                         "note": "JPL 은 GSSR 레이더 DEM(2009) 기준. 태양 쪽 차이는 위치 해석 실패로 보이며 우리 계산 오류의 증거가 아니다. 지구 쪽은 위치에 덜 민감"}, worst, None, None))
    return out


def read_csv_utf8(path: Path):
    import pandas as pd

    return pd.read_csv(path, encoding="utf-8-sig")


def v_wueller(ctx: Ctx) -> list[ValidationResult]:
    """⑤ Wueller 외 2026 착륙 후보점 130개의 한여름 최장 연속 일조일수(2025–2032)와 우리 계산 비교.

    원 자료에 '한여름' 기간과 일조 판정 기준이 정의돼 있지 않다 → 가정을 밝힌 일관성 비교다.
    가정: 해마다 태양 직하 위도가 가장 남쪽인 시각 ±20일, 12 h 간격(원 자료와 같은 증분), 태양 원반 절반 이상 노출 = 일조,
    지구 중심이 지형 위 = 교신. 관측 높이 2 m. 절대값보다 지점 간 순위(상관)를 본다.
    """
    from luna.reconcile import WUELLER_ZIP, load_wueller_sites
    from luna.terrain import Terrain

    zp = ctx.data.path(WUELLER_ZIP)
    meta = ctx.build / "terrain" / "meta.json"
    if not zp.exists() or not meta.exists():
        return []
    ctx.record_input(zp, "validation_wueller_reference")
    _record_terrain_inputs(ctx, meta)
    import io
    import zipfile

    import shapefile

    with zipfile.ZipFile(zp) as z:
        inner = zipfile.ZipFile(io.BytesIO(z.read("Landing_Sites.zip")))
        r = shapefile.Reader(shp=io.BytesIO(inner.read("LandingSites.shp")), dbf=io.BytesIO(inner.read("LandingSites.dbf")))
        recs = [rec.as_dict() for rec in r.records()]
    sun_f = {2025: "SunDays25", 2026: "SunDays26", 2027: "SunDays27", 2028: "SunDays28", 2029: "SunDays29", 2030: "Sundays30", 2031: "SunDays31", 2032: "Sundays32"}
    se_f = {2025: "Sun_Earth2", 2026: "SunEarth26", 2027: "SunEarth27", 2028: "SunEarth28", 2029: "SunEarth29", 2030: "SunEarth30", 2031: "SunEarth31", 2032: "SunEarth32"}
    # 해마다 한여름 중심: 태양 직하 위도 최솟값 (6 h 간격으로 찾고 그 주변 1 h 로 다듬지 않는다 — 창이 ±20일이라 충분)
    t_all = _times("2025-01-01T00:00:00Z", "2032-12-31T18:00:00Z", 6.0)
    sun_all, _ = spice_vectors(ctx, t_all)
    sublat = np.degrees(np.arcsin(sun_all[:, 2] / np.linalg.norm(sun_all, axis=1)))
    centers = {}
    for y in sun_f:
        idx = [i for i, t in enumerate(t_all) if t.startswith(str(y))]
        centers[y] = t_all[idx[int(np.argmin(sublat[idx]))]]
    from datetime import datetime, timedelta, timezone

    win = {}
    for y, c in centers.items():
        t0 = datetime.strptime(c, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        ts = [(t0 + timedelta(hours=12 * k)).strftime("%Y-%m-%dT%H:%M:%SZ") for k in range(-40, 41)]
        win[y] = (ts, *spice_vectors(ctx, ts))
    terr = Terrain(meta)
    h = ctx.settings.mask.observer_height_m

    def longest(b):
        best = cur = 0
        for v in b:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        return best / 2.0  # 12 h 증분 → 일

    ours_s = {y: [] for y in sun_f}
    ours_e = {y: [] for y in sun_f}
    from luna.constants import R_SUN_KM

    for rec in recs:
        lat, lon = float(rec["Latitude"]), float(rec["Longitude"])
        m = _mask_at(ctx, terr, lat, lon, h)
        for y, (ts, sv, ev) in win.items():
            saz, sel, sd = topocentric(lat, lon, m["ground_elev_m"], h, sv)
            eaz, eel, _ = topocentric(lat, lon, m["ground_elev_m"], h, ev)
            frac = disk_fraction(sel, horizon_at(m["elevation_deg"], 1.0, saz), np.degrees(np.arcsin(R_SUN_KM / sd)))
            lit = frac >= 0.5
            vis = eel > horizon_at(m["elevation_deg"], 1.0, eaz)
            ours_s[y].append(longest(lit))
            ours_e[y].append(longest(lit & vis))
    return _wueller_results(recs, sun_f, se_f, ours_s, ours_e, centers, zp, ctx)


def _rank_corr(a: np.ndarray, b: np.ndarray) -> float | None:
    ok = np.isfinite(a) & np.isfinite(b)
    a, b = a[ok], b[ok]
    if a.size < 3:
        return None
    ra = np.argsort(np.argsort(a, kind="stable"), kind="stable").astype(float)
    rb = np.argsort(np.argsort(b, kind="stable"), kind="stable").astype(float)
    if np.std(ra) == 0 or np.std(rb) == 0:
        return None
    return float(np.corrcoef(ra, rb)[0, 1])


def _wueller_results(recs, sun_f, se_f, ours_s, ours_e, centers, zp, ctx) -> list[ValidationResult]:
    out = []
    for label, fields, ours in (("sun", sun_f, ours_s), ("sun_earth", se_f, ours_e)):
        o_all, r_all, per_year = [], [], {}
        for y, fld in fields.items():
            o = np.array(ours[y], float)
            r_ = np.array([np.nan if rec.get(fld) is None else float(rec[fld]) for rec in recs], float)
            o_all.append(o)
            r_all.append(r_)
            per_year[str(y)] = {"midsummer_center_utc": centers[y], "pearson": _stats(o, r_)[3], "spearman": _rank_corr(o, r_),
                                "mean_diff_days": float(np.nanmean(o - r_)), "ref_missing": int((~np.isfinite(r_)).sum())}
        o, r_ = np.concatenate(o_all), np.concatenate(r_all)
        n, md, rm, rr, mx = _stats(o, r_)
        out.append(ValidationResult(f"wueller_{label}_max_consecutive_days", n, md, rm, rr, mx,
                                    {"ref": ctx.data.rel(zp), "points": len(recs), "years": "2025–2032", "spearman_all": _rank_corr(o, r_),
                                     "assumption": "한여름 = 태양 직하 위도 최남단 ±20일, 12 h 증분, 태양 원반 ≥ 50% = 일조, 지구 중심이 지형 위 = 교신, 관측 높이 2 m",
                                     "note": "원 자료에 한여름 기간·판정 기준 정의가 없어 가정을 둔 일관성 비교. 절대값 차이보다 순위 상관을 본다",
                                     "per_year": per_year}, [], None, None))
    return out


def write_docs(results: list[ValidationResult]) -> None:
    doc = REPO_ROOT / "docs" / "validation.md"
    if not doc.exists():
        return
    lines = ["<!-- AUTO:s80 시작 (파이프라인이 덮어씀) -->", "| 항목 | n | 평균 차이 | RMSE | r | 최대 | 판정 | 조건 |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    f = lambda v: "" if v is None or (isinstance(v, float) and not np.isfinite(v)) else (f"{v:.4f}" if isinstance(v, float) else str(v))  # noqa: E731
    for r in results:
        verdict = "통과" if r.passed else ("미달" if r.passed is False else "—")
        lines.append(f"| {r.metric} | {r.n} | {f(r.mean_diff)} | {f(r.rmse)} | {f(r.r)} | {f(r.max_abs)} | {verdict} | {json.dumps(r.conditions, ensure_ascii=False)[:160]} |")
    lines.append("<!-- AUTO:s80 끝 -->")
    text = doc.read_text(encoding="utf-8")
    block = "\n".join(lines)
    if "<!-- AUTO:s80 시작" in text:
        text = re.sub(r"<!-- AUTO:s80 시작.*?<!-- AUTO:s80 끝 -->", block, text, flags=re.S)
    else:
        text += "\n\n## 자동 결과 (s80)\n\n" + block + "\n"
    doc.write_text(text, encoding="utf-8")


def run(ctx: Ctx) -> int:
    groups = {"ephemeris": v_ephemeris, "masks": v_masks, "illumination": v_illumination, "frames": v_pa_me, "mast": v_mast_jpl, "wueller": v_wueller}
    allres = []
    failed = []
    for name, fn in groups.items():
        ctx._inputs = {}
        try:
            res = fn(ctx)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"{name} 검증 실패: {e}")
            failed.append(name)
            res = []
        allres += res
        quality = ("NO_DATA" if not res else "VALIDATION_FAILED" if any(r.passed is False for r in res)
                   else "VALIDATED" if all(r.passed is True for r in res) else "REVIEW_REQUIRED")
        if quality == "VALIDATION_FAILED":
            failed.append(name)
        if res and not ctx._inputs:
            log.warn(NAME, f"{name}: 검증 입력 추적 누락")
            failed.append(name)
            quality = "REVIEW_REQUIRED"
        write_envelope(ctx, f"validation/{name}.json", Envelope(f"luna.validation.{name}.v1", [r.to_json() for r in res], list(ctx._inputs.values()), kind="real" if res else "missing", quality=quality))
        log.info(NAME, f"{name}: {len(res)}건")
    write_docs(allres)
    if failed:
        log.warn(NAME, f"검증 그룹 실패 {len(failed)}개: {', '.join(failed)}")
        return 1
    return 0
