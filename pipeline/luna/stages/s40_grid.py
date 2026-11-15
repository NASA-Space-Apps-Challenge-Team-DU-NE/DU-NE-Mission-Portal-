"""s40 grid: 75°S 이남 AEQD 5 km 격자 + 칸별 72방위 지평선 (int16 × 0.01°)."""

from __future__ import annotations

import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from luna import log
from luna.contracts import Envelope, GridManifest, Provenance
from luna.geo.polar import GridSpec, aeqd_inverse
from luna.horizon import compute_mask
from luna.preview import save_gray
from luna.stages.common import Ctx, write_bin, write_envelope
from luna.terrain import Terrain

NAME = "s40"
SCHEMA = "luna.grid.v1"

_terr: Terrain | None = None


def _init(meta: str) -> None:
    global _terr
    _terr = Terrain(Path(meta))


def _chunk(args):
    lat, lon, h_obs, step, rng = args
    smp = _terr.grid_samplers(rng)  # type: ignore[union-attr]
    out = np.zeros((len(lat), int(round(360 / step))), dtype=np.int16)
    elev = np.full(len(lat), np.nan)
    for i, (la, lo) in enumerate(zip(lat, lon)):
        try:
            r = compute_mask(smp, float(la), float(lo), h_obs, step, rng, growth=0.01)
            out[i] = np.clip(np.round(r["elevation_deg"] / 0.01), -32000, 32000).astype(np.int16)
            elev[i] = r["ground_elev_m"]
        except ValueError:
            out[i] = 0
    return out, elev


def run(ctx: Ctx) -> int:
    meta = ctx.build / "terrain" / "meta.json"
    if not meta.exists():
        log.warn(NAME, "s20 먼저 실행")
        return 1
    g = ctx.settings.grid
    key = ctx.stamp_key(NAME, [meta], {"g": g.__dict__})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0
    spec = GridSpec(g.cell_km, g.lat_limit_deg)
    cells = spec.cell_indices()
    X, Y = spec.centers()
    xs, ys = X.ravel()[cells], Y.ravel()[cells]
    lat, lon = aeqd_inverse(xs, ys)
    n = cells.size
    log.info(NAME, f"격자 {spec.n}×{spec.n}, 유효 칸 {n}, 방위 {g.az_step_deg}°, 작업자 {ctx.workers}")

    part_dir = ctx.build_path("s40/parts")
    part_dir.mkdir(parents=True, exist_ok=True)
    chunk = 256
    jobs = [(lat[i:i + chunk], lon[i:i + chunk], g.observer_height_m, g.az_step_deg, g.max_range_km) for i in range(0, n, chunk)]
    horizon = np.zeros((n, int(round(360 / g.az_step_deg))), dtype=np.int16)
    elev = np.full(n, np.nan)
    todo = []
    for j, job in enumerate(jobs):
        f = part_dir / f"{j:05d}.npz"
        if f.exists() and not ctx.force:
            z = np.load(f)
            horizon[j * chunk:j * chunk + len(job[0])] = z["h"]
            elev[j * chunk:j * chunk + len(job[0])] = z["e"]
        else:
            todo.append(j)
    log.info(NAME, f"남은 묶음 {len(todo)}/{len(jobs)} (중간 결과는 build/s40/parts 에 저장, 끊겨도 이어서 계산)")

    def store(j, res):
        h, e = res
        horizon[j * chunk:j * chunk + len(h)] = h
        elev[j * chunk:j * chunk + len(h)] = e
        np.savez(part_dir / f"{j:05d}.npz", h=h, e=e)

    if ctx.workers > 1:
        with ProcessPoolExecutor(ctx.workers, initializer=_init, initargs=(str(meta),)) as ex:
            for k, (j, res) in enumerate(zip(todo, ex.map(_chunk, [jobs[j] for j in todo]))):
                store(j, res)
                if k % 10 == 0:
                    log.info(NAME, f"{k + 1}/{len(todo)}")
    else:
        _init(str(meta))
        for k, j in enumerate(todo):
            store(j, _chunk(jobs[j]))
            if k % 10 == 0:
                log.info(NAME, f"{k + 1}/{len(todo)}")

    write_bin(ctx, "grid/cells.u32", cells, "<u4")
    write_bin(ctx, "grid/horizon.i16", horizon, "<i2")
    np.save(ctx.build_path("s40/elev_m.npy"), elev.astype(np.float32))
    man = GridManifest(
        projection="AEQD south pole, MOON_ME, R=1737.4 km, x=ρ·sinλ, y=ρ·cosλ",
        cell_km=g.cell_km, nx=spec.n, ny=spec.n, x0_km=spec.x0_km, y0_km=spec.y0_km,
        lat_limit_deg=g.lat_limit_deg, n_cells=int(n), cells="cells.u32",
        horizon={"file": "horizon.i16", "az_step_deg": g.az_step_deg, "n_az": horizon.shape[1], "scale": g.horizon_scale_deg},
        observer_height_m=g.observer_height_m,
    )
    prov = [Provenance(**p) for p in json.loads(meta.read_text(encoding="utf-8"))["provenance"] if p["role"].startswith(("dem80", "dem240"))]
    write_envelope(ctx, "grid/manifest.json", Envelope(SCHEMA, man, prov, notes=[f"최대 탐색 {g.max_range_km} km, 80 m(40 km 이내) → 240 m"]))
    img = np.full(spec.n * spec.n, np.nan)
    img[cells] = horizon.max(axis=1) * g.horizon_scale_deg
    save_gray(img.reshape(spec.n, spec.n), ctx.build_path("preview/grid_horizon_max.png"))
    ctx.mark_done(NAME, key)
    return 0
