# LUNA-NAV · Lunar Base Planner — 팀 공통 개발 문서 (v4, 새 코드베이스)

> 저장소 루트의 `CLAUDE.md`. Claude Code는 세션을 시작할 때 이 파일을 자동으로 읽는다. 사람도 이 파일만 읽으면 같은 방식으로 일할 수 있다.
> 역할 구분은 없다. 누구든 `TASKS.md`에서 다음 작업을 가져가 이 문서의 명세대로 만든다.
>
> **v4에서 바뀐 것**
> 1. **코드는 처음부터 새로 짠다.** 이전 저장소(`nasa_project` v1)와 프로토타입 HTML은 동작·화면·데이터 형식의 *참고*일 뿐, 코드를 복사하지 않는다.
> 2. **데이터의 기준은 팀 공유 Drive `DU_NE Data`다.** 파일 1,680개(원본 1,167 + 검증 자료 513)를 전수조사·품질 판정한 `DU-NE_Drive_파일목록_2026-11-14.xlsx`와 `FINAL_COVERAGE_QA_REPORT.md`를 따른다.
> 3. 모든 값은 **원본 파일의 품질 상태**(VALIDATED / LIMITED_USE / REVIEW_REQUIRED …)를 끝까지 들고 다니고 화면에 표시한다.
> 4. 화면은 **왼쪽 사이드바 10개 페이지 + 오른쪽 고정 3D 달·현장 뷰**다. 디자인은 팀 UX 목업(dist) 팔레트를 따른다.
> 5. 3D는 **three.js**로 만든다.
>
> 구조 상세: `docs/ARCHITECTURE.md` · 작업 보드: `TASKS.md`

목차
0. 이 문서 사용법
1. 팀 확정 값과 정할 것
2. 무엇을 만드나
3. 원칙 (반드시 지킴)
4. 데이터 — Drive `DU_NE Data`
5. 기능 명세 (54개)
6. 기술 스택과 저장소 구조
7. 규약
8. 계산 명세
9. 화면 명세
10. 화면 문구 규칙
11. 같은 계산을 쓰는 기능 묶음
12. 협업 방식
13. 테스트와 검증
14. 일정과 늦을 때의 규칙
15. 제출 체크리스트
16. Claude 행동 규칙
17. 프롬프트 모음
18. 확인되지 않은 가정
19. 참고 링크

---

## 0. 이 문서 사용법

### 사람
1. 저장소를 받는다(`git clone`). Google Drive 데스크톱 앱으로 `DU_NE Data` 폴더가 내 PC에 동기화돼 있는지 확인한다(4.2).
2. `.env.local`에 `LUNA_DATA_DIR=<내 PC의 DU_NE Data 경로>`를 적는다.
3. 저장소 폴더에서 Claude Code를 열고 17절 **"세션 시작"** 프롬프트를 붙여 넣는다.
4. Claude가 고른 작업을 클레임(12.1)하고 진행한다. 끝나면 **"PR 전 점검"** 프롬프트를 돌린 뒤 PR을 올린다. 다른 팀원이 그 브랜치를 받아 로컬(`npm run dev`)에서 확인한다.

### Claude
- 세션마다 이 파일 → `docs/ARCHITECTURE.md` → `TASKS.md` → `web/src/core/types.ts` → `pipeline/luna/contracts.py` 순서로 읽는다.
- 모든 판단은 이 문서를 따른다. 다른 파일과 충돌하면 **이 문서가 우선**이고 충돌 사실을 사용자에게 알린다.
- 이 문서에 없는 것을 정해야 하면 **사용자에게 묻는다.** 임의로 정하지 않는다(16절).
- 데이터 파일을 쓸 때는 4절 표에서 경로·품질 상태를 확인하고, 표에 없으면 Drive 목록 엑셀에서 찾은 뒤 4절에 추가하는 PR을 함께 낸다.

---

## 1. 팀 확정 값과 정할 것

### 1.1 확정 값
비어 있는 값이 작업에 필요하면 Claude는 **묻는다.** 묻지 못하면 임시값을 `web/src/config.ts`(웹) 또는 `pipeline/luna/config.py`(파이프라인)에 `# PROVISIONAL` 주석과 함께 넣고 화면에서 바꿀 수 있게 한다.

| 항목 | 확정 값 | 임시값 (미확정) |
| --- | --- | --- |
| 개발 언어 | **TypeScript(웹) + Python 3.11(사전 계산)** | — |
| 웹 | **React + Vite**, 3D **three.js**, 상태 **Zustand** | — |
| 배포 | **보류** — 당분간 배포 없이 로컬 실행으로 확인 (2026-11-14 결정) | — |
| 데이터 원천 | **팀 Drive `DU_NE Data`** (2026-11-14 스냅샷) | — |
| 서버·DB | **없음.** 정적 파일만 | — |
| 제품 이름 | | LUNA-NAV / Lunar Base Planner 중 택1 |
| 저장소 | https://github.com/NASA-Space-Apps-Challenge-Team-DU-NE/Lunar-Landing-Site-Navigator | — |
| 화면 문구 언어 | | 한국어 기본 + 영어 전환(`strings.ts`) |
| 코드 주석·커밋·문서 | 한국어 | — |
| 천체력 허용 오차 (°) | | 0.1 |
| 지도 종합 점수 가중치 (발전·교신·물·금속·안전·지질) | | 40 / 25 / 20 / 0 / 15 / 10 (장기 기지 프로파일) |
| 시나리오 점수 가중치 (전력 / 통신 / 지연 견고성) | | 40 / 30 / 30 |
| 통신 여유각 기본값 (°) | | 2 |
| 지상국 최소 운용 고도각 (°) | | 10 (DSN 지평선 마스크가 있으면 그것 우선) |
| 허용 지연 일수 / 대안 날짜 폭 / 대안 반경 | | ±3일 / ±7일 / 200 km |
| 임무 기간 기본값 (h) | | 240 |
| 요구 조건: 최소 일조율 / 하루 최소 교신(h) / 허용 연속 암흑(h) / 최소 운용(h) / 전송량(MB) | | 0.6 / 6 / 48 / 168 / 2000 |
| 관측 높이 (m) | | 2 (Drive 지평선 마스크와 같음) |
| 암흑 판정 (원반 노출률 ≤) | | 0.01 |
| 남극 탐색 격자 | | 75°S 이남, 5 km, 방위 5° (8.4) |
| 착륙 먼지 반경 소·중·대 (km) | | 3 / 6 / 15 (근거 문헌 없음, **가정값** 표시) |
| 착륙 오차 타원 (km) | | 장축 10 · 단축 5 (P3-05) |
| 기능 동결 | 2026-11-15 16:00 | — |
| 제출 목표 / 마감 | 2026-11-15 21:00 / 23:59 (현지) | — |

### 1.2 팀이 정할 것 (정하면 `docs/decisions.md`에 기록하고 위 표를 채운다)
1. **제품 이름**(LUNA-NAV / Lunar Base Planner).
2. **아르테미스 후보 목록 기준.** NASA 2024-10-28 발표 9곳을 권한다. Drive `Horizon_Masks`·`Validation_Images` 폴더는 다른 13곳 기준이라 둘을 맞춰야 한다.
3. **종합 점수 식에 넣을 기준과 가중치.** 특히 경사·물까지 거리·장기 평균 일조율(PGDA69)을 넣을지.
4. **"물·얼음" 레이어에 쓸 지표.** 후보: 영구음영(LOLA PSR) 거리, LP 수소 ppm(0.5°), LEND 중성자, Diviner Tbol. 어느 것도 **얼음 검출이 아니다**(4.5).
5. **18개 과학 임무 자료를 앱에 노출할지와 방법.** 예: 지점 카드의 "과학 자료 맥락" 탭(해당 지점에 있는 관측 목록·품질), 또는 미션 프로파일 확장. **기능 목록 v2에 없는 기능이므로 결정 전에는 만들지 않는다.**
6. **미션 프로파일별 조건 값, 착륙 먼지 반경, 지질 위험 경고 거리.**
7. **5 m 국지 지형(PGDA78·PGDA104·NAC DTM)을 어느 지점까지 앱에 넣을지**(용량·시간).

---

## 2. 무엇을 만드나

### 과제
NASA Space Apps Challenge 2026 **"Lunar Landing Site Navigator"**. 달 남극 착륙지와 날짜를 빠르게 비교하는 직관적 도구. 태양·지구가 지평선 대비 어디 있는지 보여 주고 **전력(햇빛)** 과 **지구 직접 교신 창**을 평가한다.

### 제품 한 문장
**날짜와 착륙지를 고르면 달 남극의 햇빛·지구 교신·지형 위험을 실제 NASA 데이터로 계산해 보여 주고, 후보를 비교·순위화하고, 일정이 밀렸을 때 대안을 찾고, 착륙 후 운용(전력·교신)을 미리 돌려 보는 정적 웹앱.**

### 승부처
1. **일정이 밀렸을 때 대안을 얼마나 빨리 찾는가.**
2. **계산 신뢰도.** Horizons·SPICE 기준 표와 PGDA69 장기 평균 일조 지도·LROC WAC 실측 일조율로 우리 계산을 검증하고 공개한다. 모든 값에 원본 품질 상태를 붙인다.

### 데모 이야기 (모든 기능은 이 흐름을 돕는다)
1. 3D 달과 남극 지도에서 종합 점수가 높은 착륙지를 고른다. 현장 뷰 파노라마에 태양과 지구가 보인다.
2. 날짜를 2주 뒤로 옮긴다. 지구가 지형 아래로 내려가고 교신 지표가 빨개진다.
3. 일정 변경 페이지: 점수가 떨어진 이유와 "같은 곳 다른 날짜"·"다른 곳 같은 날짜" 대안이 차이와 함께 나온다.
4. 과거 미션: 비슷한 조건의 실제 착륙이 재현되고 "이 미션처럼 맞추기"로 또 다른 날짜를 받는다.
5. 후보 비교에 원래 안·템플릿 안·대안을 올려 결론을 낸다.
6. 임무 시뮬레이션: 원래 안은 배터리가 바닥나는 시점에서 멈추고(원인 표시), 대안은 끝까지 간다.
7. 전력 계획에서 "여기에 패널 몇 m², 배터리 몇 kWh", 검증 페이지에서 "PGDA69 대비 RMSE"로 마무리.

### 하지 않을 것
착륙 궤적 설계, 하강 장면, 착륙 성공 예측, 열 해석, 중계 위성 분석, 로버 경로 계획, 수빙 매장량 추정.
**점수는 후보 간 상대 비교용이며 확률이 아니다.**

