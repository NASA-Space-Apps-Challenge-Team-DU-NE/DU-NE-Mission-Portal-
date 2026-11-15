# Physics model and numerical method

The deployed application is static. A TypeScript Web Worker calculates every flight locally; Python is used only for source-data preprocessing and independent validation. There is no runtime simulation server and no saved trajectory substituted for a new calculation.

`VALIDATED` means the configured numerical constraints and the supplied DEM-model checks passed. It does not mean a flight-ready mission, NASA certification, or metre-level knowledge of real terrain. Very small endpoint residuals quantify the numerical solve, not physical accuracy.

This document describes the original LLO numerical model. Current Mode B uses [dated dynamics](docs/EPHEMERIS_MODEL.md) and [joint mission evaluation with finite burns](docs/FINITE_BURNS.md).

## Constants, states and time

All dynamics use metres, seconds, kilograms and newtons. The seven-state vector is `[x,y,z,vx,vy,vz,mass]` in lunar-centred J2000. The reference sphere is 1,737,400 m. The DE440 Moon GM is 4.902800118×10¹² m³/s², from [JPL Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html). Standard gravity for the rocket equation is exactly 9.80665 m/s².

The mapping frame is `MOON_ME`, resolved by the supplied DE440 frame kernel to `MOON_ME_DE440_ME421`. The PDS DEM's mean-Earth/polar-axis coordinates use that aligned realization. Latitude is planetocentric and longitude is east-positive. A surface point is `rF=(R+h)[cos(lat)cos(lon),cos(lat)sin(lon),sin(lat)]`.

The build-time SpiceyPy pipeline loads the local LSK, PCK, binary lunar orientation kernel and frame kernel, and uses `sxform`, including its rotation derivative. The browser loads a table of `R(t)` and `dR/dt`, not the SPICE kernels. Cubic Hermite interpolation uses both values. Position and velocity transform together:

```
rI = R rF
vI = Rdot rF + R vF
rF = inverse(R) rI
vF = inverse(R) (vI - Rdot rF)
```

Consequently a fixed point has nonzero inertial surface velocity. Touchdown metrics use the transformed fixed-frame velocity, not the inertial velocity. Actual table coverage and interpolation checks are recorded in `frontend/public/data/frames.json`. The default table is limited to 2026-11-14 22:00 through 2026-11-22 00:00 UTC approximately; the entire flight must fit. UTC epoch conversion uses the NAIF LSK. Within this short, leap-second-free interval, browser UTC elapsed seconds approximate TDB elapsed seconds to under 1 ms; this time approximation is separately disclosed in the table. The interpolation-only measured position discrepancy at 100 km is approximately 1.6 μm; it excludes the time approximation and model uncertainty.

## Circular orbit and DOI

The initial reference altitude defaults to 100 km, giving radius `ra=1,837,400 m`, speed `sqrt(mu/ra)` ≈1,633.504134 m/s and period `2*pi*sqrt(ra³/mu)` ≈7,067.459728 s. The initial radius and velocity vectors are orthogonal. A 180 s circular arc is numerically integrated before DOI.

For a requested reference PDI altitude of 15 km, `rp=1,752,400 m`. The transfer ellipse has `a=(ra+rp)/2` and `e=(ra-rp)/(ra+rp)`. Apocentre and pericentre speeds come from vis-viva, `v=sqrt(mu*(2/r-1/a))`. Retrograde DOI is approximately 19.455073 m/s; time from DOI to pericentre is `pi*sqrt(a³/mu)` ≈3,411.836139 s.

DOI is explicitly an ideal impulse. Its vector is applied to the continuously propagated state, and propellant is deducted using `m_after=m_before*exp(-|deltaV|/(Isp*g0))`. The full-thrust burn-time estimate is also reported. The finite duration of that burn is not propagated, so the impulse approximation is a model limitation. Position is continuous at DOI, velocity changes by the specified vector, and mass changes by the specified rocket-equation expenditure. Coast then integrates central gravity to PDI.

## Three-dimensional powered descent

The integrated equations are:

```
dr/dt = v
dv/dt = -mu*r/|r|^3 + (T/m)*u
dm/dt = -T/(Isp*g0)
```

Each candidate uses 24 constant inertial acceleration vectors `a_i` of equal duration. The executable thrust schedule is `T(t)=m(t)|a_i|`, `u=a_i/|a_i|`. Hence within a segment the open-loop thrust exponentially tapers as `m(t)=m_start*exp(-|a_i|*(t-t_start)/(Isp*g0))`. The RK4 integrator propagates the mass equation as well as position and velocity; it does not hold mass constant. Minimum and maximum thrust are checked at segment ends and starts, where the extrema occur. Final mass is checked against dry mass; monotonic consumption means this also bounds all earlier masses. DOI consumption is included.

