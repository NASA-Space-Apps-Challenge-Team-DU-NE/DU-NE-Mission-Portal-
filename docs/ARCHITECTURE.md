# 개발 구조 (ARCHITECTURE) — LUNA-NAV v4 새 코드베이스

> 규칙·기능·수식은 `CLAUDE.md`, 이 문서는 **어디에 무엇을 어떤 형식으로** 만드는지를 정한다.
> 코드는 처음부터 새로 짠다. 이전 저장소·프로토타입은 동작 참고만 하고 복사하지 않는다.

목차
1. 큰 그림
2. 저장소 트리
3. 파이프라인 (Python)
4. 산출물 디렉터리 `web/public/data/`
5. 데이터 계약 (스키마)
6. 웹앱 (TypeScript)
7. 데이터 흐름 예시
8. 성능·용량 예산
9. 개발 환경·명령
10. 배포
11. 결정 기록 규칙

---

## 1. 큰 그림

```
 팀 Drive "DU_NE Data" (원본, 읽기 전용)
        │  Google Drive 데스크톱 동기화 → LUNA_DATA_DIR
        ▼
 ┌────────────────────────── pipeline/ (Python 3.11) ──────────────────────────┐
 │ 00 inventory → 10 ephemeris → 20 terrain → 30 masks → 40 grid → 50 layers    │
 │ → 60 textures → 70 catalogs → 80 validation → 90 manifest                    │
 │ 중간물: build/ (git 제외)                                                    │
 └──────────────────────────────────────────────────────────────────────────────┘
        │  작은 웹용 산출물 (JSON·바이너리·PNG, 총 ≤ 60 MB) + provenance
        ▼
 web/public/data/  ── git 커밋 ──▶ 정적 파일 (로컬 dev 서버, 배포는 보류)
        │  fetch
        ▼
 ┌────────────────────────── web/ (React + Vite + TS) ─────────────────────────┐
 │ adapters(로드·검증) → state(Zustand) → core(순수 계산) ↔ workers(무거운 계산)│
 │ → components(three.js 3D, Canvas 2D) → pages(사이드바 10개)                  │
 └──────────────────────────────────────────────────────────────────────────────┘
```

원칙
- **무거운 것은 미리(Python), 날짜에 따라 바뀌는 것은 브라우저(TS).** 지형·지평선·정적 레이어·텍스처는 파이프라인, 임무 기간 일조·교신·시뮬레이션은 core/worker.
- 같은 수식(8.2·8.3)은 Python(`luna/sky.py`)과 TS(`core/sky.ts`) 양쪽에 있다. **교차 테스트**(같은 입력 → 같은 출력, `tests/fixtures/cross/*.json`)로 일치를 보장한다.
- 웹은 Drive를 모른다. 산출물 형식(5절)만 안다.

---

## 2. 저장소 트리

