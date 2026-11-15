# Browser integration contract

The application has no HTTP calculation API. Integrations use a typed input object and a dedicated Web Worker. All runtime assets are static; there is no Python, Node API process, database, secret, or cross-origin data service.

The input uses planetocentric latitude and east-positive longitude in degrees in the `MOON_ME` realization linked by `moon_de440_250416.tf` to `MOON_ME_DE440_ME421`. LLO and Mode B accept UTC ISO strings. Public state vectors and masses use SI.

```typescript
const config = {
  target: {
    latitude_deg: -89.4441,
    longitude_deg: -137.291,
    landing_time_utc: '2026-11-16T00:00:00Z'
  },
  lander: {
    initial_mass_kg: 1500,
    dry_mass_kg: 650,
    max_thrust_n: 12000,
    min_thrust_n: 0,
    isp_s: 320
  },
  orbit: { altitude_km: 100, pdi_altitude_km: 15 },
  constraints: {
    position_tolerance_m: 100,
    speed_tolerance_m_s: 2,
    horizontal_speed_tolerance_m_s: 1
  },
  objective: 'fuel'
};
```

For the default LLO input, `initial_mass_kg` is the mass before DOI. The engine accounts for DOI propellant before powered descent. NRHO inputs interpret mass according to `mass_basis`, described below. The default lander is a hypothetical demonstration preset. Candidate search is bounded; `fuel` / `time` ranks the candidates actually explored, not a proof of the global optimum.

A computed result preserves the input and supplies trajectory samples, maneuvers, validation checks, and summary quantities. In LLO and Mode B, `position_m` and `velocity_m_s` are Moon-centered J2000; `fixed_position_m` is Moon-centered MOON_ME at each sample epoch. Surface-relative velocity includes the derivative of the SPICE rotation, not merely a rotated inertial velocity. LLO/landing `altitude_m` is measured above the available DEM. A value of `null` means unavailable, never zero. Worker data-error results can contain only status, message and empty trajectory/summary/validation; clients must not assume successful-result metadata exists.

Trajectory geometry must be taken from computed samples. UI interpolation is solely for playback between numerical samples. A failed trajectory, if shown for diagnostics, retains a non-success status.

See `frontend/src/types.ts`, the Worker entry and the service wrapper for the executable message contract. These files are the canonical interface. A later Navigator integration can construct this object from its catalog without depending on its UI or data pipeline.

## Configuring the Mode B NRHO mission

`initial_orbit` defaults to `llo`. Set it to `nrho` and supply `nrho: NRHOSettings` from `frontend/src/types.ts`. Its optional `mode` accepts only `'b'`; omission also selects Mode B. Explicit retired or unknown modes are rejected before asset loading/calculation. A complete Mode B settings object is:

```typescript
const datedConfig = {
  ...config,
  initial_orbit: 'nrho',
  nrho: {
    mode: 'b',
    transfer_tof_min_days: 0.3,
    transfer_tof_max_days: 3,
    max_transfer_delta_v_m_s: 2500,
    parking_revolutions: 0,
    objective: 'delta_v',
    max_iterations: 20,
    max_computation_seconds: 60,
    mass_basis: 'llo'
  }
};
```

`reference_id`, `departure_phase_mode` and `departure_phase` are no longer input fields. For an explicitly dated legacy Mode B request, they are discarded during normalization and are absent from new result inputs. `mode: 'a'` is rejected instead of being reinterpreted. Departure is derived from landing UTC and transfer duration using the bounded NASA type-9 reference subset. The input source selector is fixed; actual source identity is result metadata.

## Mode B result conventions

`target.landing_time_utc` determines the actual landing epoch. Selectable landing times cover November 1, 2026 through January 31, 2027 inclusive (`landing_coverage_utc`); environment/reference support runs October 16 through February 1 with pre-landing padding. Source-segment gaps are rejected. Full-flight coverage, including pre-departure coast, is checked. A landing date inside the environment range is insufficient on its own. The browser does not extrapolate or fetch a missing date from an external API.

