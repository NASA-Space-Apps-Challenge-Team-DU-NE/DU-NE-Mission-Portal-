# Model and implementation limits

Mode B now enforces the [demo terminal envelope and radial contact proxy](docs/TERMINAL_DESCENT.md). These assumed limits reject dangerous endpoint-converged paths; they do not add attitude dynamics or real landing-gear geometry. Historical VALIDATED results predate this gate.


This is an educational trajectory design experiment, not flight software or a NASA-certified mission solution. Its validation statements apply to the implemented deterministic model and supplied data, at the documented numerical tolerances.

## Dynamics and propulsion

- Existing LLO descent uses a spherical point-mass Moon and JPL DE440 GM. Mode B selects either the unchanged lunar point-mass baseline or a truncated GRAIL GL1800F spherical-harmonic field, with date-dependent differential Earth/Sun accelerations throughout reference propagation, transfer, parking, DOI coast and powered descent. Missing gravity settings preserve the point-mass baseline. Other planets, radiation pressure and relativistic corrections remain absent.
- The GRAIL option represents an estimated static field, not every contribution to physical lunar gravity. The browser supports degree/order 20, 30, 60 and 90; the source extends to 1800. Degree 0 is a same-GM validation baseline. Time-varying solid-body tides and the permanent degree-2/3 tide excluded by the source are not added. Higher degree costs more arithmetic per force evaluation and does not certify landing accuracy; differences against degree 90 are not an error estimate against the full field. See [GRAVITY_MODEL.md](docs/GRAVITY_MODEL.md) and [GRAVITY_DATA.md](docs/GRAVITY_DATA.md).
- GL1800F coefficients use fully normalized real harmonics without the Condon–Shortley phase in MOON_PA_DE440. The force is transformed through the supplied PA→ME alignment and dated ME→J2000 attitude. Its 1738.0 km coefficient radius and its GM are distinct from the 1737.4 km LOLA height radius and legacy point-mass GM. External harmonic expansion and downward continuation near the surface retain model limitations; they are not terrain mass reconstruction.
- The engine assumes continuous throttling over the selected range, instantaneous changes of thrust direction at segment boundaries, and constant specific impulse. Attitude dynamics, gimbal slew, engine start/stop transients, plume interaction and landing gear are absent.
- Existing LLO DOI remains impulsive. Mode B integrates finite departure, insertion and DOI burns with constant maximum thrust and a fixed inertial direction per burn, including mass flow. This remains a restricted propulsion model without attitude or ignition transients. See [FINITE_BURNS.md](docs/FINITE_BURNS.md).
- The demonstration lander has assumed parameters. The original lander catalog is retained as provenance, and unsupported values are not filled in as real mission facts.
- The landing segment designs its initial orbit plane and phase for the target, and the NRHO solver targets that exact state. This is not a maneuver planner from an arbitrary pre-existing operational spacecraft state. Earth launch, launch windows and operational communications constraints are outside scope.

## NRHO reference mission

- Mode B uses the landing UTC and preprocessed SPICE states/rotations with browser numerical propagation; it does not run CSPICE in the browser. UTC is applicable to LLO and Mode B.
- JPL secondary radius 1737.1 km and LOLA reference radius 1737.4 km are distinct. Reference peri/apo altitude uses the former; transfer/landing clearance uses the latter. Their values are exported explicitly.
- Mode B directly interpolates the NASA/JSC reference SPK subset at each trial departure epoch. That source used a different force model and stationkeeping impulses. Only the selected departure state is imported; all later spacecraft states are outputs of the browser's documented model. The three-hour precursor and coast preview are separately integrated model paths, not the original SPK history. Neither the source nor this replay is a flown Gateway operational trajectory. No exact period or Jacobi invariant is claimed for Mode B; preview extrema describe only its computed time window.
- Mode B supports landing UTC from 2026-11-01 through 2027-01-31 inclusive. Packaged states/attitudes/reference support runs from 2026-10-16 through 2027-02-01, with leading padding for transfer and waiting. Source segments and one tiny gap are retained; no gap interpolation is allowed. Exact endpoints are metadata; UTC and TDB elapsed time are not identical. A supported landing date alone does not guarantee supported departure or whole-flight coverage. Data is never extrapolated.
- Mode B retargets finite departure/insertion burns to all six arrival states and propagates finite DOI continuously. Stationkeeping, Earth/Sun eclipses and NRHO rendezvous constraints are not simulated.
- Bounded time/short-or-long seed search is not global ΔV/time optimization. Mode B compares costs across complete finite-burn missions, with candidate diagnostics and an explicit incomplete-search flag. Mode B has no independent phase knob and derives departure from landing UTC, the landing plan and transfer duration. The search may miss feasible solutions. A time-limited search can return its best already verified candidate and reports the limit; it never fabricates a missing solution.
- Transfer collision screening uses a 12 km margin above the LOLA reference sphere with adaptive integration and spatial step control. It is model screening, not an interval-proof collision guarantee or local hazard certification. Existing DEM validation is repeated for parking and descent.
- LLO mass basis derives the required NRHO starting mass, with no additional tank-volume or maximum vehicle-mass constraint. NRHO mass basis consumes transfer propellant before recomputing descent and rejects dry-mass violations.
- Maximum thrust includes both one-sided values at each piecewise-control boundary. Attitude and real engine transient constraints remain excluded.