---

## 3. 원칙 (반드시 지킴)

1. **우선순위**: 1순위(41) 무조건 → 2순위(6) 최대한 → 3순위(6) 가능하면 → UI(1). 1순위가 모두 "최소 완료"를 넘기 전에는 2순위를 시작하지 않는다.
2. **실제 데이터만.** 합성·난수 값으로 화면을 채우지 않는다. 자료가 없으면 "자료 없음"으로 표시하거나 숨긴다.
3. **품질 상태를 들고 다닌다.** 파이프라인 산출물마다 원본 파일 경로·SHA-256·품질 상태를 기록하고(`provenance`), 화면은 값 옆에 품질 배지를 단다.
   - `VALIDATED` 그대로 사용 · `LIMITED_USE` 허용 범위(지역·채널·기간)에서만, 배지 표시 · `REVIEW_REQUIRED` 사용 가능하나 "검토 필요" 배지 + 검증 작업 대상 · `REFERENCE_ONLY` 문서·라벨·미리보기 · **`VALIDATION_FAILED`·`NO_DATA` 사용 금지.**
4. **장기 평균과 날짜별 계산을 섞지 않는다.** PGDA69 일조·지구 가시 지도(약 18.6년 평균)는 "장기 평균" 레이어다. 특정 날짜의 그림자·교신·배터리는 지평선 마스크 + 천체력으로 **직접 계산**한다(QA 보고서 4절). 화면 이름도 구분한다: "장기 평균 일조율" vs "임무 기간 일조율".
5. **원본을 고치지 않는다.** Drive 파일은 읽기만 한다. 파이프라인 산출물은 저장소 `web/public/data/`(웹용)와 로컬 `build/`(중간물)에만 쓴다. Drive에 추가·수정할 때는 Drive 루트 `00_데이터_수정_원칙.md`를 따르고 `01_변경_기록.md`에 남긴다.
6. **같은 계산 코어를 쓰는 기능은 묶어서 만든다**(11절).
7. **1순위가 늦어지면 빼지 않고 "최소 완료 기준"까지만** 만들고 다음 1순위로 넘어간다.
8. **좌표계는 평균 지구-극(Mean Earth/Polar Axis, `MOON_ME`) 하나만 쓴다.** 앱·산출물·계산의 모든 위경도·벡터는 MOON_ME 기준이다.
9. **데이터마다 원래 좌표계를 확인하고 MOON_ME로 변환한 뒤에 쓴다.** 원래 좌표계를 확인하지 못한 파일은 쓰지 않는다. 변환 방법과 원래 좌표계는 provenance에 기록한다(4.6).

---

## 4. 데이터 — Drive `DU_NE Data`

### 4.1 Drive 구조 요약 (2026-11-14, 파일 1,680 · 폴더 213)
| 폴더 | 내용 | 앱에서 |
| --- | --- | --- |
| `Raw_Data/LOLA_DEM` | LOLA 80 m(80°S 이남, zip)·240 m(75°S 이남) 남극 DEM + 라벨 | 지평선·격자·경사 원천 |
| `Raw_Data/LOLA_DEM_Global` | 전역 128 ppd 중 **75–90°S 원래 행 추출본**(분할 zip 3조각) | 30 m급 지형 원천 |
| `Raw_Data/PGDA69` · `SouthPolar_75S_90S_v1/Raw_Data/Illumination` | 장기 평균 태양·지구 가시율, 영구음영, 하늘 입체각 라벨·일부 행 | 장기 평균 레이어 라벨 |
| `SouthPolar_75S_90S_v1/Regional/Illumination` | 위 제품의 **75°S 120 m·85°S 60 m GeoTIFF 전체** | 장기 평균 일조·지구 가시·PSR 레이어, 검증 참조 |
| `SouthPolar_75S_90S_v1/Regional/Terrain` | 240 m·80 m 고도·경사 GeoTIFF(80 m는 4타일) | 경사·안전 레이어 |
| `SouthPolar_75S_90S_v1/Regional/Terrain_30m` | 30 m 고도 36타일 + VRT | 착륙지 지평선 마스크 근거리 |
| `SouthPolar_75S_90S_v1/Regional/Imaging` | LROC WAC 643 nm 남극 여름 모자이크 100 m(4타일) | 3D 남극 표면 텍스처 |
| `SouthPolar_75S_90S_v1/Regional/Composition` | LP 수소 ppm·FeO wt% 0.5° CSV | 물·금속 레이어 |
| `SouthPolar_75S_90S_v1/Regional/Science` · `Raw_Data/LEND·Thermal` | LEND 중성자, LP 열외중성자, Diviner 현지시각 온도, 자기장 모델 | 물 지표 보조(선택) |
| `Raw_Data/PGDA78` · `Raw_Data/NASA_Gap_Collection_*/Terrain_Geology` | 5 m 국지 DEM(PGDA78·PGDA104 12구역), NAC DTM 2–4 m, 단층애·낙석·바위 목록, 평원 지질도, WAC 실측 조명률 | 고해상도 안전, 지질 위험, 검증 |
| `Raw_Data/NASA_Gap_Collection_*/Mission_Engineering` | DSN 문서, **DSN 지상국 SPK/프레임 커널**, 미션 공식 기록 PDF/HTML, NASA 전력 개념 | 지상국·미션·전력 근거 |
| `Reference_Tables` (+ `external_checks`, `NASA_Gap_Collection_*`) | Horizons·SPICE 기준 표 3곳, **과거 미션 좌표 16곳(공식 대조)**, 미션 이벤트 근거, 착륙선 제원, 기지 전력 개념, **DSN 안테나 좌표·지평선 마스크** | 카탈로그·검증 |
| `Raw_Data/SPICE_Kernels` | de440s, moon_pa_de440, moon_de440 프레임, naif0012, pck00011 | 검증용 기준 표 생성 |
| `Web_Derived` | 이전 앱용 Horizons 천체력(2026-11~2028-01 + 미션 16), 5 km 격자, Site01 묶음 | **참고**(새 파이프라인으로 재생성 후 대조) |
| `Horizon_Masks` | 13곳 1° 지평선 마스크(관측 높이 2 m) | **REVIEW_REQUIRED** — 재계산 결과와 대조용 |
| `Catalogs` | sites·missions·landers·stations JSON(이전 앱용) | 참고. 카탈로그는 `Reference_Tables`의 대조본 우선 |
| `Validation_Images` | 착륙 후보·극지 LROC NAC 영상 | 검증·발표 화면 참고 |
| `Workspace/Data_Coverage_QA` | **QA 결과**: 기능 54개×데이터 매핑(`04_Function_Mapping`), 품질표(`03_Quality`), 개발 지침(`05_Development_Docs`) | **개발 전에 읽을 것** |
| `_Archive`, `Incoming` | 보관·입고 대기 | 사용 안 함 |

### 4.2 받는 법 (팀 공통)
1. **Google Drive 데스크톱 앱**으로 `DU_NE Data`를 동기화한다. 큰 파일은 우클릭 → **오프라인으로 사용 가능**.
2. `.env.local`(커밋 금지)에 경로를 적는다.
   ```
   LUNA_DATA_DIR=G:\내 드라이브\DU_NE Data        # 예시. 각자 경로
   ```
3. 파이프라인은 **이 경로 아래 상대 경로**로만 파일을 찾는다(4.4 표의 경로 그대로). 하드코딩한 절대 경로 금지.
4. 첫 실행 `python -m luna.inventory` 가 `DU-NE_Drive_파일목록_2026-11-14.xlsx`를 읽어 필요한 파일이 있는지·크기·(가능하면) SHA-256을 확인하고 빠진 것을 목록으로 보여 준다.
5. 분할 zip(`*.zip.part001` …)은 파이프라인이 임시 폴더에서 이어 붙여 연다. 원본 폴더에 풀지 않는다.
6. 웹앱은 Drive를 직접 읽지 않는다. 파이프라인이 만든 `web/public/data/`만 읽는다(작고 빠르고, API 키·CORS 문제 없음).

### 4.3 개발 전에 읽을 QA 문서 (Drive `Workspace/Data_Coverage_QA/`)
| 문서 | 언제 |
| --- | --- |
| `05_Development_Docs/FINAL_COVERAGE_QA_REPORT.md` | 처음 한 번 (범위·품질 총괄) |
| `04_Function_Mapping/function_data_matrix.csv` · `05_.../FUNCTION_DATA_MAPPING.md` | **기능 하나를 시작할 때마다** 그 기능 행을 읽는다 |
| `05_.../COORDINATE_SYSTEM_GUIDE.md` | 좌표·투영을 다루는 작업 전 (ME vs PA, 극투영, 고도 기준) |
| `05_.../DATA_ACCESS_GUIDE.md` · `DATA_FORMAT_SPECIFICATION.md` | 새 파일 형식을 읽기 전 |
| `05_.../DATA_QUALITY_GUIDE.md` · `03_Quality/validation_issues.csv` | LIMITED_USE·REVIEW_REQUIRED 파일을 쓰기 전 |
| `04_Function_Mapping/coverage_overlap_matrix.csv` · `regional_data_availability.geojson` | 여러 자료를 겹쳐 쓰는 레이어 전 (T01–T13 지원 범위) |

