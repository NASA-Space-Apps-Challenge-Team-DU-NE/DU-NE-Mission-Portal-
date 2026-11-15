# 전체 임무 평가·유한 연소 검증

**역사적 기록:** 아래 결과는 종말 하강 제약 도입 전의 수치 검증이다. 현재 기본 사례는 저고도 속도·추력 기울기 제약에서 거부된다. 최신 결과는 [TERMINAL_DESCENT.md](TERMINAL_DESCENT.md)를 따른다.


검증일: 2026-11-15 (Asia/Seoul). 아래 수치는 OneDrive 밖 복구 프로젝트에서 다시 실행한 결과다. [모델 설명](FINITE_BURNS.md)에 정의한 수치·데이터 검증이며 실제 비행 성능 인증이 아니다.

## 자동 검사

- `npm test`: **70/70 통과**, 실패·취소·건너뜀 0개, 123.71초.
- `npm run build`: TypeScript 검사 및 Vite 정적 빌드 통과.
- 상수 추력의 해석적 위치·속도·질량, 알려진 유한 연소 전이 재표적화, 두 질량 기준, 연소 중첩·연료 부족·ΔV 제한, 실제 상태 연속성을 검사했다.
- 하강 비용만 비교하면 전체 임무 비용이 악화되는 반례와 여러 완성 임무 중 최소 점수 선택을 검사했다.
- 기존 LLO 두 사례의 수치 결과는 정확히 유지됐다. Mode A의 주기·Jacobi·전이·주차·질량·실패 회귀도 통과했다.
- GRAIL 계수·정규화·극점·Hessian·SPICE 프레임·기간·손상 자료 검사를 유지했다.

## GRAIL 30차 전체 임무

입력은 Connecting Ridge `(-89.4441°, -137.291°)`, 접지 `2026-11-16T00:00:00Z`, LLO 100 km, PDI 설계 고도 15 km, LLO 진입 후 질량 1,500 kg, 건조 질량 650 kg, 추력 0–12,000 N, 비추력 320 s, 전체 ΔV 목적함수다.

| 항목 | 결과 |
|---|---:|
| 상태 / 모델 검사 | VALIDATED / 17개 통과 |
| 계산 예산 / 실행 시간 | 60 s / 55.56 s |
| 생성된 착륙 후보 / 전이 선별 진행 | 44 / 6 |
| 유한 연소 전체 임무 시도 / 통과 | 4 / 4 |
| 선택 접근 방향 / 전이 시간 | 180° / 3일 |
| 전체 특성 ΔV | 2,795.132524 m/s |
| 총 추진제 | 1,230.599034 kg |
| NRHO 출발 / 접지 질량 | 2,087.063346 / 856.464312 kg |
| 잔여 추진제 | 206.464312 kg |
| 이탈 / 진입 / DOI 연소 시간 | 27.122253 / 126.401074 / 2.424361 s |
| 진입 위치 / 속도 잔차 | 0.000906 m / 5.86e-7 m/s |
| 접지 표면 상대 속도 | 0.500000 m/s |
| 반환 경로 표본 | 6,713 |

[원시 보고서](finite-mission-30-default.json)는 후보별 비용, 실패 원인, 실제 연소 상태와 일정, 입력 및 전체 출력 SHA-256을 포함한다. **탐색은 미완료**다. 검증된 완성 후보 중 최선이며 모든 가능한 후보나 연속 제어의 전역 최적해를 보장하지 않는다. 실행 환경·예산에 따라 탐색량과 선택 후보가 달라질 수 있다.

## 독립 재적분

[독립 검증](finite-independent-validation-30.json)은 **27/27 통과**했다. 원본 NASA SPK의 초기상태, 직접 SPICE 천체 상태·좌표 변환, 독립 SciPy DOP853 및 별도 각도 기반 GRAIL 평가기를 사용했다. TypeScript 중간 상태로 재설정하지 않고, 내보낸 추력 벡터·연소 시간과 24개 하강 제어를 연속 재생했다.

