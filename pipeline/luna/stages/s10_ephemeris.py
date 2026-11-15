"""s10 ephemeris: Horizons 표(MOON_ME 직하점·거리)를 받아 web/public/data/ephemeris 에 쓴다."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from luna import log
from luna.catalogs import load_missions
from luna.contracts import Envelope
from luna.geo.frames import latlon_to_unit, norm_lon
from luna.io.horizons import build_params, fetch, horizons_time_to_iso, parse_result
from luna.provenance import external
from luna.stages.common import Ctx, write_bin, write_envelope

NAME = "s10"
SCHEMA = "luna.ephemeris.v1"


def _dt(s: str) -> datetime:
    return datetime.strptime(s.replace("Z", ""), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def _fmt(d: datetime) -> str:
    return d.strftime("%Y-%m-%d %H:%M")


def fetch_range(ctx: Ctx, start: datetime, stop: datetime, step_h: float):
    """한 달 단위로 나눠 받는다 (응답 길이 제한 대비)."""
    chunks = []
    cur = start
    frame_notes, lon_notes = set(), set()
    while cur < stop:
        nxt = min(cur + timedelta(days=31), stop)
        txt = fetch(build_params(_fmt(cur), _fmt(nxt), f"{int(step_h * 60)} m"), ctx.settings.horizons_cache)
        tb = parse_result(txt)
        frame_notes.add(tb.frame_note)
        lon_notes.add(tb.lon_note)
        chunks.append(tb)
        cur = nxt
    times, rows = [], []
    for tb in chunks:
        for i, t in enumerate(tb.times_utc):
            iso = horizons_time_to_iso(t)
            if times and iso <= times[-1]:
                continue
            times.append(iso)
            rows.append([norm_lon(tb.sun_lon[i]), tb.sun_lat[i], tb.sun_dist_km[i], norm_lon(tb.earth_lon[i]), tb.earth_lat[i], tb.earth_dist_km[i]])
    return times, np.array(rows, dtype=np.float64), " | ".join(sorted(x for x in frame_notes if x)), " | ".join(sorted(x for x in lon_notes if x))


def check_frame(frame_note: str) -> None:
    """응답 머리말에 평균 지구-극(ME) 표기가 있는지 확인 (CLAUDE.md 4.6)."""
    if not frame_note:
        log.warn(NAME, "Horizons 머리말에서 달 고정 프레임 표기를 찾지 못했다 → docs/coordinates.md 의 확인 항목. s80 이 SPICE 기준 표로 대조한다")
        return
    up = frame_note.upper()
    if "MOON_PA" in up or ("PRINCIPAL" in up and "MEAN" not in up):
        raise RuntimeError(f"Horizons 직하점이 PA 프레임으로 보인다. ME 로 변환 후 써야 한다: {frame_note}")
    if "MOON_ME" not in up and "MEAN" not in up:
        log.warn(NAME, f"Horizons 달 고정 프레임이 MOON_ME 가 아니다: {frame_note}")


def write_table(ctx: Ctx, rel: str, times: list[str], rows: np.ndarray, step_h: float, notes: list[str], frame_note: str) -> None:
    arr = rows.reshape(-1, 2, 3).astype(np.float32)
    write_bin(ctx, rel + ".bin", arr, "<f4")
    env = Envelope(
        SCHEMA,
        {
            "frame": "MOON_ME", "start_utc": times[0], "step_h": step_h, "count": len(times),
            "bodies": ["sun", "earth"], "layout": "float32[count][2][3] (sub_lon_deg, sub_lat_deg, dist_km)",
            "bin": Path(rel).name + ".bin", "source": "jpl_horizons",
        },
        [external("jpl_horizons", "ephemeris", source_crs=frame_note or "Horizons 달 고정 프레임 (머리말 확인 필요)")],
        kind="real",
        notes=notes,
    )
    write_envelope(ctx, rel + ".json", env)


def compare_drive(ctx: Ctx, times: list[str], rows: np.ndarray) -> dict | None:
    """Drive Web_Derived/ephemeris/range_*.json (이전 앱 형식) 과 직하점 각거리 비교."""
    f = ctx.data.first("Web_Derived/ephemeris/range_*.json")
    if f is None:
        return None
    old = json.loads(f.read_text(encoding="utf-8"))
    old_rows = old.get("rows") or old.get("data", {}).get("rows")
    if not old_rows:
        log.warn(NAME, f"Drive 천체력 형식을 모름: {f.name}")
        return None
    t0 = _dt(times[0]).timestamp()
    step = (_dt(times[1]).timestamp() - t0) if len(times) > 1 else 3600
    diffs_s, diffs_e = [], []
    for r in old_rows:
        k = (float(r[0]) - t0) / step
        if abs(k - round(k)) > 1e-6 or not (0 <= round(k) < len(times)):
            continue
        i = int(round(k))
        e_old = latlon_to_unit(r[2], r[1])
        s_old = latlon_to_unit(r[5], r[4])
        e_new = latlon_to_unit(rows[i, 4], rows[i, 3])
        s_new = latlon_to_unit(rows[i, 1], rows[i, 0])
        diffs_e.append(np.degrees(np.arccos(np.clip(e_old @ e_new, -1, 1))))
        diffs_s.append(np.degrees(np.arccos(np.clip(s_old @ s_new, -1, 1))))
    if not diffs_e:
        return None
    res = {"file": ctx.data.rel(f), "n": len(diffs_e), "earth_max_deg": float(np.max(diffs_e)), "sun_max_deg": float(np.max(diffs_s))}
    with ctx.build_path("s10/diff_vs_drive.csv").open("w", newline="") as fh:
        csv.writer(fh).writerows([["n", "earth_max_deg", "sun_max_deg"], [res["n"], res["earth_max_deg"], res["sun_max_deg"]]])
    log.info(NAME, f"Drive 이전 표와 직하점 차이: 지구 최대 {res['earth_max_deg']:.4f}°, 태양 최대 {res['sun_max_deg']:.4f}°")
    return res


SPICE_DIR = "Raw_Data/SPICE_Kernels"


def write_table_spice(ctx: Ctx, rel: str, times: list[str], rows: np.ndarray, step_h: float, notes: list[str], prov: list) -> None:
    arr = rows.reshape(-1, 2, 3).astype(np.float32)
    write_bin(ctx, rel + ".bin", arr, "<f4")
    env = Envelope(
        SCHEMA,
        {"frame": "MOON_ME", "start_utc": times[0], "step_h": step_h, "count": len(times), "bodies": ["sun", "earth"],
         "layout": "float32[count][2][3] (sub_lon_deg, sub_lat_deg, dist_km)", "bin": Path(rel).name + ".bin", "source": "spice"},
        prov, kind="real", notes=notes,
    )
    write_envelope(ctx, rel + ".json", env)


def _read_table(js: Path) -> tuple[list[str], np.ndarray] | None:
    if not js.exists():
        return None
    meta = json.loads(js.read_text(encoding="utf-8"))["data"]
    a = np.fromfile(js.with_suffix(".bin"), dtype="<f4").reshape(-1, 6).astype(np.float64)
    t0 = _dt(meta["start_utc"])
    times = [(t0 + timedelta(hours=meta["step_h"] * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(meta["count"])]
    return times, a[: meta["count"]]


def _diff_stats(t_new: list[str], r_new: np.ndarray, t_old: list[str], r_old: np.ndarray) -> dict | None:
    from luna.io.spice_eph import angular_diff_deg

    idx = {t: i for i, t in enumerate(t_new)}
    pairs = [(idx[t], j) for j, t in enumerate(t_old) if t in idx]
    if not pairs:
        return None
    a = np.array([p[0] for p in pairs])
    b = np.array([p[1] for p in pairs])
    ds = angular_diff_deg(r_new[a, 0], r_new[a, 1], r_old[b, 0], r_old[b, 1])
    de = angular_diff_deg(r_new[a, 3], r_new[a, 4], r_old[b, 3], r_old[b, 4])
    return {"n": int(len(pairs)), "sun_subpoint_max_deg": float(ds.max()), "sun_subpoint_rms_deg": float(np.sqrt((ds**2).mean())),
            "earth_subpoint_max_deg": float(de.max()), "earth_subpoint_rms_deg": float(np.sqrt((de**2).mean())),
            "earth_dist_max_km": float(np.abs(r_new[a, 5] - r_old[b, 5]).max())}


def _interp_error(times: list[str], rows: np.ndarray, factor: int) -> dict:
    """간격을 factor 배로 넓혔을 때(선형 보간, 웹과 같은 방식) 빠진 시각의 직하점 오차."""
    from luna.io.spice_eph import angular_diff_deg
    from luna.geo.frames import latlon_to_unit, unit_to_latlon

    n = (len(times) - 1) // factor * factor + 1
    out = {}
    for b, name in ((0, "sun"), (3, "earth")):
        u = latlon_to_unit(rows[:n, b + 1], rows[:n, b])
        coarse = u[::factor]
        errs = []
        for k in range(1, factor):
            w = k / factor
            v = coarse[:-1] * (1 - w) + coarse[1:] * w
            v /= np.linalg.norm(v, axis=1, keepdims=True)
            lat, lon = unit_to_latlon(v)
            ref = rows[k:n:factor][: len(v)]
            errs.append(angular_diff_deg(lon, lat, ref[:, b], ref[:, b + 1]))
        e = np.concatenate(errs)
        out[name] = {"max_deg": float(e.max()), "rms_deg": float(np.sqrt((e**2).mean()))}
    return out


def run_spice(ctx: Ctx) -> int:
    """작업 4: SPICE 로 범위 표와 미션별 표. Horizons 표는 대조용으로 남긴다 (build/ 에 이전 표 사본)."""
    from luna.io.spice_eph import ABCORR, KERNELS, SpiceEphemeris, hourly_times

    cfg = ctx.settings.eph
    kdir = ctx.data.path(SPICE_DIR)
    eph = SpiceEphemeris(kdir)
    cov = eph.coverage()
    lo, hi = eph.common_window_et()
    report: dict = {"kernel_coverage_utc": cov, "common_window_utc": [eph.sp.et2utc(lo, "ISOC", 0), eph.sp.et2utc(hi, "ISOC", 0)],
                    "abcorr": ABCORR, "frame": "MOON_ME (moon_de440_250416.tf)"}
    prov = [ctx.prov(kdir / k, f"spice_{k}", allow_unlisted=True, source_crs="MOON_ME (.tf 정의, PA bpc + 고정 회전)") for k in KERNELS]
    note = [f"SPICE spkpos(target, et, MOON_ME, {ABCORR}, MOON). 커널 공통 기간 {report['common_window_utc'][0]} ~ {report['common_window_utc'][1]}"]

    old = _read_table(ctx.out / "ephemeris" / "range.json")
    old_src = json.loads((ctx.out / "ephemeris" / "range.json").read_text(encoding="utf-8"))["data"].get("source") if old else None
    if old and old_src == "jpl_horizons":
        # 대조용으로 이전 Horizons 표를 build/ 에 보관 (웹 산출물에서는 SPICE 표로 바꾼다)
        import shutil

        shutil.copy2(ctx.out / "ephemeris" / "range.json", ctx.build_path("s10/range_horizons.json"))
        shutil.copy2(ctx.out / "ephemeris" / "range.bin", ctx.build_path("s10/range_horizons.bin"))
    hz = _read_table(ctx.build / "s10" / "range_horizons.json")

    times = hourly_times(cfg.range_start_utc, cfg.range_stop_utc, cfg.step_h)
    rows = eph.rows(times)
    if hz:
        report["vs_horizons_range"] = _diff_stats(times, rows, *hz)
    report["interp_error_if_step_widened"] = {f"{f}h": _interp_error(times, rows, f) for f in (2, 3, 6)}
    write_table_spice(ctx, "ephemeris/range", times, rows, cfg.step_h, note + [f"기간 {times[0]} ~ {times[-1]}, {cfg.step_h} h 간격 (사용자 결정 2026-11-15)"], prov)
    log.info(NAME, f"SPICE 범위 표 {len(times)}행 ({times[0]} ~ {times[-1]})")

    seed = ctx.data.first("Catalogs/missions.json")
    coords = ctx.data.first("Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv")
    missions, _ = load_missions(seed, coords)
    mrep = {}
    for m in missions:
        t = _dt(m["landing_utc"])
        a = (t - timedelta(days=1)).replace(minute=0, second=0)
        b = t + timedelta(days=cfg.mission_pad_days)
        mt = hourly_times(a.strftime("%Y-%m-%dT%H:%M:%SZ"), b.strftime("%Y-%m-%dT%H:%M:%SZ"), cfg.step_h)
        mr = eph.rows(mt)
        pjs = ctx.out / "ephemeris" / "missions" / f"{m['id']}.json"
        if pjs.exists() and json.loads(pjs.read_text(encoding="utf-8"))["data"].get("source") == "jpl_horizons":
            import shutil

            shutil.copy2(pjs, ctx.build_path(f"s10/missions_horizons/{m['id']}.json"))
            shutil.copy2(pjs.with_suffix(".bin"), ctx.build_path(f"s10/missions_horizons/{m['id']}.bin"))
        prev = _read_table(ctx.build / "s10" / "missions_horizons" / f"{m['id']}.json")
        if prev:
            # Horizons 표의 시각 그대로 SPICE 를 계산해 비교 (두 표의 시각 격자가 다르다)
            mrep[m["id"]] = _diff_stats(prev[0], eph.rows(prev[0]), *prev)
        write_table_spice(ctx, f"ephemeris/missions/{m['id']}", mt, mr, cfg.step_h, note + [f"미션 {m['name']} 착륙 {m['landing_utc']}"], prov)
    if mrep:
        report["vs_horizons_missions"] = mrep
    write_envelope(ctx, "validation/ephemeris_spice.json", Envelope("luna.validation.ephemeris_spice.v1", report, prov, quality="REVIEW_REQUIRED",
                   notes=["차이를 기록할 뿐 합격·불합격을 판정하지 않는다 (허용 오차는 팀이 정함)"]))
    log.info(NAME, f"SPICE 미션 표 {len(missions)}개")
    return 0


def run(ctx: Ctx) -> int:
    cfg = ctx.settings.eph
    if cfg.source == "spice":
        return run_spice(ctx)
    key = ctx.stamp_key(NAME, [], {"cfg": cfg.__dict__})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0
    start, stop = _dt(cfg.range_start_utc), _dt(cfg.range_stop_utc)
    times, rows, frame_note, lon_note = fetch_range(ctx, start, stop, cfg.step_h)
    check_frame(frame_note)
    notes = [f"Horizons 경도 표기: {lon_note or '머리말에서 못 찾음'}"]
    cmp = compare_drive(ctx, times, rows)
    if cmp:
        notes.append(f"Drive 이전 표 대비 직하점 최대 차이 지구 {cmp['earth_max_deg']:.4f}° 태양 {cmp['sun_max_deg']:.4f}°")
    write_table(ctx, "ephemeris/range", times, rows, cfg.step_h, notes, frame_note)
    log.info(NAME, f"범위 표 {len(times)}행 저장")

    # 미션별 표 (착륙 −1일 … +pad 일)
    seed = ctx.data.first("Catalogs/missions.json")
    coords = ctx.data.first("Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv")
    missions, mnotes = load_missions(seed, coords)
    for n in mnotes:
        log.info(NAME, n)
    for m in missions:
        t = _dt(m["landing_utc"])
        try:
            mt, mr, fn, _ = fetch_range(ctx, t - timedelta(days=1), t + timedelta(days=cfg.mission_pad_days), cfg.step_h)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"미션 {m['id']} 천체력 실패: {e}")
            continue
        write_table(ctx, f"ephemeris/missions/{m['id']}", mt, mr, cfg.step_h, [f"미션 {m['name']} 착륙 {m['landing_utc']}"], fn)
    log.info(NAME, f"미션 표 {len(missions)}개")
    ctx.mark_done(NAME, key)
    return 0
