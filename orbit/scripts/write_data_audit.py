"""Render the actual static-data preparation inventory as a readable audit."""
from pathlib import Path
import json

root=Path(__file__).resolve().parents[1]
inventory=json.loads((root/"docs/data_inventory.json").read_text(encoding="utf-8"))
validation=json.loads((root/"docs/data_validation.json").read_text(encoding="utf-8"))
sites=json.loads((root/"data/catalogs/sites.json").read_text(encoding="utf-8"))
text="""# DATA AUDIT — 2026-11-15 KST

## Scope and preservation

The independent simulator uses existing NASA data and publishes only derived static assets. Python is an offline preprocessing/verification tool, not a runtime server. No existing repository, Downloads source, or Google Drive source was changed. No science raw-data download was needed. Four small current catalog snapshots (257,264 bytes total) were materialized from Drive into the new project; `sites.json` and `landers.json` contain substantive corrections compared with the old Downloads copies. The unchanged manifest and terrain-source snapshots are retained for reproducibility; they were read via the connector after its text representation returned empty content. The existing originals remain intact.

The OS Downloads location was read from Windows User Shell Folders Known Folder `{374DE290-123F-4565-9164-39C4925E467B}`: `C:/Users/hach0/Downloads`. Only relevant lunar source files were hashed and used. The main reusable data root is `C:/Users/hach0/Downloads/DU_NE Data`. A second pre-existing source is the current workspace's `outputs/global_data_2026-11-14/data/LOLA_DEM_Global`.

## Drive review before preparation

Read the current [data folder](https://drive.google.com/drive/folders/1u3A21Su1smMEnUlx3kpJC99qzWuxtrX2), [README](https://drive.google.com/file/d/1lL4mwXuResP7Onx-nvhxc0g-hFXHI9MZ/view), [modification rules](https://drive.google.com/file/d/11SP_l1VbpAwcCAP2uTyWxQnEc363YEKL/view), [change log](https://drive.google.com/file/d/1BD53wJJ13FVO_lsCqqjBRjmfvGkvwUNR/view), and all four requested catalogs. Read-only snapshots and folder metadata are in `docs/drive_snapshot/`. The source documents instruct preservation of raw data; no source edits or uploads were made, so their write workflow was not invoked.

Current Drive metadata was compared by product name, byte count, generation/version evidence, and local SHA-256. The connector omitted `sha256Checksum`, `md5Checksum`, and `version` even when explicitly requested. **Remote full-byte hash equality is not claimed for the reused DEM or kernels.** Current Drive byte counts match the reused required files; their content is checked by label structure, frame load/coverage, and numerical tests. The global TIFF SHA-256 equals the hash in the current Drive collection README. That is a recorded remote provenance match, not an independent re-download comparison.

## Inventory

The JSON inventory in `docs/data_inventory.json` contains machine-readable original paths, project paths, sizes, SHA-256, current Drive IDs, metadata times, status, product/version and calculation stage. A source's old generation date is not a reason to replace a valid product.

"""
for file in inventory["files"]:
    text+=f"### {file['file']} — {file['status']}\n\n"
    for title,key in [("Original path","source_path"),("Used path","used_path"),("Bytes","bytes"),("SHA-256","sha256"),("Version/product","version"),("Product generation time","source_generation_time"),("Drive file ID","drive_file_id"),("Drive modified UTC (not product age)","drive_modified_utc"),("Drive size matches","drive_size_matches"),("Checksum comparison","drive_sha256_comparison"),("Calculation","calculation"),("Skip reason","reason")]:
        if file.get(key) is not None:text+=f"- {title}: `{file[key]}`\n"
    if file.get("source_url"):text+=f"- [Original source]({file['source_url']})\n"
    text+="\n"
text+="""## Important findings

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

"""
for group,results in validation.items():
    text+=f"### {group}\n\n"
    if isinstance(results,dict):
        text+="\n".join(f"- `{key}`: {value}" for key,value in results.items())+"\n\n"
    else:text+=f"{results}\n\n"
text+="""`docs/spice-reference-cases.json` includes6 independent non-knot SPICE states with nonzero body-fixed velocities and14 terrain cases at the pole, cardinal longitudes, tile boundaries, and outside coverage. These support browser-engine cross-checks against Python source calculations. Interpolation tests measure selected interior times in every interval; they are not a proof of a global error bound.

## Explicit exclusions

No Diviner temperature, magnetic, mineral/spectral, neutron/hydrogen/iron, CRaTER, full LROC image, PGDA98, full5m/10m DEM, or full Artemis navigation-grid dataset was downloaded or changed. Those are not required inputs to the current central-gravity/thrust equations. The80m sources were hashed/audited but not shipped because native240m is the requested first model. Finer landing-site hazard checks and `ldec` observation-density quality remain future work; zero-count pixels must then be reported as interpolated, not directly measured.

## Reproduction

Run `scripts/prepare_data.py` with NumPy, Pillow and SpiceyPy after editing `data/config.json` or passing `--source-root` and `--global-source`. It validates sizes before reading, references large local files rather than making full raw copies, and writes only derived assets in this new project. By default it does not download anything. `--download-missing` uses a minimal NASA/PDS/NAIF URL allowlist only when a required input is missing and places new files in this project's `data/raw`; it never overwrites an existing source. Current source catalog snapshots are already included. `scripts/write_data_audit.py` renders this audit from actual inventory metadata.
"""
(root/"DATA_AUDIT.md").write_text(text,encoding="utf-8")
print(f"Wrote DATA_AUDIT.md: {len(inventory['files'])} source records, {len(sites)} sites")