### 4.4 기능별 사용 파일 (경로는 `LUNA_DATA_DIR` 기준, 품질은 Drive 목록 엑셀)
| 용도 | 파일 | 품질 | 메모 |
| --- | --- | --- | --- |
| 지평선 원거리 | `Raw_Data/LOLA_DEM/ldem_75s_240m.img` + `.lbl` | VALIDATED | 75°S 이남, 극평사 |
| 지평선 중거리 | `Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip` + `.lbl` | VALIDATED | 80°S 이남 |
| 지평선 근거리 | `SouthPolar_75S_90S_v1/Regional/Terrain_30m/LOLA_LDEM_75S_30m_r??_c??.tif` (36장, `.vrt`) | VALIDATED | 30 m |
| 경사·안전 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_75s_240m.tif`, `slope_80s_80m_{NE,NW,SE,SW}.tif`, `elevation_*` | VALIDATED | 격자 칸별 평균·90분위 경사 |
| 장기 평균 일조·지구 가시 | `SouthPolar_75S_90S_v1/Regional/Illumination/solar_illumination_{75s_120m,85s_60m}.tif`, `earth_visibility_{…}.tif` | VALIDATED | **장기 평균**(약 18.6년) |
| 영구음영(PSR) | `…/Illumination/permanent_shadow_{75s_120m,85s_60m}.tif` · `Workspace/Codex_Data_Collection/01_NASA_Downloads/Illumination/NAC_POLE_PSR_SOUTH/LOLA_PSR_75S90S_complete_features.zip` | VALIDATED · LIMITED_USE | `psr_dist_km`(래스터, 작은 그늘 포함 → 칸의 62%가 0), `psr_poly_dist_km`(폴리곤 5 km² 이상) |
| 하늘 입체각 | `…/Illumination/sky_visibility_75s_240m.tif` | VALIDATED | 참고 레이어(선택) |
| 실측 조명률(검증) | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_PCT_SOUTH_100M.IMG` (+README), `…_TWI_…` | LIMITED_USE | **88–90°S만** |
| 수소(물 지표) | `SouthPolar_75S_90S_v1/Regional/Composition/LP_hydrogenhd_75S90S_0p5deg.csv` | LIMITED_USE | 음수 추정 25개 처리(QA) |
| FeO·TiO₂(금속) | `…/Composition/LP_ironhd_75S90S_0p5deg.csv`(FeO 0.5°), `Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/LP_GRS_TiO2_native_75S90S.csv`(TiO₂ **2° 셀만** → `tio2_wt_lp`·`tio2_lp_sigma`) | LIMITED_USE | 지역 조성, **해상도 거칠다** 표시 |
| FeO 약 1 km | `Web_Derived/Mineral_Resources_3D_2026-11-15/NATIVE_NUMERIC_KAGUYA.zip.part*`(COG, `DOWNLOAD_AND_INSTALL.json`로 build/에 복원), 교차 확인 `Raw_Data/Gap_Supplements_2026-11-14/science/Kaguya_SP_LOLA_v2/*.zip` | REVIEW_REQUIRED | Lemelin 외 2022, 품질 1 화소만, 보간·−10 제외 (작업 5) |
| TiO₂ JAXA MI (연구용) | `…/NATIVE_NUMERIC_ALTERNATIVES.zip.part*`의 `jaxa_mi_tio2_*_16ppd.tif` | REVIEW_REQUIRED | **75–85°S 정량 사용 보류.** `tio2_jaxa_mi_research`(칸 중심 원래 화소)·`tio2_jaxa_mi_flags`만, 점수·필터·순위·내보내기에 쓰지 않음 (작업 6) |
| 중성자(보조) | `…/Regional/Science/lend_neutron_rates_75s_*.csv`, `lp_epithermal_75s.csv` | LIMITED_USE | 선택 |
| 온도(보조) | `…/Regional/Science/diviner_gcp_80s75s_002.tab.gz`, `Raw_Data/Thermal/global_cumul_avg_cyl_*.tab.gz` | LIMITED_USE | Diviner ST·PRP는 얼음 판정 금지 |
| 단층(지질) | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP` (남쪽 점 12개, 도형 좌표 기준) | REVIEW_REQUIRED | 점 자료 — 단층선까지 거리보다 길게 나옴 (작업 7) |
| 낙석·바위 | `Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv` (75°S 이남, 이전 추출본과 같은 821행), `Boulder_locations_in_shackleton_*` | REVIEW_REQUIRED | 80°S 이남은 검출 범위 밖 → 검출 없는 칸은 자료 없음 (작업 7) |
| 평원 지질도 | `…/Terrain_Geology/PolarPlains_Mapping.7z` | LIMITED_USE | `plains_frac` (매핑 범위 평사 ±304 km 밖은 자료 없음) |
| 섀클턴 바위 | `…/Terrain_Geology/Boulder_locations_in_shackleton_Gawronska_Boazman_2025.xlsx` + `Lunar_Geologic_Catalog_Coordinate_QA.csv` | LIMITED_USE | `boulder_count` (바위 없는 칸은 자료 없음, QA 이상치 1점 제외) |
| WAC 시간가중 조명률 | `…/Terrain_Geology/WAC_POLE_ILL_TWI_SOUTH_100M.IMG` | LIMITED_USE | `wac_ill_twi`, s80 일조 대조 (88–90°S) |
| 마스트 높이 검증 | `…/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv` | REVIEW_REQUIRED | s80 `mast` — B1 좌표 축 규약 미확인 |
| 한여름 연속 일조 검증 | `Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip` (후보점 속성 SunDays·SunEarth) | REVIEW_REQUIRED | s80 `wueller` — 한여름 기간 정의 없음, 가정 비교 |
| 5 m 국지 지형 | `Raw_Data/PGDA78/Site01_*`, `…/Terrain_Geology/PGDA104_A3CLR22_*.zip`, `NAC_DTM_*.TIF` | LIMITED_USE | 착륙지 상세(P1-05 완성, P3-05) |
| 3D 남극 텍스처 | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_{NE,NW,SE,SW}.tif` | VALIDATED | 다운샘플 PNG |
| 3D 전구 텍스처 | Moon Trek WMTS LRO_LOLA_ClrShade (원격), 대체 NASA SVS 4720 | 외부 | `Reference_Tables/external_checks/moon_trek_capabilities.xml` |
| 천체력 | **SPICE 주 경로** (`Raw_Data/SPICE_Kernels/*`, MOON_ME, LT+S), Horizons 는 대조용 (`config.eph.source`) | REVIEW_REQUIRED | **2026-11-01~2031-01-01** + 미션별 (작업 4) |
| 천체력 검증 | `Reference_Tables/horizons_*.csv`, `spice_*.csv`, `existing_validation.json`, `…/Terrain_Geology/Horizons_IM{1,2}_{Sun,Earth}_*.json` | REVIEW_REQUIRED/REF | 기준 표 |
| SPICE | `Raw_Data/SPICE_Kernels/*` | REVIEW_REQUIRED | 천체력 표 원천. `moon_de440_250416.tf`의 **MOON_ME** 프레임. CSPICE 는 한글 경로를 못 열어 커널 폴더로 옮겨 연다 |
| 착륙지 카탈로그 | `Catalogs/sites.json` (2026-11-15 대조 반영) + 대조 자료 `LUNA_HISTORICAL_SITE_COORDINATES_16.csv`, `Raw_Data/Additional_Global_Science/Mission_History/ANTHROPOGENIC_OBJECTS_180.ZIP`, `Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip`, `Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip` | REFERENCE_ONLY | 좌표 종류·근거 수준 필드, 대조 표 `validation/catalog_sites.json` (작업 1) |
| 과거 미션 | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv`, `LUNA_MISSION_FIELD_EVIDENCE.csv`, `Workspace/Codex_Data_Collection/00_Existing_Audit/LANDING_MISSION_RECONCILIATION.csv`, `Catalogs/missions.json` | REFERENCE_ONLY | 필드별 근거·조명 관련(yes/no/unknown)·시각 정밀도. 실제 운용 기간이 없으면 계획 기간으로 대신하지 않음 (작업 2) |
| 착륙선 프리셋 | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_LANDER_TECHNICAL_SPECS.csv`, `Catalogs/landers.json` | REFERENCE_ONLY | 근거표에 대응 행 없음 → 데이터 숫자는 null. 화면은 근사값(PROVISIONAL)으로 시작, "근사값" 배지 (작업 3) |
| 기지 전력 기준 | `…/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv`, `Mission_Engineering/NASA_Lunar_relocatable_10kW_array.pdf` | REFERENCE_ONLY | 비교 단위 |
| 지상국 | `…/DSN_ITRF93_ANTENNA_COORDINATES.csv`, `DSN_HORIZON_MASKS_301O.csv`, `EARTH_STATION_LEGACY_FIELD_AUDIT.csv`(여주 포함), `Mission_Engineering/earthstns_itrf93_260814.bsp` | REFERENCE_ONLY | 안테나별 방위 마스크 |
| 마스트 높이(검증) | `…/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv` | REVIEW_REQUIRED | P3-01 결과 대조 |
| 기능↔자료 매핑 | `Workspace/Data_Coverage_QA/04_Function_Mapping/function_data_matrix.csv` | VALIDATED | 기능 시작 전 |

### 4.5 쓰면 안 되는 것 · 주의 (QA 보고서)
- `Raw_Data/LOLA_DEM_Global/ldem_128.img` — **VALIDATION_FAILED**(앞부분만 있음). 대신 같은 폴더의 75–90°S 행 추출 zip 3조각.
- Diviner **ST 온도 제품** — 분석 제외. Diviner **PRP 모델**(facet·깊이) — **얼음 검출로 쓰지 않음.**
- `LADEE_LDEX_*` — NO_DATA(비극지).
- LEND 파일명의 두 날짜는 "이틀치"가 아니라 **두 누적 기간의 시작**.
- ESALL_SR12 CONF의 미정의 코드 1,208개 제외. CONF가 없는 DTM은 유한값만 검증된 상태.
- SOFIA 슬릿은 경도 방향 불명 → 다른 지도와 정합 보류.
- QA의 0.25° 검사 격자 "충족"은 **같은 각도 셀에 자료가 있다는 뜻**이지 면적비·동시 관측·미터급 정합이 아니다.
- **T03(정밀 DEM + 위치 확인된 고해상도 영상) = 0셀.** 고해상도 영상 위에 지형을 겹친 "정밀 착륙 판정" 화면은 만들지 않는다.
- 좌표계는 4.6을 따른다. 원래 좌표계를 확인하지 않은 채 다른 지도와 겹치지 않는다.

### 4.6 좌표계 — 평균 지구-극(MOON_ME) 사용과 데이터 변환

#### 기준 (앱 전체 공통)
| 항목 | 기준 |
| --- | --- |
| 달 고정 좌표계 | **MOON_ME (Mean Earth/Polar Axis)**. x축 = 위도 0°·경도 0°(지구를 향한 평균 방향), z축 = 평균 자전축(북극) |
| 위경도 | 행성 중심(planetocentric) 위도, **동경 +**, 경도 범위 **(−180, 180]** |
| 고도 | 기준 구면 **1737.4 km** 대비 m |
| 남극 격자 투영 | MOON_ME 위 남극 중심 방위 등거리(AEQD), 구 반지름 1737.4 km |
| 천체 위치 | 달 중심 MOON_ME 벡터(km) |
| 지구 쪽 좌표 (지상국) | 지구 고정 ITRF93 / WGS84. 지상국에서 본 달 고도 계산에만 쓰고 달 좌표와 섞지 않는다 |

