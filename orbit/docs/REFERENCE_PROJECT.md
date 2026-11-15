# Reference project inspection

> Historical reference: this describes the initial light theme. The current UI follows the newer Mission Portal dark theme; see [PORTAL_UI_REVIEW.md](PORTAL_UI_REVIEW.md) and [MISSION_PORTAL_INTEGRATION.md](MISSION_PORTAL_INTEGRATION.md). Coordinate conventions below still apply.

Inspected 2026-11-15 (Asia/Seoul). The requested GitHub repository was accessed read-only through the GitHub connector. `get_repo` returned HTTP 404. This does not establish whether the repository is private, deleted, or outside the connection's access.

A local downloaded reference exists at:

`C:\Users\hach0\Downloads\Lunar-Landing-Site-Navigator-main\Lunar-Landing-Site-Navigator-main`

Only read operations were performed. No original source, Git metadata, data, commits, branches, or remote state were modified.

## Structure and framework

The reference README describes `pipeline/` (Python preprocessing), `web/` (web app), `docs/` (decisions, sources, coordinate checks), and `tests/` (Python/TypeScript cross-check inputs). The web package uses React 18.3.1, Vite 5.4.11, TypeScript 5.6.3, Three.js 0.160.0, and Zustand 4.5.5. Source structure includes `components`, `core`, `adapters`, `state`, `layout`, `pages`, and `styles`.

## Verified visual system

Read `web/src/styles/base.css`, `web/src/layout/Shell.tsx`, and `web/src/components/kit.tsx`. The simulator uses the verified original tokens below, in an independently implemented layout:

| Token | Original value |
|---|---|
| Background | `#F4F7F6` |
| Panel | `#FFFFFF` |
| Secondary panel | `#F0F4F3` |
| Divider | `#DFE6E8` |
| Strong border | `#C9D5D8` |
| Foreground | `#12212B` |
| Muted text | `#6B7B82` |
| Teal accent | `#2E8B83` |
| Accent background | `#E2F1ED` |
| Navy | `#102C39` |
| Warning | `#C96457` |
| Amber | `#A86E1F` |
| Corner radius | `2px` |

Original typography stacks are Space Grotesk / IBM Plex Sans KR for display, IBM Plex Sans KR / system sans for body, and IBM Plex Mono / Consolas for telemetry. The simulator preserves those stacks with system fallbacks. No Google Fonts or other CDN is required at runtime. Font appearance depends on installed fonts because no local font asset was present in the reference clone.

Original components use compact form fields, segmented controls, fine borders, small uppercase monospaced labels, cards with divided headings, badges, and three primary columns. These conventions were retained. The simulator changes the content layout to dedicate the largest column to flight dynamics.

## Moon and coordinate implementation

Read `web/src/components/MoonGlobe.tsx` and `web/src/core/types.ts`. The reference uses a direct Three.js `WebGLRenderer`, a `SphereGeometry`, a custom shader, and NASA SVS CGI Moon Kit grayscale texture with an additional south-polar LROC WAC mosaic. It displays positive-east lunar longitude and MOON_ME coordinates.

Its conversion is `MOON_ME [x,y,z] -> Three.js [x,z,-y]`; spherical points are `[r cos(lat) cos(lon), r sin(lat), -r cos(lat) sin(lon)]`. The simulator preserves this axis convention and retains physical radial distances when normalizing by the 1,737,400 m reference radius. Renderer coordinates are only for display; dynamics remain in SI and the solver's declared frame.

## Landing sites and Drive integration

The reference type contract uses `id`, `name`, `lat_deg`, `lon_deg`, optional `elevation_m`, `category`, `terrain`, `source_keys`, `verified`, and optional `note`; numeric fields include unit suffixes. `Site` coordinates are MOON_ME with longitude in (−180,180]. The simulator accepts both these fields and normalized `latitude_deg` / `longitude_deg` fields and preserves source/verification notes.

The reference does not directly query Google Drive from the browser. A Python pipeline reads the local `DU_NE Data` directory configured by `LUNA_DATA_DIR` and generates `web/public/data/`. Its README explicitly displays missing-data states instead of fabricating missing data. The simulator likewise bundles only needed static inputs, records their provenance, and returns a distinct missing-data status when required inputs or DEM coverage are unavailable.

The reference lander type mainly covers solar arrays, battery energy, electrical loads and communication rates. Those fields cannot establish thrust, wet/dry mass, or specific impulse. The simulator uses an explicit editable demonstration lander for dynamics.

## Separation

The new app lives in `Lunar-Landing-Orbit-Simulator`. It imports no code from the original source folder at runtime. UI source is independent; NASA visual assets reused from the original output retain their own provenance in `DATA_AUDIT.md`.