```
luna-nav/
├─ CLAUDE.md                 # 팀 공통 규칙·명세
├─ TASKS.md                  # 작업 보드
├─ README.md
├─ .env.example              # LUNA_DATA_DIR=, HORIZONS_CACHE_DIR=
├─ .gitignore                # build/, .env.local, node_modules/, __pycache__/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ decisions.md           # 결정 기록 (11절)
│  ├─ validation.md          # 검증 결과
│  ├─ sources.md             # 제출용 데이터 출처 (자동 생성 + 손 보강)
│  └─ handoff/
├─ tests/fixtures/cross/     # Python↔TS 교차 테스트 입력·기대값
├─ pipeline/
│  ├─ pyproject.toml         # 패키지 luna, 명령 진입점
│  ├─ requirements.txt       # 정확한 버전 고정
│  ├─ luna/
│  │  ├─ __init__.py
│  │  ├─ config.py           # 격자·해상도·기간 (PROVISIONAL 표시)
│  │  ├─ constants.py        # CLAUDE.md 7절 상수
│  │  ├─ contracts.py        # 산출물 dataclass = web/src/core/types.ts
│  │  ├─ paths.py            # LUNA_DATA_DIR 해석, Drive 상대 경로 상수
│  │  ├─ quality.py          # 엑셀 목록 로드, 파일 → 품질 상태 조회, 금지 파일 차단
│  │  ├─ provenance.py       # sha256, 기록 객체
│  │  ├─ io/                 # 읽기 전용 어댑터
│  │  │  ├─ pds.py           #   PDS3 .lbl/.img 파서
│  │  │  ├─ geotiff.py       #   rasterio 래퍼, 극투영 정보
│  │  │  ├─ archives.py      #   분할 zip 결합, 7z, zip 안 스트리밍
│  │  │  ├─ tables.py        #   CSV/JSON/xlsx
│  │  │  └─ horizons.py      #   Horizons API 클라이언트 + 캐시
│  │  ├─ geo/               # 좌표 변환은 여기서만 (CLAUDE.md 4.6)
│  │  │  ├─ frames.py        #   MOON_ME 기준, PA→ME, 위경도↔벡터, ENU, 경도 범위 통일
│  │  │  ├─ polar.py         #   남극 극평사·AEQD 변환, 재투영
│  │  │  └─ crs.py           #   파일별 원래 좌표계 읽기(.lbl·GeoTIFF·.prj·CSV 규칙표)
│  │  ├─ sky.py              # 8.2·8.3 수식 (TS와 동일)
│  │  ├─ horizon.py  terrain.py  catalogs.py  sources.py
│  │  ├─ stages/
│  │  │  ├─ s00_inventory.py
│  │  │  ├─ s10_ephemeris.py
│  │  │  ├─ s20_terrain.py
│  │  │  ├─ s30_masks.py
│  │  │  ├─ s40_grid.py
│  │  │  ├─ s50_layers.py
│  │  │  ├─ s60_textures.py
│  │  │  ├─ s70_catalogs.py
│  │  │  ├─ s80_validation.py
│  │  │  └─ s90_manifest.py
│  │  ├─ preview.py          # 단계별 확인용 PNG
│  │  └─ cli.py              # python -m luna <stage|all> [--only site_id]
│  └─ tests/                 # pytest
├─ build/                    # 중간물 (git 제외)
└─ web/
   ├─ package.json  vite.config.ts  tsconfig.json  index.html
   ├─ public/data/           # 파이프라인 산출물 (4절). 손으로 고치지 않음
   └─ src/
      ├─ main.tsx  App.tsx  config.ts  strings.ts
      ├─ core/               # 순수 계산 (DOM·fetch·React 금지)
      ├─ adapters/           # 산출물 로드·검증·캐시
      ├─ state/              # Zustand 슬라이스
      ├─ workers/            # Web Worker 진입점 + 메시지 계약
      ├─ components/         # 공용 UI·그림 (3d/, canvas/, ui/)
      ├─ pages/              # 사이드바 10개 페이지
      ├─ layout/             # Sidebar, TopBar, RightRail, FullscreenHud
      └─ styles/             # tokens.css, base.css
```

---

## 3. 파이프라인 (Python)

### 3.1 공통 규칙
- 실행: `python -m luna all` 또는 단계별 `python -m luna s30 --only shackleton_rim`.
- 단계는 **입력이 바뀌지 않으면 건너뛴다**(입력 sha256 + 설정 해시를 `build/<stage>/.stamp`에 저장).
- 모든 입력 파일은 `quality.require(path, allow={...})`로 연다. `VALIDATION_FAILED`·`NO_DATA`면 예외. 허용 집합 밖 품질이면 경고 + provenance에 기록.
- 출력 경로는 `build/` 또는 `web/public/data/`만. Drive 쓰기 금지(`paths.py`가 막는다).
- **좌표계**: 모든 입력은 `geo/frames.py`·`geo/polar.py`를 거쳐 MOON_ME(평균 지구-극)로 변환된 뒤에만 다음 단계로 간다(CLAUDE.md 4.6). 파일을 열 때 `geo.source_crs(path)`가 라벨·CRS·`.prj`에서 원래 좌표계를 읽고, 확인 못 하면 예외. 결과는 provenance의 `source_crs`·`transform`·`lon_convention`에 남는다.
- 각 단계는 끝에 `preview.py`로 PNG(지도·마스크 그림)를 `build/preview/`에 남긴다.