#### 데이터별 원래 좌표계와 변환 (파이프라인이 처리, 확인 전 값은 "확인 필요")
| 데이터 | 원래 좌표계·형식 (확인할 곳) | MOON_ME로 바꾸는 일 |
| --- | --- | --- |
| LOLA DEM `.img` (80·240 m) | 남극 극평사 투영, ME 기준, 16비트 정수×배율 (`.lbl`의 MAP_PROJECTION, SCALING_FACTOR, OFFSET) | 라벨 파라미터로 픽셀 ↔ 위경도 변환, 정수 → m, 기준 구면 고도 확인 |
| LOLA 30 m 타일·Regional GeoTIFF (고도·경사·PGDA69 조명·PSR) | GeoTIFF CRS (극평사, 중심 경도·반지름 파일마다) | 파일마다 CRS를 읽어 기록, 서로 다르면 격자로 재투영(쌍선형/평균) |
| WAC 모자이크·`WAC_POLE_ILL_*.IMG` | 극평사 (라벨·CRS) | 같음. 텍스처는 AEQD로 재투영 |
| PGDA78·PGDA104·NAC DTM (5 m, 2–4 m) | 지점 중심 극평사·국지 투영이 파일마다 다름, 고도 기준도 다를 수 있음 | CRS·고도 기준 확인 후 변환. 고도 기준이 다르면 1737.4 km 구면으로 맞춤 |
| LP 수소·FeO·TiO₂ CSV, LEND·LP 중성자 CSV | 위경도 격자(0.5°·2°·5°·20°), **경도 0–360°일 수 있음**, 값이 칸 중심인지 모서리인지 | 경도 → (−180, 180], 칸 중심 좌표로 통일 후 격자 칸에 면적 가중 할당 |
| Diviner 표(`*.tab`) | 원통 도법 위경도, 경도 0–360° 가능 | 경도 변환, 칸 중심 통일 |
| 점 목록 CSV (단층애·낙석·바위, 미션 좌표 16곳) | 위경도 열, 경도 방향·범위 파일마다 확인 (QA의 좌표 QA 표) | 경도 부호·범위 통일, 출처 좌표계가 ME가 아니면 표시 |
| PSR 폴리곤 (zip 안 shapefile) | `.prj` CRS | 위경도로 읽고 AEQD로 변환, 거리 레이어 계산 |
| SPICE 커널 | `moon_pa_de440_200625.bpc` = **PA(주축) 좌표계** | `moon_de440_250416.tf`의 `MOON_ME`(ME_DE440) 프레임으로 변환해서 비교. PA와 ME는 수백 m 수준 다르다 |
| JPL Horizons 응답 | 응답 헤더의 좌표계 표기 확인 (달 고정 프레임 이름) | ME가 아니면 변환 후 저장. 직하점 경도 범위 통일 |
| Drive `Horizon_Masks`·`Web_Derived` (이전 산출물) | 이전 앱 기준 (manifest 확인) | 대조용으로만 쓰고, 방위 기준(북 0°, 시계 방향)이 같은지 먼저 확인 |
| DSN·여주 지상국 | ITRF93 직교 좌표 / 측지 위경도 | 지구 쪽 계산에만 사용 (변환 대상 아님) |
| 외부 3D 텍스처(Moon Trek, SVS) | 등장방형 위경도, 경도 0 중심 여부 확인 | 텍스처 UV의 경도 0이 MOON_ME 경도 0과 맞는지 확인 |

#### 규칙
1. 파이프라인의 모든 입력은 `luna/geo/frames.py`·`polar.py`만 거쳐 MOON_ME로 들어온다. 단계별로 따로 변환 코드를 쓰지 않는다.
2. provenance에 `source_crs`(원래 좌표계 문자열 또는 라벨 요약), `transform`(변환 방법), `lon_convention`(원래 경도 범위)을 기록한다.
3. 원래 좌표계가 라벨·CRS·문서로 확인되지 않으면 그 파일은 쓰지 않고 `docs/validation.md` "좌표계 미확인"에 올린다.
4. 변환 검증: 극투영 왕복 오차, 같은 지점을 서로 다른 자료(LOLA 고도 vs PGDA 타일 vs NAC DTM)에서 찍어 고도·위치 차이를 비교해 기록한다.
5. 웹앱은 변환하지 않는다. 산출물은 이미 MOON_ME이고, core는 그것만 가정한다.
6. 자세한 근거는 Drive `Workspace/Data_Coverage_QA/05_Development_Docs/COORDINATE_SYSTEM_GUIDE.md`를 따른다. 이 표와 다르면 그 문서를 확인하고 이 표를 고친다.

---

## 5. 기능 명세 (54개)

각 기능: **ID · 기능 · 최소 완료(반드시) · 완성(시간 되면) · 데이터(4.4) · 페이지(9절)**. 기능마다 시작 전에 `function_data_matrix.csv`의 같은 기능 행을 읽고, 데이터 상태(DATA_READY / PARTIAL_DATA / QUALITY_LIMITED / MODEL_REQUIRED / UI_ONLY / DATA_MISSING)를 PR 설명에 적는다.

### 5.1 우선순위 1 (41개)

**지도**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-01 | 달 3D 지도 | three.js 구 + 실제 표면 텍스처 + 선택 시각 태양 방향 조명·명암 경계 + 회전·확대·클릭 선택 | 남극 WAC 텍스처, 남극 격자 실제 그림자(지금 햇빛) 오버레이 | Moon Trek/SVS, WAC 모자이크, 천체력 | 오른쪽 |
| P1-02 | 종합 점수 지도 | 격자 칸별 종합 점수 색(빨강→노랑→초록), 켜기·끄기(C), 진하기, 미달 칸 흐리게/가리기/그대로 | 2D·3D 같은 색 | 격자 레이어 | 01·오른쪽 |
| P1-03 | 햇빛 지도 | 임무 기간 일조율 레이어 + "지금 햇빛" 전환 | **장기 평균 일조율(PGDA69) 레이어**를 별도 이름으로 | 격자 지평선·천체력, PGDA69 | 01 |
| P1-04 | 지구 교신 지도 | 임무 기간 지구 가시율(여유각 반영) | 장기 평균 지구 가시율(PGDA69), 지상국 교집합 교신율 | 같음 | 01 |
| P1-05 | 착륙 안전 지도 | 칸별 평균·90분위 경사와 안전 점수 | 착륙지 5 m 경사(PGDA78/104) 상세 | 80·240 m 경사, 5 m 국지 | 01 |
| P1-06 | 지질 위험 지도 | 단층애 거리(3곳) + 급경사 + 낙석 밀도로 위험도. 자료가 없는 곳은 "자료 없음" | 평원 지질도 연계 | 단층애·낙석 CSV, 경사 | 01 |
| P1-07 | 마커 | 착륙지·과거 미션·아르테미스 후보·상위 후보·내 기지·태양/지구 직하점 (2D·3D) | 클릭 선택, 겹침 처리 | 카탈로그 | 01·오른쪽 |

**착륙지·날짜**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-08 | 착륙지 목록 | 카테고리(아폴로·CLPS·다른 나라·아르테미스·기타) + 검색. 고르면 전 화면 반영 | "지형 반영/격자 근사/지형 미반영" 배지 | sites | 01 |
| P1-09 | 좌표 직접 입력 | 위·경도 입력. 75°S 이남은 격자 지평선(근사 표시), 그 밖은 구면 지평선 + "지형 미반영" | 지도·3D 클릭 입력 | 격자 | 01 |
| P1-10 | 날짜·시각 선택 | UTC 날짜·시각 입력 + 시간 막대, 100 ms 안 갱신 | "지금", "착륙 시각"으로 이동 | — | 상단 |
| P1-11 | 시간 재생 | 1h·6h·1d 속도, 일시정지, 스페이스·←/→·Shift | 재생 중 "지금 햇빛" 갱신 | — | 상단 |

**현장 정보**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-12 | 지평선 파노라마 | 방위 0–360°, 지형 윤곽, 태양(원반)·지구 현재 위치, 기간 궤적 | 마우스 방위·고도, 가시 비율 | 마스크·천체력 | 오른쪽 |
| P1-13 | 하늘 돔 | 천정 중심 극좌표, 지형 지평선, 30일 궤적 | 현재 위치 강조 | 같음 | 오른쪽 |
| P1-14 | 지표 카드 | 태양 고도·방위, 원반 노출률, 일몰(일출)까지, 지구 보임·고도, 지구몰(돋이)까지, 기간 일조율·교신율·최장 암흑 | 지구 위상, 지형 지평선 높이 | 같음 | 오른쪽 |
| P1-15 | 조도 | 수평면·수직 추적 패널 W/m² | 기간 평균 | 같음 | 오른쪽 |
| P1-16 | 통신 여유각 | 0–10° 슬라이더 → 교신 판정·지표·지도 갱신 | — | — | 01·07 |
| P1-17 | 알림 | 30일: 일출·일몰, 지구 뜸·짐, 착륙 윈도, 먼지·단층 경고. 클릭 → 그 시각 | 개수 배지 | 타임라인 | 오른쪽 |

**후보지 찾기**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-18 | 조건 필터 | 일조 ≥, 교신 ≥, 경사 ≤, 물까지 ≤, 최장 그늘 ≤, 단층 근처 제외, 아르테미스만. 자료 없는 조건은 비활성 + "자료 없음" | 통과 칸 수 | 격자 레이어 | 01 |
| P1-19 | 후보지 순위 | 통과 칸 상위 15(8 km 중복 제외), 카탈로그 순위 전환, 행 클릭 → 선택 | 정렬 | 같음 | 01 |
| P1-20 | 점수 근거 | 기준별 기여 막대 + 감점 이유 + 빠진 기준(자료 없음) | 시나리오 점수도 같은 형식 | 같음 | 01 |
| P1-21 | 착륙 윈도 | 태양 ≥50% + 지구 가시가 24·48·72h 이상, 30·60·90일 | 상위 6곳 비교 타임라인 | 타임라인 | 02 |

**일정 지연**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-22 | 원래 안 재평가 | "점수 82 → 54, 원인: 교신율 71% → 38%" | +3·+7·+14일 미리보기 | 시나리오 점수 | 03 |
| P1-23 | 대안 제안 | 같은 곳 다른 날짜(±7일) / 다른 곳 같은 날짜(200 km) 그룹별 상위 3 | 격자 칸 후보 포함 | 같음 | 03 |
| P1-24 | 차이 표시 | 6개 변화량(점수·일조·교신·최장 암흑·거리·날짜) + 이유 한 줄 | "비교에 추가" | 같음 | 03 |

