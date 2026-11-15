# Lunar Landing Orbit Simulator

첫 화면은 기존 [종말 하강·접촉 제약](docs/TERMINAL_DESCENT.md)을 유지하면서 통과한 [Mode B 기본 예제](docs/SUCCESSFUL_DEFAULT.md)입니다. 전이 3일·동력 하강 880초·접근 방향 180°이며, 매번 브라우저에서 다시 계산합니다. NRHO 계산은 Mode B만 사용하며 별도 100 km LLO 시작 기능도 제공합니다.


NASA LOLA 지형, JPL SPICE에서 전처리한 천체력·좌표 변환 자료와 선택 가능한 GRAIL GL1800F 달 중력장을 사용하는 **브라우저 전용** 달 착륙 궤도 시뮬레이터입니다. 기존 LLO 착륙과 Mode B의 날짜 기반 NRHO → LLO → 착륙을 지원합니다. React / TypeScript / Vite / Three.js / React Three Fiber로 작성되었으며 궤도 적분·동력 하강 탐색·연료 소모·착륙 검증을 Web Worker에서 직접 계산합니다.

Python API, Node API, 데이터베이스, 로그인, API 키는 실행에 필요하지 않습니다. Vite는 로컬 정적 파일 개발 서버입니다. Python은 선택적인 원본 데이터 전처리와 독립 검증에만 사용합니다.

## Windows 실행

Node.js 22.12 이상을 설치한 후 PowerShell에서 이 프로젝트 폴더로 이동합니다.

```powershell
npm install
npm run dev
```

터미널에 표시된 `http://127.0.0.1:5174`를 엽니다. 초기 데이터 로딩 후 착륙지·UTC 시각·가상 착륙선 제원을 선택하고 **착륙 경로 계산**을 누릅니다. 타임라인, 그래프, 재생 버튼과 카메라 모드로 계산 결과를 확인할 수 있습니다.

```powershell
npm test
npm run build
npm run preview
```

`dist/` 전체가 배포 결과입니다. 이 폴더를 정적 호스팅에 올리면 됩니다. SPA의 `/` 경로에서 작동하며 Worker·JSON·바이너리·이미지를 같은 출처에서 제공합니다. `file://`로 직접 여는 방식은 브라우저 Worker/fetch 정책 때문에 지원하지 않습니다.

NASA 파일 SHA-256 검사에 Web Crypto를 사용하므로 **HTTPS 또는 localhost**에서 실행해야 합니다.

## 계산 실패 안내

계산이 실패하거나 착륙 검증을 통과하지 못하면 경고창이 자동으로 열립니다. 추력·추진제 부족, 지형/시각 데이터 범위, NRHO 전이 ΔV 한도, 계산 시간·횟수 한도, 중력 데이터·수치 오류, 입력 오류를 실제 진단 정보에 따라 구분하고 설정 조정 방법을 안내합니다. 수렴 실패는 모든 경로가 물리적으로 불가능하다는 뜻이 아니며, 추천은 성공을 보장하지 않습니다. 요청한 GRAIL 계산이 실패해도 점질량 성공 경로로 자동 대체하지 않습니다.

경고창의 **설정 확인하기**로 입력 화면에 돌아가 수정한 뒤 다시 계산하세요. 닫은 경고는 결과 아래 **원인·해결 방법**으로 다시 열 수 있습니다. 설정 변경 후에는 이전 계산의 진단임을 표시합니다. 정상 완료와 사용자 취소에는 실패 경고를 띄우지 않습니다.

## NRHO → LLO → 착륙 확장

`Initial Orbit`에서 **NRHO · NASA Reference**를 선택하면 날짜 기반 Mode B로 계산합니다. 이탈·전이·100 km 원궤도 진입·DOI·동력 하강을 연결합니다. 모델 선택기와 수동 출발 위상은 제거했으며, LLO에서 바로 시작하는 별도 계산은 유지합니다. [Mode B 전용 정리 내역](docs/MODE_B_ONLY.md).

| 모델 | 출발 상태·시간 | 적용 중력과 달 자세 |
|---|---|---|
| Mode B · Dated Ephemeris | NASA 참조 궤적에서 출발 시각의 상태 직접 조회, 사용자가 지정한 착륙 UTC | 전 구간 선택한 달 점질량 또는 GRAIL GL1800F + 날짜별 지구·태양 차등 중력·추력. SPICE의 실제 날짜별 달 자세 |