### 3.2 단계

| 단계 | 입력 (Drive 상대 경로, CLAUDE.md 4.4) | 처리 | 출력 |
| --- | --- | --- | --- |
| **s00 inventory** | `DU-NE_Drive_파일목록_2026-11-14.xlsx`, 필요 파일 목록(`paths.py`) | 엑셀 → `build/inventory.parquet`(경로·품질·크기). 필요 파일 존재·크기 확인, 온라인 전용 의심 표시, 금지 파일 참조 검사 | `build/inventory.parquet`, 콘솔 보고 |
| **s10 ephemeris** | Horizons API (캐시 `HORIZONS_CACHE_DIR`), `Web_Derived/ephemeris/*`(대조) | 태양·지구의 달 중심 MOON_ME 좌표: 범위 2026-11-01~2028-01-01 1 h, 미션별 착륙 ±15일 1 h. 직하점 위경도 + 거리로 저장. Drive 기존 표와 각거리 비교 | `web/public/data/ephemeris/range.bin` + `.json`, `missions/<id>.bin`, `build/s10_diff.csv` |
| **s20 terrain** | `ldem_75s_240m.img`, `ldem_80s_80m.img.zip`, `Terrain_30m/*.tif`, `Terrain/*.tif`, (선택) PGDA78/104·NAC DTM | 라벨 파싱 → 공통 극투영 메타 정리, 30/80/240 m 피라미드를 `build/terrain/*.npy`(memmap)로. 고도 기준을 1737.4 km 구면으로 통일 | `build/terrain/{dem30,dem80,dem240}.npy` + `meta.json` |
| **s30 masks** | s20, `Catalogs/sites.json`·카탈로그 후보, `Horizon_Masks/*`(대조) | 착륙지마다 1° 360방위 지평선(CLAUDE.md 8.4). 관측 높이 2 m 기본, P3-01용 0·5·10·20·30 m. Drive 13곳과 방위별 차이(최대·RMS) | `web/public/data/masks/<site_id>.json`, `masks/heights/<site_id>.json`, `build/s30_compare.csv` |
| **s40 grid** | s20 | 75°S 이남 AEQD 5 km 격자 → 유효 칸 목록, 칸별 72방위 지평선(int16×0.01°) | `grid/manifest.json`, `grid/cells.u32`(칸 → 행·열), `grid/horizon.i16` |
| **s50 layers** | s20, s40, Illumination·Composition·Science·Terrain_Geology 파일들, PSR 폴리곤 | 칸별 정적 레이어(CLAUDE.md 8.5 목록). 래스터 → 칸 평균/분위, 0.5° CSV → 칸 최근접/면적 가중, 점 목록 → 거리·밀도. 원본 없는 칸 NaN | `grid/layers/<name>.f32` + `grid/layers.json`(LayerMeta) |
| **s60 textures** | WAC 모자이크 4타일, s20 음영기복 | 남극 텍스처(2048², 75°S 원판), 2D 지도용 음영기복 PNG, (선택) 전구 텍스처 캐시 | `textures/south_wac_2048.jpg`, `textures/south_hillshade_1024.png` |
| **s75 local** | LOLA 30 m 타일(VRT), 카탈로그 착륙지 | 착륙지 중심 20 km 국지 음영기복 (1024², 약 19.5 m/px, 위 = 북). 03 기지 배치 지도 배경용, 계산에 안 씀 | `local/<site_id>.jpg`, `local/local.json` |
| **s70 catalogs** | `Catalogs/*.json`, `Reference_Tables/NASA_Gap_Collection_2026-11-14/*.csv` | sites(아르테미스 기준 1.2-2 반영)·missions(16곳 좌표 대조본 우선)·landers·stations(DSN 좌표·지평선 마스크 + 여주)·power_refs 정규화. 출처·`verified` 필드 | `catalog/{sites,missions,landers,stations,power_refs}.json` |
| **s80 validation** | s10, s30, s50, `Reference_Tables/*`, SPICE 커널, PGDA69·WAC | ① 천체력 vs Horizons·SPICE 기준 표 ② 지평선 vs Drive 13곳 ③ 장기 일조율 vs PGDA69(칸 표본)·WAC(88–90°S) ④ 마스트 높이 vs JPL IPN 표 | `validation/*.json` (웹 10페이지), `docs/validation.md` 갱신 |
| **s90 manifest** | 모든 산출물 | 파일별 크기·sha256·provenance 통합, `sources.json`·`quality.json` 생성, 용량 예산 검사(8절) | `manifest.json`, `sources.json`, `quality.json`, `docs/sources.md` |