## Numerical optimization

- The solver forward-integrates a seven-state position/velocity/mass ODE. A seed shape can initialize thrust commands, but seed geometry is never a returned flight path.
- A finite search over duration, direction and phase uses a low-dimensional shooting correction to piecewise thrust commands. It does not explore every possible continuous control history, prove physical impossibility, or prove a global fuel/time optimum.
- Non-convergence is reported as a search/numerical outcome. A trajectory failing position, velocity, propellant, thrust, continuity, data or collision requirements cannot be labeled a validated landing.
- Integration and collision checks have finite step sizes. Step refinement checks numerical consistency, not the accuracy of the physical model or terrain measurements.
- Missing/corrupt gravity data, non-finite gravity evaluation and exhausted compute budgets are separate failures, not proofs of physical impossibility. A GRAIL failure never silently switches to point mass. Model/degree changes clear the displayed mission result.
- The same-control gravity diagnostic starts only at the successful mission's actual PDI state and uses the same inertial acceleration commands with GL1800F's degree-0 GM. It compares endpoint states at the GRAIL final epoch, without finding a new touchdown or validating baseline terrain clearance. It is neither a full NRHO mission comparison nor a second validated landing. Session-history comparisons use separately optimized, validated missions with identical non-gravity inputs; their numerical differences do not isolate force-model effects alone.

## Terrain and coordinates

- Southern landing validation uses the available 240 m LOLA grid and bilinear interpolation. Grid spacing is not a guarantee that hazards of that size are fully measured. Boulders, craters below the grid scale, slope safety, footprint clearance, dust and sub-pixel peaks are not validated.
- Global data supports high-altitude clearance checks. Coarse global terrain is not accepted as a substitute for local 240 m landing data.
- Missing terrain is explicitly unavailable, never zero-height terrain. The UI does not claim detailed terrain validation outside the supported landing region.
- No new 5 m, 10 m or 20 m DEM or observation-density volumes are loaded. Thus `ldec=0` measurement density is not evaluated in this release. A future high-resolution implementation must distinguish interpolated cells from observations.
- NASA LOLA's DE421 mean-Earth mapping is paired with the NAIF DE440 frame realization aligned to DE421. The frame-kernel discussion describes small realization differences; this is not perfect datum equivalence.
- The original LLO table and Mode B ephemeris pack have separate finite intervals. Extending either requires preprocessing and validating new static data. Loading Mode B does not change the original LLO date interval.
- UTC/ET conversions and frame interpolation are checked against SpiceyPy during preprocessing. The browser interpolates the packaged state-transform data; it does not load a full SPICE runtime or raw kernels.

## Product scope

- There is no runtime server, database or HTTP calculation API. The integration surface is a typed Web Worker input/result contract.
- Results are local to a browser session unless exported. No background computation continues after the page or Worker is closed.
- Rendering uses numerical trajectory samples with playback interpolation. In Mode B, each trajectory/reference point is expressed in MOON_ME at its own sample epoch, while Earth position and solar lighting follow the playback epoch. CR3BP's static L1/L2 markers are hidden in Mode B. Orbital distances, celestial radii and terrain elevations retain physical scale; marker sizes and lighting aids are visual choices, not an eclipse or illumination safety analysis.
- The source site was investigated from a local clone because connected GitHub access returned 404. This verifies the local snapshot's style, not the current inaccessible remote head.
- The exact test outcomes and any remaining UI verification limits are recorded in [VALIDATION.md](VALIDATION.md) and [GRAVITY_VALIDATION.md](docs/GRAVITY_VALIDATION.md); the presence of a feature in this document is not evidence that every possible input is solvable.
