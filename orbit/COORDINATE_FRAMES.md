# Coordinate frames, time and model junction

## Unchanged LLO mode

The original engine uses Moon-centred J2000 positions and velocities in SI. Packaged SPICE matrices map MOON_ME terrain coordinates to J2000, including dR/dt in velocity. It retains the original UTC interval, GM, 1737.4 km LOLA reference radius, numerical controls and terrain checks. Regression tests compare both original successful cases to the saved pre-extension numerical results exactly.

## Mode B dated frames and time

Mode B uses Moon-centred positions/velocities with J2000 axes, in metres and metres/second. Earth and Sun states are geometric Moon-relative states, with no light-time or stellar-aberration correction. The lunar origin accelerates, so the spacecraft equations include differential third-body acceleration, not the absolute attraction of Earth/Sun. See [the Mode B equations](docs/EPHEMERIS_MODEL.md).

The static epoch is `2026-11-01T00:00:00Z`. Integrator times are **ET/TDB seconds offset from the packaged `epoch_et`**, not Unix time or naive UTC elapsed seconds. The browser converts UTC with the packaged SPICE UTC/ET mapping and interpolates Earth/Sun positions and velocities using cubic Hermite interpolation. `EphemerisFrames.time()` uses this mapping. R and Rdot are also interpolated, including the derivative of the interpolant.

Let R(t) map MOON_ME to J2000 and D(t)=dR/dt. The full state transform is:

```text
r_I = R r_ME
v_I = R v_ME + D r_ME
r_ME = inverse(R) r_I
v_ME = inverse(R) [v_I - D r_ME]
```

Thus a surface-fixed target has nonzero inertial velocity. Touchdown limits apply to the resulting surface-relative velocity. MOON_ME resolves through the supplied DE440 frame kernel to `MOON_ME_DE440_ME421`; it is the same terrain convention used by the existing LOLA assets.

### Optional GRAIL force frame

Mode B can retain the existing point-mass Moon or use GL1800F harmonics. The latter's coefficients belong to `MOON_PA_DE440`, not the terrain's mean-Earth axes. The static gravity asset includes the SPICE-derived constant `A = R_PA_to_ME`. At each integration epoch:

```text
Q(t) = R_ME_to_J2000(t) A
r_PA = Q(t)^T r_I
a_I = Q(t) a_PA(r_PA)
H_I = Q(t) H_PA(r_PA) Q(t)^T
```

Here `H` is the position derivative of gravitational acceleration. The same rotated Hessian is used in transfer STM propagation. A force-vector rotation does not add `Rdot`, Coriolis or centrifugal terms because the ODE state remains in J2000 axes. The full position/velocity state transform above still requires `Rdot` when constructing the moving surface target. The near-orthogonal packaged rotation is validated; direct SPICE PA→J2000 comparisons and interpolation bounds are documented in [GRAVITY_DATA.md](docs/GRAVITY_DATA.md).

The GL1800F field includes its own central term and GM, `4902800306330.2 m³/s²`. Do not add the legacy point-mass acceleration a second time or substitute the legacy GM into the harmonics. Its coefficient reference radius is 1738.0 km; terrain heights and the 100 km LLO use the separate 1737.4 km LOLA radius. Degree 0 comparisons use the GL1800F GM to isolate noncentral terms, while the selectable legacy point-mass mode preserves its original GM. See [GRAVITY_MODEL.md](docs/GRAVITY_MODEL.md) and [GRAVITY_VALIDATION.md](docs/GRAVITY_VALIDATION.md).

### Dated mission seed and time junction

Each candidate's departure state is read at its actual ET from the original NASA type-9 reference subset. Original Earth-centred J2000 position and velocity are each degree-7 Lagrange interpolated within one source segment, then the geometric DE440 Moon-relative Earth state is added. Original segment priority and gaps are preserved. The November 12 seed in the static pack is only an integrator regression fixture. Browser reference propagation is a new trajectory under the selected lunar field plus dated Earth/Sun differential gravity; no original source samples or stationkeeping impulses are substituted later. The selected field applies continuously through reference propagation, transfer, parking, DOI coast, descent and validation; the standalone LLO model remains separate.

Mode B's time junction is:

1. Convert the requested landing UTC to the ephemeris time coordinate. Design a landing plan in that same time-dependent model and actual lunar attitude; its initial state defines the 100 km osculating circular LLO target.
2. Subtract the candidate transfer duration from the actual LLO arrival epoch to obtain departure. Read the NASA reference subset at that epoch and translate the origin from Earth to Moon. There is no independent departure phase rotation.
3. Apply the numerical departure impulse, propagate transfer, and apply insertion at the **actual** arrival position. Replay parking, DOI and powered descent without resetting the position or substituting a saved target state.
4. Include 10,800 s of numerically integrated coast before departure. Trajectory, event, `nrho.system.body_path` and exported control `start_s` values are elapsed seconds from this full mission start. `reference.controls_time_origin` is `Full mission start`.

Internal `transfer_diagnostic` epochs and `replay_initial.*_et_offset_s` remain offsets from the static ephemeris epoch; `result.nrho.transfer` times are mission elapsed times. Use `reference.start_et_offset_s` to translate between these origins. Do not mix them.

Landing UTC must be within November 1, 2026 through January 31, 2027 inclusive. The entire flight must fit the October 16, 2026–February 1, 2027 support interval, and departure must fall within an actual covered NASA segment (not a gap). Exact UTC equivalents are metadata, not rounded calendar-date arithmetic. No extrapolation, Jacobi conservation or periodic closure assumption is used in Mode B.

## Mass junction

For each impulse, m_after=m_before exp(-|Δv|/(Isp g0)). LLO mass basis works backward to required NRHO mass, then forward through both burns to verify equality. NRHO mass basis works forward, recomputes the landing with the reduced LLO mass, and retargets when the new landing initial state changes. A maximum of three coupling passes is allowed; lack of convergence is reported.

## Three.js and radii

Rendering consumes Moon-centred fixed metre coordinates. Its existing scene mapping is a right-handed axis permutation/scaling, with one scene unit equal to the LOLA lunar radius. Earth, Moon and reference/transfer positions all use the same physical scale. Fixed model L1/L2 positions are neither exported nor displayed. Camera extent changes for system, NRHO, transfer and surface views. Markers and ΔV arrows are explicitly visual aids.

Mode B converts each historical trajectory and reference-preview point using its own epoch's R(t). The displayed curve is therefore a sequence in lunar fixed axes, not an inertial snapshot rotated using one fixed epoch. Earth position and sunlight direction use the current playback time through `body_path`. Solar direction is visualized without compressing the Sun's physical distance into a fictitious nearby body. Lighting aids do not constitute an eclipse or terrain illumination calculation.

JPL orbit extrema use radius 1737.1 km. Terrain and 100 km LLO use radius 1737.4 km. GL1800F's 1738.0 km coefficient radius does not rescale the rendered Moon or redefine terrain altitude. Transfer altitude is spherical-reference altitude, not DEM clearance; the UI distinguishes it from descent terrain altitude. The terrestrial visual radius is taken from the existing PCK kernel. No raw SPICE kernel is loaded by the browser.
