"""s40 grid: 칸별 72방위 지평선 (int16 × 0.01°).

지역 (ctx.regions): south = 75°S 이남 AEQD 5 km (grid/), north = 75°N 이북 AEQD 5 km (grid_north/),
global = 75°S–75°N 위도 띠 15 km (grid_global/). 전역 확장 안 B (2026-11-15).
"""

from __future__ import annotations

import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from luna import log
from luna.contracts import BandGridManifest, Envelope, GridManifest, Provenance
from luna.geo.polar import BandGridSpec, GridSpec
from luna.horizon import compute_mask
from luna.preview import save_gray
from luna.stages.common import Ctx, write_bin, write_envelope
from luna.terrain import Terrain

NAME = "s40"
SCHEMA = "luna.grid.v1"
SCHEMA_BANDS = "luna.grid_bands.v1"

_terr: Terrain | None = None


def _init(meta: str) -> None:
    global _terr
    _terr = Terrain(Path(meta))


def _chunk(args):
    lat, lon, h_obs, step, rng = args
    smp = _terr.grid_samplers(rng)  # type: ignore[union-attr]
    out = np.zeros((len(lat), int(round(360 / step))), dtype=np.int16)
    elev = np.full(len(lat), np.nan)
    ok = np.zeros(len(lat), dtype=bool)
    for i, (la, lo) in enumerate(zip(lat, lon)):
        try:
            r = compute_mask(smp, float(la), float(lo), h_obs, step, rng, growth=0.01)
        except ValueError:
            continue  # 실패 칸: 0° 평지 지평선으로 내보내지 않는다
        e = np.asarray(r["elevation_deg"], dtype=float)
        g = float(r["ground_elev_m"])
        if not (np.isfinite(e).all() and np.isfinite(g)):
            continue  # DEM 결측 → 유효하지 않은 칸
        out[i] = np.clip(np.round(e / 0.01), -32000, 32000).astype(np.int16)
        elev[i] = g
        ok[i] = True
    return out, elev, ok


def run(ctx: Ctx) -> int:
    rc = 0
    for region in ("south", "north", "global"):
        if region in ctx.regions:
            rc = _run_region(ctx, region) or rc
    return rc


def _region_setup(ctx: Ctx, region: str):
    """(단계 이름, DEM 메타, 격자, 출력 폴더, 도장 추가 키)"""
    g = ctx.settings.grid
    if region == "south":
        # 남극은 기존 단계 이름·도장 키를 그대로 쓴다 (기존 조각 캐시·산출물 유지)
        return NAME, ctx.build / "terrain" / "meta.json", GridSpec(g.cell_km, g.lat_limit_deg), "grid", {"g": _south_keys(g), "code": 2}
    if region == "north":
        return f"{NAME}_north", ctx.build / "terrain" / "meta_north.json", GridSpec(g.cell_km, g.north_lat_limit_deg), "grid_north", {"g": g.__dict__, "code": 1}
    return f"{NAME}_global", ctx.build / "terrain" / "meta_global.json", BandGridSpec(g.global_cell_km, g.global_lat_max_deg), "grid_global", {"g": g.__dict__, "code": 1}


_NEW_KEYS = ("north_lat_limit_deg", "global_cell_km", "global_lat_max_deg")


def _south_keys(g) -> dict:
    """전역 확장으로 늘어난 설정 항목을 빼서 남극 도장 키가 예전과 같게 한다 (남극 산출물을 다시 계산하지 않음)."""
    return {k: v for k, v in g.__dict__.items() if k not in _NEW_KEYS}