| TypeScript와의 최종 차이 | 값 |
|---|---:|
| 위치 | 0.013575373 m |
| 속도 | 8.44598e-6 m/s |
| 질량 | 약 4.15e-9 kg |

원본 파일 해시·GM·중력장 규약, 전이 및 최종 상태, 질량·추력·일정, 접지 조건, 표본 충돌 경계, UTC/TDB·프레임·지원 기간·표시 표본을 검사했다. 전체 LOLA 경로의 독립 충돌 재감사는 포함하지 않는다. 작은 잔차는 구현한 결정론적 모델의 수치 일치도이며 실제 달 지형·항법·엔진 오차를 포함한 착륙 정확도가 아니다.

## 다른 질량 기준과 실패 사례

점질량 Mode B에서 NRHO 출발 질량을 2,600 kg으로 고정한 전체 임무도 17개 검사를 통과했다. LLO 도착 질량 1,856.155258 kg, 접지 질량 1,052.954864 kg이었다. 17개 완성 후보를 시도해 14개가 통과했다. 입력 질량을 LLO에서 다시 사용하지 않고 실제 전이 후 질량으로 하강을 계산했다([보고서](finite-mission-point-nrho-mass.json)).

| GRAIL 30차 변경 조건 | 상태 | 반환 궤적 표본 |
|---|---|---:|
| 최대 추력 100 N | NOT CONVERGED | 0 |
| 계산 예산 1초 | ERROR — MISSION COMPUTATION TIME LIMIT | 0 |
| 전이 반복 한도 1회, 예산 30초 | TRANSFER NOT CONVERGED | 0 |

원시 기록: [추력](finite-mission-30-thrust.json), [시간 예산](finite-mission-30-budget.json), [반복 한도](finite-mission-30-iterations.json). 시간·반복 한도 실패는 물리적 불가능의 증명이 아니다. 자동 테스트는 전이 ΔV 1 m/s 제한, NRHO 질량 700 kg의 연료 부족, 지원 기간 밖 입력도 검사한다.

## 재현

프로젝트 루트에서:

```powershell
npm test
npm run build
node --max-old-space-size=256 --max-semi-space-size=8 --no-concurrent-recompilation scripts/run-finite-validation.mjs --degree=30 --budget=60
node scripts/run-finite-validation.mjs --degree=point --scenario=nrho-mass --budget=60
node scripts/run-finite-validation.mjs --degree=30 --scenario=thrust --budget=30
node scripts/run-finite-validation.mjs --degree=30 --scenario=budget --budget=30
node scripts/run-finite-validation.mjs --degree=30 --scenario=iterations --budget=30
python scripts/independent_verify_ephemeris.py --input .cache/finite-mission-30-default.json --output docs/finite-independent-validation-30.json
```

환경: Node 24.15.0, Python 3.13.2, NumPy 2.5.4, SciPy 1.18.1, SpiceyPy 8.4.0. Python과 원본 커널은 개발용 독립 검증에만 필요하다. 일반 웹 실행은 `npm install`, `npm run dev`, 배포는 정적 `dist`다.

## 남은 확인 범위

브라우저 초기 화면과 NRHO Mode A 선택 상태까지 확인했으나 자동 제어 연결이 종료되어 Mode B 최종 화면·조작의 시각 검증은 완료하지 못했다. 내장 브라우저는 WebGL 미지원 안내를 표시했다. UI의 TypeScript 검사와 정적 빌드는 통과했다.

초기 작업 중 Node 네이티브 메모리 할당 오류로 중단된 실행은 통과로 집계하지 않았다. 위 보고서는 복구 후 정상 완료한 실행이다. 자세·짐벌·선회율, 점화 과도응답, 항법·엔진 불확실성, 전력·통신·조명 및 고해상도 지형 위험은 후속 개선 범위다.