### 3.3 장기 일조율 비교용 계산 (s80 ③)
우리 지평선(격자 72방위) + 1년 이상 2.5일 간격 천체력으로 칸별 평균 원반 노출률을 계산 → PGDA69 `solar_illumination_*`를 같은 칸으로 집계한 값과 비교. **조건 차이(기간 18.6년 vs 1년+, 관측 높이)를 결과 JSON에 명시.** 이 값은 검증용이며 지도 레이어로는 PGDA69 원본 집계값(`illum_avg`)을 쓴다.

### 3.4 의존성(후보, T01에서 버전 고정)
numpy, pandas, pyarrow, openpyxl, rasterio, pyproj, shapely, pillow, py7zr, requests, spiceypy(검증), pytest.

---

## 4. 산출물 디렉터리 `web/public/data/`

```
data/
├─ manifest.json            # 전체 목록·버전·sha256·생성 시각 (adapters가 맨 처음 읽음)
├─ sources.json             # 출처 키 → 이름·URL·해상도·설명
├─ quality.json             # 산출물·레이어 → kind·quality·주의 문구
├─ ephemeris/
│  ├─ range.json + range.bin        # 2026-11-01~2028-01-01, 1 h
│  └─ missions/<mission_id>.json + .bin
├─ masks/
│  ├─ <site_id>.json                # 1°, 2 m
│  └─ heights/<site_id>.json        # 0·5·10·20·30 m (P3-01)
├─ grid/
│  ├─ manifest.json                 # GridManifest
│  ├─ cells.u32  horizon.i16
│  ├─ layers.json                   # LayerMeta[]
│  └─ layers/<name>.f32
├─ textures/
│  ├─ south_wac_2048.jpg  south_hillshade_1024.png
├─ catalog/
│  ├─ sites.json  missions.json  landers.json  stations.json  power_refs.json
└─ validation/
   ├─ ephemeris.json  masks.json  illumination.json  missions.json  mast.json
```

---

## 5. 데이터 계약 (스키마)

`pipeline/luna/contracts.py` ↔ `web/src/core/types.ts`. 필드 snake_case, 단위 접미사 필수. 바꾸려면 CLAUDE.md 12.5.

### 5.1 공통
```jsonc
// 모든 JSON 산출물 최상위
{
  "schema": "luna.mask.v1",          // 형식 이름·버전
  "generated_utc": "2026-11-14T03:00:00Z",
  "provenance": [                    // 이 산출물을 만든 입력
    { "drive_path": "Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip",
      "sha256": "…", "quality": "VALIDATED", "role": "terrain_mid",
      "source_crs": "polar stereographic, center -90/0, R=1737.4 km, ME (from .lbl)",
      "transform": "pixel -> MOON_ME lat/lon via label params",
      "lon_convention": "-180..180" }
  ],
  "kind": "real",                    // real | approx | assumed | missing
  "quality": "VALIDATED",            // 입력 중 가장 낮은 품질
  "notes": ["…"],
  "data": { … }
}
```
품질 순서(낮은 쪽이 대표): VALIDATED > LIMITED_USE > REVIEW_REQUIRED > REFERENCE_ONLY.

