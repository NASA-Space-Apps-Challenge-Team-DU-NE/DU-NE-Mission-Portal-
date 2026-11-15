# 검증된 Mode B 기본 예제

2026-11-15 (Asia/Seoul). 기본 입력은 `frontend/src/defaultMission.ts` 한 곳에서 정의하며 첫 화면·예제 불러오기·검증 실행기가 함께 사용한다. 저장된 경로를 성공 결과로 재생하지 않고 브라우저에서 다시 계산한다. NRHO는 Mode B로 계산하며 기존 LLO 시작 기능도 사용할 수 있다.

## 입력과 유지한 제한

| 항목 | 값 |
|---|---|
| 모델 | Mode B, GRAIL GL1800F 30차 + DE440 지구·태양 |
| 목표 | Connecting Ridge, -89.4441°, -137.291° |
| 접지 시각 | 2026-11-16T00:00:00Z |
| LLO / PDI 설계 고도 | 100 km / 15 km, LOLA 기준 구면 |
| LLO 질량 / 건조 질량 | 1,500 kg / 650 kg |
| 추력 / 비추력 | 0–12,000 N / 320 s |
| 전이 시간 | 3일 |
| 동력 하강 시간 | 880초 |
| 접근 방향 | 북쪽 기준 시계방향 180° |
| 반복 / 시간 예산 | 40회 / 60초 |

속도·기울기·접촉 제한은 변경하지 않았다. `terminalDescent.ts`는 이전 [제약 검증 기록](terminal-validation.json)의 SHA-256과 바이트 단위로 동일하다. 1,000/100/10 m 이하 수평속도 50/5/0.5 m/s, 하강속도 30/5/1 m/s, 추력 기울기 45/15/5°를 유지한다. 가정한 접촉점 높이 2 m, 접지 허용오차 0.02 m, 조기 접촉 제한, 추진제·추력 한도도 그대로다.

## 계산 변경

기존 제어 후보는 접지 직전까지 큰 수평 감속을 요구했다. 입력 고도만 바꾼 조사에서도 이 제약을 통과하지 못했다. 새 후보는 종단 순가속도를 0으로 유도하는 5차 다항식 **초기 추정**과 더 이른 감속 위치를 사용한다. 96개의 실제 관성 가속도 명령을 shooting으로 보정하고 모든 출력 상태를 위치·속도·질량 운동방정식으로 적분한다. 다항식 곡선을 결과 궤도로 반환하지 않는다.

하강 시간·접근 방향은 예제의 입력으로 명시했다. 두 설정을 생략하면 440/560/700/880초와 네 방향을 탐색한다. 초기 위상 계수 0.6, 4/7, 0.55를 비교한다. 계산 시간·방향 선택은 물리적 허용 한도를 바꾸지 않는다.

전이 계산 전에 고밀도 동력 하강 표본으로 종말 제약을 선별한다. 이후 실제 유한 연소 도착 상태에서 하강 제어를 다시 보정하고, 지형·추력·연료·연속성·정밀 재적분을 포함한 전체 검사를 반복한다. 실패 시 빈 궤적을 반환하는 동작은 유지된다. 유한 후보 집합의 비교이며 전역 최적 제어 또는 실제 비행 안전의 증명이 아니다.

## 초기 구현 당시 전체 임무 결과

아래 수치는 단일 초기상태 전파 방식의 이전 검증 이력이다. 현재 직접 조회 방식과 확장된 2026년 11월–2027년 1월 자료의 재검증은 [EPHEMERIS_EXPANSION.md](EPHEMERIS_EXPANSION.md)를 따른다. 기본 입력과 종말 제약은 동일하며 현재 기본 사례도 통과했다.

최종 `npm test`는 **81/81 통과**(44.73초), 실패·건너뜀 0개다. TypeScript 검사와 Vite 정적 빌드도 통과했다(9.64초). [검증 요약·소스 해시](default-validation.json).

브라우저와 동일한 TypeScript 엔진: **VALIDATED, 20/20 검사 통과**. 실행 37.05초, 전체 유한 연소 후보 3개 모두 통과했다. 지정한 시간·방향 안의 후보 탐색은 완료됐다.

| 항목 | 결과 |
|---|---:|
| 접지 표면 상대 속도 | 0.500000 m/s |
| 접지 직전 추력 기울기 | 0.347974° |
| 저고도 속도 / 기울기 위반 | 0 / 0 |
| 조기 접촉 / 지형 관통 | 0 / 0 |
| 동력 하강 특성 ΔV | 2,277.331 m/s |
| 전체 특성 ΔV | 3,415.993 m/s |
| 필요한 NRHO 출발 질량 | 2,142.799 kg |
| 접지 질량 / 잔여 추진제 | 721.494 kg / 71.494 kg |
| 전이 위치·속도 재설정 | 없음 |

[요약·후보별 기록](finite-mission-30-default-successful-default.json), [전체 실제 계산 결과](successful-default-mission.json). 전체 JSON은 개발 검증 자료이며 웹 런타임 자산으로 읽지 않는다.

독립 SciPy DOP853·별도 각도 기반 GRAIL·직접 SPICE 재적분은 원본 NASA 초기상태에서 시작해 **28/28 검사 통과**했다. TypeScript와 최종 위치 차이는 약 **0.004690 m**, 속도 차이는 약 **7.83e-6 m/s**다. 동력 하강 7,200개 검사 표본에서 종말 제약 위반은 없었다. [독립 보고서](successful-default-independent.json)

독립 지형 감사는 기존 모델과 동일하게 12 km 미만에서 원본 240 m LOLA를 의무 사용한다. 높은 고도의 남극 ROI 밖 표본 40개에는 무결성을 확인한 보수적 전역 DEM을 사용했고, 12 km 아래 전역 DEM 사용은 0개였다. 이 고도 규칙은 브라우저에 이미 존재하던 규칙이며 종말 제약을 완화한 것이 아니다. 이전 독립 감사기가 높은 고도에도 남극 자료를 요구하던 범위 불일치를 수정했다. 전체 JSON 복사본은 보고서가 읽은 `.cache` 원본과 SHA-256이 동일하다.

수치 일치도는 실제 착륙 정확도나 운용 예비 추진제를 인증하지 않는다. 2 m 접촉점은 시연용 가정이며 자세·착륙 다리·지반·미세 장애물·엔진 과도응답·항법 불확실성은 추가 모델링 대상이다.

## 재현

```powershell
npm install
npm run dev
# 첫 화면의 Mode B 기본 예제로 계산하거나 'Mode B 기본 예제 불러오기' 선택
npm test
npm run build
node --max-old-space-size=256 --max-semi-space-size=8 --no-concurrent-recompilation scripts/run-finite-validation.mjs --degree=30 --budget=60 --tag=successful-default
node scripts/validate-ephemeris-expansion.mjs
python scripts/independent_verify_ephemeris.py --input .cache/expanded-mission-2026-11-16.json --output docs/ephemeris-expanded-independent-default.json
python scripts/verify-terminal-regression.py
```

Python·원본 커널은 개발 독립 검증에만 필요하다. 일반 실행은 정적 파일과 TypeScript Worker로 동작하며 `dist`를 정적 호스팅할 수 있다. 기존 위험 경로는 회귀 자료로 보존하고 계속 거부한다. 브라우저 시각 검증은 이번 실행 기록의 범위에 포함하지 않는다.
