"""Independently revalidate a seven-day integrator regression under GL1800F.

This checks reference propagation only, not feasibility of every mission date.
Direct SPICE and SciPy angular harmonics are independent of the browser model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time

import numpy as np
from scipy.integrate import solve_ivp
import spiceypy as spice

from nasa_data import PROJECT, SpiceFrames
from independent_verify_gravity import IndependentGravity
from prepare_gravity import save


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--degree", type=int, default=30, choices=[20,30,60,90])
    args = parser.parse_args()
    started=time.perf_counter()
    asset_path=PROJECT/"frontend/public/data/gravity/index.json"
    asset_bytes=asset_path.read_bytes()
    asset=json.loads(asset_bytes)
    manifest=json.loads((asset_path.parent/"manifest.json").read_text())
    if hashlib.sha256(asset_bytes).hexdigest()!=manifest["sha256"]:
        raise ValueError("Gravity asset integrity mismatch")
    eph_path=PROJECT/"frontend/public/data/ephemeris/index.json"
    eph=json.loads(eph_path.read_text())
    frames=SpiceFrames()
    os.chdir(PROJECT)
    spice.furnsh("data/ephemeris/gm_de440.tpc")
    spice.furnsh("data/ephemeris/source-cache/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp")
    gm={name:float(spice.bodvrd(name.upper(),"GM",1)[1][0])*1e9 for name in ["earth","sun"]}
    epoch=float(eph["epoch_et"])
    seed=eph["reference_seed"]
    seed_t=float(seed["epoch_t_s"])
    initial=np.asarray(spice.spkezr("-60000",epoch+seed_t,"J2000","NONE","MOON")[0])*1000
    seed_difference=float(np.max(abs(initial-np.asarray(seed["state"]))))
    model=IndependentGravity(asset,args.degree)
    evaluations=0

    def rhs(t,state):
        nonlocal evaluations
        evaluations+=1
        r=state[:3]
        rot=spice.pxform("J2000","MOON_PA_DE440",epoch+t)
        a=rot.T@model.acceleration(rot@r)
        for name in ["earth","sun"]:
            p=np.asarray(spice.spkezr(name.upper(),epoch+t,"J2000","NONE","MOON")[0][:3])*1000
            q=p-r
            a+=gm[name]*(q/np.linalg.norm(q)**3-p/np.linalg.norm(p)**3)
        return np.r_[state[3:],a]

    regression_coverage=[seed_t-7*86400.,seed_t+7*86400.]
    states=[]
    windows=[]
    max_position_difference=0.
    max_velocity_difference=0.
    for direction in [-1,1]:
        end=regression_coverage[0 if direction<0 else 1]
        if not eph["coverage_s"][0]<=min(seed_t,end)<=max(seed_t,end)<=eph["coverage_s"][1]:
            raise ValueError("Declared reference window exceeds static-data coverage")
        solutions=[]
        for max_step in [300.,150.]:
            sol=solve_ivp(rhs,(seed_t,end),initial,method="DOP853",rtol=2e-13,
                          atol=[1e-7]*3+[1e-10]*3,max_step=max_step,dense_output=True)
            if not sol.success or not np.all(np.isfinite(sol.y)):
                raise ValueError("Reference propagation failed or produced nonfinite states")
            solutions.append(sol)
            print(f'degree {args.degree}, direction {direction}, max_step {max_step}: {sol.nfev} RHS',flush=True)
        coarse,fine=solutions
        offsets=np.linspace(seed_t,end,20001)
        positions=fine.sol(offsets)[:3].T
        moon_altitudes=np.linalg.norm(positions,axis=1)-1737400.
        comparison=fine.sol(offsets)-coarse.sol(offsets)
        dp=float(np.max(np.linalg.norm(comparison[:3].T,axis=1)))
        dv=float(np.max(np.linalg.norm(comparison[3:].T,axis=1)))
        max_position_difference=max(max_position_difference,dp)
        max_velocity_difference=max(max_velocity_difference,dv)
        earth_clearance=float("inf")
        for t,r in zip(offsets[::20],positions[::20]):
            earth=np.asarray(spice.spkezr("EARTH",epoch+t,"J2000","NONE","MOON")[0][:3])*1000
            earth_clearance=min(earth_clearance,float(np.linalg.norm(r-earth))-eph["earth_radius_m"])
        windows.append({"direction":direction,"end_t_s":end,"end_utc":frames.et_to_utc(epoch+end),
                        "duration_tdb_days":(end-seed_t)/86400.,"min_sampled_moon_altitude_m":float(np.min(moon_altitudes)),
                        "max_sampled_moon_altitude_m":float(np.max(moon_altitudes)),"min_sampled_earth_clearance_m":earth_clearance,
                        "moon_samples":len(offsets),"earth_samples":len(offsets[::20]),
                        "max_step_refinement_position_m":dp,"max_step_refinement_velocity_m_s":dv,
                        "coarse_evaluations":coarse.nfev,"fine_evaluations":fine.nfev})
        for days in [1,3,7]:
            t=seed_t+direction*days*86400.
            if min(seed_t,end)-1e-8<=t<=max(seed_t,end)+1e-8:
                states.append({"t_s":t,"duration_s":direction*days*86400.,"state":fine.sol(t).tolist()})
    limits={"position_refinement_m":.1,"velocity_refinement_m_s":1e-5,
            "min_moon_altitude_m":12000.,"min_earth_clearance_m":0.}
    checks={"original_seed_matches":seed_difference<1e-8,"six_golden_states":len(states)==6,
            "position_step_refinement":max_position_difference<limits["position_refinement_m"],
            "velocity_step_refinement":max_velocity_difference<limits["velocity_refinement_m_s"],
            "sampled_moon_clearance":all(w["min_sampled_moon_altitude_m"]>limits["min_moon_altitude_m"] for w in windows),
            "sampled_earth_clearance":all(w["min_sampled_earth_clearance_m"]>limits["min_earth_clearance_m"] for w in windows)}
    result={"schema":"lunar.gravity.reference-window.v1","passed":all(checks.values()),"checks":checks,"limits":limits,
            "model":"GL1800F","degree":args.degree,"gravity_asset_sha256":manifest["sha256"],
            "ephemeris_sha256":hashlib.sha256(eph_path.read_bytes()).hexdigest(),
            "method":"Independent SciPy DOP853 with complex angular harmonics and direct SPICE PA rotation/Earth/Sun at every RHS. Original source SPK seed only; no intermediate resets. 300s vs150s step caps at rtol2e-13.",
            "epoch_et":epoch,"epoch_utc":eph["epoch_utc"],
            "coverage_utc":[frames.et_to_utc(epoch+t) for t in regression_coverage],"coverage_s":regression_coverage,
            "seed_t_s":seed_t,"seed_utc":seed["epoch_utc"],"seed_state":initial.tolist(),
            "golden_states":states,"windows":windows,"evaluations":evaluations,"elapsed_s":time.perf_counter()-started,
            "scope":"Numerical propagation of this single NASA seed in the selected model for +/-7 TDB days; clearance is sampled, not interval-certified. Does not prove periodicity, operational stationkeeping, or landing feasibility for every date/site.",
            "other_degrees":"This report validates only its named degree; other degree windows require their own execution or browser/reference checks."}
    path=PROJECT/f"data/gravity/reference-window-{args.degree}.json"
    save(path,result,True)
    save(PROJECT/f"docs/gravity-reference-window-{args.degree}.json",result,True)
    print(json.dumps({"passed":result["passed"],"checks":checks,"windows":windows,"elapsed_s":result["elapsed_s"]},indent=2),flush=True)
    if not result["passed"]:
        raise SystemExit("Reference window verification failed")


if __name__=="__main__":
    main()