An endpoint-constrained cubic Hermite polynomial is used **only to seed acceleration commands**. Its second derivative minus central gravity supplies the initial 24 vectors. The polynomial positions are never returned, animated or accepted as a flight path. Six shooting parameters add a constant and a linearly varying three-dimensional correction to those acceleration commands. A finite-difference 6×6 Jacobian, Newton correction and line search solve the six terminal position/velocity residuals by repeated forward integration. This is single shooting over a restricted control family, not unrestricted 72-variable optimal control or multiple shooting.

The desired position is the actual DEM surface radius at the selected coordinate, transformed at landing time. The desired inertial velocity is the SPICE surface velocity minus a radial contact speed. Contact speed defaults to 0.5 m/s downward, or one quarter of a smaller user-specified total-speed limit. It is not forced to inertial zero. Cross-track acceleration is available, so the final propagation is fully 3D.

## Candidate search and ranking

For every selected target the solver tests 48 independent initial conditions: four approach headings (north/east/south/west in the target's local frame), four powered durations (260, 340, 440, 560 s), and three approach phase factors (0.9, 1.0, 1.1). The departure plane and DOI position are reconstructed from each target-relative heading and phase. Thus changing the target changes the orbit plane and departure state rather than moving a marker on a fixed flight.

Candidate phase starts at `beta=vp*duration/(2*rp)*factor`. Each PDI state comes from its own propagated circular arc, DOI and coast. Candidates satisfying the numerical endpoint and engine constraints are ranked by propellant or time. Ranked candidates then undergo full forward propagation and terrain checks until the first valid candidate is found. The second validation location demonstrates rejection of a terrain-intersecting first candidate and selection of a later valid candidate.

Fuel/time objectives select among this bounded family. No continuous global optimum is claimed. `INFEASIBLE UNDER ASSUMPTIONS` means numerically converged candidates failed the imposed constraints within this search; it is not proof that every possible flight is impossible. If the numerical solves fail, the status is `NOT CONVERGED`. If terminal convergence passes but complete checks fail, it is `NUMERICALLY CONVERGED` or `DATA UNAVAILABLE` as appropriate.

## Forward validation and terrain

The candidate shooting step uses RK4 steps no larger than 2 s. The endpoint is independently refined at 0.5 s. The selected full flight is propagated again from the initial circular state; powered sampling uses no more than 0.5 s or 120 m of path length per step, whichever is smaller. Coast steps are no larger than 2 s. Display samples are decimated only after checking the dense trajectory.

Native LOLA south-polar data are signed little-endian 16-bit DN, with `h=DN*0.5m` and the label's polar stereographic registration. The browser lazily loads 256×256 derived tiles and bilinearly samples the unchanged 240 m grid. Outside the south-polar grid, a 1° max-pooled derivative of an existing 4-pixel/degree NASA global DEM can screen only high-altitude states (reference altitude ≥12 km). Max-pooled cells are sampled by containing cell, never bilinearly averaged. They upper-bound their included coarse source samples, not all unresolved real lunar terrain. Landing itself requires the 240 m south-polar data. Missing terrain is never replaced with a zero-elevation sphere.

Validation checks endpoint distance ≤100 m, total surface-relative speed ≤2 m/s, horizontal speed ≤1 m/s (all editable), thrust bounds, dry mass, sampled pre-contact terrain clearance, endpoint refinement and stage continuity. A disclosed 0.02 m numerical clearance tolerance avoids rejecting roundoff at contact. This tolerance is far smaller than the DEM uncertainty and does not confer physical precision. The report gives unavailable/collision sample counts and the source-resolution counts. Surface distance is checked through the 3D displacement of actual and desired fixed-frame positions; the final coordinates are also reported.

DOI/PDI continuity residuals are measured against independently propagated candidate boundary states. The independent development-time SciPy `solve_ivp` validation replays the exported thrust schedule from the initial state and checks its final result. Tests compare circular energy/period/plane, vis-viva and pericentre, SPICE position/velocity transforms, DEM values, mass and limits, and the complete landing.

## Scope

This is a point-mass, two-body educational trajectory model. It excludes nonspherical lunar gravity, Earth/Sun acceleration, terrain-model errors below the source grid, attitude dynamics, thrust-direction slew, engine transients, communications, lighting, plume effects, contact dynamics and operational flight margins. Real lander catalog entries with unknown propulsion data are not silently completed; the editable demonstration preset is labelled `DEMONSTRATION LANDER — ASSUMED PARAMETERS`.