### 5.2 천체력 `ephemeris/range.json` + `.bin`
```jsonc
"data": {
  "frame": "MOON_ME", "start_utc": "...", "step_h": 1, "count": 9505,
  "bodies": ["sun", "earth"],
  "layout": "float32[count][2][3]",  // body별 (sub_lon_deg, sub_lat_deg, dist_km)
  "bin": "range.bin", "source": "jpl_horizons", "max_diff_vs_drive_deg": 0.004
}
```

### 5.3 지평선 `masks/<site_id>.json`
```jsonc
"data": {
  "site_id": "shackleton_rim", "lat_deg": -89.66, "lon_deg": 129.2,
  "ground_elev_m": 1932.4, "observer_height_m": 2,
  "az_step_deg": 1, "elevation_deg": [/* 360 */],
  "max_range_km": [/* 360, 방위별 실제 탐색 거리 */],
  "terrain": "site", "dem_used": ["dem30", "dem80", "dem240"],
  "compare_drive": { "rms_deg": 0.12, "max_deg": 0.6 }   // Drive 마스크 있을 때
}
```

### 5.4 격자 `grid/manifest.json` (GridManifest)
```jsonc
"data": {
  "projection": "AEQD south pole, MOON_ME, R=1737.4 km",
  "cell_km": 5, "nx": 182, "ny": 182, "x0_km": -455, "y0_km": 455,   // 왼쪽·위쪽 모서리, 행은 아래로 갈수록 y 감소
  "lat_limit_deg": -75, "n_cells": 26000,
  "cells": "cells.u32",                         // 유효 칸 → (row*nx+col)
  "horizon": { "file": "horizon.i16", "az_step_deg": 5, "n_az": 72, "scale": 0.01 },
  "observer_height_m": 2
}
```
### 5.5 레이어 `grid/layers.json` (LayerMeta[])
```jsonc
[{ "name": "slope_p90_deg", "file": "layers/slope_p90_deg.f32", "unit": "deg",
   "kind": "real", "quality": "VALIDATED", "nodata": "NaN",
   "stat": "p90 of 80 m slope within cell (240 m outside 80S)",
   "source_keys": ["lola_slope_80m", "lola_slope_240m"],
   "coverage": { "valid_cells": 25810, "lat_range_deg": [-90, -75] },
   "caution": null }]
```
`illum_avg`·`earth_vis_avg`의 caution = "장기 평균(PGDA69). 특정 날짜 값 아님". `h_ppm` = "얼음 가능성 지표 · 검출 아님", `feo_wt`/`tio2_wt` = "원 격자 2–20°".

### 5.6 카탈로그
- `sites.json`: `{id, name, category: apollo|clps|international|artemis|other, lat_deg, lon_deg, terrain: site|grid|flat, mask?: "masks/<id>.json", source_keys[], verified}`
- `missions.json`: `{id, name, agency, landing_utc, lat_deg, lon_deg, duration_h, outcome: success|partial|failure, outcome_reason, power, comm, ephemeris: "ephemeris/missions/<id>.json", source_keys[], verified}`
- `landers.json`: `{id, name, panel_area_m2, efficiency, mount: horizontal|vertical_fixed|vertical_tracking, battery_wh, load_active_w, load_idle_w, load_survival_w, rate_kbps, approximate: true, source_keys[]}`
- `stations.json`: `{id, name, lat_deg, lon_deg, height_m, antennas:[{id, diameter_m, horizon_mask?:{az_step_deg, elevation_deg[]}}], min_elev_deg, source_keys[]}`
- `power_refs.json`: `{id, name, value, unit, source_keys[]}`

