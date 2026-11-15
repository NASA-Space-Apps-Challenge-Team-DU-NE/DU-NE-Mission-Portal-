# 화면 개편 + 실제 데이터 재연결 (2026-11-14 밤)

기준: 팀 UI 예시 `lunar-base-planner-ui.html`, `DEVELOPER_DATA_INTEGRATION_GUIDE.md`, `DU-NE_Drive_파일목록_2026-11-14.xlsx`.

## 1. 화면

UI 예시와 같은 구조·CSS·문구로 다시 만들었다. 계산 코어(`src/core`)와 Worker는 그대로 쓴다.

| 영역 | 내용 | 파일 |
| --- | --- | --- |
| 틀 | 상단 시간 막대 · 왼쪽 단계 사이드바(01→11, 단계별 요약·경고 점, "지금 계획") · 가운데 단계 화면(머리·꼬리 이전/다음) · 오른쪽 3D 달 + 현장 뷰 | `layout/Shell.tsx`, `layout/Rail.tsx` |
| 스타일 | UI 예시 CSS 그대로 (`styles/base.css`), 옛 토큰 이름은 별칭으로 남김 | `styles/base.css` |
| 단계 | 01 조건 · 02 착륙지 · 03 날짜 · 04 기지 · 05 전력 · 06 시뮬레이션 · 07 통신 · 08 일정 변경 · 09 비교 · 10 과거 미션 · 11 검증 | `pages/*.tsx` |
| 그림 | 예시의 차트·파노라마·하늘 돔·남극 지도를 실제 계산 결과에 연결 | `components/viz.tsx`, `components/SouthMap.tsx` |
| 3D 달 | 예시 셰이더·조작·HTML 표지(태양·지구 방향 칩) | `components/MoonGlobe.tsx` |
| 지구 3D | 07 통신에서 클릭으로 "가정 지상국" 추가 (저장하지 않음) | `components/EarthGlobe.tsx` |
| 레이어 고르기 | 그룹별 설명·좋은 방향·해상도·출처 창 | `components/kit.tsx`, `state/layerUi.ts` |

옛 화면 부품(`components/canvas/*`, `components/3d/*`, `components/ui`, `layout/TopBar·Sidebar·RightRail`, 옛 페이지 10개)은 지웠다.

### UI 예시와 일부러 다르게 한 것
- **3D 달의 지도 색은 75°S 이남만** 칠한다. 예시는 가짜 값으로 달 전체를 칠했지만, 실제 격자 자료는 남극 5 km 격자뿐이다 (합성 값 금지).
- 상단의 "UI 예시 · 값은 가짜" 배지는 뺐다. 배지는 실제 데이터 상태(데이터 준비됨 / 일부 수치 미검증)만 보인다.
- 검증 화면 수치는 파이프라인 s80 결과다. 천체력 판정은 파이프라인의 제안값 0.1°(임시값) 기준이라고 화면에 적었다.
- 지구 3D 표면 그림은 three.js 예제 이미지(CDN)를 쓴다. 장식이며 계산과 무관하다. 못 받으면 단색 구로 그린다.

## 2. 데이터

- `.env.local` 의 `LUNA_DATA_DIR` = 로컬 사본 `NASA_Data\DU_NE Data` (Drive 원본 2,083개 파일을 복사하고 MD5로 확인).
- 파이프라인 `python -m luna all` 을 실제 데이터로 다시 돌렸다. 필요한 97개 파일 모두 확인, 산출물 94개 · 13.3 MB.
- **새로 추가**: s60 이 `Raw_Data/LROC_Global/lroc_color_poles_8k.tif`(NASA SVS 4720 CGI Moon Kit)를 회색 `textures/globe_gray_2k.jpg`·`globe_gray_8k.jpg` 로 만든다. 3D 달 전역 표면용이며, 이전에 실행 중 받던 Moon Trek 타일을 대신한다. 가이드 8.2-6대로 표면 색으로만 쓰고 계산에는 쓰지 않는다.
- s80 결과: 천체력 12건(최대 각거리 0.003° 수준), 지평선 마스크 13건(Drive 대조 RMS 0.005–0.70°), 일조율 2건(PGDA69 대비 RMSE 0.062, r 0.89), PA→ME 1건.

## 3. 이번에 고친 버그
| 증상 | 원인 | 수정 |
| --- | --- | --- |
| s80 천체력 검증 0건 ("기간을 덮지 않음") | pandas 3 은 시각 해상도가 µs 라 `astype(int64)/1e9` 가 틀린 초를 냄 | epoch 기준 `total_seconds()` 로 변경 (`s80_validation.py`) |
| `npm run lint` 가 한글·공백 경로에서 실패 | `URL.pathname` 이 퍼센트 인코딩된 경로를 줌 | `fileURLToPath` 사용 (`scripts/check-rules.mjs`) |

## 4. 확인한 것 / 남은 것
- 확인: `tsc` 통과, 규칙 검사 통과, Vitest 41개 통과, `vite build` 통과, pytest 29개 통과. 브라우저에서 11단계 모두 열어 콘솔 오류 없음 확인. 1600×950 에서 UI 예시와 나란히 비교.
- 08 일정 변경의 대안 계산은 Worker 에서 15–20초 걸린다. 그동안 진행 막대만 보인다.
- 10 과거 미션의 "조명 관련" 표시는 카탈로그에 `lighting_related` 필드가 없어 결과 설명 문구(발전·일몰 언급)로 근사 판단한다. 카탈로그에 필드를 넣는 편이 맞다.
- 화면 문구는 UI 예시와 같게 페이지 안에 직접 적었다 (`strings.ts` 경유 아님).
- 파이썬은 3.14 에서 최신 패키지(rasterio 1.5.x, numpy 2.x, pandas 3.x)로 돌렸다. `requirements.txt` 고정 버전은 3.14 에서 설치되지 않는다 (TASKS T01).
