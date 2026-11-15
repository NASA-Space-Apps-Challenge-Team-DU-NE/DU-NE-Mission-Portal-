# DATA AUDIT — 2026-11-15 KST

## Scope and preservation

The independent simulator uses existing NASA data and publishes only derived static assets. Python is an offline preprocessing/verification tool, not a runtime server. No existing repository, Downloads source, or Google Drive source was changed. No science raw-data download was needed. Four small current catalog snapshots (257,264 bytes total) were materialized from Drive into the new project; `sites.json` and `landers.json` contain substantive corrections compared with the old Downloads copies. The unchanged manifest and terrain-source snapshots are retained for reproducibility; they were read via the connector after its text representation returned empty content. The existing originals remain intact.

The OS Downloads location was read from Windows User Shell Folders Known Folder `{374DE290-123F-4565-9164-39C4925E467B}`: `C:/Users/hach0/Downloads`. Only relevant lunar source files were hashed and used. The main reusable data root is `C:/Users/hach0/Downloads/DU_NE Data`. A second pre-existing source is the current workspace's `outputs/global_data_2026-11-14/data/LOLA_DEM_Global`.

## Drive review before preparation

Read the current [data folder](https://drive.google.com/drive/folders/1u3A21Su1smMEnUlx3kpJC99qzWuxtrX2), [README](https://drive.google.com/file/d/1lL4mwXuResP7Onx-nvhxc0g-hFXHI9MZ/view), [modification rules](https://drive.google.com/file/d/11SP_l1VbpAwcCAP2uTyWxQnEc363YEKL/view), [change log](https://drive.google.com/file/d/1BD53wJJ13FVO_lsCqqjBRjmfvGkvwUNR/view), and all four requested catalogs. Read-only snapshots and folder metadata are in `docs/drive_snapshot/`. The source documents instruct preservation of raw data; no source edits or uploads were made, so their write workflow was not invoked.

Current Drive metadata was compared by product name, byte count, generation/version evidence, and local SHA-256. The connector omitted `sha256Checksum`, `md5Checksum`, and `version` even when explicitly requested. **Remote full-byte hash equality is not claimed for the reused DEM or kernels.** Current Drive byte counts match the reused required files; their content is checked by label structure, frame load/coverage, and numerical tests. The global TIFF SHA-256 equals the hash in the current Drive collection README. That is a recorded remote provenance match, not an independent re-download comparison.

## Inventory

The JSON inventory in `docs/data_inventory.json` contains machine-readable original paths, project paths, sizes, SHA-256, current Drive IDs, metadata times, status, product/version and calculation stage. A source's old generation date is not a reason to replace a valid product.

### ldem_75s_240m.img — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_75s_240m.img`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_75s_240m.img`
- Bytes: `29062688`
- SHA-256: `d031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490`
- Version/product: `V2.0`
- Product generation time: `2017-06-15`
- Drive file ID: `1Zm83CD4RSXWKAosfXZWJslTXxRcjumxh`
- Drive modified UTC (not product age): `2026-11-13T23:27:09.006Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `native terrain height, tile export, collision model`
- [Original source](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img)

### ldem_75s_240m.lbl — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_75s_240m.lbl`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_75s_240m.lbl`
- Bytes: `4990`
- SHA-256: `ec07239f41d8abc1a3681495b5799b770c7206b5268b76721d69180df0422e02`
- Version/product: `V2.0`
- Product generation time: `2017-06-15`
- Drive file ID: `1G_Vdcv0MBqmi6z3_8n6OjM7cs9I9Z5Ep`
- Drive modified UTC (not product age): `2026-11-13T23:27:09.017Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `native terrain height, tile export, collision model`
- [Original source](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.lbl)

### de440s.bsp — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\de440s.bsp`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\de440s.bsp`
- Bytes: `32726016`
- SHA-256: `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`
- Version/product: `de440s.bsp`
- Drive file ID: `1Nr7BYjPwIJVhmCARmA7VDusUWaz6TLov`
- Drive modified UTC (not product age): `2026-11-13T23:27:39.194Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `static MOON_ME/J2000 state transform export`
- [Original source](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp)

### moon_pa_de440_200625.bpc — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\moon_pa_de440_200625.bpc`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\moon_pa_de440_200625.bpc`
- Bytes: `12863488`
- SHA-256: `60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f`
- Version/product: `moon_pa_de440_200625.bpc`
- Drive file ID: `1NcfHAWHF8SqnKmiSH3HOSzN1rnZ8og5X`
- Drive modified UTC (not product age): `2026-11-13T23:27:39.829Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `static MOON_ME/J2000 state transform export`
- [Original source](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc)

### moon_de440_250416.tf — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\moon_de440_250416.tf`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\moon_de440_250416.tf`
- Bytes: `19478`
- SHA-256: `a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768`
- Version/product: `moon_de440_250416.tf`
- Drive file ID: `1hT24jorYk9jAva5j_nUcaY325bHmpAXt`
- Drive modified UTC (not product age): `2026-11-13T23:27:39.209Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `static MOON_ME/J2000 state transform export`
- [Original source](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf)

### naif0012.tls — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\naif0012.tls`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\naif0012.tls`
- Bytes: `5257`
- SHA-256: `678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b`
- Version/product: `naif0012.tls`
- Drive file ID: `1ke0mZyijf9yTbvx6ilAVDVjXRGZkJ5Y-`
- Drive modified UTC (not product age): `2026-11-13T23:27:39.842Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `static MOON_ME/J2000 state transform export`
- [Original source](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls)

### pck00011.tpc — REUSED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\pck00011.tpc`
- Used path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\SPICE_Kernels\pck00011.tpc`
- Bytes: `131226`
- SHA-256: `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1`
- Version/product: `pck00011.tpc`
- Drive file ID: `1A2WEqYQ-Bcr52VR7vLRWgCZl6vtVJV7X`
- Drive modified UTC (not product age): `2026-11-13T23:27:39.857Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `static MOON_ME/J2000 state transform export`
- [Original source](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc)

### sites.json — REFRESHED_PROJECT_COPY

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Catalogs\sites.json`
- Used path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\Lunar-Landing-Orbit-Simulator\data\catalogs\sites.json`
- Bytes: `15036`
- SHA-256: `d880a9f9ecae26cc3fd0569819a55ade16c2676385067c2fef3b01b98e1d170d`
- Version/product: `sites.json`
- Drive file ID: `1rVSw8fr6XxL89WQe8R8UF-G-SvPbRdld`
- Drive modified UTC (not product age): `2026-11-14T19:38:43.527Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `catalog input/provenance review`
- [Original source](https://drive.google.com/file/d/1rVSw8fr6XxL89WQe8R8UF-G-SvPbRdld/view?usp=drivesdk)

### landers.json — REFRESHED_PROJECT_COPY

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Catalogs\landers.json`
- Used path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\Lunar-Landing-Orbit-Simulator\data\catalogs\landers.json`
- Bytes: `1969`
- SHA-256: `d18ab88f3bac0112b23e1165aeb026eb62f13ffdc5b327822280739d98f7e3aa`
- Version/product: `landers.json`
- Drive file ID: `1UAaMs0F29m_HXiOzmVwvJZ8okHBDPzEz`
- Drive modified UTC (not product age): `2026-11-14T19:38:43.394Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `catalog input/provenance review`
- [Original source](https://drive.google.com/file/d/1UAaMs0F29m_HXiOzmVwvJZ8okHBDPzEz/view?usp=drivesdk)

### data_manifest.json — REUSED_CONTENT_PROJECT_SNAPSHOT

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Catalogs\data_manifest.json`
- Used path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\Lunar-Landing-Orbit-Simulator\data\catalogs\data_manifest.json`
- Bytes: `226930`
- SHA-256: `09c877ec91ad049456ff775a3fa8b32bac422efe79b7b4673d662816d0d22daa`
- Version/product: `data_manifest.json`
- Drive file ID: `16sfUTqHNfjwT0Ws5ZLFkArolX_0AsoyI`
- Drive modified UTC (not product age): `2026-11-13T23:27:08.259Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `catalog input/provenance review`
- [Original source](https://drive.google.com/file/d/16sfUTqHNfjwT0Ws5ZLFkArolX_0AsoyI/view?usp=drivesdk)

### terrain_sources.json — REUSED_CONTENT_PROJECT_SNAPSHOT

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Catalogs\terrain_sources.json`
- Used path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\Lunar-Landing-Orbit-Simulator\data\catalogs\terrain_sources.json`
- Bytes: `13329`
- SHA-256: `a7e3ca153b1c4459eaf43ab9797c880f987f0ddc3ae4bf7d51056d2af92bc21a`
- Version/product: `terrain_sources.json`
- Drive file ID: `1YTPBungZs95ud45N-_pFd7aZv1ysWMb7`
- Drive modified UTC (not product age): `2026-11-13T23:27:08.341Z`
- Drive size matches: `True`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `catalog input/provenance review`
- [Original source](https://drive.google.com/file/d/1YTPBungZs95ud45N-_pFd7aZv1ysWMb7/view?usp=drivesdk)

### ldem_4_uint.tif — REUSED

- Original path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\outputs\global_data_2026-11-14\data\LOLA_DEM_Global\ldem_4_uint.tif`
- Used path: `C:\Users\hach0\OneDrive\Documents\ChatGPT\스페이스앱\outputs\global_data_2026-11-14\data\LOLA_DEM_Global\ldem_4_uint.tif`
- Bytes: `2076866`
- SHA-256: `e6668bec27fc9b8fbb02d198c7ddfb08eedeeb790167b494f95e6b34201da05e`
- Version/product: `NASA SVS4720 2019 4ppd`
- Product generation time: `2019-06-04T16:14:59`
- Drive file ID: `1UoLm92sn5Ul3HbHx03VhCeNuaQmZhbBq`
- Checksum comparison: `MATCHES SHA-256 recorded in current Drive README (not an independent remote full-byte read)`
- Calculation: `coarse high-altitude global collision model`
- [Original source](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4_uint.tif)

### globe_gray_2k.jpg — REUSED

- Original path: `C:\Users\hach0\Downloads\Lunar-Landing-Site-Navigator-main\Lunar-Landing-Site-Navigator-main\web\public\data\textures\globe_gray_2k.jpg`
- Used path: `C:\Users\hach0\Downloads\Lunar-Landing-Site-Navigator-main\Lunar-Landing-Site-Navigator-main\web\public\data\textures\globe_gray_2k.jpg`
- Bytes: `431652`
- SHA-256: `c328d67aca25f5cf711eef13d05b2f7fdc93c4f8e34d640776c093015bd5462f`
- Version/product: `globe_gray_2k.jpg`
- Checksum comparison: `connector omitted checksum fields; remote equality not claimed`
- Calculation: `visual-only Moon texture; not a physical height input`
- [Original source](https://svs.gsfc.nasa.gov/4720/)

### ldem_80s_80m.img — SKIPPED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_80s_80m.img`
- Bytes: `115520000`
- SHA-256: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`
- Version/product: `V2.0`
- Drive file ID: `1-grMsvdK_LHvQzG5nU6kcPUJQK9i1_jz`
- Skip reason: `Native240m model is sufficient for first trajectory demonstration; no 80m request or browser payload.`
- [Original source](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img)

### ldem_80s_80m.lbl — SKIPPED

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM\ldem_80s_80m.lbl`
- Bytes: `4986`
- SHA-256: `107c7558cbf8832e4119d3c8c2b1b272623344275c85378a9b0e03c22876eb33`
- Version/product: `V2.0`
- Drive file ID: `1GxkdDOMtIE9UOgtsQzr-hDz2dtM1pZCI`
- Skip reason: `Native240m model is sufficient for first trajectory demonstration; no 80m request or browser payload.`
- [Original source](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl)

### ldem_128.img — SKIPPED_INVALID

- Original path: `C:\Users\hach0\Downloads\DU_NE Data\Raw_Data\LOLA_DEM_Global\ldem_128.img`
- Bytes: `63225856`
- SHA-256: `fb12d0141c853160c65d2b4afb7e7e071e7b9bfdf9d71308b98b2631d62f92c5`
- Version/product: `LDEM_128`
- Skip reason: `Truncated: label expects 23040*46080*2=2123366400 bytes. Preserved untouched. Existing valid4ppd substitutes only coarse high-altitude model.`

## Important findings

- The local `ldem_128.img` is incomplete: 63,225,856 bytes, whereas its 23,040 × 46,080 signed-16 label requires 2,123,366,400 bytes. It was rejected and left untouched. No global128 dataset was downloaded.
- The current site catalog has **32 entries**. Its `verified` flags describe source-coordinate verification, not landing safety. Regional centroids, research candidate points, historical touchdowns, and approximate representative points retain their source notes. Current Connecting Ridge is −89.4441°, −137.291°, not the stale local −89.45°, −137.31°. Its native240m sampled height is 1,953.725141952523 m. Catalog elevation fields can reflect another DEM/grid/date and are not substituted for runtime DEM samples.
- The current lander catalog contains four surface power/communications presets with approximate/null fields. It has no verified dynamic mass/thrust/Isp specification. The simulator must use its explicitly assumed demonstration lander; catalog values are never promoted to certified propulsion data.
- The loaded FK maps `MOON_ME` to `MOON_ME_DE440_ME421`, then `MOON_PA_DE440`. Its ME421 alignment supports the DEM reference realization; residual frame-realization uncertainty remains a model limitation. All velocity transformations include the `sxform` derivative blocks.
- The DEM label is V2.0, created 2017-06-15 from observations through 2017-02-02. The data are not expired because of that date. Native little-endian signed16 samples are elevation `DN × 0.5 m`; 1,737,400 m is added only to obtain radius.

## Static browser assets

| Asset | Preparation and actual use |
|---|---|
| `terrain/index.json` and `terrain/tiles/*.bin` | 199 cropped 256×256 tiles from the native240m southern cap; 131,072 bytes each, 26,083,328 bytes across all files. Browser loads required tiles only. Edge padding is −32768 unavailable. Original full IMG is not loaded by the browser. |
| `terrain/global.bin` | 129,600-byte one-degree maxima of every underlying4ppd global TIFF cell; decoded half-metre unsigned16, offset−10000m. Nearest containing cell, no bilinear averaging. High-altitude coarse screening only, not a landing model. |
| `terrain/context.bin` | 1.92km sampled overview, visual context only. Not used as the physical collision grid. |
| `frames.json` | Actual SPICE rotation and derivative samples every300s. Epoch2026-11-15T00:00:00Z, support−7200…604800s. Cubic Hermite interpolation with analytic derivative. No runtime SPICE/kernel download. |
| `moon-gray-2k.jpg` | Reused431,652-byte grayscale derivative of NASA SVS4720 CGI Moon Kit from the reference project. Longitude−180…180, latitude90…−90, center0 longitude. Visual only, not scientific reflectance or height. |
| `sites.json`, `landers.json`, `manifest.json` | Current source snapshots and compact provenance, with flags/notes preserved. |

The global maximum pooled model bounds the included **coarse DEM samples** only. It cannot bound real subpixel peaks. Landing/low-altitude terrain use remains limited to the native southern DEM. A valid numerical path within this model is not a terrain or NASA mission certification. No observation-count quality product was loaded; nominal240m grid spacing is not interpreted as uniformly measured240m terrain resolution.

## Actual data verification

### terrain

- `pixel_roundtrip_max_error_px`: 1.3642420526593924e-12
- `pixel_center_elevation_max_error_m`: 1.0504663805477321e-10
- `south_pole_pixel`: [1905.5, 1905.5]
- `out_of_domain_returns_none`: True
- `native_size_bytes`: 29062688
- `tile_count`: 199
- `total_tiled_bytes`: 26083328

### spice

- `samples_tested`: 6120
- `method`: cubic Hermite elementwise R and dR/dt from sxform; measured at 1/4,1/2,3/4 of every interval
- `max_rotation_matrix_error_2norm`: 8.760070739055498e-13
- `max_derivative_error_per_s`: 4.5252466686714996e-15
- `max_position_error_at_100km_m`: 1.6095753975940573e-06
- `max_surface_velocity_error_at_100km_m_s`: 8.314688229017013e-09
- `max_orthogonality_defect`: 2.692197279100261e-15
- `max_spice_roundtrip_state_error`: 4.656612873077393e-10
- `precision_scope`: Interpolation only; kernel/model/data uncertainties are separate. Interior samples are measured checks, not a rigorous error bound.

### global_sha256_matches_drive_readme

True

`docs/spice-reference-cases.json` includes6 independent non-knot SPICE states with nonzero body-fixed velocities and14 terrain cases at the pole, cardinal longitudes, tile boundaries, and outside coverage. These support browser-engine cross-checks against Python source calculations. Interpolation tests measure selected interior times in every interval; they are not a proof of a global error bound.

## Explicit exclusions

No Diviner temperature, magnetic, mineral/spectral, neutron/hydrogen/iron, CRaTER, full LROC image, PGDA98, full5m/10m DEM, or full Artemis navigation-grid dataset was downloaded or changed. Those are not required inputs to the current central-gravity/thrust equations. The80m sources were hashed/audited but not shipped because native240m is the requested first model. Finer landing-site hazard checks and `ldec` observation-density quality remain future work; zero-count pixels must then be reported as interpolated, not directly measured.

## Reproduction

Run `scripts/prepare_data.py` with NumPy, Pillow and SpiceyPy after editing `data/config.json` or passing `--source-root` and `--global-source`. It validates sizes before reading, references large local files rather than making full raw copies, and writes only derived assets in this new project. By default it does not download anything. `--download-missing` uses a minimal NASA/PDS/NAIF URL allowlist only when a required input is missing and places new files in this project's `data/raw`; it never overwrites an existing source. Current source catalog snapshots are already included. `scripts/write_data_audit.py` renders this audit from actual inventory metadata.

## NRHO extension recheck — 2026-11-15

The extension rechecked the actual Downloads path and all **16** baseline local source records. **16/16 SHA-256 values match**; original DEMs, kernels, catalogs and texture sources remain unchanged. The truncated global128 file is still rejected. Drive data root, README, rules, log, catalog metadata, kernel/LOLA/reference-table folder listings were inspected read-only before any new acquisition. The connector still omits requested checksum/version metadata, so this records unchanged relevant metadata rather than claiming remote hash equality. Evidence: `docs/nrho-data-audit.json` and `data/nrho/drive-recheck.json`.

No suitable NRHO periodic-orbit response was found in the checked existing data locations. The exact requested [JPL Earth–Moon L2 southern halo 6–7 day query](https://ssd-api.jpl.nasa.gov/periodic_orbits.api?sys=earth-moon&family=halo&libr=2&branch=S&periodmin=6&periodmax=7&periodunits=d) returned 102 candidates, API version1.0. Its raw 22,919-byte response is retained at `data/nrho/jpl-earth-moon-l2-southern-halo-6-7days.json`, SHA-256 `de4a61474cacc2b3ee10670ad5ef081db4a8cb6130c34248caf8c3c60a945f6d`. There is no runtime external API dependency.

`scripts/prepare_nrho.py` independently propagates every candidate with DOP853 and selects unmodified row42 by a documented score against the NASA FAQ's approximate values. The exported period is6.57989438565days, peri/apo altitudes1,244.02494/69,774.39603km relative to JPL's1737.1km secondary radius. Final independent periodic closure is0.000131m with sampled Jacobi drift3.88e−13. The native LOLA reference radius remains1737.4km; its 300m difference is explicitly recorded. Full candidate results, selection and frame calibration are retained in `data/nrho/candidate-propagation.json`, `docs/nrho-data-validation.json`, and `frontend/public/data/nrho/reference.json`.

The five existing SPICE kernels were reused to construct a constant terrain alignment at2026-11-16T00:00:00Z. This calibration feeds relative-time CR3BP Mode A only, not a real-date mission. No new kernel or terrain payload was downloaded. The browser receives the small static reference JSON alongside existing lazy terrain tiles.

The specifically requested official reference documents were downloaded for source review: relay SRD1,619,912bytes, SHA-256 `4779d15380ae16bd8fc40588ca1dafc938730bec4871dcbb76c49e116e9e8c75`; HLS20240009379 PDF2,865,463bytes, SHA-256 `2c2477b7d477e2b3266d337bf09950cdcd9d569f15482006210e011254515b38`. They remain under `data/nrho/reference-documents`, outside the browser payload. The SRD, HLS paper and FAQ describe different reference assumptions; they are not represented as a single operational mission. Exact URLs, differences, contracts and reproduction steps are documented in `docs/nrho-data-sources.md`.

`scripts/independent_verify_nrho.py` verifies the exported mission independently from the original JPL state through its selected phase, departure impulse, CR3BP transfer, insertion impulse, SI frame conversion, parking, DOI and all powered controls. It writes `docs/nrho-independent-validation.json`; the scope is the stated piecewise Mode A dynamics, not UTC ephemeris or independent terrain hazard certification. Preserve this extension section if regenerating the baseline audit with `scripts/write_data_audit.py`.

The default mission's14 independent checks pass. The full original-JPL-chain transfer endpoint residual is0.0001182m; final TypeScript/DOP853 differences are0.0000704m position,8.24e−8m/s velocity and3.41e−12kg mass. The source-state residual is carried through all impulses and24 powered control segments without a position or velocity reset. See the report's input SHA-256 for the precise export tested; these small numerical differences are not physical accuracy claims.
