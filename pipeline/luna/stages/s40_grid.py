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
    meta = ctx.build / "terrain" / "meta.json"
    if not meta.exists():
        log.warn(NAME, "s20 먼저 실행")
        return 1
    g = ctx.settings.grid
    key = ctx.stamp_key(NAME, [meta], {"g": g.__dict__, "code": 2})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0
    spec = GridSpec(g.cell_km, g.lat_limit_deg)
    cells = spec.cell_indices()
    X, Y = spec.centers()
    xs, ys = X.ravel()[cells], Y.ravel()[cells]
    lat, lon = aeqd_inverse(xs, ys)
    n = cells.size
    if n == 0:
        ctx.invalidate(NAME)
        log.warn(NAME, "격자 후보가 0개다 → 산출물을 만들지 않음")
        return 1
    log.info(NAME, f"격자 {spec.n}×{spec.n}, 유효 칸 {n}, 방위 {g.az_step_deg}°, 작업자 {ctx.workers}")

    # 조각 캐시는 입력(DEM 메타)·설정·코드 버전 키별 폴더에 둔다: 관측 높이 등을 바꾸면 이전 조각을 읽지 않는다
    part_dir = ctx.build_path(f"s40/parts/{key[:16]}")
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
    log.info(NAME, f"남은 묶음 {len(todo)}/{len(jobs)} (중간 결과는 build/s40/parts 에 저장, 끊겨도 이어서 계산)")

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
                    log.info(NAME, f"{k + 1}/{len(todo)}")
    else:
        _init(str(meta))
        for k, j in enumerate(todo):
            store(j, _chunk(jobs[j]))
            if k % 10 == 0:
                log.info(NAME, f"{k + 1}/{len(todo)}")

    # 지평선을 계산하지 못한 칸(DEM 결측 등)은 격자에서 뺀다. 웹·s50 은 cells.u32 목록만 쓰므로 그대로 전파된다
    bad = int((~valid).sum())
    if bad:
        log.warn(NAME, f"지평선 계산 실패 칸 {bad}개 제외 (DEM 결측 또는 계산 오류)")
    cells, horizon, elev = cells[valid], horizon[valid], elev[valid]
    n = cells.size
    if n == 0:
        ctx.invalidate(NAME)
        log.warn(NAME, "유효한 DEM 격자 칸이 0개다 → 산출물을 만들지 않음")
        return 1
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
    write_envelope(ctx, "grid/manifest.json", Envelope(SCHEMA, man, prov, notes=[f"최대 탐색 {g.max_range_km} km, 80 m(40 km 이내) → 240 m"] + ([f"지평선 계산 실패 칸 {bad}개 제외"] if bad else [])))
    img = np.full(spec.n * spec.n, np.nan)
    img[cells] = horizon.max(axis=1) * g.horizon_scale_deg
    save_gray(img.reshape(spec.n, spec.n), ctx.build_path("preview/grid_horizon_max.png"))
    ctx.mark_done(NAME, key)
    return 0