1. Mode B에서는 착륙지, **목표 착륙 UTC**와 **달 중력장**을 선택합니다. GRAIL 차수는 20·30·60·90 중에서 선택하며 기존 점질량 기준 모델도 유지합니다. 중력 설정이 없는 기존 요청은 점질량으로 해석합니다. Connecting Ridge / `2026-11-16T00:00:00Z`의 모델별 실제 실행 결과는 검증 문서를 참조하십시오. `NRHO 전체 임무 계산`을 누르면 같은 TypeScript 엔진이 브라우저에서 새 경로를 계산합니다.
2. 질량 기본값 1,500 kg은 **LLO 진입 후**의 질량입니다. 필요한 NRHO 출발 질량과 전이 추진제는 별도로 계산합니다. `NRHO 출발 질량`을 선택하면 입력 질량에서 전이 연료를 실제로 차감한 뒤 착륙 계산을 반복합니다.
3. 시스템·NRHO·전이·LLO·하강·착륙지 카메라를 전환하고, `구간 확대`로 짧은 하강 구간을 확대합니다. 기동 시 정지, 기동 이벤트 선택, 재생 속도, 계산 취소를 지원합니다.
4. 고급 설정에서 전이 시간 범위, 총 전이 ΔV 한도, LLO 체류 회전 수, 계산 시간·반복 한도를 조절합니다. Mode B는 착륙 UTC와 전이 시간으로 출발 시각을 결정합니다. Mode B는 여러 착륙 후보의 전이·착륙 전체 비용을 비교합니다. 9개 전이 시간과 2개 초기 추정 방향 중 넓은 시간 범위를 먼저 여러 접근 방향에 탐색하며, 제한 시간 안에 검증된 전체 임무 중 최선을 선택합니다. 수렴하지 않으면 성공 궤도를 만들지 않습니다.

Mode B는 NASA 공개 NRHO 참조 SPK의 필요한 구간을 정적 데이터로 가공하고, **각 후보의 출발 시각에 해당하는 위치·속도**를 직접 조회합니다. 11월 12일 초기상태를 장기간 전파해서 출발 상태를 만들지 않습니다. 출발 후 경로는 선택한 중력 모델과 추력을 적분하며 NASA 원본의 후속 상태나 궤도 유지 기동으로 덮어쓰지 않습니다. 실제 Gateway 운용 경로나 인증된 임무 해가 아닙니다. Mode B의 이탈·진입·DOI는 최대 추력·고정 관성 방향의 유한 연소입니다. 위치·속도·질량을 적분하고 두 전이 연소를 재표적화해 실제 도착 상태에서 접지까지 이어 계산합니다. [모델 설명](docs/FINITE_BURNS.md)과 [현재 검증 결과](docs/MODE_B_ONLY.md)를 확인하십시오.

Mode B 착륙 UTC는 **2026-11-01 00:00부터 2027-01-31 23:59:59.999까지** 지원합니다. 최대 14일 전이와 LLO 대기·출발 전 coast를 위해 10월 16일부터의 환경·참조 자료를 포함합니다. 약 **13.16 MB의 단일 정적 JSON**을 사용하며 원본 SPICE나 외부 API를 런타임에 읽지 않습니다. 데이터 지원과 경로 수렴은 별개입니다. 원본 공백·범위 밖 조회를 거부하고, 전체 비행을 실제 계산해 검증한 경우에만 성공 경로를 표시합니다. [확장 범위·대표 날짜 검증](docs/EPHEMERIS_EXPANSION.md).


GRAIL은 GL1800F의 정적 구면조화 계수를 최대 90차로 절단한 모델입니다. 계수는 `MOON_PA_DE440`에서 평가한 뒤 실제 날짜의 J2000 축으로 회전하며, 같은 모델을 NRHO 전파·전이·LLO 대기·DOI coast·동력 하강 및 재검증에 적용합니다. 약 164 kB의 정적 중력 파일만 읽으며 약 198 MB 원본 TAB을 브라우저에 보내지 않습니다. 차수가 높으면 계산량이 늘고, 시간가변 고체 조석·원본에서 제외한 영구 조석·90차 초과 성분은 포함하지 않습니다. 모델·프레임·진단 비교의 범위는 [docs/GRAVITY_MODEL.md](docs/GRAVITY_MODEL.md), 원본·정규화·검증 기준은 [docs/GRAVITY_DATA.md](docs/GRAVITY_DATA.md)를 참조하십시오.