def _run_region(ctx: Ctx, region: str) -> int:
    name, meta, spec, outdir, extra = _region_setup(ctx, region)
    if not meta.exists():
        log.warn(name, f"s20 먼저 실행 ({meta.name} 없음, --regions {region})")
        return 1
    g = ctx.settings.grid
    key = ctx.stamp_key(name, [meta], extra)
    if ctx.up_to_date(name, key):
        log.info(name, "변경 없음, 건너뜀")
        return 0
    cells = spec.cell_indices()
    lat, lon = spec.latlon(cells)
    n = cells.size
    if n == 0:
        ctx.invalidate(name)
        log.warn(name, "격자 후보가 0개다 → 산출물을 만들지 않음")
        return 1
    size = f"{spec.n}×{spec.n}" if isinstance(spec, GridSpec) else f"띠 {spec.n_rows}개"
    log.info(name, f"격자 {size}, 유효 칸 {n}, 방위 {g.az_step_deg}°, 작업자 {ctx.workers}")

    # 조각 캐시는 입력(DEM 메타)·설정·코드 버전 키별 폴더에 둔다: 관측 높이 등을 바꾸면 이전 조각을 읽지 않는다
    part_dir = ctx.build_path(f"{name}/parts/{key[:16]}")
    part_dir.mkdir(parents=True, exist_ok=True)
    chunk = 256
    jobs = [(lat[i:i + chunk], lon[i:i + chunk], g.observer_height_m, g.az_step_deg, g.max_range_km) for i in range(0, n, chunk)]
    n_az = int(round(360 / g.az_step_deg))
    horizon = np.zeros((n, n_az), dtype=np.int16)
    elev = np.full(n, np.nan)
    valid = np.zeros(n, dtype=bool)
    todo = []
    for j, job in enumerate(jobs):
        f = part_dir / f"{j:05d}.npz"
        sl = slice(j * chunk, j * chunk + len(job[0]))
        if f.exists() and not ctx.force:
            try:
                z = np.load(f)
                same = (z["h"].shape == (len(job[0]), n_az) and "ok" in z and np.allclose(z["lat"], job[0]) and np.allclose(z["lon"], job[1]))
            except Exception:  # noqa: BLE001
                same = False
            if same:
                horizon[sl], elev[sl], valid[sl] = z["h"], z["e"], z["ok"]
                continue
        todo.append(j)
    log.info(name, f"남은 묶음 {len(todo)}/{len(jobs)} (중간 결과는 build/<단계>/parts 에 저장, 끊겨도 이어서 계산)")

    def store(j, res):
        h, e, ok = res
        sl = slice(j * chunk, j * chunk + len(h))
        horizon[sl], elev[sl], valid[sl] = h, e, ok
        np.savez(part_dir / f"{j:05d}.npz", h=h, e=e, ok=ok, lat=jobs[j][0], lon=jobs[j][1])

    if ctx.workers > 1:
        with ProcessPoolExecutor(ctx.workers, initializer=_init, initargs=(str(meta),)) as ex:
            for k, (j, res) in enumerate(zip(todo, ex.map(_chunk, [jobs[j] for j in todo]))):
                store(j, res)
                if k % 10 == 0:
                    log.info(name, f"{k + 1}/{len(todo)}")
    else:
        _init(str(meta))
        for k, j in enumerate(todo):
            store(j, _chunk(jobs[j]))
            if k % 10 == 0:
                log.info(name, f"{k + 1}/{len(todo)}")

    # 지평선을 계산하지 못한 칸(DEM 결측 등)은 격자에서 뺀다. 웹·s50 은 cells.u32 목록만 쓰므로 그대로 전파된다
    bad = int((~valid).sum())
    if bad:
        log.warn(name, f"지평선 계산 실패 칸 {bad}개 제외 (DEM 결측 또는 계산 오류)")
    cells, horizon, elev = cells[valid], horizon[valid], elev[valid]
    n = cells.size
    if n == 0:
        ctx.invalidate(name)
        log.warn(name, "유효한 DEM 격자 칸이 0개다 → 산출물을 만들지 않음")
        return 1
    write_bin(ctx, f"{outdir}/cells.u32", cells, "<u4")
    write_bin(ctx, f"{outdir}/horizon.i16", horizon, "<i2")
    np.save(ctx.build_path(f"{name}/elev_m.npy" if region != "south" else "s40/elev_m.npy"), elev.astype(np.float32))
    hz = {"file": "horizon.i16", "az_step_deg": g.az_step_deg, "n_az": horizon.shape[1], "scale": g.horizon_scale_deg}
    if isinstance(spec, GridSpec):
        proj = "AEQD south pole, MOON_ME, R=1737.4 km, x=ρ·sinλ, y=ρ·cosλ" if spec.pole < 0 else "AEQD north pole, MOON_ME, R=1737.4 km, x=ρ·sinλ, y=−ρ·cosλ"
        man = GridManifest(
            projection=proj, cell_km=spec.cell_km, nx=spec.n, ny=spec.n, x0_km=spec.x0_km, y0_km=spec.y0_km,
            lat_limit_deg=spec.lat_limit_deg, n_cells=int(n), cells="cells.u32", horizon=hz, observer_height_m=g.observer_height_m,
        )
        schema = SCHEMA
    else:
        man = BandGridManifest(
            projection="위도 띠 격자, MOON_ME, R=1737.4 km: 띠 높이 dlat, 띠마다 경도 칸 n_lon (경도 −180° 부터)",
            cell_km=spec.cell_km, lat_max_deg=spec.lat_max_deg, dlat_deg=spec.dlat_deg, n_rows=spec.n_rows,
            n_lon=[int(v) for v in spec.n_lon], n_cells_total=spec.n_cells, n_cells=int(n), cells="cells.u32", horizon=hz,
            observer_height_m=g.observer_height_m,
        )
        schema = SCHEMA_BANDS
    meta_js = json.loads(meta.read_text(encoding="utf-8"))
    if region == "south":
        prov = [Provenance(**p) for p in meta_js["provenance"] if p["role"].startswith(("dem80", "dem240"))]
        dem_note = "80 m(40 km 이내) → 240 m"
    else:
        prov = [Provenance(**p) for p in meta_js["provenance"]]
        dem_note = " → ".join(f"{d['name']}({d['max_km']:.0f} km 이내)" for d in meta_js["grid_dems"][:-1]) + f" → {meta_js['grid_dems'][-1]['name']}"
    write_envelope(ctx, f"{outdir}/manifest.json", Envelope(schema, man, prov, notes=[f"최대 탐색 {g.max_range_km} km, {dem_note}"] + ([f"지평선 계산 실패 칸 {bad}개 제외"] if bad else [])))
    if isinstance(spec, GridSpec):
        img = np.full(spec.n * spec.n, np.nan)
        img[cells] = horizon.max(axis=1) * g.horizon_scale_deg
        save_gray(img.reshape(spec.n, spec.n), ctx.build_path(f"preview/{outdir}_horizon_max.png" if region != "south" else "preview/grid_horizon_max.png"))
    ctx.mark_done(name, key)
    return 0
