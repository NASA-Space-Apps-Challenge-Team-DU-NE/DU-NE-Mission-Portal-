"""s80 validation: ① 천체력 vs Horizons·SPICE 기준 표 ② 지평선 vs Drive 13곳 ③ 장기 일조율 vs PGDA69·WAC ④ 마스트 높이 ⑤ PA→ME.

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
    js = json.loads(rel_json.read_text(encoding="utf-8"))["data"]
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


def v_ephemeris(ctx: Ctx) -> list[ValidationResult]:
    """Reference_Tables/{horizons,spice}_<site>_<date>.csv (utc, sun_az_deg, sun_el_deg, earth_az_deg, earth_el_deg)."""
    res = []
    seed = ctx.data.first("Catalogs/sites.json")
    sites = {s["id"]: s for s in load_sites(seed)[0]} if seed else {}
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
    return res


def v_masks(ctx: Ctx) -> list[ValidationResult]:
    # 마스크 JSON 마다 실린 Drive 대조값을 읽는다 (s30 을 --only 로 일부만 돌려도 나머지 착륙지 대조가 남도록)
    out = []
    moved: set[str] = set()
    seed = ctx.data.first("Catalogs/sites.json")
    if seed is not None:
        for x in json.loads(seed.read_text(encoding="utf-8")):
            n = str(x.get("note") or "")
            if "2026-11-15" in n and ("이동" in n or "차이" in n):
                moved.add(str(x.get("id")))
    for f in sorted((ctx.out / "masks").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))["data"]
        cmp = d.get("compare_drive")
        if not cmp:
            continue
        drive = ctx.data.first(f"Horizon_Masks/{d['site_id']}*.json")
        cond = {"drive_file": ctx.data.rel(drive) if drive else None, "drive_quality": "REVIEW_REQUIRED"}
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
    for name, label, cond in (("illum_avg", "PGDA69 장기 평균", {}), ("wac_ill_pct", "WAC 실측 (88–90°S)", {"lat_max": -88.0})):
        f = ctx.out / "grid" / "layers" / f"{name}.f32"
        if not f.exists():
            continue
        ref = np.fromfile(f, dtype="<f4").astype(float)
        sel = np.ones(cells.size, bool) if not cond else lat <= cond["lat_max"]
        n, md, rm, r, mx = _stats(ours[sel], ref[sel])
        diff = np.where(sel, np.abs(ours - ref), np.nan)
        worst = [{"id": f"cell_{int(i)}", "diff": float(diff[i])} for i in np.argsort(-np.nan_to_num(diff, nan=-1))[:10]]
        out.append(ValidationResult(f"illum_vs_{name}", n, md, rm, r, mx,
                                    {"ref": label, "ours": f"격자 지평선(5°) + Horizons 표 {span_days:.0f}일, {ctx.settings.eph.longterm_step_h:.0f} h 간격",
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
    from luna.geo.frames import pa_to_me_matrix

    try:
        M, desc = pa_to_me_matrix(tf)
    except Exception as e:  # noqa: BLE001
        log.warn(NAME, f"PA→ME 각도 읽기 실패: {e}")
        return []
    ang = float(np.degrees(np.arccos(np.clip((np.trace(M) - 1) / 2, -1, 1))))
    cond = {"kernel": ctx.data.rel(tf), "matrix": desc, "rotation_deg": ang, "surface_shift_m": ang * np.pi / 180 * 1737400}
    try:
        import spiceypy as sp

        sp.furnsh(str(tf))
        for k in ("moon_pa_de440_200625.bpc", "naif0012.tls", "pck00011.tpc"):
            p = ctx.data.first(f"Raw_Data/SPICE_Kernels/{k}")
            if p:
                sp.furnsh(str(p))
        R = np.array(sp.pxform("MOON_PA", "MOON_ME", 0.0))
        cond["max_abs_vs_spiceypy"] = float(np.abs(R - M).max())
        cond["direction_ok"] = bool(np.abs(R - M).max() < 1e-9)
    except Exception as e:  # noqa: BLE001
        cond["spiceypy"] = f"대조 못 함: {e}"
    return [ValidationResult("frame_pa_to_me", 1, float("nan"), float("nan"), None, ang, cond, [], cond.get("direction_ok"), None)]


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
    groups = {"ephemeris": v_ephemeris, "masks": v_masks, "illumination": v_illumination, "frames": v_pa_me}
    allres = []
    for name, fn in groups.items():
        try:
            res = fn(ctx)
        except Exception as e:  # noqa: BLE001
            log.warn(NAME, f"{name} 검증 실패: {e}")
            res = []
        allres += res
        write_envelope(ctx, f"validation/{name}.json", Envelope(f"luna.validation.{name}.v1", [r.to_json() for r in res], [], kind="real" if res else "missing", quality="VALIDATED" if res else "NO_DATA"))
        log.info(NAME, f"{name}: {len(res)}건")
    write_docs(allres)
    return 0
