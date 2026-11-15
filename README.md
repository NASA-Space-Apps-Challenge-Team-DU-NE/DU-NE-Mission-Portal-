# LUNA-NAV · Lunar Base Planner

NASA Space Apps Challenge 2026 **"Lunar Landing Site Navigator"** — 날짜와 착륙지를 고르면 달 남극의 햇빛·지구 교신·지형 위험을 실제 NASA 데이터로 계산해 보여 주는 정적 웹앱.

- 팀 규칙·명세: [`CLAUDE.md`](CLAUDE.md) · 구조: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 작업 보드: [`TASKS.md`](TASKS.md)
- 점수는 후보 간 상대 비교용 지표이며 확률이 아니다.
- 화면은 팀 UI 예시(`lunar-base-planner-ui.html`)의 01→11 단계 구조를 따른다. 바뀐 점: [`docs/handoff/2026-11-14-ui-redesign.md`](docs/handoff/2026-11-14-ui-redesign.md)

## 구성
```
pipeline/   Python 3.11 사전 계산 (Drive "DU_NE Data" → web/public/data)
web/        React + Vite + TypeScript + three.js 웹앱
docs/       결정·검증·출처·좌표계 확인표
tests/      Python↔TS 교차 테스트 입력
```

## 웹 실행
```
cd web
npm install
npm run dev          # http://localhost:5173
npm run check        # 타입 + 규칙 검사 + Vitest
npm run build
```
`web/public/data` 가 비어 있으면 화면마다 "자료 없음"이 뜬다 (합성 값으로 채우지 않는다). 근사 천체력·구면 지평선만으로 하늘 화면은 동작한다.

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
보류. 당분간 로컬 `npm run dev` 로 확인한다.

## 데이터 출처
[`docs/sources.md`](docs/sources.md)