**과거 미션**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-25 | 과거 미션 재현 | 실제 착륙 시각·좌표로 이동 + 기간 재생 + 결과 라벨 | 3건 이상 기록 대조 결과 표시 | 미션 좌표 16·이벤트 근거, 미션 천체력 | 09 |
| P1-26 | 참고 사례 | 비슷한 과거 미션 3개 + 결과·실패 원인 항상 함께 | 특징별 차이 | 같음 | 09 |
| P1-27 | 이 미션처럼 맞추기 | 일출 후 경과 시간이 같아지는 가장 가까운 날짜 제안 | 태양 고도도 맞춤 | 같음 | 09 |

**기지·전력**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-28 | 먼지·충돌 검사 | 먼지 반경 안 보호 대상(과거 착륙지)·단층 근처 경고 + 지도 원 | 기지끼리 검사(P2-06) | 카탈로그, 단층, 가정값 | 04 |
| P1-29 | 착륙선 프리셋 | 3–4종 선택·수정 + "근사값" 배지 | 공개 수치 출처 링크 | 착륙선 제원 CSV | 06 |
| P1-30 | 전력 계산 | 1 m² 평균 발전, 패널 면적, 배터리 kWh, 30일 그래프 | 수요 예시, 비교 단위(10 kW 배열·FSP) | 타임라인, 전력 개념 CSV | 05 |
| P1-31 | 패널 설치 추천 | 반경 R km 안 칸 중 같은 수요에 패널·배터리 최소 5곳(4 km 이상, 경사 조건) | 여기로 착륙지 바꾸기 | 격자 | 05 |

**운용 시뮬레이션**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-32 | 임무 시뮬레이션 | 거주·ISRU·상시 부하 + 패널·배터리로 최대 1년: 가동률, 정전, 교신 끊김, ISRU 차단 + 그래프 | 이벤트 기록, 자동 크기 | 1년 타임라인 | 06 |
| P1-33 | 표면 운용 타임랩스 | 착륙선 프리셋으로 배터리·교신·누적 전송 재생 + 충족/부분/미충족 | 현장 뷰와 시각 연동 | 같음 | 06 |
| P1-34 | 멈춤 지점과 원인 | 배터리 하한 첫 도달 시각 + 원인(일조 차단/지구 가림/소비 과다) | 그 시각 파노라마 자동 | 같음 | 06 |

**통신**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-35 | 지구 교신 판정 | 지구 중심 고도 > 지형 지평선 + 여유각 | — | 마스크·천체력 | 공통 |
| P1-36 | 지상국 통신 창 | 달에서 지구 보임 ∩ 지상국(골드스톤·마드리드·캔버라·여주)에서 달 고도 ≥ 기준. 지상국별 띠 + 하루 교신 시간 | **안테나별 DSN 지평선 마스크**, 시뮬레이션 반영 | DSN 좌표·마스크, 여주 제원 | 07 |

**비교·검증**
| ID | 기능 | 최소 완료 | 완성 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- | --- |
| P1-37 | 비교 보드 | 시나리오(착륙지+시각+기간) 2–4개 나란히, 출처(사용자/대안/템플릿/미션) | 30일 햇빛·교신 띠 | — | 08 |
| P1-38 | 시나리오 비교 | 조건 묶음 A/B 저장 → 순위 결과 비교, 겹치는 상위 후보 수 | — | — | 08 |
| P1-39 | 검증 | ① 천체력 vs Horizons·SPICE 기준 표 ② **우리 장기 일조율 vs PGDA69**, WAC 실측(88–90°S) 산점도·평균 차이·RMSE·r ③ 미션 재현 vs 기록 | 차이 큰 지점 목록 | 4.4 검증 행 | 10 |
| P1-40 | 데이터 출처 | 값마다 출처·해상도·종류(실제/근사/가정값/자료 없음)·**품질 상태**·링크 | 값 옆 정보 아이콘 | `sources.json`, `quality.json` | 오른쪽 |
| P1-41 | 내보내기 | 순위 CSV, 보고서 텍스트(조건·상위 후보·경고·검증 요약) | 비교 보드 CSV | — | 상단 |

### 5.2 우선순위 2 (6개)
| ID | 기능 | 완료 기준 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- |
| P2-01 | 물·얼음 지도 | PSR 거리 + LP 수소 ppm(+선택 LEND·Tbol) 레이어, "얼음 가능성 지표 · 검출 아님" 표시 | 4.4 | 01 |
| P2-02 | 금속 지도 | LP FeO·TiO₂ 레이어 + "원 격자 2–20°, 해상도 거침" 표시 | 4.4 | 01 |
| P2-03 | 미션 프리셋 | 장기 기지·착륙 정찰·물 탐사 → 필수 조건·가중치 자동 | 1.2-6 | 상단·01 |
| P2-04 | 역방향 탐색 | 요구 조건 + 날짜 범위 → (착륙지, 날짜 구간) 점수순. Worker·진행률·멈춤 없음 | 마스크·천체력 | 02 |
| P2-05 | 파노라마 겹쳐 보기 | 두 시나리오 지평선·궤적을 한 파노라마에 색·선으로 구분 | — | 03 |
| P2-06 | 기지 배치 | 착륙장(소·중·대)·발전·물 채굴·거주 배치·삭제, 목록, 거리표, 먼지·단층 검사 확장 | 카탈로그 | 04 |

### 5.3 우선순위 3 (6개)
| ID | 기능 | 완료 기준 | 데이터 | 페이지 |
| --- | --- | --- | --- | --- |
| P3-01 | 마스트 높이 비교 | 관측 높이 0·5·10·20·30 m별 마스크를 **파이프라인으로 실제 계산**(근사식 금지) → 일조율·최장 그늘·패널·배터리 | DEM, JPL IPN 표(검증) | 05 |
| P3-02 | 빛 릴레이 | 햇빛 시간이 엇갈리는 두 곳 쌍 | 격자 | 05 |
| P3-03 | 착륙선 시점 화면 | 착륙선에서 본 하늘·지평선 타임랩스 | — | 06 |
| P3-04 | 빛 쌍둥이 | 30일 햇빛·교신 패턴이 비슷한 다른 지점(20 km 이상) 상위 3 | 격자 | 08 |
| P3-05 | 착륙 오차 확률 | 오차 타원 안 격자점별 요구 조건 만족 비율. **실제 5 m 지형이 있는 곳만** | 5 m 국지 | 03 |
| P3-06 | 과학·공학 균형 | PSR 거리 대 전력·통신 점수 산점도 | PSR | 08 |

### 5.4 UI (1개)
| ID | 기능 | 완료 기준 | 페이지 |
| --- | --- | --- | --- |
| UI-01 | 전체화면·발표 모드 | 3D 달 전체화면(버튼·더블클릭·F, Esc 복귀): 조건 요약·선택 지점 카드·시간 막대만. 발표 모드는 이것도 숨김 | 오른쪽 |

---

## 6. 기술 스택과 저장소 구조

### 6.1 스택
| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 웹 | React 18 + Vite 5 + TypeScript 5 (strict) | |
| 3D | three.js | 텍스처·조명·남극 오버레이·마커·레이캐스트 |
| 상태 | Zustand | 슬라이스별 스토어, 파생값은 셀렉터·useMemo |
| 2D 그림 | Canvas 2D (남극 지도, 파노라마, 하늘 돔, 타임라인, 그래프) | |
| 무거운 계산 | Web Worker (격자 점수, 대안, 역방향 탐색, 패널 추천, 1년 시뮬) | |
| 천체력(브라우저) | 사전 수신 Horizons 표 보간 기본, 표 밖은 core 안 해석적 근사(`AnalyticEphemeris`, `docs/decisions.md`) | "근사 천체력" 배지 |
| 사전 계산 | Python 3.11: numpy, rasterio, pyproj, pandas, openpyxl, spiceypy(검증), pillow, py7zr | `pipeline/requirements.txt` 버전 고정 |
| 테스트 | Vitest(TS), Playwright(스모크), pytest(Python) | |
| 배포 | 보류. 로컬 `npm run dev` 로 확인 | |
| 서버·DB | 없음 | |

의존성 버전은 **T01에서 실제 설치한 버전으로 `package.json`·`requirements.txt`에 정확히 고정**한다(`^` 금지). 새 의존성은 팀에 먼저 알린다.

### 6.2 저장소 구조 (상세는 `docs/ARCHITECTURE.md`)
```
CLAUDE.md  TASKS.md  README.md  .env.example
docs/          ARCHITECTURE.md  decisions.md  validation.md  sources.md  handoff/
pipeline/      Python 패키지 luna/ (inventory → ephemeris → terrain → masks → grid → layers → textures → catalogs → validation → manifest)
web/           React 앱 (src/core · adapters · state · workers · components · pages · styles), public/data/ = 파이프라인 산출물
build/         파이프라인 중간물 (git 제외)
```

---

## 7. 규약

| 항목 | 규칙 |
| --- | --- |
| 각도 | 도(°). 함수 내부는 라디안 가능, 입출력은 도 |
| 방위각 | 북 0°, 동(시계 방향) 증가, [0, 360) |
| 고도각 | 수평 0°, 천정 90° |
| 위·경도 | 북위 +, 동경 +, 경도 (−180, 180] |
| 좌표계 | **MOON_ME (평균 지구-극)**. x = (0°, 0°), z = 북극. 다른 좌표계 자료는 4.6대로 변환 후 사용 |
| 고도 | 기준 구면 1737.4 km 대비 m |
| 시각 | 저장·계산 UTC, ISO 8601 `2027-01-02T06:00:00Z`, 화면에 항상 "UTC" |
| 거리 km · 비율 0–1 저장, 화면에서만 % |
| 이름 | TS camelCase/PascalCase, 컴포넌트 파일 PascalCase.tsx, Python snake_case, JSON 필드 snake_case + 단위 접미사 `_deg _m _km _h _w _wh _kw _kwh _kbps _mb _utc` |
| 지점 id | 소문자 snake_case `shackleton_rim`, 격자 칸 `cell_<index>` |
| 상수 (`core/constants.ts`, `luna/constants.py` 같은 값) | `R_MOON_KM=1737.4`, `S0_W_M2=1361`, `R_SUN_KM=695700`, `R_EARTH_KM=6378.137`, `AU_KM=149597870.7`, `SYNODIC_DAYS=29.530588853` |
| 바이너리 | 리틀 엔디언, 행 우선. 형식·배율·결측(NaN 또는 지정값)은 manifest에 |
| 품질 | 모든 산출물·레이어에 `kind`(real/approx/assumed/missing)와 `quality`(Drive 상태) |

**core 금지**: `Date.now()`, 시드 없는 `Math.random()`, DOM, fetch, React import. **pipeline 금지**: Drive 원본 수정, 절대 경로 하드코딩.

