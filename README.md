# LUNA-NAV · Lunar Base Planner

NASA Space Apps Challenge 2026 **"Lunar Landing Site Navigator"** — 날짜와 착륙지를 고르면 달 남극의 햇빛·지구 교신·지형 위험을 실제 NASA 데이터로 계산해 보여 주는 정적 웹앱.

- 팀 규칙·명세: [`CLAUDE.md`](CLAUDE.md) · 구조: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 작업 보드: [`TASKS.md`](TASKS.md)
- 점수는 후보 간 상대 비교용 지표이며 확률이 아니다.
- 화면은 팀 UI 예시(`lunar-base-planner-ui.html`)의 01→11 단계 구조를 따른다. 바뀐 점: [`docs/handoff/2026-11-14-ui-redesign.md`](docs/handoff/2026-11-14-ui-redesign.md)

## 구성
```
pipeline/   Python 3.11 사전 계산 (Drive "DU_NE Data" → web/public/data)
web/        React + Vite + TypeScript + three.js 포탈
orbit/      검증된 Orbit 소스·정적 NASA 자료·회귀 검사
scripts/    통합 빌드와 로컬 확인
docs/       결정·검증·출처·좌표계 확인표
tests/      Python↔TS 교차 테스트 입력
```

## 홈페이지 + 포탈 사이트 (배포)

배포 사이트는 `/`에 팀 홈페이지(`homepage/`, 정적 HTML), `/mission-portal/`에 이 포탈을 둡니다. 홈페이지의 "착륙 계획 세우기"가 `/mission-portal/`로 이동합니다.

```sh
npm run build          # 포탈(web/dist) + 사이트(dist/: 홈페이지 + /mission-portal/)
npm run preview:site   # http://127.0.0.1:5176  (홈페이지 → 착륙 계획 세우기 → 포탈)
```

`dist/`는 `scripts/build-site.mjs`가 만들고 Cloudflare(`wrangler.jsonc`)가 이 폴더를 올립니다. 홈페이지 문구를 고치면 `homepage/`에서 고치고, 검색 색인은 `homepage/tools/build_search_index.py`로 다시 만듭니다.

## 포탈 + Orbit 실행

프로젝트 **루트**에서 실행합니다. Node.js 22 이상을 권장합니다.

```sh
npm install
npm run dev          # http://127.0.0.1:5175
```

05 궤도 분석은 NRHO Mode B를 브라우저 Worker에서 계산합니다. 01 착륙선 정보에서 질량·추진·궤도 조건, 02에서 계획 착륙지·UTC를 바꾸면 같은 입력이 05로 전달됩니다. 기본 임무는 Connecting Ridge, 2026-11-16 UTC, GRAIL 30차, LLO 총질량 1500 kg / 건조 650 kg / 최대 추력 12000 N의 검증 예제입니다. 저장된 성공 경로를 재생하지 않고 실행할 때 다시 계산합니다.

포탈 EN/KR 선택에 Orbit 언어도 따라 바뀌며 계산과 결과는 유지됩니다. 상단 보고서와 순위 CSV에는 Orbit 입력·계산 상태·검증 결과를 포함합니다. 순위 점수는 기존 표면 평가 기준을 유지하고, 미계산 후보에는 `NOT_CALCULATED`를 표시합니다. 카탈로그 복원·재연결 등 후속 수정은 [검토 수정 기록](docs/ORBIT_REVIEW_FIXES.md)을 확인하세요.

```sh
npm test             # 포탈 타입·규칙·170개 검사 + Orbit 76개 회귀 검사
npm run build        # 정적 배포물: web/dist
npm run preview      # 빌드 결과 확인, 포트 5175
npm --prefix web run e2e -- e2e/orbit-integration.spec.ts e2e/orbit-review-fixes.spec.ts e2e/smoke.spec.ts
```

Chrome으로 브라우저 검사를 하려면 `PLAYWRIGHT_CHANNEL=chrome` 환경 변수를 설정합니다. 통합 검사는 실제 계산을 포함합니다. `web`만 개발하려면 먼저 루트 `npm run prepare:orbit` 후 기존 `web` 명령을 사용할 수 있습니다. Orbit 소스를 수정한 경우 `npm run prepare:orbit`로 임베드 빌드를 갱신합니다.

`web/public/orbit`는 자동 생성·Git 제외 디렉터리입니다. Orbit 원본은 `orbit/`에 포함되어 다른 로컬 저장소 경로를 참조하지 않습니다. 런타임 Python/Node API/DB는 필요 없습니다. `web/dist`를 하위 경로에 배포할 때는 포탈의 Vite base를 그 경로로 지정하고 다시 빌드합니다. 자세한 구조·범위·검증은 [Orbit 통합 기록](docs/ORBIT_INTEGRATION.md)을 확인하세요.

## 데이터 만들기 (Drive 데이터가 있는 PC)
```
cp .env.example .env.local      # LUNA_DATA_DIR=<DU_NE Data 경로>
cd pipeline
python -m venv .venv && .venv\Scripts\activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt && pip install -e .
python -m luna s00              # 필요한 파일·품질 확인
python -m luna all --workers 4  # 전체 (끊겨도 이어서 계산)
pytest
```
결과는 `web/public/data/` 에 생긴다. 확인용 그림은 `build/preview/`. 결과를 커밋하는 PR 은 `data/` 브랜치로.

## 배포
Cloudflare Workers 설정(`wrangler.jsonc`)은 `web/dist` 정적 파일을 제공한다. Orbit 통합본의 빌드 명령은 **저장소 루트에서 `npm ci && npm run build`**다. 기존 `cd web && npm ci && npm run build` 설정은 변경해야 한다. GitHub 업로드와 서비스 배포는 별개이며, 이번 작업에서는 Cloudflare 계정 설정을 변경하지 않았다. [반영·배포 안내](docs/ORBIT_GITHUB_HANDOFF.md).

## 데이터 출처
[`docs/sources.md`](docs/sources.md)

## 라이선스
이 저장소의 코드와 문서는 [MIT License](LICENSE)를 따른다.

아래는 MIT License의 대상이 아니며 각 원 출처의 조건을 따른다. 출처와 링크는 [`docs/data-sources.md`](docs/data-sources.md)에 있다.

- `web/public/data/` 등의 데이터: NASA 자료(공공 영역), USGS 자료(공공 영역), CC BY 4.0 연구 자료(Wueller 외 2026, Lemelin 외 2022, Bickel 외 2020, Gawronska·Boazman 2025, 극지 평원 지도)는 출처 표시가 필요하다. JAXA Kaguya MI 자료는 ISAS 데이터 정책을 따른다.
- `homepage/` 이미지: 달 기지 그림(NASA, SpaceX·Blue Origin 제공 NASA 배포), 대학 로고는 각 소유자의 것이다.
- 글꼴: Pretendard, JetBrains Mono (SIL Open Font License 1.1).
