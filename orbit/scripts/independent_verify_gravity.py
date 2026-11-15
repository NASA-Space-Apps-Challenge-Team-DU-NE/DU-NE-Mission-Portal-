"""Generate independent SciPy harmonic and direct-SPICE frame reference fixtures.

This evaluator uses SciPy's complex angular spherical harmonics, not the
browser Cartesian solid-harmonic recurrence. It is development-only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import scipy
from scipy.special import sph_harm_y, sph_harm_y_all
import spiceypy as spice

from nasa_data import PROJECT, SpiceFrames
from prepare_gravity import PA, ME, save


class IndependentGravity:
    """SciPy complex orthonormal/CS -> real geodesy4pi/no-CS gravity."""

    def __init__(self, data, degree):
        if not 0 <= degree <= data["max_degree"]:
            raise ValueError("Unsupported harmonic degree")
        self.degree = degree
        pairs = [(n,m) for n in range(degree+1) for m in range(n+1)]
        self.n = np.array([x[0] for x in pairs])
        self.m = np.array([x[1] for x in pairs])
        self.c = np.asarray(data["c"][:len(pairs)])
        self.s = np.asarray(data["s"][:len(pairs)])
        self.gm = data["gm_m3_s2"]
        self.r0 = data["reference_radius_m"]
        self.factor = np.where(self.m == 0, np.sqrt(4*np.pi), np.sqrt(8*np.pi)*(-1.)**self.m)
        self.complex_weights = (self.c-1j*self.s)*self.factor

    def evaluate(self, position):
        x,y,z = np.asarray(position, dtype=float)
        radius = float(np.linalg.norm(position))
        if radius <= 0 or not math.isfinite(radius):
            raise ValueError("Invalid gravity position")
        rho = math.hypot(x,y)
        theta = math.atan2(rho,z)
        phi = math.atan2(y,x) % (2*np.pi)
        values, gradients = sph_harm_y_all(self.degree, self.degree, theta, phi, diff_n=1)
        ynm, derivatives = values[self.n,self.m], gradients[self.n,self.m]
        powers = (self.r0/radius)**self.n
        weighted = self.complex_weights*powers
        terms = np.real(weighted*ynm)
        potential = self.gm/radius*float(np.sum(terms))
        radial = -self.gm/radius**2*float(np.sum((self.n+1)*terms))
        dtheta = self.gm/radius**2*float(np.real(np.sum(weighted*derivatives[:,0])))
        if rho == 0:
            # Exact Cartesian axis limit: theta-directional derivatives at
            # phi=0 and pi/2 recover both horizontal components without a
            # singular division or evaluating at an artificially moved point.
            _, dy = sph_harm_y_all(self.degree, self.degree, theta, np.pi/2, diff_n=1)
            dy = dy[self.n,self.m]
            sign = 1. if z > 0 else -1.
            dy = self.gm/radius**2*float(np.real(np.sum(weighted*dy[:,0])))
            acceleration = np.array([sign*dtheta, sign*dy, sign*radial])
        else:
            sine, cosine = rho/radius, z/radius
            cphi, sphi = x/rho, y/rho
            dphi = self.gm/radius**2*float(np.real(np.sum(weighted*derivatives[:,1])))/sine
            er = np.array([sine*cphi, sine*sphi, cosine])
            etheta = np.array([cosine*cphi, cosine*sphi, -sine])
            ephi = np.array([-sphi,cphi,0.])
            acceleration = radial*er+dtheta*etheta+dphi*ephi
        return potential, acceleration

    def acceleration(self, position):
        return self.evaluate(position)[1]

    def potential(self, position):
        return self.evaluate(position)[0]

    def jacobian(self, position, step=10.):
        result = np.zeros((3,3))
        for axis in range(3):
            h = np.eye(3)[axis]*step
            result[:,axis] = (self.acceleration(position-2*h)-8*self.acceleration(position-h)
                              +8*self.acceleration(position+h)-self.acceleration(position+2*h))/(12*step)
        return result


def spherical_position(radius, latitude, longitude):
    lat, lon = np.radians([latitude,longitude])
    return radius*np.array([np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)])


def frame_validation(ephemeris, frames, pa_to_me):
    epoch = ephemeris["epoch_et"]
    samples = ephemeris["samples"]
    maxima = {"rotation_element":0., "orthogonality":0., "surface_position_m":0., "derivative_element_per_s":0.}
    golden = []
    test = np.array([1738000/np.sqrt(3)]*3)
    count = 0
    for i in range(len(samples)-1):
        a,b=samples[i],samples[i+1]
        h=b["t_s"]-a["t_s"]
        for u in [.25,.5,.75]:
            t=a["t_s"]+u*h
            ra,rb=np.array(a["rotation"]).reshape(3,3),np.array(b["rotation"]).reshape(3,3)
            da,db=np.array(a["derivative"]).reshape(3,3),np.array(b["derivative"]).reshape(3,3)
            interp=((2*u**3-3*u*u+1)*ra+(u**3-2*u*u+u)*h*da
                    +(-2*u**3+3*u*u)*rb+(u**3-u*u)*h*db)@pa_to_me
            derivative=((6*u*u-6*u)/h*ra+(3*u*u-4*u+1)*da
                        +(-6*u*u+6*u)/h*rb+(3*u*u-2*u)*db)@pa_to_me
            exact=spice.sxform(PA,"J2000",epoch+t)
            maxima["rotation_element"]=max(maxima["rotation_element"],float(np.max(abs(interp-exact[:3,:3]))))
            maxima["derivative_element_per_s"]=max(maxima["derivative_element_per_s"],float(np.max(abs(derivative-exact[3:,:3]))))
            maxima["orthogonality"]=max(maxima["orthogonality"],float(np.max(abs(interp.T@interp-np.eye(3)))))
            maxima["surface_position_m"]=max(maxima["surface_position_m"],float(np.linalg.norm((interp-exact[:3,:3])@test)))
            if i%432==0 and u==.25:
                golden.append({"t_s":t,"utc":frames.et_to_utc(epoch+t),"pa_to_j2000":exact[:3,:3].ravel().tolist(),
                               "pa_to_j2000_derivative":exact[3:,:3].ravel().tolist()})
            count+=1
    # Include both support endpoints explicitly.
    for t in ephemeris["coverage_s"]:
        exact=spice.sxform(PA,"J2000",epoch+t)
        golden.append({"t_s":t,"utc":frames.et_to_utc(epoch+t),"pa_to_j2000":exact[:3,:3].ravel().tolist(),
                       "pa_to_j2000_derivative":exact[3:,:3].ravel().tolist()})
    limits={"rotation_element":1e-10,"orthogonality":1e-10,"surface_position_m":.001,"derivative_element_per_s":1e-11}
    if any(maxima[k]>limits[k] for k in limits):
        raise ValueError(f"PA frame interpolation failed: {maxima}")
    return {"epoch_et":epoch,"epoch_utc":ephemeris["epoch_utc"],"passed":True,"interior_epochs_checked":count,"max_errors":maxima,"limits":limits,"golden":golden,
            "method":"Existing ME cubic Hermite R/Rdot times exact constant PA->ME; compared with direct CSPICE sxform(PA,J2000,t)."}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare",type=Path,help="Optional browser evaluation JSON with a cases array keyed by name/degree")
    args=parser.parse_args()
    asset=PROJECT/"frontend/public/data/gravity/index.json"
    data=json.loads(asset.read_text("utf-8"))
    positions=[
        ("north_pole_surface",np.array([0.,0.,1737400.])),
        ("south_pole_surface",np.array([0.,0.,-1737400.])),
        ("near_north_pole",np.array([.3,-.7,1737400.])),
        ("near_south_pole",np.array([.3,-.7,-1737400.])),
        ("equator_0",np.array([1738000.,0.,0.])),
        ("equator_90",np.array([0.,1738000.,0.])),
        ("connectingridge_like_PA_direction",spherical_position(1737400.,-89.4441,-137.291)),
        ("below_reference_radius",spherical_position(1729000.,-77.3,42.)),
        ("llo_100km",spherical_position(1837400.,-42.8,123.4)),
        ("nrho_perilune",spherical_position(4500000.,-72.,-24.)),
        ("nrho_apolune",spherical_position(70000000.,79.,42.)),
        ("oblique",np.array([-1210000.,1040000.,880000.])),
    ]
    cases=[]
    max_monopole_error=0.
    max_jacobian_step_change=0.
    max_scipy_batch_difference=0.
    # Confirm the batch routine's positive-order indexing/convention against
    # independent public per-(n,m) API calls before using it for mission replay.
    indexing=IndependentGravity(data,90)
    for theta,phi in [(0.,0.),(np.pi,0.7),(1.234,5.678)]:
        values,derivatives=sph_harm_y(indexing.n,indexing.m,theta,phi,diff_n=1)
        batch,batch_derivatives=sph_harm_y_all(90,90,theta,phi,diff_n=1)
        max_scipy_batch_difference=max(max_scipy_batch_difference,float(np.max(abs(values-batch[indexing.n,indexing.m]))),
                                       float(np.max(abs(derivatives-batch_derivatives[indexing.n,indexing.m]))))
    for degree in [0,20,30,60,90]:
        model=IndependentGravity(data,degree)
        for name,r in positions:
            potential,acceleration=model.evaluate(r)
            entry={"name":name,"degree":degree,"position_pa_m":r.tolist(),
                   "potential_m2_s2":potential,"acceleration_m_s2":acceleration.tolist()}
            if degree==0:
                expected=-model.gm*r/np.linalg.norm(r)**3
                max_monopole_error=max(max_monopole_error,float(np.max(abs(expected-acceleration))))
            if name in ["south_pole_surface","equator_0","llo_100km","oblique"]:
                jac10=model.jacobian(r,10.)
                jac5=model.jacobian(r,5.)
                step_change=float(np.max(abs(jac10-jac5)))
                max_jacobian_step_change=max(max_jacobian_step_change,step_change)
                entry["jacobian_s2"]=jac5.ravel().tolist()
                entry["jacobian_step_change_s2"]=step_change
            cases.append(entry)
    if max_monopole_error>2e-15 or max_jacobian_step_change>2e-11 or max_scipy_batch_difference>5e-13:
        raise ValueError("Independent evaluator self-check did not converge")
    frames=SpiceFrames()
    ephemeris=json.loads((PROJECT/"frontend/public/data/ephemeris/index.json").read_text("utf-8"))
    validation=frame_validation(ephemeris,frames,np.array(data["pa_to_me_rotation"]).reshape(3,3))
    convergence=[]
    for name,r in positions:
        base=next(c for c in cases if c["name"]==name and c["degree"]==90)
        convergence.append({"name":name,"position_pa_m":r.tolist(),"relative_to_degree90_m_s2":{
            str(degree):float(np.linalg.norm(np.array(next(c for c in cases if c["name"]==name and c["degree"]==degree)["acceleration_m_s2"])-base["acceleration_m_s2"]))
            for degree in [0,20,30,60]},"caveat":"Difference from N90 only; not an estimate of error against the full physical gravity field."})
    result={"schema":"lunar.gravity.reference.v1","source_asset_sha256":hashlib.sha256(asset.read_bytes()).hexdigest(),
            "method":"SciPy special.sph_harm_y_all(diff_n=1), checked against per-(n,m) sph_harm_y, complex angular harmonics; independent of browser Cartesian recurrence. Complex orthonormal CS converted by sqrt(4pi) for m0 and sqrt(8pi)*(-1)^m for m>0.",
            "scipy_version":scipy.__version__,"sources":["https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.sph_harm_y.html","https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.sph_harm_y_all.html","https://shtools.github.io/SHTOOLS/real-spherical-harmonics.html"],
            "axes":"Exact axis Cartesian horizontal derivatives obtained from analytic theta-direction derivatives at phi0/pi2; no singular longitude division or shifted evaluation point.",
            "sample_position_convention":"All positions are synthetic PA-frame evaluation points. connectingridge_like_PA_direction uses similar numeric latitude/longitude on a reference sphere; it is not the actual MOON_ME landing target or its LOLA elevation.",
            "jacobian_method":"Fourth-order central differences of independent acceleration, h5m; compared with h10m.",
            "self_checks":{"degree0_acceleration_max_abs_error_m_s2":max_monopole_error,"jacobian_h5_h10_max_abs_difference_s2":max_jacobian_step_change,"scipy_batch_vs_single_max_abs_difference":max_scipy_batch_difference},
            "comparison_limits":{"potential_abs_m2_s2":2e-7,"acceleration_abs_m_s2":3e-10,"jacobian_abs_s2":2e-11},
            "cases":cases,"frame_validation":validation,"degree_comparison":convergence,
            "physical_accuracy_caveat":"Independent implementation agreement and numerical convergence do not certify full-field accuracy or landing safety."}
    if args.compare:
        browser=json.loads(args.compare.read_text("utf-8"))
        diffs={"potential_abs_m2_s2":0.,"acceleration_abs_m_s2":0.,"jacobian_abs_s2":0.}
        for expected in cases:
            matches=[v for v in browser["cases"] if v["name"]==expected["name"] and v["degree"]==expected["degree"]]
            if len(matches)!=1:
                raise ValueError(f"Missing/duplicate browser case {expected['name']}/{expected['degree']}")
            actual=matches[0]
            diffs["potential_abs_m2_s2"]=max(diffs["potential_abs_m2_s2"],abs(actual["potential_m2_s2"]-expected["potential_m2_s2"]))
            diffs["acceleration_abs_m_s2"]=max(diffs["acceleration_abs_m_s2"],float(np.max(abs(np.asarray(actual["acceleration_m_s2"])-expected["acceleration_m_s2"]))))
            if "jacobian_s2" in expected:
                diffs["jacobian_abs_s2"]=max(diffs["jacobian_abs_s2"],float(np.max(abs(np.asarray(actual["jacobian_s2"]).ravel()-expected["jacobian_s2"]))))
        passed=all(diffs[k]<=result["comparison_limits"][k] for k in diffs)
        result["browser_comparison"]={"passed":passed,"cases":len(cases),"max_errors":diffs}
        if not passed:
            raise ValueError(f"Independent browser comparison failed: {diffs}")
    save(PROJECT/"data/gravity/reference-fixtures.json",result,True)
    report={k:v for k,v in result.items() if k!="cases"}
    report["reference_cases"]=len(cases)
    save(PROJECT/"docs/gravity-data-validation.json",report,True)
    print(json.dumps({"reference_cases":len(cases),"self_checks":result["self_checks"],"frame_max_errors":validation["max_errors"],"browser_comparison":result.get("browser_comparison")},indent=2))


if __name__=="__main__":
    main()
