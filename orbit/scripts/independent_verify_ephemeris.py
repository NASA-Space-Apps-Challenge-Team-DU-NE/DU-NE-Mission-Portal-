"""Replay an exported Mode B mission using direct SPICE + independent DOP853.

Development only. The website does not depend on Python, SciPy, or SPICE.
Spacecraft states are never reset to TypeScript targets or saved intermediate
states. Only the initial NASA source state, commanded impulses and powered
acceleration controls are inputs. Legacy terrain checks are not re-audited.
New terminal-policy exports also audit powered descent against native LOLA.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp
import spiceypy as spice

from nasa_data import PROJECT, SpiceFrames

G0 = 9.80665
LOLA_RADIUS = 1737400.


def norm(value):
    return float(np.linalg.norm(value))


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=PROJECT / ".cache/ephemeris-mission-result.json")
    parser.add_argument("--output", type=Path, default=PROJECT / "docs/ephemeris-independent-validation.json")
    args = parser.parse_args()
    args.input, args.output = args.input.resolve(), args.output.resolve()
    input_bytes = args.input.read_bytes()
    input_modified_utc = datetime.fromtimestamp(args.input.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
    mission = json.loads(input_bytes.decode("utf-8-sig"))
    if mission.get("status") != "VALIDATED" or mission.get("reference", {}).get("mode") != "EPHEMERIS":
        raise ValueError("Input must be a fully exported, validated Mode B mission")
    environment = read(PROJECT / "frontend/public/data/ephemeris/index.json")
    os.chdir(PROJECT)  # CSPICE Windows uses ASCII relative cache paths.
    frames = SpiceFrames()
    gm_kernel = PROJECT / "data/ephemeris/gm_de440.tpc"
    reference_kernel = PROJECT / "data/ephemeris/source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp"
    spice.furnsh("data/ephemeris/gm_de440.tpc")
    spice.furnsh("data/ephemeris/source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp")
    gm = {body.lower(): float(spice.bodvrd(body, "GM", 1)[1][0])*1e9 for body in ["MOON", "EARTH", "SUN"]}
    cfg, ref, transfer, replay = (mission[k] for k in ["input", "reference", "transfer_diagnostic", "replay_initial"])
    gravity_metadata = ref.get("gravity", {"model": "point_mass", "degree": 0})
    gravity_kind = gravity_metadata.get("model")
    requested_kind = cfg.get("nrho", {}).get("gravity_model", "point_mass")
    if gravity_kind not in ["point_mass", "grail"] or gravity_kind != requested_kind:
        raise ValueError("Exported gravity model does not match the mission input")
    harmonic = None
    gravity_provenance = {"model": "point_mass", "degree": 0, "asset_integrity": True,
                          "source_frame_consistent": True}
    if gravity_kind == "grail":
        from independent_verify_gravity import IndependentGravity
        from prepare_gravity import SOURCE_SHA256
        asset_path = PROJECT / "frontend/public/data/gravity/index.json"
        asset_bytes = asset_path.read_bytes()
        asset = json.loads(asset_bytes)
        manifest = read(asset_path.parent / "manifest.json")
        fixtures = read(PROJECT / "data/gravity/reference-fixtures.json")
        actual_hash = hashlib.sha256(asset_bytes).hexdigest()
        degree = gravity_metadata.get("degree")
        if degree not in [0,20,30,60,90] or degree != cfg["nrho"].get("gravity_degree", 30):
            raise ValueError("Unsupported or inconsistent exported GRAIL degree")
        asset_integrity = (actual_hash == manifest["sha256"] == fixtures["source_asset_sha256"]
                           and len(asset_bytes) == manifest["bytes"]
                           and asset["source_sha256"] == SOURCE_SHA256)
        source_frame_consistent = (asset["frame"] == gravity_metadata.get("frame") == "MOON_PA_DE440"
                                   and asset["fixed_frame"] == frames.resolved_frame
                                   and asset["normalization"] == "4pi" and asset["csphase"] == 1
                                   and asset["gm_m3_s2"] == gravity_metadata.get("gm_m3_s2") == 4902800306330.2
                                   and asset["reference_radius_m"] == gravity_metadata.get("reference_radius_m") == 1738000.)
        if not asset_integrity or not source_frame_consistent:
            raise ValueError("GRAIL asset identity, source conventions or exported metadata mismatch")
        harmonic = IndependentGravity(asset, degree)
        gm["moon"] = asset["gm_m3_s2"]
        gravity_provenance = {"model": "grail", "product": asset["model"], "degree": degree,
                              "asset_sha256": actual_hash, "original_tab_sha256": SOURCE_SHA256,
                              "asset_integrity": asset_integrity, "source_frame_consistent": source_frame_consistent,
                              "normalization": "4pi", "csphase": 1, "reference_radius_m": asset["reference_radius_m"],
                              "source_url": asset["source_url"], "frame": asset["frame"],
                              "evaluation": "Independent SciPy complex angular harmonics and analytic angular derivatives; direct SPICE J2000<->PA at every RHS call. No browser recurrence or frame interpolation.",
                              "tides": "Static source coefficients; degree2/3 permanent tide and dynamic solid-body tides omitted"}
    epoch = frames.utc_to_et(ref["epoch_utc"])
    direct_reference = ref.get("departure_state_source") == "NASA SPK type-9 direct lookup"
    # Exported UTC is rounded to milliseconds for display. Use the full ET for
    # the original SPK lookup and numerical replay at a fractional departure.
    seed_et = (float(ref["reference_seed"]["epoch_et"]) if direct_reference
               else frames.utc_to_et(ref["reference_seed"]["epoch_utc"]))
    seed_t = seed_et-epoch
    # The source kernel is read afresh, independently of the exported seed.
    initial = np.asarray(spice.spkezr("-60000", seed_et, "J2000", "NONE", "MOON")[0])*1000
    source_delta = initial-np.asarray(ref["reference_seed"]["state"])
    source_seed_difference = norm(source_delta)
    source_position_difference = norm(source_delta[:3])
    source_velocity_difference = norm(source_delta[3:])
    isp = float(cfg["lander"]["isp_s"])
    departure_time, arrival_time = map(float, [transfer["departure_time_s"], transfer["arrival_time_s"]])
    start_time = float(ref["start_et_offset_s"])
    events = {event["name"]: event for event in mission["events"]}
    finite = mission["summary"].get("propulsion_model") == "finite_constant_thrust_v1"
    burns = {b["name"]: b for b in mission.get("finite_burns", [])}
    finite_records = []
    if finite:
        def characteristic(name):
            b = burns[name]
            force = np.array(b["thrust_vector_n"])
            return force/norm(force)*float(b["delta_v_m_s"]) if norm(force) else np.zeros(3)
        dv0, dv1 = characteristic("NRHO_DEPARTURE"), characteristic("LLO_INSERTION")
    else:
        dv0, dv1 = np.array(transfer["departure_dv_m_s"]), np.array(transfer["insertion_dv_m_s"])
    total_transfer_dv = norm(dv0)+norm(dv1)
    initial_mass = float(cfg["lander"]["initial_mass_kg"])
    if cfg["nrho"]["mass_basis"] == "llo":
        initial_mass *= np.exp(total_transfer_dv/(isp*G0))
    evals = 0
    segments = []

    def gravity(t, r):
        if harmonic is None:
            acceleration = -gm["moon"]*r/norm(r)**3
        else:
            j2000_to_pa = spice.pxform("J2000", "MOON_PA_DE440", epoch+t)
            acceleration = j2000_to_pa.T @ harmonic.acceleration(j2000_to_pa @ r)
        for name in ["earth", "sun"]:
            p = np.asarray(spice.spkezr(name.upper(), epoch+t, "J2000", "NONE", "MOON")[0][:3])*1000
            q = p-r
            acceleration += gm[name]*(q/norm(q)**3-p/norm(p)**3)
        return acceleration

    def propagate(y, begin, end, commanded=None, max_step=300., record=False, force=None):
        nonlocal evals
        if abs(end-begin) < 1e-10:
            return np.asarray(y).copy(), None
        command = np.zeros(3) if commanded is None else np.asarray(commanded)
        acceleration_magnitude = norm(command)

        def rhs(t, state):
            if len(state) == 7 and state[6] <= 0:
                raise ValueError("Nonpositive mass")
            acceleration = command if force is None else np.asarray(force)/state[6]
            derivative = np.r_[state[3:6], gravity(t, state[:3])+acceleration]
            if len(state) == 7:
                flow = state[6]*acceleration_magnitude if force is None else norm(force)
                derivative = np.r_[derivative, -flow/(isp*G0)]
            return derivative

        atol = [1e-7]*3+[1e-10]*3+([1e-10] if len(y) == 7 else [])
        solution = solve_ivp(rhs, (begin, end), y, method="DOP853", rtol=2e-13,
                             atol=atol, max_step=max_step, dense_output=True)
        if not solution.success:
            raise RuntimeError(solution.message)
        evals += solution.nfev
        if record:
            segments.append((begin, end, solution))
        return solution.y[:, -1], solution

    def finite_burn(name, state, expected_start):
        b = burns[name]
        t = start_time+float(b["start_s"])
        duration = float(b["duration_s"])
        force = np.asarray(b["thrust_vector_n"])
        if abs(t-expected_start) > 1e-6 or duration < 0 or not np.isfinite(force).all():
            raise ValueError("Invalid finite burn command schedule")
        before = state.copy()
        after, solution = propagate(state, t, t+duration, max_step=.5, record=True, force=force)
        first, last = np.array(b["initial_state"]), np.array(b["final_state"])
        finite_records.append({"name": name, "start_s": t, "duration_s": duration,
            "thrust_n": norm(force), "initial_mass_kg": float(before[6]), "final_mass_kg": float(after[6]),
            "mass_flow_error_kg": abs(float(before[6]-after[6])-norm(force)*duration/(isp*G0)),
            "delta_v_accounting_error_m_s": abs(isp*G0*np.log(before[6]/after[6])-float(b["delta_v_m_s"])),
            "state_position_vs_export_m": max(norm(before[:3]-first[:3]),norm(after[:3]-last[:3])),
            "state_velocity_vs_export_m_s": max(norm(before[3:6]-first[3:6]),norm(after[3:6]-last[3:6]))})
        return after, solution, t+duration

    beginning, _ = propagate(initial, seed_t, start_time)
    y = np.r_[beginning, initial_mass]
    state_at_start = y.copy()
    y, _ = propagate(y, start_time, departure_time, record=True)
    departure_state = y.copy()
    insertion_start = start_time+float(burns["LLO_INSERTION"]["start_s"]) if finite else arrival_time
    if finite:
        y, _, departure_end = finite_burn("NRHO_DEPARTURE", y, departure_time)
        post_departure = y.copy()
        if departure_end > insertion_start:
            raise ValueError("Overlapping transfer burns")
        y, _ = propagate(y, departure_end, insertion_start, record=True)
        arrival = y.copy()
        y, _, insertion_end = finite_burn("LLO_INSERTION", y, insertion_start)
        if abs(insertion_end-arrival_time) > 1e-6:
            raise ValueError("Insertion end differs from arrival")
    else:
        y[3:6] += dv0
        y[6] *= np.exp(-norm(dv0)/(isp*G0))
        post_departure = y.copy()
        y, transfer_solution = propagate(y, departure_time, arrival_time, record=True)
        arrival = y.copy()
        y[3:6] += dv1
        y[6] *= np.exp(-norm(dv1)/(isp*G0))
    insertion = y.copy()
    current_t = arrival_time
    doi_t = start_time+float(events["DOI"]["time_s"])
    pdi_t = start_time+float(events["PDI"]["time_s"])
    if not current_t <= doi_t <= pdi_t:
        raise ValueError("Non-monotonic insertion/DOI/PDI epochs")
    y, _ = propagate(y, current_t, doi_t, max_step=2, record=True)
    doi_before = y.copy()
    if finite:
        y, _, doi_end = finite_burn("DOI", y, doi_t)
        if doi_end >= pdi_t:
            raise ValueError("DOI overlaps descent")
    else:
        doi_dv = -y[3:6]/norm(y[3:6])*float(events["DOI"]["delta_v_m_s"])
        y[3:6] += doi_dv
        y[6] *= np.exp(-norm(doi_dv)/(isp*G0))
        doi_end = doi_t
    doi_after = y.copy()
    y, _ = propagate(y, doi_end, pdi_t, max_step=2, record=True)
    pdi = y.copy()
    current_t = pdi_t
    peak_thrust = max((b["thrust_n"] for b in finite_records), default=0.)
    minimum_thrust = min((b["thrust_n"] for b in finite_records if b["duration_s"] > 0), default=float("inf"))
    terminal_segments = []
    maximum_control_gap, summed_powered_dv = 0., 0.
    for control in mission["controls"]:
        begin = start_time+float(control["start_s"])
        duration = float(control["duration_s"])
        gap = abs(begin-current_t)
        maximum_control_gap = max(maximum_control_gap, gap)
        if gap > 1e-6 or duration <= 0:
            raise ValueError("Exported powered controls are not continuous, positive time intervals")
        acceleration = np.array(control["acceleration_m_s2"])
        magnitude = norm(acceleration)
        peak_thrust = max(peak_thrust, float(y[6])*magnitude)
        y, solution = propagate(y, current_t, begin+duration, acceleration, max_step=.5, record=True)
        terminal_segments.append((begin, begin+duration, solution, acceleration))
        minimum_thrust = min(minimum_thrust, float(y[6])*magnitude)
        summed_powered_dv += magnitude*duration
        current_t = begin+duration
    final = y.copy()
    fixed = frames.sxform(epoch+current_t, inverse=True) @ final[:6]
    target_fixed = np.array(mission["target"]["fixed_position_m"])
    radial = fixed[:3]/norm(fixed[:3])
    vertical = float(fixed[3:]@radial)
    horizontal = norm(fixed[3:]-vertical*radial)
    exported_final = np.array(replay["final_state_m_m_s_kg"])
    terminal_policy = ref.get("terminal_descent")
    terminal_audit = None
    contact_height = 0.
    if terminal_policy is not None:
        if terminal_policy.get("version") != "demo-terminal-v1" or terminal_policy.get("center_to_contact_m") != 2:
            raise ValueError("Unsupported terminal contact policy")
        from terminal_audit import audit_terminal
        terminal_audit = audit_terminal(terminal_segments, frames, epoch, cfg["constraints"])
        contact_height = 2.
    support_position = fixed[:3]-contact_height*radial

    # A dense transfer-only collision-envelope screen. This does not re-audit
    # the LOLA terrain model or constitute an interval-proof of clearance.
    minimum_moon, minimum_earth = float("inf"), float("inf")
    for t in np.linspace(departure_time, arrival_time, 10001):
        segment = next(item for item in segments if item[0]-1e-7 <= t <= item[1]+1e-7)
        s = segment[2].sol(t)
        earth = np.asarray(spice.spkezr("EARTH", epoch+t, "J2000", "NONE", "MOON")[0][:3])*1000
        minimum_moon = min(minimum_moon, norm(s[:3])-LOLA_RADIUS)
        minimum_earth = min(minimum_earth, norm(s[:3]-earth)-float(environment["earth_radius_m"]))

    trajectory = mission["trajectory"]
    monotonic = all(float(a["time_s"]) <= float(b["time_s"])+1e-8 for a, b in zip(trajectory, trajectory[1:]))
    samples_compared, max_sample_position, max_sample_velocity, max_sample_mass = 0, 0., 0., 0.
    # Finite boundaries are continuous. Legacy impulses are compared by stage.
    stride = max(1, len(trajectory)//80)
    for sample in trajectory[::stride]:
        t = start_time+float(sample["time_s"])
        segment = next((item for item in segments if item[0]+1e-5 < t < item[1]-1e-5), None)
        if segment:
            state = segment[2].sol(t)
            max_sample_position = max(max_sample_position, norm(state[:3]-np.array(sample["position_m"])))
            max_sample_velocity = max(max_sample_velocity, norm(state[3:6]-np.array(sample["velocity_m_s"])))
            max_sample_mass = max(max_sample_mass, abs(float(state[6])-float(sample["mass_kg"])))
            samples_compared += 1

    landing_et_direct = frames.utc_to_et(cfg["target"]["landing_time_utc"])
    epoch_mapping_error = abs(epoch-float(ref["epoch_et"]))
    touchdown_time_error = abs(epoch+current_t-landing_et_direct)
    exported_fixed_direct = frames.sxform(epoch+current_t, inverse=True) @ exported_final[:6]
    frame_position_difference = norm(exported_fixed_direct[:3]-np.array(trajectory[-1]["fixed_position_m"]))
    frame_speed_difference = abs(norm(exported_fixed_direct[3:])-float(trajectory[-1]["speed_m_s"]))
    source_coverage = frames.coverage_start <= min(seed_et, epoch+start_time) and epoch+current_t <= frames.coverage_end
    event_times = {"NRHO_DEPARTURE": departure_time, "LLO_INSERTION": insertion_start,
                   "DOI": doi_t, "PDI": pdi_t, "TOUCHDOWN": current_t}
    maximum_event_time_difference = max(abs(start_time+float(events[name]["time_s"])-t) for name, t in event_times.items())
    source_checks = {source["file"]: {"sha256": source["sha256"]} for source in environment["sources"]}
    checked_sources = [frames.kernel_dir/name for name in frames.kernels]+[gm_kernel, reference_kernel, PROJECT/"data/ephemeris/nrho.lbl"]
    for path in checked_sources:
        source_checks[path.name]["actual_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        source_checks[path.name]["matches"] = source_checks[path.name]["actual_sha256"] == source_checks[path.name]["sha256"]
    stages = {
        "seed_position_vs_export_m": norm(initial[:3]-np.array(ref["reference_seed"]["state"][:3])),
        "seed_velocity_vs_export_m_s": norm(initial[3:]-np.array(ref["reference_seed"]["state"][3:])),
        "start_position_vs_typescript_m": norm(state_at_start[:3]-np.array(trajectory[0]["position_m"])),
        "departure_position_vs_typescript_m": norm(departure_state[:3]-np.array(transfer["initial_state" if finite else "departure_state"][:3])),
        "departure_velocity_vs_typescript_m_s": norm(departure_state[3:6]-np.array(transfer["initial_state" if finite else "departure_state"][3:6])),
        "arrival_position_vs_typescript_m": norm(arrival[:3]-np.array(burns["LLO_INSERTION"]["initial_state"][:3] if finite else transfer["pre_insertion_state"][:3])),
        "arrival_velocity_vs_typescript_m_s": norm(arrival[3:6]-np.array(burns["LLO_INSERTION"]["initial_state"][3:6] if finite else transfer["pre_insertion_state"][3:6])),
        "post_insertion_position_vs_typescript_m": norm(insertion[:3]-np.array(replay["post_insertion_state_m_m_s_kg"][:3])),
        "post_insertion_velocity_vs_typescript_m_s": norm(insertion[3:6]-np.array(replay["post_insertion_state_m_m_s_kg"][3:6])),
        "doi_delta_v_accounting_m_s": abs(isp*G0*np.log(doi_before[6]/doi_after[6])-float(events["DOI"]["delta_v_m_s"])),
        "pdi_position_vs_typescript_m": norm(pdi[:3]-np.array(replay["pdi_state_m_m_s_kg"][:3])),
        "pdi_velocity_vs_typescript_m_s": norm(pdi[3:6]-np.array(replay["pdi_state_m_m_s_kg"][3:6])),
        "final_position_vs_typescript_m": norm(final[:3]-exported_final[:3]),
        "final_velocity_vs_typescript_m_s": norm(final[3:6]-exported_final[3:6]),
        "final_mass_vs_typescript_kg": abs(float(final[6]-exported_final[6])),
    }
    limits = {"state_position_m": .1, "state_velocity_m_s": .0001, "mass_kg": 1e-7,
              "landing_time_s": .00001, "control_time_gap_s": 1e-6, "target_radial_clearance_m": .02}
    checks = {
        "original_initial_state": ((source_position_difference < .001 and source_velocity_difference < 1e-6)
                                   if direct_reference else source_seed_difference < 1e-8),
        "original_source_hashes": all(source_checks[path.name]["matches"] for path in checked_sources),
        # JavaScript JSON.stringify may serialize a large IEEE-754 double as
        # an integer token. Compare in the same double domain, not Python's
        # arbitrary-precision JSON integer domain.
        "same_gravitational_parameters": all(gm[k] == float(ref["gm_m3_s2"][k]) for k in gm),
        "gravity_asset_integrity": gravity_provenance["asset_integrity"],
        "gravity_source_frame_conventions": gravity_provenance["source_frame_consistent"],
        "departure_state": stages["departure_position_vs_typescript_m"] < .1 and stages["departure_velocity_vs_typescript_m_s"] < .0001,
        "transfer_state": stages["arrival_position_vs_typescript_m"] < .1 and stages["arrival_velocity_vs_typescript_m_s"] < .0001,
        "full_chain_final_state": stages["final_position_vs_typescript_m"] < .1 and stages["final_velocity_vs_typescript_m_s"] < .0001,
        "mass_accounting": stages["final_mass_vs_typescript_kg"] < 1e-7 and abs(float(initial_mass-final[6])-float(mission["summary"]["propellant_consumed_kg"])) < 1e-7,
        "target_position": norm(support_position-target_fixed) <= cfg["constraints"]["position_tolerance_m"],
        "target_radial_contact": abs(norm(fixed[:3])-norm(target_fixed)-contact_height) <= .02 and vertical <= 0,
        "target_surface_speed": norm(fixed[3:]) <= cfg["constraints"]["speed_tolerance_m_s"],
        "target_horizontal_speed": horizontal <= cfg["constraints"]["horizontal_speed_tolerance_m_s"],
        "dry_mass": float(final[6]) >= cfg["lander"]["dry_mass_kg"],
        "thrust": peak_thrust <= cfg["lander"]["max_thrust_n"]+1e-6 and minimum_thrust >= cfg["lander"]["min_thrust_n"]-1e-6,
        "transfer_collision_envelope_sampled": minimum_moon > 12000 and minimum_earth > 0,
        "utc_tdb_landing_epoch": epoch_mapping_error < 1e-6 and touchdown_time_error < .00001,
        "independent_lunar_frame": frames.fixed_frame == ref["surface_frame"] == environment["fixed_frame"] and frames.resolved_frame == environment["resolved_frame"] and frame_position_difference < .00001 and frame_speed_difference < .000001,
        "original_spice_coverage": source_coverage,
        "static_data_coverage": environment["coverage_s"][0] <= start_time <= current_t <= environment["coverage_s"][1],
        "reference_departure_coverage": environment["reference_coverage_s"][0] <= departure_time <= environment["reference_coverage_s"][1],
        "control_and_display_times": maximum_control_gap < 1e-6 and maximum_event_time_difference < 1e-6 and monotonic and abs(float(trajectory[0]["time_s"])) < 1e-6 and abs(start_time+float(trajectory[-1]["time_s"])-current_t) < 1e-6,
        "display_sample_crosscheck": samples_compared > 0 and max_sample_position < .1 and max_sample_velocity < .0001 and max_sample_mass < 1e-7,
    }
    if direct_reference:
        checks["direct_departure_epoch"] = abs(seed_t-departure_time) < 1e-6
        checks["departure_utc_display_rounding"] = abs(frames.utc_to_et(ref["reference_seed"]["epoch_utc"])-seed_et) <= .0011
    if terminal_audit is not None:
        checks["independent_terminal_envelope"] = terminal_audit["passed"]
    if finite:
        checks["finite_burn_mass_and_delta_v"] = all(b["mass_flow_error_kg"] < 1e-7 and b["delta_v_accounting_error_m_s"] < 1e-7 for b in finite_records)
        checks["finite_burn_states"] = all(b["state_position_vs_export_m"] < .1 and b["state_velocity_vs_export_m_s"] < .0001 for b in finite_records)
        checks["finite_burn_engine_limits"] = all(b["initial_mass_kg"] >= b["final_mass_kg"] >= cfg["lander"]["dry_mass_kg"] and (b["duration_s"] == 0 or cfg["lander"]["min_thrust_n"]-1e-6 <= b["thrust_n"] <= cfg["lander"]["max_thrust_n"]+1e-6) for b in finite_records)
        checks["finite_burn_schedule"] = len(finite_records) == 3 and all(a["start_s"]+a["duration_s"] <= b["start_s"]+1e-7 for a,b in zip(finite_records,finite_records[1:]))
    report = {
        "schema": "lunar.ephemeris.independent-validation.v1", "passed": all(checks.values()), "checks": checks, "limits": limits,
        "method": "Independent SciPy DOP853, direct geometric SPICE Earth/Sun and sxform at requested ET, original NASA reference SPK initial state, no TS state resets",
        "scope": (f"Static GL1800F degree {harmonic.degree} DE440 PA lunar gravity" if harmonic is not None else "Simplified lunar monopole")+" + differential Earth/Sun point masses in Moon-centered J2000 axes; finite force/time burns when exported, otherwise legacy impulses; exported piecewise acceleration controls. Not operational flight validation; new terminal-policy exports audit powered descent with native LOLA, but no full-flight terrain or unresolved-hazard certification.",
        "terminal_descent": terminal_audit,
        "finite_burns": finite_records,
        "input": str(args.input.relative_to(PROJECT)) if args.input.is_relative_to(PROJECT) else str(args.input), "input_sha256": hashlib.sha256(input_bytes).hexdigest(),
        "input_generated_at_utc": mission.get("generated_at_utc", input_modified_utc),
        "input_timestamp_source": "generated_at_utc field" if "generated_at_utc" in mission else "File last modification UTC; the exported result has no generated_at field",
        "validated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_checks": source_checks, "gravitational_parameters_m3_s2": gm,
        "gravity_model": gravity_provenance,
        "solver": {"method": "DOP853", "rtol": 2e-13, "position_atol_m": 1e-7, "velocity_atol_m_s": 1e-10, "mass_atol_kg": 1e-10, "reference_transfer_max_step_s": 300, "landing_coast_max_step_s": 2, "powered_max_step_s": .5, "evaluations": evals},
        "source_state": {"method": "Original SPICE departure lookup" if direct_reference else "Original SPICE fixed seed",
                         "position_difference_m": source_position_difference,
                         "velocity_difference_m_s": source_velocity_difference,
                         "position_limit_m": .001 if direct_reference else 1e-8,
                         "velocity_limit_m_s": 1e-6 if direct_reference else 1e-8,
                         "replay_starts_from": "Original SPICE state, not the exported browser state"},
        "state_comparisons": stages,
        "transfer": {"duration_s": arrival_time-departure_time, "departure_delta_v_m_s": norm(dv0), "insertion_delta_v_m_s": norm(dv1), "minimum_moon_altitude_m": minimum_moon, "minimum_earth_altitude_m": minimum_earth, "collision_samples": 10001, "position_or_velocity_reset": False},
        "landing": {"target_position_error_m": norm(support_position-target_fixed), "target_radial_clearance_m": norm(fixed[:3])-norm(target_fixed)-contact_height, "surface_speed_m_s": norm(fixed[3:]), "horizontal_speed_m_s": horizontal, "vertical_speed_m_s": vertical, "peak_thrust_n": peak_thrust, "minimum_powered_thrust_n": minimum_thrust, "controls": len(mission["controls"]), "powered_delta_v_m_s": summed_powered_dv},
        "mass": {"basis": cfg["nrho"]["mass_basis"], "initial_nrho_kg": initial_mass, "post_departure_kg": float(post_departure[6]), "post_insertion_kg": float(insertion[6]), "doi_propellant_kg": float(doi_before[6]-doi_after[6]), "final_kg": float(final[6]), "total_propellant_kg": float(initial_mass-final[6])},
        "time": {"epoch_et": epoch, "seed_et": seed_et, "start_et_offset_s": start_time, "departure_et_offset_s": departure_time, "arrival_et_offset_s": arrival_time, "landing_et_offset_s": current_t, "landing_utc": frames.et_to_utc(epoch+current_t), "landing_epoch_vs_requested_utc_s": touchdown_time_error, "maximum_control_gap_s": maximum_control_gap, "maximum_event_time_difference_s": maximum_event_time_difference},
        "frame": {**frames.info(), "final_fixed_position_vs_typescript_same_inertial_state_m": frame_position_difference, "final_surface_speed_vs_typescript_same_inertial_state_m_s": frame_speed_difference},
        "display_samples": {"count": samples_compared, "maximum_position_difference_m": max_sample_position, "maximum_velocity_difference_m_s": max_sample_velocity, "maximum_mass_difference_kg": max_sample_mass},
        "independent_final_state_m_m_s_kg": final.tolist(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "checks": checks, "state_comparisons": stages, "landing": report["landing"], "time": report["time"]}, indent=2, allow_nan=False))
    if not report["passed"]:
        raise SystemExit("Independent Mode B validation failed; inspect reported checks")


if __name__ == "__main__":
    main()