### 5.7 검증 `validation/*.json`
`{ metric, n, mean_diff, rmse, r, max_abs, conditions:{…}, worst:[{id|cell, diff}] , pass: bool, threshold }`

---

## 6. 웹앱 (TypeScript)

### 6.1 레이어와 의존 방향
```
pages ─▶ components ─▶ state ─▶ core
  │          │           │        ▲
  │          └──────▶ adapters ───┘ (타입만)
  └──────▶ workers ─▶ core
```
- `core`는 어떤 것도 import하지 않는다(types·constants 제외). ESLint `import/no-restricted-paths`로 강제.
- `pages`는 서로 import하지 않는다. 공유는 `components`·`state`로.

### 6.2 `core/` (순수 함수, Vitest 필수)
| 파일 | 내용 | 묶음 |
| --- | --- | --- |
| `types.ts` `constants.ts` | 계약·상수 | 공통 |
| `vec.ts` `frames.ts` | 벡터, 위경도↔벡터, ENU, 각거리 | A |
| `ephemeris.ts` | 표 보간(단위 벡터 보간), 표 밖은 core 안 해석적 근사(`AnalyticEphemeris`) + `approx` 표시 (decisions.md) | A |
| `time.ts` `color.ts` | 시각 변환, 점수 색 | 공통 |
| `light.ts` | 빛 쌍둥이·릴레이·오차 타원·마스트 비교 (3순위) | B·E |
| `horizon.ts` | `horizonAt`, 구면 지평선(지형 미반영), 원반 노출률 | A |
| `sky.ts` | `skyState(site, mask, t, margin)` → 태양·지구 az/el, frac, 조도, 교신 | A |
| `timeline.ts` | 표본 생성, `summarize`, 다음 일몰·일출·지구몰·돋이 보간 | A |
| `events.ts` | 알림 목록, 착륙 윈도 | A |
| `gridScore.ts` | 동적 레이어, 정규화, 종합 점수, 필터, 순위(8 km 중복 제외), 점수 근거 | B |
| `scenario.ts` | 시나리오 점수, 지연 견고성 | C |
| `alternatives.ts` | 대안 A/B, 차이 6개, 이유 | C |
| `reverseSearch.ts` | 역방향 탐색(청크 단위 제너레이터) | C |
| `similarity.ts` | 참고 사례, 이 미션처럼 맞추기 | D |
| `energy.ts` | 에너지 수지 시뮬, 멈춤 원인, 1년 기지 | E |
| `power.ts` | 1 m² 출력, 패널 이분 탐색, 배터리, 패널 위치 추천, 마스트 비교, 빛 릴레이 | E |
| `stations.ts` | 지상국 지평 좌표, 안테나 마스크, 교집합 창 | F |
| `hazards.ts` | 먼지 반경 검사, 기지 간 거리, 지질 경고 | G |
| `validationStats.ts` | 평균 차이·RMSE·r | H |
| `export.ts` | CSV·보고서 텍스트 생성 | H |

### 6.3 `adapters/`
- `loadManifest()` → 이후 모든 로드는 manifest의 경로·sha256 기준(캐시 무효화).
- `loadMask(siteId)`, `loadEphemeris(range|missionId)`, `loadGrid()`(manifest + horizon + 레이어 지연 로드), `loadCatalog(name)`, `loadValidation(name)`.
- 로드 시 스키마 버전·길이·NaN 비율 검사. 실패하면 `{status: 'missing', reason}`을 돌려 화면이 "자료 없음"을 표시(던지지 않음).
- 바이너리는 `ArrayBuffer` → `Float32Array/Int16Array` 그대로(복사 없이 Worker에 transfer).