검증 명령:

```powershell
npm test
node scripts/run-finite-validation.mjs --degree=30 --budget=180
# 선택적 개발용 독립 검증: numpy / scipy / spiceypy와 원본 커널 준비 후
py scripts/independent_verify_ephemeris.py --input .cache/finite-mission-30-default.json --output docs/finite-independent-validation-30.json
```

Mode B 자료는 `py scripts/prepare_ephemeris.py --help`로 전처리 옵션을 확인합니다. 일반 실행에는 Python이나 JPL API 접속이 필요하지 않습니다. Mode B 계산·재현 방법은 [docs/EPHEMERIS_MODEL.md](docs/EPHEMERIS_MODEL.md)에 정리했습니다.

소스 저장소는 [NASA-Space-Apps-Challenge-Team-DU-NE/Lunar-Landing-Orbit-Simulator](https://github.com/NASA-Space-Apps-Challenge-Team-DU-NE/Lunar-Landing-Orbit-Simulator)입니다. GitHub 소스 업로드와 정적 호스팅 배포는 별도 작업입니다. 이 문서의 로컬 검증 결과는 공개 호스팅에 동일 버전이 배포되었다는 의미가 아닙니다.

## 계산과 데이터

- 초기 궤도: 기준 반지름 1,737,400 m 위의 100 km 원궤도.
- DOI: vis-viva 초기 설계. 기존 LLO는 충격기동, Mode B는 실제 추력과 질량유량을 적용한 유한 연소.
- PDI 이후: 3차원 위치·속도·질량 상태를 중력과 추력으로 전방 적분하고 목표점·달 표면 상대속도를 맞추는 shooting 탐색.
- 결과 판정은 위치, 접지 속도, 수평 속도, 질량, 추력, 지형, 단계 연결 검사에 따릅니다. 미수렴·데이터 부족 결과는 성공으로 표시하지 않습니다.
- 가상 착륙선은 **DEMONSTRATION LANDER — ASSUMED PARAMETERS**로 표시됩니다. 실제 NASA 착륙선 제원이 아닙니다.
- 현재 정밀 착륙 목표 범위는 **남위 75°–90°**입니다. 기존 LLO 모드 접지 시각은 **2026-11-15 00:00–2026-11-22 00:00 UTC**, Mode B는 위의 별도 날짜 범위와 출발 제약을 사용합니다. 전체 비행의 데이터 범위를 검사하며 범위 밖은 성공으로 표시하지 않습니다.

NASA 자료를 사용했다는 사실은 NASA가 이 시뮬레이터나 결과를 검증했다는 의미가 아닙니다. `VALIDATED`는 문서에 정의한 계산 모델과 수치 허용오차에 대한 자체 검증 상태입니다.

## 구조

```text
frontend/src/components/  3D 장면과 UI
frontend/src/physics/     TypeScript 운동방정식·좌표변환·최적화·검증
frontend/src/workers/     브라우저 계산 Worker
frontend/src/services/    정적 데이터 및 Worker 연결
frontend/public/data/     NASA 파생 타일·좌표 변환 표·카탈로그
scripts/                 개발용 NASA 데이터 준비와 검증
tests/                   실제 수치 검증 및 오류 회귀 테스트
docs/                    검사 결과·원본 프로젝트 조사·데이터 목록
dist/                    npm run build 출력
```

기존 `Lunar-Landing-Site-Navigator` 저장소와 Google Drive 원본은 수정하지 않았습니다. 본 프로젝트는 독립 디렉터리에서 실행됩니다. 초기 UI와 지도 좌표 관례는 `docs/REFERENCE_PROJECT.md`에 기록합니다. 현재 UI는 미션 포탈의 2026-11-15 다크 테마를 따릅니다.

## 미션 포탈 연동 준비

포탈 코드는 수정하지 않고 orbit의 로컬 화면만 최신 검정 테마·흰색 주요 버튼·Pretendard/JetBrains Mono로 맞췄습니다. 글꼴과 팀 로고는 정적 파일로 포함되어 있습니다.

- [추가 입력 항목·기존 포탈 필드 매핑·주의점](docs/MISSION_PORTAL_INTEGRATION.md)
- [현재 검증 예제 Config JSON](docs/portal-orbit-default-input.json)
- [UI 변경·검증 기록](docs/PORTAL_UI_REVIEW.md)

아직 포탈과 상태를 공유하지 않습니다. 포탈 기본 날짜 2026-12-02는 확장된 Mode B 자료 범위 안입니다. 실제 통합 전에 날짜 범위·질량 기준 시점과 스타일 격리를 처리해야 합니다.

## 검증 및 한계 문서

- [DATA_AUDIT.md](DATA_AUDIT.md): Downloads/Drive 비교, SHA-256, 재사용 및 제외 사유.
- [PHYSICS_MODEL.md](PHYSICS_MODEL.md): 물리 모델, 좌표계, 최적화 및 수치 적분.
- [VALIDATION.md](VALIDATION.md): 실행한 테스트와 실제 수치 결과.
- [LIMITATIONS.md](LIMITATIONS.md): 지형·기간·물리 모델·미구현 기능의 한계.
- [docs/INTERFACE.md](docs/INTERFACE.md): 다른 사이트에서 전달할 수 있는 입력 구조.
- [과거 Mode A 설계 기록](NRHO_MODEL.md): 실제 JPL 기준 궤도와 CR3BP 적분.
- [docs/EPHEMERIS_MODEL.md](docs/EPHEMERIS_MODEL.md): Mode B 날짜·중력·전이·동력 하강과 재현 절차.
- [docs/EPHEMERIS_DATA.md](docs/EPHEMERIS_DATA.md): Mode B 원본 NASA 자료·전처리·지원 범위와 검증.
- [docs/GRAVITY_MODEL.md](docs/GRAVITY_MODEL.md): Mode B GRAIL 계산, 좌표 변환, 비교 진단과 한계.
- [docs/GRAVITY_DATA.md](docs/GRAVITY_DATA.md): GL1800F 원본·정적 계수·정규화·독립 기준값.
- [docs/GRAVITY_VALIDATION.md](docs/GRAVITY_VALIDATION.md): GRAIL 차수별 수치 검사·전체 임무·실행 성능의 실제 기록.
- [docs/FINITE_BURNS.md](docs/FINITE_BURNS.md): 현재 전이 shooting, 전체 임무 후보 탐색과 유한 연소.
- [COORDINATE_FRAMES.md](COORDINATE_FRAMES.md): UTC/ET·단위·위치/속도 변환·구간 연결.
- [docs/nrho-data-sources.md](docs/nrho-data-sources.md): NASA 공식 참고 임무와 현재 모델의 차이.

## 선택적 데이터 재생성

이미 가공한 정적 데이터가 포함되어 있으므로 일반 실행에는 이 단계가 필요하지 않습니다. 원본을 다시 준비하거나 제공 기간을 바꿀 개발자만 Python을 사용합니다.

```powershell
py -m pip install numpy scipy spiceypy pillow
py scripts/prepare_data.py --source-root "C:\path\to\DU_NE Data" --global-source "C:\path\to\ldem_4_uint.tif"
node scripts/run-physics-validation.mjs
py scripts/independent_verify.py
```

`data/config.json`의 원본 경로와 `static_epoch_utc` / `static_coverage_seconds`를 확인하십시오. 기본 전처리는 기존 로컬 파일만 읽습니다. `--download-missing`을 명시한 경우에만 필요한 허용 목록의 공식 자료를 프로젝트 `data/raw/`에 받으며 기존 원본을 덮어쓰지 않습니다. 타일·프레임 표를 갱신한 뒤 테스트와 정적 빌드를 다시 실행합니다.

## 출처

- [JPL DE440 상수](https://ssd.jpl.nasa.gov/astro_par.html)
- [NASA PDS GRAIL GL1800F](https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.xml)
- [NASA PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)
- [JPL NAIF generic kernels](https://naif.jpl.nasa.gov/naif/data_generic.html)
- [MOON_ME / DE440 frame kernel](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf)

NASA 원본 자료의 출처와 카탈로그의 연구 데이터 출처는 별도로 보존합니다. 카탈로그의 `verified`는 그 좌표 출처의 검토 상태이며, 그 지점의 착륙 안전성이나 본 시뮬레이션 성공을 의미하지 않습니다.
