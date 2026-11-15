# NRHO source data and reproducible reference selection

This extension uses an actual NASA/JPL periodic-orbit response and an independently propagated Earth–Moon CR3BP reference orbit. It does not identify the selected row with a dated Gateway operational trajectory. Runtime assets are static; the browser does not call JPL, SPICE, or Python.

## JPL acquisition and data contract

The exact query is [Earth–Moon, halo, L2, southern branch, 6–7 days](https://ssd-api.jpl.nasa.gov/periodic_orbits.api?sys=earth-moon&family=halo&libr=2&branch=S&periodmin=6&periodmax=7&periodunits=d). The response has API signature version `1.0`, 102 rows, and fields `x,y,z,vx,vy,vz,jacobi,period,stability`. JPL defines barycentric rotating coordinates, dimensionless state/time, LU as primary separation, and TU as inverse angular speed. The response's secondary radius is in kilometres. [JPL API documentation](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html)

The untouched 22,919-byte response is `data/nrho/jpl-earth-moon-l2-southern-halo-6-7days.json`; SHA-256 `de4a61474cacc2b3ee10670ad5ef081db4a8cb6130c34248caf8c3c60a945f6d`. The recorded acquisition time is `2026-11-14T21:36:41.594703Z`. `data/nrho/acquisition.json` retains the query, schema, hash and count.

`frontend/public/data/nrho/reference.json` exports:

| Field | Meaning / value |
|---|---|
| `system.mu`, `system.mass_ratio` | `0.01215058560962404` |
| `system.lunit_km` | `389703.264829278` km |
| `system.tunit_s` | `382981.289129055` s |
| `system.moon_radius_km`, `system.radius_secondary_km` | JPL secondary radius `1737.1` km |
| `system.terrain_reference_radius_km` | Existing LOLA spherical reference radius `1737.4` km |
| `system.L1` | `[0.836915125772357,0,0]`, unchanged API coordinates |
| `system.L2` | `[1.15568216544488,0,0]`, unchanged API coordinates |
| `initial_state`, `state_nd` | Identical raw selected row's six values; LU and LU/TU |
| `period_nd` | `1.4844142287293904` TU |
| `moon_fixed_to_synodic` | Row-major 3×3 constant rotation B described below |
| `validation.independent_reference_states` | 17 SciPy states through one period for browser cross-checks |

The 300 m radius difference is preserved explicitly. Reference-orbit peri/apo altitude fields use the JPL radius; landing and terrain altitudes use the LOLA radius. SI lunar GM in the existing landing model is also distinct from the value implied by JPL's normalized constants. Neither is silently overwritten.

## Candidate selection and independent propagation

NASA's Gateway FAQ describes approximately 1,500 km closest approach, 70,000 km farthest approach and a 6.5-day period. These are approximate descriptive targets, not an exact set of simultaneous CR3BP constraints. [NASA Gateway FAQ](https://www.nasa.gov/gateway-frequently-asked-questions/)

`scripts/prepare_nrho.py` propagates all 102 returned rows with SciPy DOP853. It samples the trajectory and refines interior radial extrema, rejects collision or failed closure/conservation checks, and ranks the 99 eligible rows by

```text
((perilune_altitude_km-1500)/1500)^2
+ ((apolune_altitude_km-70000)/70000)^2
+ ((period_days-6.5)/0.5)^2
```

Those weights and eligibility thresholds are this project's documented choices. The full candidate metrics are in `data/nrho/candidate-propagation.json`. Row 42 (zero based) ranks first and is then propagated more tightly with `rtol=5e-14`, `atol=5e-15`, maximum step `period/2048`. Its initial state is not corrected or synthesized:

```json
[1.0199980623062246, 2.1160308577002953e-27, -0.1806643468271845,
 -2.5788917015758105e-13, -0.09880598885992746, -3.991534879589688e-12]
```

| Independent result | Value |
|---|---:|
| Period | 6.579894385651548 days |
| Perilune / apolune, JPL radius | 1,244.024941 / 69,774.396034 km |
| Perilune / apolune, LOLA radius | 1,243.724941 / 69,774.096034 km |
| One-period position closure | 0.000130958 m |
| One-period velocity closure | 1.410×10⁻⁹ m/s |
| Maximum sampled Jacobi drift | 3.877×10⁻¹³ |
| API stability index | 1.26520943665633 |

Closure and conservation measure numerical reproduction of the ideal model, not operational accuracy or stability. The orbit is labelled a Gateway-like southern L2 reference halo. `docs/nrho-data-validation.json` records the measurements and ranking.

## How the official mission references differ

The lunar relay SRD is baseline 2022-12-05, Revision B with DCN 001 dated 2023-03-22. Appendix B.5, printed page 61 / PDF page 70, provides dated reference paths for coverage analysis. Figure B-1 illustrates an apoapsis departure, 100×100 km LLO with three revolutions, lowering toward 15 km and a south-pole landing sequence. This supplies an architectural example; its particular departure phase and dated path are not imposed on this simulator's search. [NASA Lunar Relay Services SRD, Appendix B.5](https://www.nasa.gov/wp-content/uploads/2025/08/lunar-relay-services-requirements-document-srd.pdf)

The 2024 HLS targeting paper instead uses a reference NRHO with about 3,500 km perilune and 70,000 km apolune. Its example departs roughly 12 hours before perilune, targets 100 km LLO, permits tracking revolutions, then uses DOI toward 15 km and powered descent. It discusses lunar rotation, landing-site/approach-dependent LLO targeting, and numerical Earth/Moon/Sun correction following an approximate targeting seed. Our CR3BP transfer is a simpler reference model and does not reproduce that flight targeting algorithm or its full perturbation model. [Dukeman and Krolick, Autonomous Burn Targeting for a Lunar Sortie Staged From a Near-Rectilinear Halo Orbit, NTRS 20240009379](https://ntrs.nasa.gov/citations/20240009379)

The FAQ's 1,500 km value, HLS paper's 3,500 km reference and relay SRD's particular trajectory are therefore kept separate. Combining them into one supposed NASA mission state would be unsupported.

The two PDFs were read and their relevant figures rendered locally for inspection. Local copies are reference documents, not browser payloads:

| Local document | Bytes | SHA-256 |
|---|---:|---|
| `data/nrho/reference-documents/lunar-relay-services-requirements-document-srd.pdf` | 1,619,912 | `4779d15380ae16bd8fc40588ca1dafc938730bec4871dcbb76c49e116e9e8c75` |
| `data/nrho/reference-documents/HLS_Targeting_Logic_AAS_2024_Paper.pdf` | 2,865,463 | `2c2477b7d477e2b3266d337bf09950cdcd9d569f15482006210e011254515b38` |

## Frozen terrain alignment and relative time

The existing five locally cached NAIF kernels are reused offline: `naif0012.tls`, `pck00011.tpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, and `moon_de440_250416.tf`. The loaded lunar frame kernel resolves `MOON_ME` to `MOON_ME_DE440_ME421`. [NAIF generic kernels](https://naif.jpl.nasa.gov/naif/data_generic.html)

At `2026-11-16T00:00:00Z`, preparation obtains the geometric Earth→Moon J2000 position r and velocity v with aberration correction `NONE`. It forms x=unit(r), z=unit(r×v), y=z×x and E=[x,y,z]. If F is the actual SPICE MOON_ME→J2000 rotation, B=EᵀF maps terrain axes into the frozen synodic reference. B's orthogonality error is 8.02×10⁻¹⁶ and determinant 1.0000000000000004. Full source state and E/F are retained in `reference.json.alignment`.

Mode A subsequently uses its own uniform CR3BP spin, `Rz(t/TU) B`, with landing at relative t=0. The one-epoch calibration provides a documented terrain orientation; it does not make the NRHO or transfer a real UTC ephemeris. Velocity transformations include the angular-rate cross-position term. The separate dated [Mode B model](EPHEMERIS_MODEL.md) uses a NASA reference seed and static DE440 ephemeris; this document describes Mode A. The spherical Earth visualization uses the actual PCK equatorial radius 6,378,136.6 m; flattening is omitted.

## Existing-data preservation and reproduction

The actual Downloads known-folder path was rechecked as `C:/Users/hach0/Downloads`. All 16 original local source records retain their baseline SHA-256 values. The existing truncated `ldem_128.img` remains rejected and unchanged. Drive was re-listed read-only, including the data root, required README/rules/log, catalogs, SPICE folder, LOLA folder and reference-table folder. Relevant metadata did not indicate a new catalog/kernel/DEM version. The connector omitted checksum/version fields, so remote byte equality is not claimed. No NRHO API reference was present in the checked source locations.

The exact read-only evidence is in `data/nrho/drive-recheck.json` and `docs/nrho-data-audit.json`. No Drive upload, source-folder edit, or NASA terrain/kernel re-download occurred. New downloads were the 22,919-byte query and the two specifically referenced PDFs.

Run `python scripts/prepare_nrho.py` with NumPy, SciPy and SpiceyPy plus the existing local `data/config.json` sources. It reads cached raw data by default. `--fetch` only retrieves the fixed official query if that cache is absent, caps it at 2 MB and writes inside this project; an existing response is never overwritten. The browser consumes only `frontend/public/data/nrho/reference.json` and the already prepared terrain assets.

After `node scripts/run-nrho-validation.mjs` generates `.cache/nrho-mission-result.json`, run `python scripts/independent_verify_nrho.py`. That separate verifier directly implements CR3BP acceleration, SI rotating-frame conversions, rocket-equation impulses, and seven-state lunar thrust dynamics. It starts from the original JPL row, replays departure, transfer, insertion, parking, DOI and all controls with DOP853, preserving propagated residuals. `docs/nrho-independent-validation.json` records comparisons and model limits; it is not an independent terrain hazard certification.

The default exported mission passed all 14 independent checks. Reintegrating the saved departure state gives a 0.0000441 m transfer-target residual; reconstructing the departure from the original JPL row gives 0.0001182 m. The latter residual is retained through insertion and descent. The final independent state differs from TypeScript by 0.0000704 m, 8.24×10⁻⁸ m/s and 3.41×10⁻¹² kg. Surface-relative terminal speed is 0.500000317 m/s and final mass is 856.794654 kg. These values are numerical checks within the piecewise model; they do not describe real mission accuracy. Each report records the exact exported input's SHA-256.