### 6.4 `state/` (Zustand)
| 슬라이스 | 내용 |
| --- | --- |
| `selection` | 선택 지점(카탈로그 id 또는 좌표), 시각 t, 기간, 재생 상태·속도 |
| `requirements` | 필수 조건, 가중치, 여유각, 프로파일 |
| `map` | 켜진 레이어, 진하기, 미달 표시 방식, 2D/3D 동기 시점 |
| `scenarios` | 비교 보드 목록(최대 4), A/B 조건 묶음 |
| `base` | 기지 배치 요소 |
| `sim` | 착륙선 프리셋·수정값, 기지 부하 |
| `data` | 로드 상태(manifest·격자·카탈로그), 배지 "일부 수치 미검증" |
| `ui` | 현재 페이지, 오른쪽 탭, 전체화면·발표 모드 |
- 파생값(현재 SkyState, 30일 타임라인, Summary)은 셀렉터 + 메모이제이션. 스토어에 저장하지 않는다.
- URL 동기화: `selection`·`ui.page`만 쿼리스트링(`?site=&t=&d=&p=`).

### 6.5 `workers/`
| Worker | 요청 → 응답 | 사용 |
| --- | --- | --- |
| `grid.worker.ts` | `{t0, duration_h, margin, weights, filters}` → 동적 레이어 Float32Array들 + 순위 + 통과 수 | 01 지도·순위, 3D 오버레이, 패널 추천 |
| `search.worker.ts` | 대안·역방향 탐색 요청 → 진행률 메시지 + 결과 | 03, 02 |
| `sim.worker.ts` | 1년 기지 시뮬, 마스트 비교 | 06, 05 |
- 메시지 계약은 `workers/protocol.ts`(요청 id, `cancel`, `progress`, `result`, `error`). 새 요청이 오면 이전 요청은 취소.
- 격자 지평선·레이어 버퍼는 Worker 시작 시 한 번 transfer.

### 6.6 `components/`
```
components/
├─ 3d/      MoonScene.tsx (three.js 렌더러 수명 관리), moonMaterial.ts(전구 텍스처 + 태양 조명),
│           southOverlay.ts(격자 레이어 → DataTexture, 남극 캡), markers.ts, picking.ts, FullscreenHud.tsx
├─ canvas/  PolarMap.tsx(2D 남극 지도 + 레이어 + 마커), Panorama.tsx, SkyDome.tsx,
│           Timeline.tsx(햇빛·교신 띠), LineChart.tsx, Scatter.tsx
└─ ui/      QualityBadge.tsx, KindBadge.tsx, NoData.tsx, Kpi.tsx, Slider.tsx, Table.tsx, Tabs.tsx, SourceInfo.tsx
```
- three.js 객체는 React 상태에 넣지 않는다. `MoonScene`이 `useRef`로 소유하고 스토어 구독으로 갱신, 언마운트 시 `dispose`.
- 2D 그림은 Canvas 2D, devicePixelRatio 반영, 리사이즈 옵저버.

### 6.7 `pages/` · `layout/`
`pages/Explore.tsx`(01) · `Windows`(02) · `Delay`(03) · `Base`(04) · `Power`(05) · `Sim`(06) · `Comm`(07) · `Compare`(08) · `Missions`(09) · `Validation`(10). 페이지가 커지면 같은 이름 폴더로 나눈다. 페이지 ↔ 기능 대응은 CLAUDE.md 9.2. `layout/`: `Sidebar`, `TopBar`(날짜·재생·프로파일·내보내기·배지), `RightRail`(3D + 현장 뷰 탭), `FullscreenHud`. 오른쪽 영역은 페이지 전환과 무관하게 **항상 마운트**(3D 재생성 방지).

### 6.8 `config.ts` · `strings.ts` · `styles/tokens.css`
- `config.ts`: 1.1 임시값, `FEATURES`(기능 플래그 — 동결 시 미완성 숨김).
- `strings.ts`: `{ko, en}` 키 사전, CLAUDE.md 10절 금지 문구 테스트(Vitest가 금지어 검색).
- `tokens.css`: 팔레트·간격·글꼴 토큰. 컴포넌트 CSS는 토큰만 사용.