---

## 8. 계산 명세

### 8.1 공용 타입
`web/src/core/types.ts`(TS)와 `pipeline/luna/contracts.py`(Python dataclass)가 **같은 계약**이다. 산출물 JSON의 스키마는 `docs/ARCHITECTURE.md` 5절. 바꾸려면 12.5 절차.
핵심 타입: `Site`, `HorizonMask`(az_step_deg, elevation_deg[], observer_height_m, terrain: 'site'|'grid'|'flat', provenance), `AzEl`, `SkyState`, `TimelineSample`, `Summary`, `SkyEvent`, `Requirements`, `Scenario`, `ScenarioScore`, `GridManifest`, `LayerMeta`(name, file, unit, kind, quality, source_keys, coverage), `Mission`, `Lander`, `Station`(+ horizon_mask), `SourceEntry`, `Provenance`(drive_path, sha256, quality, retrieved).

### 8.2 좌표 변환
착륙지 φ, λ, h: `u=[cosφcosλ, cosφsinλ, sinφ]`, `p=(R+h/1000)u`, `e=[−sinλ, cosλ, 0]`, `n=[−sinφcosλ, −sinφsinλ, cosφ]`.
천체 위치 B(달 중심 MOON_ME km): `d=B−p`, `el=asin(d̂·u)`, `az=atan2(d̂·e, d̂·n)`, `ang_radius=asin(R_body/|d|)`. **지구는 착륙지 기준(topocentric)으로.**
표 보간: 직하점(λs, φs)·거리 D → 단위 벡터를 선형 보간 후 정규화(경도 직접 보간 금지).

### 8.3 하늘·지표
- 태양 원반 노출률: `h=horizonAt(mask, az)`, `x=clamp((el−h)/r, −1, 1)`, `frac=1−(acos x − x√(1−x²))/π`.
- 지구 교신: `earth.el > horizonAt(mask, earth.az) + margin`.
- 조도: `S=S0(AU/dist)²`; 수평 `S·frac·max(0, sin el)`; 수직 추적 `S·frac·cos el`; 수직 고정(방위 A) `S·frac·cos el·max(0, cos(az−A))`.
- summarize: illum_frac(평균 frac), sunlit_frac(frac>0.01), comm_frac, longest_dark_h, daily_comm_h_min, 다음 일몰·일출·지구몰·돋이(0.25 h 이하 재표본, 최대 60일, 보간 시각).
- 착륙 윈도: `frac≥0.5 && earth_visible`이 min_h 이상 연속.

### 8.4 지평선 마스크 (pipeline)
1. 관측점 지면 고도 H₀ = 가장 촘촘한 DEM에서 쌍선형 보간, `r₀=R+H₀+h_obs`.
2. 방위마다 대원을 따라 거리 s 증가: **30 m(근거리) → 80 m → 240 m(원거리, 최대 300 km)** 순으로 DEM 선택. 범위를 벗어나면 그 방위는 멈추고 `max_range_km` 기록.
3. 곡률 반영 `elev=atan2(r·cosθ − r₀, r·sinθ)`, θ=s/R. 방위의 지평선 = 최댓값.
4. 착륙지 1°(360), 격자 5°(72, int16×0.01°).
5. **Drive `Horizon_Masks` 13곳(REVIEW_REQUIRED)과 비교**해 차이를 `docs/validation.md`에 기록.
6. (P3-01) 관측 높이 0·5·10·20·30 m로 반복.

### 8.5 남극 탐색 격자 (pipeline → web)
- 투영: 남극 방위 등거리(AEQD), 5 km, 75°S 이남(반경 약 455 km), 유효 칸 약 2.6만(PROVISIONAL, 성능 보고 후 확정).
- 정적 레이어(파이프라인, 칸 평균 또는 지정 통계): `elev_m`, `slope_mean_deg`, `slope_p90_deg`, `illum_avg`(PGDA69 장기), `earth_vis_avg`(PGDA69 장기), `psr_frac`, `psr_dist_km`, `h_ppm`, `feo_wt`, `tio2_wt`, `scarp_dist_km`, `rockfall_density`, `wac_ill_pct`(88–90°S), `sky_sr`. 원본에 없는 칸은 NaN.
- 동적 레이어(Worker): 임무 기간 `illum_mission`, `comm_mission`, `sun_now`, `dark_h`(6 h 간격, 최대 60일).
- 안전 `safety=clamp(1−slope_p90/16, 0, 1)` (PROVISIONAL). 지질 `geo=clamp(1−exp(−scarp_dist/10),0,1)·clamp(1−max(0,slope_p90−15)/15,0,1)·(1−rockfall_norm)` (PROVISIONAL, 자료 없는 항은 빼고 이름에 표시).
- 종합 = 자료가 있는 기준만 가중 평균. 필터 하나라도 실패 → 미통과. 자료 없는 필터는 비활성.
- 순위: 통과 칸 점수순, 8 km 안 중복 제외, 상위 15.

### 8.6 시나리오 점수·대안·참고 사례
- `power_s=0.5·min(1, illum/req)+0.5·min(1, max_dark/max(dark,1))`, `comm_s=0.5·min(1, comm/0.5)+0.5·min(1, daily_min/req)`, `robust_s`=±delay일 각 경우 (power_s+comm_s)/2 최솟값, `total=100·가중 평균`. 요건 실패 → "요건 미달" + reason.
- 대안 A: 새 날짜 ±7일 6 h 간격 상위 3(24 h 이상 떨어짐). B: 200 km 안 착륙지 + 통과 격자 칸 상위 3(8 km 이상). 차이 6개 + 이유(절댓값 최대 변화).
- 참고 사례 특징 `[|lat|, 착륙 시 태양 고도, 지구 고도, 일출 후 경과 h, 임무 기간]` z-score + 태그(전원·통신·접근) 차이 +0.5. 결과 라벨·원인 필수. 템플릿: 내 지점 ±30일 1 h 간격으로 일출 후 경과가 같아지는 가장 가까운 시각.

### 8.7 지상국
- 지상국 좌표: `DSN_ITRF93_ANTENNA_COORDINATES.csv`(골드스톤·마드리드·캔버라 대표 안테나) + 여주(`EARTH_STATION_LEGACY_FIELD_AUDIT.csv`·KARI 자료).
- 달 고도: 지상국 지평 좌표(대기 굴절 없음). 기준: **안테나별 DSN 지평선 마스크(`DSN_HORIZON_MASKS_301O.csv`) 우선**, 없으면 최소 고도각.
- 교신 가능 = 착륙지 `earth_visible` ∩ 지상국 가시 합집합.

### 8.8 에너지 수지 (타임랩스·임무 시뮬 공용)
```
P_gen = S·frac·mountFactor·area·eff·(1−loss)
P_load = active(교신·운용) | idle | survival(배터리 < min_fraction)
E ← clamp(E + (P_gen−P_load)·Δt·(충전이면 0.9), 0, cap)   // 시작 0.8·cap
sent_mb += 교신 ? rate_kbps·3600·Δt/8000 : 0
```
판정: 운용 h ≥ min_ops_h 이고 전송 ≥ data_mb → 충족, 하나만 → 부분, 둘 다 아님 → 미충족. 멈춤 원인: 직전 12 h frac≈0 과반 → 일조 차단, 교신 불가 과반 → 지구 가림, 그 외 소비 과다. 1년 시뮬: 배터리 20% 미만 ISRU 차단, 50% 이상 재가동, 자동 크기는 첫 30일 `powerPlan`.

### 8.9 전력
1 m² 출력 = 수직 추적 기준. 패널 면적 이분 탐색 × (1+margin). 배터리 = 최대 감소량 ÷ 0.8. 비교 단위는 `LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv`의 값과 출처를 그대로 쓴다(기억으로 숫자 쓰지 않음).

### 8.10 검증 통계
- 천체력: 같은 시각 고도 차이 + **각거리**, 최대·평균.
- 일조율: PGDA69 장기 평균을 격자 칸으로 표본 추출 → 우리 장기 일조율(1년 이상, 2.5일 간격)과 평균 차이·RMSE·r·차이 큰 칸. WAC 실측은 88–90°S만.

### 8.11 성능 목표
첫 화면 3초(격자는 뒤에서 로드), 날짜·지점 변경 → 현장 뷰 100 ms, 격자 재계산 1초(Worker), 대안 2초, 1년 시뮬 1초, 역방향 탐색 10초(진행률), 메모리 300 MB, `web/public/data` 전체 60 MB 이하.

---

## 9. 화면 명세

### 9.1 배치 (데스크톱 1440)
```
┌ 사이드바 ┬──────────── 상단: 프로파일 · 날짜/시각 · ▶ 속도 · 데이터 상태 배지 · ? · 보고서 · CSV ────────────┐
│ 01 후보지 탐색 │  페이지 (약 2/3)                                   │ 3D 달 (레이어·미달 표시·진하기·⤢)   │
│ 02 시간 윈도   │                                                     ├─────────────────────────────────────┤
│ 03 일정 변경   │                                                     │ 현장 뷰: 하늘 | 알림 | 데이터 출처 │
│ 04 기지 배치   │                                                     │  지표 카드 · 파노라마 · 하늘 돔      │
│ 05 전력 계획   │                                                     │                                     │
│ 06 임무 시뮬   │                                                     │                                     │
│ 07 통신        │                                                     │                                     │
│ 08 후보 비교   │                                                     │                                     │
│ 09 과거 미션   │                                                     │                                     │
│ 10 검증        │                                                     │                                     │
└────────────────┴─────────────────────────────────────────────────────┴─────────────────────────────────────┘
```
- 1280px 이하: 오른쪽 영역이 페이지 위로. 760px 이하: 한 열, 16px 여백, 가로 스크롤 없음.
- 색: 목업 팔레트(paper 배경·white 카드·navy 사이드바/3D 배경·teal 강조·amber 태양·coral 경고·earth 청록). 토큰은 `web/src/styles/tokens.css` 한 곳. 점수 색 `#d07166 → #d3a05c → #2b8f85`. 색만으로 의미를 전달하지 않는다(숫자·글자 함께).

