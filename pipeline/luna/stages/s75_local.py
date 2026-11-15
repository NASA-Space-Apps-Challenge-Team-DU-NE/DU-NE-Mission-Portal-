"""s75 local: 착륙지 주변 국지 음영기복 (LOLA 30 m 남극 타일 → 착륙지 중심 정사각형 그림).

03 기지 배치 지도의 배경이다. 계산에는 쓰지 않는다.
- 틀: 착륙지 중심 방위 등거리(국지 평면). 위 = 북(위도가 커지는 쪽), 오른쪽 = 동. 웹 LocalMap 과 같은 규칙.
- 한 변 2·half_km, size_px 화소. 30 m 타일을 쌍선형으로 표본, 비는 곳은 80 m DEM 으로 메운다.
- 음영기복의 조명 방향은 보기 좋게 고른 값(북서 35°)이며 실제 햇빛이 아니다.
- 고도 그림(<id>_elev.png): 같은 틀을 ELEV_PX 화소로 줄여 고도를 0.1 m 단위 정수(최저 고도 기준)로 R(상위)·G(하위) 바이트에 담는다.
  웹 03 기지 배치의 3D 지형 보기용. 브라우저 캔버스가 16비트 PNG 를 8비트로 줄이므로 두 바이트로 나눴다.
- 30 m 타일 좌표계: VRT SRS 가 남극 극평사(위도 −90, 중앙 경도 0, 구 1737.4 km)인지 확인한 뒤에만 쓴다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from luna import log
from luna.catalogs import load_sites
from luna.constants import R_MOON_KM
from luna.contracts import Envelope, Provenance
from luna.geo.frames import destination
from luna.geo.polar import stereo_forward
from luna.stages.common import Ctx, write_envelope
from luna.stages.s60_textures import hillshade

NAME = "s75"
SCHEMA = "luna.local.v1"
HALF_KM = 10.0  # 웹 기지 지도 최대 한 변 20 km 와 같게
SIZE_PX = 1024  # 약 19.5 m/화소 (원본 30 m 를 쌍선형으로 표본)
LIGHT_AZ, LIGHT_ALT = 315.0, 35.0
ELEV_PX = 512  # 약 39 m/화소 (원본 30 m 와 비슷한 해상도)
ELEV_STEP_M = 0.1


def check_polar_srs(srs: str) -> str:
    """VRT SRS 가 우리가 쓰는 극평사 규칙과 같은지 확인하고 요약을 돌려준다. 다르면 예외."""
    u = srs.replace(" ", "").lower()
    ok = (
        "polar_stereographic" in u
        and re.search(r'"latitude_of_origin",-90', u)
        and re.search(r'"central_meridian",0[,\]]', u)
        and re.search(r'spheroid\["[^"]*",1737400,0', u)
        and 'unit["metre",1' in u
    )
    if not ok:
        raise ValueError(f"30 m 타일 좌표계를 확인하지 못했다: {srs[:160]}")
    return "Polar Stereographic, lat_ts −90, lon0 0, 구 1737.4 km, m (VRT SRS 확인)"


def local_grid(lat0: float, lon0: float, half_km: float, n: int):
    """국지 정사각형 화소 중심의 위경도. 행 0 = 북쪽 끝, 열 0 = 서쪽 끝."""
    c = (np.arange(n) + 0.5) / n * 2 * half_km - half_km
    E, N = np.meshgrid(c, -c)
    bearing = np.degrees(np.arctan2(E, N))
    lat, lon = destination(lat0, lon0, bearing.ravel(), np.hypot(E, N).ravel())
    return np.asarray(lat).reshape(E.shape), np.asarray(lon).reshape(E.shape)


def sample_vrt(vrt, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """VRT 화소 중심 기준 쌍선형 표본 (geotransform 은 왼쪽 위 모서리, m)."""
    x0, dx, _, y0, _, dy = vrt.transform
    xk, yk = stereo_forward(lat, lon)  # km, x=ρ sinλ, y=ρ cosλ
    col = (xk * 1000.0 - x0) / dx - 0.5
    row = (yk * 1000.0 - y0) / dy - 0.5
    r0, r1 = int(np.floor(np.nanmin(row))) - 1, int(np.ceil(np.nanmax(row))) + 2
    c0, c1 = int(np.floor(np.nanmin(col))) - 1, int(np.ceil(np.nanmax(col))) + 2
    r0, c0 = max(0, r0), max(0, c0)
    r1, c1 = min(vrt.height, r1), min(vrt.width, c1)
    out = np.full(lat.shape, np.nan)
    if r1 - r0 < 2 or c1 - c0 < 2:
        return out
    A = vrt.read(r0, r1, c0, c1).astype(np.float64)
    rr, cc = row - r0, col - c0
    i0, j0 = np.floor(rr).astype(int), np.floor(cc).astype(int)
    ok = (i0 >= 0) & (j0 >= 0) & (i0 < A.shape[0] - 1) & (j0 < A.shape[1] - 1)
    i, j, fr, fc = i0[ok], j0[ok], rr[ok] - i0[ok], cc[ok] - j0[ok]
    out[ok] = A[i, j] * (1 - fr) * (1 - fc) + A[i + 1, j] * fr * (1 - fc) + A[i, j + 1] * (1 - fr) * fc + A[i + 1, j + 1] * fr * fc
    return out


def run(ctx: Ctx) -> int:
    from PIL import Image

    from luna.io.geotiff import VrtTiles, vrt_dependencies
    from luna.terrain import Terrain

    vrt_path = ctx.data.first("SouthPolar_75S_90S_v1/Regional/Terrain_30m/*.vrt")
    seed = ctx.data.first("Catalogs/sites.json")
    meta = ctx.build / "terrain" / "meta.json"
    if vrt_path is None or seed is None:
        log.warn(NAME, "30 m VRT 또는 Catalogs/sites.json 이 없다 → 건너뜀")
        return 0
    # s70 이 만든 카탈로그(웹이 실제로 쓰는 착륙지 목록)를 우선 쓴다. 없으면 Drive 원본
    built = ctx.out / "catalog" / "sites.json"
    if built.exists():
        sites = json.loads(built.read_text(encoding="utf-8"))["data"]
    else:
        sites, _ = load_sites(seed)
    south = [s for s in sites if s["lat_deg"] <= ctx.settings.grid.lat_limit_deg and (not ctx.only or s["id"] in ctx.only)]
    inputs = vrt_dependencies(vrt_path) + [seed] + ([built] if built.exists() else [])
    if meta.exists():
        inputs.append(meta)
        dem80_meta = json.loads(meta.read_text(encoding="utf-8")).get("dem80", {})
        inputs += [Path(dem80_meta[k]) for k in ("label", "image") if dem80_meta.get(k)]
    key = ctx.stamp_key(NAME, inputs, {"half": HALF_KM, "n": SIZE_PX, "light": [LIGHT_AZ, LIGHT_ALT], "ids": [s["id"] for s in south], "elev": [ELEV_PX, ELEV_STEP_M], "v": 3})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0

    vrt = VrtTiles(vrt_path)
    crs = check_polar_srs(vrt.srs)
    dem80 = None
    if meta.exists():
        try:
            dem80 = Terrain(meta).dem80
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"80 m DEM 을 열지 못해 메우기 없이 진행: {e}")

    px_km = 2 * HALF_KM / SIZE_PX
    out: dict[str, dict] = {}
    for s in south:
        lat, lon = local_grid(s["lat_deg"], s["lon_deg"], HALF_KM, SIZE_PX)
        z = sample_vrt(vrt, lat, lon)
        dem = "dem30"
        miss = ~np.isfinite(z)
        if miss.any() and dem80 is not None:
            z[miss] = dem80(lat[miss], lon[miss])
            dem = "dem30+dem80"
        if not np.isfinite(z).any():
            log.warn(NAME, f"{s['id']}: 지형 자료 없음 → 건너뜀")
            continue
        zf = np.where(np.isfinite(z), z, np.nanmean(z))
        hs = hillshade(zf, px_km, LIGHT_AZ, LIGHT_ALT)
        g = (40 + 215 * hs).astype(np.uint8)  # 완전 검정은 피한다
        g[~np.isfinite(z)] = 0
        Image.fromarray(g, "L").save(ctx.out_path(f"local/{s['id']}.jpg"), quality=86, optimize=True)
        # 고도 그림: 2×2 평균으로 줄이고, 최저 고도 기준 0.1 m 정수 → R·G 두 바이트 (B 는 0)
        k = max(1, SIZE_PX // ELEV_PX)
        ep = SIZE_PX // k
        ze = zf[: ep * k, : ep * k].reshape(ep, k, ep, k).mean(axis=(1, 3))
        zmin = float(np.min(ze))
        q = np.clip(np.round((ze - zmin) / ELEV_STEP_M), 0, 65535).astype(np.uint32)
        rgb = np.zeros((ep, ep, 3), np.uint8)
        rgb[..., 0] = (q >> 8).astype(np.uint8)
        rgb[..., 1] = (q & 255).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(ctx.out_path(f"local/{s['id']}_elev.png"), optimize=True)
        c = SIZE_PX // 2
        out[s["id"]] = {
            "file": f"{s['id']}.jpg", "lat_deg": s["lat_deg"], "lon_deg": s["lon_deg"],
            "elev_center_m": round(float(np.nanmean(z[c - 1:c + 1, c - 1:c + 1])), 1),
            "elev_min_m": round(float(np.nanmin(z)), 1), "elev_max_m": round(float(np.nanmax(z)), 1),
            "dem": dem, "missing_frac": round(float((~np.isfinite(z)).mean()), 4),
            "elev_file": f"{s['id']}_elev.png", "elev_px": ep, "elev_offset_m": round(zmin, 2), "elev_step_m": ELEV_STEP_M,
        }
        log.info(NAME, f"{s['id']}: 중심 {out[s['id']]['elev_center_m']:.0f} m, 범위 {out[s['id']]['elev_min_m']:.0f}~{out[s['id']]['elev_max_m']:.0f} m ({dem})")

    # --only 로 일부만 다시 만들면 기존 local.json 의 다른 지점을 지우지 않고 합친다
    old_local = ctx.out / "local" / "local.json"
    if ctx.only and old_local.exists():
        try:
            prev = json.loads(old_local.read_text(encoding="utf-8"))["data"]["sites"]
            out = {k: v for k, v in prev.items() if k not in out and (ctx.out / "local" / v.get("file", "")).exists()} | out
        except (ValueError, KeyError, TypeError, AttributeError) as e:
            log.warn(NAME, f"기존 local/local.json 을 읽지 못해 병합하지 않음: {e}")
    prov = [ctx.prov(vrt_path, "dem30", allow_unlisted=True, source_crs=crs, transform="국지 방위 등거리 화소 → 위경도 → 극평사 (luna.geo.polar) → 30 m 화소 쌍선형", lon_convention="-180..180")]
    if dem80 is not None:
        prov += [Provenance(**p) for p in json.loads(meta.read_text(encoding="utf-8"))["provenance"] if p["role"] == "dem80"]
    prov.append(ctx.prov(seed, "site_seed"))
    for record in out.values():
        ctx.track_output(ctx.out / "local" / record["file"])
        if record.get("elev_file"):
            ctx.track_output(ctx.out / "local" / record["elev_file"])
    write_envelope(ctx, "local/local.json", Envelope(SCHEMA, {
        "half_km": HALF_KM, "size_px": SIZE_PX, "m_per_px": round(px_km * 1000, 2),
        "frame": "착륙지 중심 방위 등거리, 위 = 북(위도 증가), 오른쪽 = 동",
        "light": {"az_deg": LIGHT_AZ, "alt_deg": LIGHT_ALT, "note": "보기 위한 조명 방향. 실제 햇빛 아님"},
        "radius_km": R_MOON_KM, "sites": out,
    }, prov, notes=["03 기지 배치 지도 배경용 그림. 계산에는 쓰지 않는다", "원본 LOLA 30 m 를 쌍선형 표본 (약 19.5 m/화소)", "고도 그림은 2×2 평균 (약 39 m/화소), 0.1 m 단위 R·G 바이트, 3D 보기용"]))
    ctx.mark_done(NAME, key)
    log.info(NAME, f"착륙지 {len(out)}곳 국지 음영기복 저장")
    return 0
