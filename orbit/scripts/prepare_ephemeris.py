"""Create bounded, browser-only Mode B inputs from existing NASA/SPICE kernels.

Development utility only: no Python or SPICE service is needed by the website.
Original kernels are read-only. Two small additional inputs are cached beneath
data/ephemeris; the 39 MB reference SPK stays in ignored source-cache.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import urllib.request

import numpy as np
from scipy.integrate import solve_ivp
import spiceypy as spice

from nasa_data import PROJECT, SpiceFrames
from nrho_reference import export_reference, validate_reference

NAIF = "https://naif.jpl.nasa.gov/pub/naif/"
DSG = NAIF + "misc/MORE_PROJECTS/DSG/"
EXTRA = {
    "gm_de440.tpc": NAIF + "generic_kernels/pck/gm_de440.tpc",
    "nrho.lbl": DSG + "nrho.lbl",
    "source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp": DSG + "receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp",
}
KERNEL_URLS = {
    "naif0012.tls": NAIF + "generic_kernels/lsk/naif0012.tls",
    "pck00011.tpc": NAIF + "generic_kernels/pck/pck00011.tpc",
    "de440s.bsp": NAIF + "generic_kernels/spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc": NAIF + "generic_kernels/pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": NAIF + "generic_kernels/fk/satellites/moon_de440_250416.tf",
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               indent=2 if pretty else None,
                               separators=None if pretty else (",", ":")), encoding="utf-8")


def utc_ms(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000


def hermite(a, da, b, db, u, h):
    value = (2*u**3-3*u*u+1)*a + (u**3-2*u*u+u)*h*da + (-2*u**3+3*u*u)*b + (u**3-u*u)*h*db
    derivative = (6*u*u-6*u)/h*a + (3*u*u-4*u+1)*da + (-6*u*u+6*u)/h*b + (3*u*u-2*u)*db
    return value, derivative


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2026-11-01T00:00:00Z")
    parser.add_argument("--end", default="2027-02-01T00:00:00Z", help="Exclusive end of supported landing UTC")
    parser.add_argument("--padding-days", type=int, default=16, help="Pre-landing support for up to 14 transfer days plus LLO wait")
    parser.add_argument("--step", type=float, default=600)
    parser.add_argument("--seed", default="2026-11-12T00:00:00Z")
    parser.add_argument("--download-missing", action="store_true")
    args = parser.parse_args()
    if args.step <= 0:
        raise ValueError("A positive sampling step is required")
    cache = PROJECT / "data/ephemeris"
    for relative, url in EXTRA.items():
        path = cache / relative
        if not path.exists():
            if not args.download_missing:
                raise FileNotFoundError(f"Missing {path.name}; pass --download-missing to acquire from official NAIF URL")
            path.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(url, path)
    frames = SpiceFrames()
    # CSPICE's Windows C path handling does not accept this checkout's Korean
    # absolute path; ASCII relative paths preserve the same read-only files.
    os.chdir(PROJECT)
    spice.furnsh("data/ephemeris/gm_de440.tpc")
    spice.furnsh("data/ephemeris/source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp")
    gm = {body.lower(): float(spice.bodvrd(body, "GM", 1)[1][0]) * 1e9 for body in ["MOON", "EARTH", "SUN"]}
    earth_radius = float(spice.bodvrd("EARTH", "RADII", 3)[1][0]) * 1000
    landing_start = frames.utc_to_et(args.start)
    support_start = (datetime.fromisoformat(args.start.replace('Z','+00:00'))-timedelta(days=args.padding_days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    epoch, end, seed_et = map(frames.utc_to_et, [support_start, args.end, args.seed])
    landing_last = (datetime.fromisoformat(args.end.replace('Z','+00:00'))-timedelta(milliseconds=1)).isoformat(timespec='milliseconds').replace('+00:00','Z')
    if args.padding_days < 16 or landing_start >= end:
        raise ValueError('Need at least 16 padding days and an ordered landing interval')
    duration = end - epoch
    if duration <= args.step or not epoch <= seed_et <= end:
        raise ValueError("Need an ordered support interval containing the reference seed")
    offsets = np.arange(0, duration + 1e-8, args.step)
    # Avoid a millisecond-sized final interval when UTC and TDB spans differ.
    if duration - offsets[-1] < 1:
        offsets[-1] = duration
    elif offsets[-1] < duration:
        offsets = np.append(offsets, duration)

    sources = [{"file": name, "url": KERNEL_URLS[name], "sha256": sha(frames.kernel_dir / name),
                "bytes": (frames.kernel_dir / name).stat().st_size, "original_reused": True} for name in frames.kernels]
    sources += [{"file": Path(name).name, "url": url, "sha256": sha(cache / name),
                 "bytes": (cache / name).stat().st_size, "browser_included": False} for name, url in EXTRA.items()]

    def state(body, et):
        return np.asarray(spice.spkezr(body, et, "J2000", "NONE", "MOON")[0]) * 1000

    samples, times = [], []
    for offset in offsets:
        et = epoch + offset
        transform = frames.sxform(et)
        samples.append({"t_s": float(offset), "earth": state("EARTH", et).tolist(), "sun": state("SUN", et).tolist(),
                        "rotation": transform[:3, :3].ravel().tolist(), "derivative": transform[3:, :3].ravel().tolist()})
        times.append({"utc_ms": utc_ms(frames.et_to_utc(et)), "t_s": float(offset)})

    seed_state = state("-60000", seed_et)
    seed_t = seed_et - epoch
    reference_coverage = [0, duration]
    reference = export_reference(cache / 'source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp', epoch, end,
                                 EXTRA['source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp'])
    reference_validation = validate_reference(reference, epoch, frames)
    print(f"NRHO source: {reference_validation['segments']} segments / {reference_validation['states']} states; preserved {len(reference['gaps_s'])} gaps", flush=True)
    value = {
        "schema": "lunar.ephemeris.v2", "epoch_utc": support_start, "epoch_et": epoch,
        "coverage_utc": [support_start, args.end],
        "landing_coverage_utc": [args.start, landing_last], "landing_coverage_s": [landing_start-epoch, frames.utc_to_et(landing_last)-epoch],
        "nrho_reference": reference, "coverage_s": [0, duration], "step_s": args.step,
        "gm": gm, "earth_radius_m": earth_radius, "moon_reference_radius_m": 1737400,
        "fixed_frame": frames.fixed_frame, "resolved_frame": frames.resolved_frame,
        "inertial_frame": "J2000", "origin": "MOON", "units": "m, m/s, s, m3/s2",
        "aberration_correction": "NONE", "matrix_order": "row-major",
        "time_standard": "t_s = SPICE ET/TDB minus epoch_et; UTC map converted using packaged source LSK",
        "time_mapping": "Piecewise linear interpolation of utc_ms -> t_s; no leap-second boundary in supplied interval; reject extrapolation",
        "interpolation": "Cubic Hermite position/velocity and R/Rdot; use adjacent actual t_s values",
        "reference_coverage_s": reference_coverage,
        "reference_coverage_utc": [frames.et_to_utc(epoch+t) for t in reference_coverage],
        "reference_seed": {"epoch_utc": args.seed, "epoch_et": seed_et, "epoch_t_s": seed_t,
            "state": seed_state.tolist(), "source_url": EXTRA["source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp"],
            "object_id": -60000, "origin_id": 301, "frame": "J2000", "units": "m, m/s",
            "label": "Integrator regression seed only; Mode B departures use nrho_reference at the actual departure time",
            "purpose": "validation_only",
            "provenance": "Geometric spkezr(-60000, epoch, J2000, NONE, MOON). SPK original origin is Earth, transformed using DE440s. Not a flown/operational ephemeris.",
            "source_force_model": "Published reference uses DE430, DE431 GMs, Earth/Moon/Sun/Jupiter and lunar 8x8 gravity plus small stationkeeping impulses.",
            "runtime_force_model": "Mode B reads its departure state from the source SPK subset at departure UTC, then integrates selected lunar gravity and differential Earth/Sun attraction; no subsequent source samples replace integrated states."},
        "sources": sources, "samples": samples, "time_samples": times,
    }

    print(f"Prepared {len(samples)} states; validating independent interior epochs", flush=True)
    maxima = {"earth_position_m": 0., "earth_velocity_m_s": 0., "sun_position_m": 0., "sun_velocity_m_s": 0.,
              "rotation_element": 0., "derivative_element_per_s": 0., "orthogonality": 0., "surface_position_m": 0., "surface_velocity_m_s": 0., "utc_to_tdb_seconds": 0.}
    golden = []
    fixed_test = np.array([1737400/np.sqrt(3)]*3 + [0.]*3)
    for i in range(len(samples)-1):
        a, b = samples[i], samples[i+1]
        h = b["t_s"] - a["t_s"]
        for u in [.25, .5, .75]:
            t = a["t_s"] + u*h
            exact = {body: state(body.upper(), epoch+t) for body in ["earth", "sun"]}
            for body in ["earth", "sun"]:
                av, bv = np.array(a[body]), np.array(b[body])
                p, v = hermite(av[:3], av[3:], bv[:3], bv[3:], u, h)
                maxima[body+"_position_m"] = max(maxima[body+"_position_m"], float(np.linalg.norm(p-exact[body][:3])))
                maxima[body+"_velocity_m_s"] = max(maxima[body+"_velocity_m_s"], float(np.linalg.norm(v-exact[body][3:])))
            r, d = hermite(np.array(a["rotation"]), np.array(a["derivative"]), np.array(b["rotation"]), np.array(b["derivative"]), u, h)
            sx = frames.sxform(epoch+t)
            maxima["rotation_element"] = max(maxima["rotation_element"], float(np.max(abs(r.reshape(3,3)-sx[:3,:3]))))
            maxima["derivative_element_per_s"] = max(maxima["derivative_element_per_s"], float(np.max(abs(d.reshape(3,3)-sx[3:,:3]))))
            maxima["orthogonality"] = max(maxima["orthogonality"], float(np.max(abs(r.reshape(3,3).T@r.reshape(3,3)-np.eye(3)))))
            maxima["surface_position_m"] = max(maxima["surface_position_m"], float(np.linalg.norm(r.reshape(3,3)@fixed_test[:3]-(sx@fixed_test)[:3])))
            maxima["surface_velocity_m_s"] = max(maxima["surface_velocity_m_s"], float(np.linalg.norm(d.reshape(3,3)@fixed_test[:3]-(sx@fixed_test)[3:])))
            um = utc_ms(frames.et_to_utc(epoch+t))
            estimate_t = times[i]["t_s"] + (um-times[i]["utc_ms"])/(times[i+1]["utc_ms"]-times[i]["utc_ms"])*h
            maxima["utc_to_tdb_seconds"] = max(maxima["utc_to_tdb_seconds"], abs(estimate_t-t))
            if i % 432 == 0 and u == .25:
                golden.append({"t_s": t, "utc": frames.et_to_utc(epoch+t), "earth": exact["earth"].tolist(), "sun": exact["sun"].tolist(),
                               "rotation": sx[:3,:3].ravel().tolist(), "derivative": sx[3:,:3].ravel().tolist()})

    def rhs(t, y):
        r = y[:3]
        acceleration = -gm["moon"] * r / np.linalg.norm(r)**3
        for body in ["earth", "sun"]:
            p = state(body.upper(), epoch+t)[:3]
            q = p-r
            acceleration += gm[body] * (q/np.linalg.norm(q)**3 - p/np.linalg.norm(p)**3)
        return np.concatenate((y[3:], acceleration))

    propagation = []
    extrema = []
    for sign in [-1, 1]:
        final_t = seed_t + sign*7*86400
        sol = solve_ivp(rhs, (seed_t, final_t), seed_state, method="DOP853", rtol=2e-13,
                        atol=np.array([1e-6]*3+[1e-10]*3), max_step=300, dense_output=True)
        if not sol.success:
            raise RuntimeError(sol.message)
        for days in [1, 3, 7]:
            t = seed_t + sign*days*86400
            if reference_coverage[0] <= t <= reference_coverage[1]:
                propagation.append({"t_s": t, "duration_s": sign*days*86400, "state": sol.sol(t).tolist()})
        states = sol.sol(np.linspace(seed_t, final_t, 20001)).T
        radii = np.linalg.norm(states[:,:3], axis=1)
        extrema.append({"direction": sign, "min_altitude_m": float(np.min(radii)-1737400), "max_altitude_m": float(np.max(radii)-1737400), "evaluations": sol.nfev})
    thresholds = {"earth_position_m": .05, "earth_velocity_m_s": .001, "sun_position_m": .1, "sun_velocity_m_s": .002,
                  "rotation_element": 1e-10, "derivative_element_per_s": 1e-11, "orthogonality": 1e-10,
                  "surface_position_m": .001, "surface_velocity_m_s": .0001, "utc_to_tdb_seconds": .00001}
    if any(maxima[k] > thresholds[k] for k in thresholds):
        raise RuntimeError(f"Interpolation validation did not pass: {maxima}")
    validation = {"schema": "lunar.ephemeris.validation.v1", "passed": True, "coverage_utc": value["coverage_utc"],
        "sample_count": len(samples), "interior_epochs_checked": (len(samples)-1)*3, "max_errors": maxima, "limits": thresholds,
        "nrho_reference": reference_validation, "golden_states": golden, "reference_seed": value["reference_seed"], "golden_propagation": propagation,
        "propagation_method": "Independent SciPy DOP853, direct SPICE Earth/Sun states at every RHS evaluation, rtol=2e-13; no browser ephemeris interpolation",
        "reference_window_extrema_sampled": extrema, "sources": sources,
        "source_reference_caveat": "Departure states come directly from the bounded NASA SPK subset. All post-departure states are integrated; the retained seed/golden_propagation only test the integrator independently."}
    value["validation"] = {"passed": True, "max_errors": maxima, "limits": thresholds, "interior_epochs_checked": validation["interior_epochs_checked"]}
    output = PROJECT / "frontend/public/data/ephemeris/index.json"
    save(output, value)
    manifest = {"schema": "lunar.ephemeris.manifest.v2", "schema_version": 2, "file": "index.json", "index_file": "index.json", "sha256": sha(output), "bytes": output.stat().st_size,
                "coverage_utc": value["coverage_utc"], "landing_coverage_utc": value["landing_coverage_utc"], "reference_coverage_s": reference_coverage}
    save(output.parent / "manifest.json", manifest, True)
    validation["output"] = manifest
    save(PROJECT / "docs/ephemeris-data-validation.json", validation, True)
    save(cache / "acquisition.json", {"sources": sources, "output": manifest}, True)
    # Prove preprocessing did not overwrite any original inputs.
    for source in sources:
        candidates = [frames.kernel_dir / source["file"], cache / source["file"], cache / "source-cache" / source["file"]]
        existing = next(p for p in candidates if p.exists())
        if sha(existing) != source["sha256"]:
            raise RuntimeError("An original source changed during preprocessing")
    print(json.dumps({"output": manifest, "max_errors": maxima, "reference_window_extrema": extrema}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