### 9.2 페이지별 기능
| 페이지 | 기능 |
| --- | --- |
| 01 후보지 탐색 | 착륙지 목록·좌표(P1-08·09), KPI, 필수 조건·가중치·여유각(P1-18·16, P2-03), 순위(P1-19), 점수 근거(P1-20), 일정 민감도 미리보기(P1-22 완성), 2D 남극 지도 + 레이어(P1-02~07, P2-01·02) |
| 02 시간 윈도 | 착륙 윈도(P1-21), 상위 6곳 타임라인, 역방향 탐색(P2-04) |
| 03 일정 변경 | 재평가(P1-22), 대안(P1-23), 차이(P1-24), 겹쳐 보기(P2-05), 착륙 오차(P3-05) |
| 04 기지 배치 | 기지 배치(P2-06), 먼지·충돌 검사(P1-28), 거리표 |
| 05 전력 계획 | 전력 계산(P1-30), 패널 추천(P1-31), 마스트 비교(P3-01), 빛 릴레이(P3-02) |
| 06 임무 시뮬레이션 | 착륙선 프리셋(P1-29), 타임랩스·멈춤(P1-33·34), 1년 기지(P1-32), 착륙선 시점(P3-03) |
| 07 통신 | 지구 교신 타임라인(P1-35), 지상국 창(P1-36), 여유각 |
| 08 후보 비교 | 비교 보드(P1-37), 시나리오 A/B(P1-38), 빛 쌍둥이(P3-04), 과학·공학 균형(P3-06) |
| 09 과거 미션 | 재현(P1-25), 참고 사례(P1-26), 맞추기(P1-27) |
| 10 검증 | P1-39 ①②③ |
| 오른쪽 고정 | 3D 달(P1-01·02·07, UI-01), 현장 뷰(P1-12~17), 데이터 출처(P1-40) |
| 상단 | 날짜·시각·재생(P1-10·11), 프로파일(P2-03), 내보내기(P1-41) |

### 9.3 상호작용
입력 즉시 반영(적용 버튼 없음), 무거운 계산은 Worker + 진행 표시 + 이전 요청 취소. 자료 없는 기능은 회색 + "자료 없음" + 출처 링크. 단축키: 스페이스 재생, ←/→ 1h, Shift 1일, C 색, F 전체화면, Esc 닫기. URL 쿼리에 지점·시각·기간·페이지(공유).

---

## 10. 화면 문구 규칙

문구는 모두 `web/src/strings.ts`에 키로.
| 쓰지 않는다 | 대신 |
| --- | --- |
| 임무 성공 확률 | 표면 운용 요구 조건 충족 여부 |
| 추천 미션 | 참고 사례 (결과 라벨·실패 원인 함께) |
| (점수 옆) 확률·성공 가능성 | 후보 간 상대 비교용 지표이며 확률이 아님 |
| 얼음이 있다 / 매장량 | 얼음 가능성 지표 · 검출 아님 |
| 일조율 (장기 평균인데 구분 없이) | 장기 평균 일조율(PGDA69) / 임무 기간 일조율 |
| 안전한 착륙지 | 조건을 만족하는 착륙지 |
| (지형 없는 곳 무표시) | 지형 미반영 · 격자 근사 |
| (착륙선·먼지 값을 확정처럼) | 근사값 · 가정값 |
| (빈 화면) | 자료 없음 |
| (품질 미표시) | 검증됨 / 제한 사용 / 검토 필요 배지 |

미검증 값이 하나라도 있으면 상단 배지 "일부 수치 미검증". 시각에 UTC, 숫자에 단위.

---

## 11. 같은 계산을 쓰는 기능 묶음
| 묶음 | 코어 | 기능 |
| --- | --- | --- |
| A 하늘 | ephemeris, horizon, timeline, events | 파노라마·돔·지표·조도·여유각·알림·윈도·교신 판정·미션 재현 |
| B 격자 | gridScore(Worker) + 정적 레이어 | 2D/3D 지도 레이어, 필터, 순위, 점수 근거, 패널 추천, P2 물·금속, P3 쌍둥이·오차·균형 |
| C 시나리오 | score, alternatives | 재평가·대안·차이·비교 보드·A/B·역방향 탐색·겹쳐 보기 |
| D 미션 | similarity | 참고 사례·맞추기 |
| E 에너지 | simulate, power | 전력·프리셋·타임랩스·멈춤·1년 시뮬·마스트·릴레이·착륙선 시점 |
| F 통신 | stations | 지상국 창 |
| G 위험 | dust, geology | 먼지·충돌, 기지 배치, 지질 위험 |
| H 신뢰 | validation, provenance | 검증·출처·품질 배지·내보내기 |
| I 3D | three.js | 3D 달·마커·전체화면 |
| P 파이프라인 | luna.* | 모든 정적 산출물 |

---

## 12. 협업 방식

### 12.1 클레임
1. `git pull` → `TASKS.md`에서 의존이 모두 `완료`인 `대기` 작업 중 가장 위.
2. 상태 `진행`, 담당, 브랜치 기록 → **`TASKS.md`만 main에 바로 커밋·푸시**(`chore(tasks): U03 클레임`). 유일한 main 직접 커밋 예외.
3. 충돌이면 pull 후 다시. 먼저 푸시한 사람이 우선.
4. 2시간 넘게 커밋이 없으면 팀 채팅 확인 후 넘겨받을 수 있다.

### 12.2 완료의 정의
main 병합 + 로컬 실행에서 동작 + 작성자 외 1명 확인 + 테스트·빌드 통과 + `TASKS.md` 완료 + (데이터 작업) provenance·품질 기록.

### 12.3 브랜치·커밋·PR
`feat/<ID>-<이름>`, `fix/…`, `data/…`. 커밋 `<종류>(<범위>): <내용>`. PR 제목 `<ID> <작업>`, 본문: 무엇·왜·확인 방법 + 스크린샷 + **사용한 Drive 파일과 품질 상태**. 공용 파일 변경은 맨 위 "공용 변경". 리뷰 30분 안, squash merge.

### 12.4 충돌 방지
공용 파일(`types.ts`, `contracts.py`, `config.ts`, `strings.ts`, `tokens.css`, `store/*`, `TASKS.md`, `docs/ARCHITECTURE.md` 5절)은 필요한 줄만 추가. 같은 `pages/<페이지>` 폴더를 동시에 고치지 않는다. 큰 리팩터링 금지.

### 12.5 공용 계약 바꾸기
팀 채팅 3줄(무엇·왜·영향 파일) → 이견 없으면 `types.ts`·`contracts.py`·이 문서·ARCHITECTURE 5절을 **같은 PR에서** → `docs/decisions.md` 기록 → 산출물 재생성.

### 12.6 소통
15분 막히면 팀 채팅(하려던 것·안 되는 것·해 본 것). 점검 30분 전 상태 한 줄. 세션 끝 `docs/handoff/<이름>-<날짜시각>.md`.

---

## 13. 테스트와 검증

| 대상 | 테스트 |
| --- | --- |
| core/vec | ENU 직교, 방위 정규화(−10°→350°), ±180° 경계 보간 연속 |
| horizon | 격자점·보간·359.5° 감싸기, frac(x=1→1, 0→0.5, −1→0) |
| timeline/events | 합성 표본(10 h 밝음·5 h 어둠 반복)으로 일조율·최장 암흑·보간 시각·윈도 *(테스트용 합성 입력은 허용, 화면 노출 금지)* |
| ephemeris | 기준 CSV 대비 최대·평균 오차 ≤ 허용 |
| gridScore | 자료 없는 기준 제외, 필터 경계, 8 km 중복 제외 |
| score / simulate / power / dust | 경계값, 상·하한, 원인 분류, 이분 탐색 단조성 |
| pipeline (pytest) | 평평한 DEM → 곡률만큼 음수 지평선, 단일 봉우리 DEM → 그 방위만 높음, PDS 라벨 파싱, 극투영 왕복 오차, 분할 zip 결합 SHA |
| 데이터 | 산출물마다 provenance 존재(`source_crs` 포함), VALIDATION_FAILED 파일 사용 0건 |
| 좌표계 | 극평사·AEQD 왕복 오차, 경도 0–360 → (−180, 180] 변환, PA → ME 변환값을 SPICE와 대조, 같은 지점의 자료 간 위치·고도 차이 |
| 스모크 (Playwright) | 10개 페이지 열기, 지점 선택, 시간 재생, 콘솔 에러 0 |

`docs/validation.md`: 천체력(Horizons·SPICE) / 지평선 마스크(Drive 13곳 대조) / 일조율(PGDA69·WAC) / 미션 재현 3건 / 마스트 높이(JPL IPN 표) 결과.

---

## 14. 일정과 늦을 때의 규칙

| 시점 | 확인 | 늦으면 |
| --- | --- | --- |
| 토 11:00 | T01–T05, P01 인벤토리 통과 | 바로 공유, 데이터 경로 문제 먼저 |
| 토 15:00 | 천체력(P02)·DEM 조립(P03)·지평선(P04), C01–C03 | 3D·텍스처는 뒤로 |
| 토 20:00 | 격자·정적 레이어(P05·P06), 묶음 A 화면, 3D 기본 | 저녁은 P1 최소 완료만 |
| 토 23:30 | P1 코어 전부, 화면 2/3 | 일 오전까지 P1 최소 완료 |
| 일 11:00 | **P1 41개 최소 완료** (T09 관통) | 2순위 시작 안 함 |
| 일 14:00 | P1 완성 보강 + P2 | P3 시작 안 함 |
| 일 16:00 | **기능 동결** | 미완성 P2·P3는 `FEATURES`로 숨김 |
| 일 21:00 | 제출 목표 (마감 23:59) | — |

P1은 빼지 않는다. "최소 완료"까지만 만들고 다음으로.

---

## 15. 제출 체크리스트
- [ ] 데모 이야기 전체 동작 (배포 방식은 팀 결정, 그 전까지 로컬 실행)
- [ ] 공개 GitHub 저장소, README(실행·배포·기능·데이터 출처)
- [ ] 데모 영상
- [ ] NASA 데이터 목록 + 그 밖의 데이터 목록(`docs/sources.md`, Drive 경로·품질 포함)
- [ ] AI 도구 사용 내역
- [ ] 검증 결과 요약(`docs/validation.md`)
- [ ] 합성 값 0, VALIDATION_FAILED 사용 0, 문구 규칙 위반 0, `verified:false` 0(또는 화면에 미검증 표시)
- [ ] 제출 항목·분량·형식은 참가자 가이드로 확인

---

## 16. Claude 행동 규칙