---

## 7. 데이터 흐름 예시

**날짜를 바꿨을 때**
1. TopBar → `selection.t` 변경.
2. 셀렉터: `skyState(site, mask, t)` 즉시 재계산(≤ 1 ms) → 지표 카드·파노라마·돔·3D 태양 방향 갱신.
3. 기간 타임라인·Summary: 메모 키(site, t0, duration, margin) 변경 → 재계산(≤ 30 ms).
4. 격자 동적 레이어: 디바운스 150 ms 후 `grid.worker`에 요청(이전 요청 취소) → 결과로 지도·순위 갱신, 진행 표시.

**일정 변경 페이지**
원래 시나리오 점수(core) → "대안 찾기" → `search.worker`(대안 A: 같은 곳 ±7일, B: 200 km 안 착륙지 + 통과 칸) → 차이 6개 → "비교에 추가" → `scenarios` 슬라이스.

---

## 8. 성능·용량 예산

| 항목 | 예산 |
| --- | --- |
| 첫 화면 JS (gzip) | ≤ 400 KB (three.js 포함, 페이지별 코드 분할) |
| 첫 화면 데이터 | manifest + 카탈로그 + 선택 지점 마스크 + 천체력 ≤ 3 MB |
| 격자 (지평선 + 레이어 15개) | 26k × (72×2 B + 15×4 B) ≈ 5.3 MB |
| 천체력 범위 표 | 9.5k × 2 × 3 × 4 B ≈ 230 KB (+ 미션 16개) |
| 지평선 마스크 | 착륙지당 ≈ 5 KB, 높이별 ×5 |
| 텍스처 | ≤ 16 MB (전역 표면 2k·8k, 남극 WAC, 지형 음영 3장 ≈ 15.6 MB) |
| `web/public/data` 합계 | ≤ 100 MB (s90이 넘으면 실패. 2026-11-15 60 → 80 → 100 MB) |
| 단일 파일 | ≤ 25 MB (git 여유) |
| 시간 목표 | CLAUDE.md 8.11 |

---

## 9. 개발 환경·명령

```
# 데이터 (각자 한 번)
cp .env.example .env.local    # LUNA_DATA_DIR 입력

# 파이프라인
cd pipeline
python -m venv .venv && .venv\Scripts\activate     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m luna s00            # 데이터 확인
python -m luna all            # 전체 (단계 건너뛰기 지원)
pytest

# 웹
cd web
npm ci
npm run dev                   # http://localhost:5173
npm run check                 # tsc --noEmit + eslint + vitest
npm run build && npm run preview
npm run e2e                   # Playwright 스모크
```
- 웹만 고치는 사람은 파이프라인을 돌릴 필요 없다(산출물이 커밋돼 있음).
- 산출물을 다시 만든 PR은 `data/` 브랜치로, 본문에 `manifest.json` 변경 요약.

---

## 10. 배포
- **보류** (2026-11-14). 당분간 로컬 `npm run dev` 로만 확인한다. 정적 파일 앱이라 나중에 어느 정적 호스팅이든 `npm run build` 결과(`web/dist`)를 올리면 된다.
- 데이터 파일 캐시 무효화는 manifest 의 sha 쿼리(`?v=`)로 이미 처리한다 (`adapters/data.ts`).
- 외부 요청: Moon Trek 타일(실패 시 저장소 텍스처로 대체). 그 외 런타임 외부 요청 없음.

---

## 11. 결정 기록 규칙
`docs/decisions.md`에 한 줄씩: `YYYY-MM-DD HH:MM | 결정 | 이유 | 영향 파일 | 결정한 사람`.
CLAUDE.md 1.2의 항목을 정하면 반드시 여기 남기고 1.1 표를 채운다.
