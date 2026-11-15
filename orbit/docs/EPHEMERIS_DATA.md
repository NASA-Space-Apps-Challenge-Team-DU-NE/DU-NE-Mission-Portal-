# Mode B static ephemeris inputs

The browser verifies one `frontend/public/data/ephemeris/index.json` file (schema `lunar.ephemeris.v2`, 13,155,940 bytes) against a SHA-256 pinned in TypeScript. It contains the environment and bounded NASA NRHO source states, not a precomputed transfer or landing. The companion manifest is development metadata; no Python, original SPK, external API or calculation server is needed to run the site.

## Coverage and frames

| Purpose | Inclusive UTC bounds |
|---|---|
| Selectable landing time | 2026-11-01T00:00:00Z – 2027-01-31T23:59:59.999Z |
| Environment and reference support | 2026-10-16T00:00:00Z – 2027-02-01T00:00:00Z |

The 16 leading days support up to 14 transfer days, LLO waiting and the computed three-hour precursor. Padding is not an extension of the landing-date input. Full-flight environmental coverage and actual source segment coverage remain mandatory. UTC uses the packaged SPICE UTC/ET mapping; offsets are TDB seconds relative to `epoch_et`. The interval has no leap-second crossing and is never extrapolated.

There are 15,553 environmental samples at nominal 600-second ET spacing. Use adjacent `t_s` values: the last interval is adjusted to the exact end UTC. Earth/Sun geometric states are Moon-centered J2000, SI, with aberration correction `NONE`. The surface frame is `MOON_ME`, resolved to `MOON_ME_DE440_ME421`. Row-major rotation and derivative blocks come from `sxform(MOON_ME,J2000,ET)`.

Environmental positions/velocities and rotation/derivative use cubic Hermite interpolation. State transforms include rotational velocity, and their inverse uses a numerical matrix inverse. GRAIL PA alignment and its separate coefficient GM/radius are unchanged; see [GRAVITY_DATA.md](GRAVITY_DATA.md).

## Direct NRHO departure states

The [NASA/NAIF design SPK](https://naif.jpl.nasa.gov/pub/naif/misc/MORE_PROJECTS/DSG/receding_horiz_3189_1burnApo_DiffCorr_15yr.bsp), [label](https://naif.jpl.nasa.gov/pub/naif/misc/MORE_PROJECTS/DSG/nrho.lbl) and [design paper](https://ntrs.nasa.gov/citations/20190030294) describe a reference trajectory, not an operational Gateway ephemeris. Its 41,020,416-byte original is kept read-only in ignored `data/ephemeris/source-cache/`, outside browser assets.

`scripts/nrho_reference.py` exports only the 51 overlapping original segments (14,451 states), preserving original knots needed at either end. The source is object −60000, Earth center 399, J2000, [SPK type 9](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html), degree 7. Runtime uses the original eight-node Lagrange rule independently on all six state components. It does not treat velocity as the derivative of a new Hermite fit. Exact knots return the recorded state. Shared segment endpoints use original DAF priority; interpolation never spans segment boundaries.

One approximately 0.119 microsecond source gap is retained in `gaps_s` (within the October support padding). Queries strictly inside it fail; no gap filling or clamping is used. Endpoint and gap tests are included.

For each trial, departure time is LLO arrival time minus trial transfer duration. The browser interpolates the original Earth-relative spacecraft state, then adds the DE440 Moon-relative Earth position and velocity. This provides the initial state for the actual finite departure burn. All subsequent states and mass follow the existing numerical dynamics; no later NASA state replaces the computed trajectory. The three-hour pre-departure coast is integrated backwards from that departure, and the displayed coast preview is a separate numerical propagation, not the source stationkeeping path.

The packaged November 12 `reference_seed` is explicitly `validation_only`: it remains for ±1/3/7-day integrator regression, not for production departure lookup. The original source uses different forces and stationkeeping maneuvers, so long-term equivalence to that reference is not claimed.

## Source preservation and validation

Original DE440, lunar orientation, LSK, PCK, GM and NRHO source URLs, byte counts and hashes are recorded in `data/ephemeris/acquisition.json`. All existing originals are reused read-only and checked again after preprocessing. The runtime SHA-256 is `e6e308c593d9e33e527990556ec8750aa79ede74d5507a73f1726ee4a077a20d`.

[Raw validation](ephemeris-data-validation.json) checks 46,656 environment interior epochs and 14,275 NRHO off-knot/segment-boundary epochs against direct SPICE.

| Comparison | Maximum difference |
|---|---:|
| Earth position | 5.71374e-05 m |
| Sun position | 0.00177765 m |
| Surface frame position | 1.67156e-06 m |
| UTC/TDB | 9.16421e-07 s |
| NRHO Earth-relative position | 0.000166278 m |
| NRHO Earth-relative velocity | 2.76377e-08 m/s |

The TypeScript implementation is also checked against 357 exact-ET source fixtures across all segments, including Moon-origin translation, shared endpoints, gaps, corruption and support boundaries. These are source interpolation errors, not navigation accuracy.

Independent complete-mission replay starts from a fresh original-SPICE lookup at the exported full-precision departure ET. It uses direct SPICE frames and Earth/Sun states, independent GRAIL evaluation and SciPy DOP853, applying exported forces/controls continuously without intermediate state resets. Source interpolation (1 mm / 1e-6 m/s limits) is tested separately from unchanged complete-flight agreement limits (0.1 m / 1e-4 m/s), engine, contact, terrain and terminal constraints. Rounded display UTC is not used as the numerical departure epoch. Current representative results and limitations are in [EPHEMERIS_EXPANSION.md](EPHEMERIS_EXPANSION.md); earlier mission reports retain their historical model/asset identity.

## Reproduce

Website: `npm install`, `npm run dev`. Static build: `npm run build`.

Development with source kernels, NumPy, SciPy and SpiceyPy:

```powershell
py scripts/prepare_ephemeris.py --start 2026-11-01T00:00:00Z --end 2027-02-01T00:00:00Z --padding-days 16
# --end is exclusive for landing dates. --download-missing only downloads missing sources.
py scripts/independent_verify_gravity.py
py scripts/verify_gravity_reference_window.py
npm test
node scripts/validate-ephemeris-expansion.mjs
py scripts/independent_verify_ephemeris.py --input .cache/expanded-mission-2026-11-16.json --output docs/ephemeris-expanded-independent-default.json
py scripts/independent_verify_ephemeris.py --input .cache/expanded-mission-2027-01-31.json --output docs/ephemeris-expanded-independent-end.json
```

Changing support or sampling requires reviewing and updating the pinned hash, fixtures and validation. `--seed` now selects only the independent regression seed. Normal users do not run these Python tools.