### 한다
- 세션 시작 시 0절 순서로 읽고 작업 ID를 확인한다.
- 시작 전 할 일을 5줄 이내로 말하고 바로 시작한다.
- 이 문서의 명세(타입, 수식, 파일 형식, 우선순위, 문구, 품질 규칙)를 그대로 따른다.
- 데이터 파일을 열기 전에 4.4 표와 Drive 목록 엑셀에서 **품질 상태**를 확인하고, 산출물 provenance에 경로·SHA-256·품질을 쓴다.
- 기능을 시작할 때 `function_data_matrix.csv`의 그 기능 행을 읽고 요약한다.
- core·pipeline 함수마다 테스트를 쓰고 돌린다. 화면은 실행해서 확인하고 스크린샷을 남긴다.
- 정확히 모르는 것(라이브러리 함수, 파일 구조, 대회 규정)은 확인하고 쓰거나 "확인 필요"로 표시한다.
- 끝나면 완료 기준을 하나씩 체크해 보여 주고 PR 설명·`TASKS.md` 갱신을 준비한다.

### 하지 않는다
- 이 문서에 없는 기능 추가(18개 과학 임무 노출 포함, 1.2-5 결정 전). 우선순위 무시.
- 팀 확정 값·공용 계약 임의 변경.
- 기억·추정으로 좌표·날짜·제원 숫자 채우기. 합성·난수 데이터를 실제처럼 쓰기.
- VALIDATION_FAILED·NO_DATA 파일 사용, Diviner PRP로 얼음 판정, 장기 평균을 날짜별 값처럼 표시.
- 원래 좌표계를 확인하지 않은 파일 사용, MOON_ME가 아닌 좌표를 변환 없이 겹치기, `geo/` 밖에서 좌표 변환 코드 작성.
- 이전 저장소·프로토타입 **코드 복사**.
- Drive 원본 수정·삭제, 50 MB 넘는 파일 커밋, `git push --force`, main 직접 커밋(TASKS 클레임 제외), 다른 사람 브랜치 수정.

### 막혔을 때
15분 넘으면 멈추고 시도한 것과 선택지 2–3개를 보고. 다른 사람 작업이 원인이면 고치지 말고 원인·제안 정리. 점검 지점을 못 맞출 것 같으면 14절 규칙으로 축소안 제안.

---

## 17. 프롬프트 모음
`<>`만 바꿔서 붙여 넣는다.

### 세션 시작 (매번)
```
CLAUDE.md를 처음부터 끝까지 읽고 그 규칙대로 작업해 줘. 그다음 docs/ARCHITECTURE.md, TASKS.md, web/src/core/types.ts, pipeline/luna/contracts.py를 읽어.
- 내 이름: <이름>
- 지금 시각: <예: 토 14:30>
- 데이터 경로: .env.local 의 LUNA_DATA_DIR (없으면 나한테 물어봐)
- 할 작업: <작업 ID, 또는 "다음 작업 골라 줘">

1. 작업이 없으면 12.1 규칙과 우선순위로 지금 시작할 수 있는 작업을 골라 줘.
2. git pull 후 TASKS.md 클레임(TASKS.md만 main에 커밋·푸시), feat/<ID>-<이름> 브랜치 생성.
3. 이 작업의 명세(5절 기능, 8절 계산, 9절 화면, ARCHITECTURE 해당 절)와 최소 완료·완성 기준을 요약해.
4. 데이터가 필요한 작업이면 4.4 표에서 쓸 파일·품질 상태를 적고, Drive QA의 function_data_matrix.csv에서 해당 기능 행을 읽어 요약해.
5. 할 일을 5줄 이내로 말한 뒤 바로 시작해. 비어 있는 확정 값이나 계약 변경이 필요하면 먼저 물어봐.
```

### 다음 작업 고르기
```
TASKS.md를 다시 읽고, 의존이 끝난 대기 작업 중 지금 바로 시작할 수 있는 것 3개를 알려 줘.
우선순위 1, 그리고 다음 점검 지점(14절)에 영향이 큰 것부터.
```

### 데이터 확인 (Drive)
```
<기능 ID 또는 데이터 이름>에 쓸 Drive 파일을 확인해 줘.
1. CLAUDE.md 4.4 표와 LUNA_DATA_DIR의 DU-NE_Drive_파일목록_2026-11-14.xlsx에서 후보 파일, 품질 상태, 크기를 찾아.
2. Workspace/Data_Coverage_QA/04_Function_Mapping/function_data_matrix.csv 해당 행과 03_Quality/validation_issues.csv 관련 행을 요약해.
3. 실제로 파일이 내 PC에 있는지(온라인 전용인지) 확인하고, 없으면 무엇을 오프라인으로 받아야 하는지 알려 줘.
4. 4.4 표에 없는 파일이면 표에 추가하는 변경을 제안해. 코드는 아직 쓰지 마.
```

### 파이프라인 작업
```
<ID>를 진행해 줘. CLAUDE.md 4·8절, ARCHITECTURE 4·5절을 따라.
- 입력은 LUNA_DATA_DIR 아래 상대 경로만. Drive 원본은 읽기만.
- 산출물마다 provenance(드라이브 경로, sha256, 품질 상태, 생성 시각)를 manifest에 적어.
- 결과를 PNG로 그려 눈으로 확인할 수 있게 하고 pytest를 붙여.
- REVIEW_REQUIRED 입력을 썼으면 docs/validation.md에 검증 항목을 추가해.
```

### 기능 구현 (웹)
```
<ID> <작업 이름>을 구현해 줘. CLAUDE.md 5절 기능, 8절 계산, 9절 화면, ARCHITECTURE 6절 모듈 규칙을 그대로 따라.
- core는 순수 함수 + Vitest. 무거운 계산은 Worker.
- 데이터는 web/public/data 산출물만 adapters 를 통해 읽어. 없으면 "자료 없음"으로 표시하고 합성 값 금지.
- 값 옆에 kind·quality 배지가 나오게 해.
- 문구는 strings.ts에, 10절 규칙대로.
끝나면 최소 완료·완성 기준을 하나씩 체크해서 보여 줘.
```

### 다른 사람 코드에 연결
```
<파일/함수>를 내 작업에 연결하려고 해. 먼저 읽고 CLAUDE.md 8절·types.ts·contracts.py와 다른 점이 있는지 확인해 줘.
다르면 고치지 말고 차이와 제안만 정리해 줘(팀 채팅용).
```

### 공용 계약 변경
```
<타입/함수/필드/파일 형식>을 이렇게 바꿔야 할 것 같아: <내용, 이유>.
코드는 아직 바꾸지 말고, 영향받는 파일 목록과 팀 채팅용 3줄 공지문을 써 줘(12.5).
```

### 버그
```
버그: <증상>. 재현: <순서>. 기대: <동작>.
원인을 찾아 설명하고, 내 작업 범위면 고치고 테스트를 추가해 줘. 다른 사람 작업이 원인이면 원인·수정안만 정리해 줘.
```

### PR 전 점검
```
PR 전에 점검해 줘.
1. 테스트·린트·타입·빌드 (web: npm run check, pipeline: pytest)
2. CLAUDE.md 규약(각도·좌표계 MOON_ME·UTC·단위·이름·10절 문구) 위반
3. 공용 파일 변경 여부 → 있으면 "공용 변경"
4. 합성 값, VALIDATION_FAILED 사용, provenance 누락, PROVISIONAL 새로 생긴 것
5. 최소 완료·완성 기준 충족 여부
문제 없으면 git pull --rebase 하고 PR 제목·본문(무엇/왜/확인 방법/사용한 Drive 파일·품질)을 써 주고 TASKS.md를 리뷰로 바꿔 줘.
```

### PR 리뷰
```
PR <번호/브랜치>를 리뷰해 줘. 기준: CLAUDE.md 명세 일치, 계산 정확성(단위·부호·좌표계·방위 기준), 품질 상태 처리, 합성 값 여부,
문구 규칙, 테스트, 범위 밖 변경. "꼭 고칠 것 / 고치면 좋은 것 / 괜찮음"으로 짧게. 브랜치를 받아 로컬에서 실행해 확인해 줘.
```

### 점검 지점 직전
```
지금 <시각>, 다음 점검은 <14절 시점과 기준>이야. TASKS.md 기준으로 남은 P1 작업과 예상 시간을 추정하고,
못 맞추면 어떤 P1을 "최소 완료"로 줄이고 어떤 P2·P3를 미룰지 제안해 줘.
```

### 기능 동결 후
```
기능 동결이야. 미완성 P2·P3를 config.ts FEATURES에서 끄고, 15절 제출 체크리스트를 하나씩 확인해서 남은 항목을 알려 줘.
```

### 세션 끝·인계
```
이번 세션을 정리해 줘: 끝난 것, 남은 것, 알려진 버그, 다음 사람이 알아야 할 것, TASKS.md 상태.
docs/handoff/<이름>-<날짜시각>.md로 저장하고 커밋해 줘.
```

---

## 18. 확인되지 않은 가정
- [ ] 사전 개발 규정(데이터·문서 재사용 범위), 제출 항목, 심사 기준
- [ ] 팀원 모두 Drive 데스크톱 동기화 가능 여부와 각자 `LUNA_DATA_DIR`
- [ ] 75°S 이남 5 km 격자(약 2.6만 칸)의 브라우저 계산 시간 — C04에서 측정 후 확정
- [ ] 30 m 타일·80 m·240 m DEM 극투영 파라미터가 서로 같은지(`COORDINATE_SYSTEM_GUIDE.md`)
- [ ] PGDA69 장기 평균 계산 기간·관측 높이와 우리 계산 조건 차이(비교 시 명시)
- [ ] 여주 안테나 좌표·최소 고도각 출처 확정
- [ ] 카탈로그 좌표(특히 아르테미스 대표점)의 출처
- [ ] Moon Trek 타일 서비스 가용성(대회 당일)
- [ ] 가중치·점수 식·지질 위험 식·먼지 반경은 제안값

---

## 19. 참고 링크
- 대회: https://www.spaceappschallenge.org/2026/
- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/ · API 문서: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- PGDA 69 극지 조명: https://pgda.gsfc.nasa.gov/products/69 · PGDA 78: https://pgda.gsfc.nasa.gov/products/78
- LROC 남극 일조 비율: https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH
- Moon Trek: https://trek.nasa.gov/moon/ · NASA SVS 4720: https://svs.gsfc.nasa.gov/4720/
- PDS LOLA: https://pds-geosciences.wustl.edu/missions/lro/lola.htm · NAIF: https://naif.jpl.nasa.gov/naif/data_generic.html
- NASA 아르테미스 III 후보 지역(2024-10-28): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- astronomy-engine: https://github.com/cosinekitty/astronomy
- 팀 Drive 안: `README.md`, `00_데이터_수정_원칙.md`, `Workspace/Data_Coverage_QA/05_Development_Docs/*`