`result.nrho.mode` and `reference.mode` are `EPHEMERIS`, with `reference.mode_b_implemented: true`. Optional `nrho.ephemeris` holds `coverage_utc`, the static `epoch_utc` and `reference_epoch_utc`. `nrho.source` identifies the NASA type-9 design reference. `reference_epoch_utc` is the selected departure time, not the November 12 integrator-test seed. `reference.reference_seed` contains the actual departure state and full-precision `epoch_et`/`epoch_t_s`; use ET for numerical replay because display UTC is rounded to milliseconds. CR3BP-specific period, mass-ratio and scale fields are optional and absent from Mode B source metadata. Computed preview duration/extrema live in `reference.reference_preview_*`; they are not assertions of periodicity.

`nrho.reference_path_fixed_m` is numerically propagated, with each point transformed at its own epoch. `nrho.system.body_path` contains mission-relative `time_s` plus Earth/Sun MOON_ME positions for playback. L1/L2 fields and display markers are removed from the result type. All spacecraft phases use the selected lunar point-mass or GRAIL + differential Earth/Sun model, with actual date-dependent lunar orientation for surface quantities.

Trajectory samples, event times, `nrho.transfer` times and control `start_s` values share the **full mission elapsed-time origin**; `reference.controls_time_origin` states this. Internal `transfer_diagnostic` times and `replay_initial.*_et_offset_s` instead use ET/TDB seconds offset from the static ephemeris epoch. `reference.start_et_offset_s` relates the two. Never treat either value as Unix seconds. Mode B's NRHO/TRANSFER altitude is spherical-reference altitude; parking and landing samples use DEM clearance.

The default dated transfer search evaluates 9 TOFs and 2 branches. The NASA type-9 subset is directly queried at each departure epoch and translated from Earth to Moon origin; it is not independently phase-rotated or obtained by propagating a fixed November seed. The solver returns no fabricated path when all candidates fail. Some failures have no `nrho` field, so integrations should read status/message and tolerate absent reference metadata.

## Common result and Worker handling

The full trajectory uses phases `NRHO`, `TRANSFER`, optional `PARKING`, `CIRCULAR`, `COAST`, `POWERED_DESCENT`. Samples on either side of an impulse can share a timestamp and position while carrying different velocities and masses. Do not smooth over these physical impulses or replace the insertion position with its target. Full-mission results include all burn costs, the NRHO start mass, reduced LLO mass and final mass. `global_optimality_proven` remains false.

`replay_initial` and the 24 exported controls support independent reproduction; check the mode-specific state units and time origins before replaying them. `VALIDATED` requires the configured model checks, not merely optimizer convergence. `NUMERICALLY CONVERGED`, `TRANSFER NOT CONVERGED`, `INFEASIBLE UNDER ASSUMPTIONS` and `DATA UNAVAILABLE` are not successful landings. A computed diagnostic trajectory may still exist for a non-success result and must retain that status.

The service posts `{ type: 'RUN', id, config, assetBase }` to a module Worker. Replies are `{ type: 'PROGRESS', id, message }`, `{ type: 'RESULT', id, result }` or `{ type: 'ERROR', id, error }`. The Worker loads the selected model's static dataset and computes the result. `assetBase` must resolve to the deployed static data directory; no HTTP calculation endpoint is involved.

Cancellation terminates the Web Worker and rejects its pending promise with `AbortError`; clients should ignore that error as a user cancellation. A main-thread timer also enforces the configured NRHO budget and returns `TRANSFER NOT CONVERGED` with an empty path on expiry. No external JPL/API calculation is made at runtime.

The UI's failure guidance distinguishes data coverage/integrity, reference departure coverage, propulsion limits, transfer constraints and numerical failure. Recommendations use UTC/TOF changes; removed model/phase controls are never suggested. The typed contract and source remain authoritative: see [types.ts](../frontend/src/types.ts), [Worker](../frontend/src/workers/simulation.worker.ts), [service](../frontend/src/services/simulation.ts), [Mode B model](EPHEMERIS_MODEL.md) and [coordinate conventions](../COORDINATE_FRAMES.md).


Mode B additionally accepts optional `nrho.powered_descent_duration_s` (260–1200 s) and `nrho.approach_heading_deg` (0 inclusive to 360 exclusive, north-clockwise). Omitted values explore the bounded duration/direction set. The startup example comes from `frontend/src/defaultMission.ts`; its 880 s and 180° settings do not override `demo-terminal-v1` safety limits. Mode B exports 96 ODE acceleration controls with the actual duration; do not assume the historical 24-control layout. See [the validated default](SUCCESSFUL_DEFAULT.md).
