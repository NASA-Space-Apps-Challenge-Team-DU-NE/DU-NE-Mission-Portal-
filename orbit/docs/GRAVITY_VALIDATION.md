> 최신 직접 출발 상태 조회·날짜 확장의 재검증은 [EPHEMERIS_EXPANSION.md](EPHEMERIS_EXPANSION.md)를 따른다. 아래 임무 수치는 이전 구현 이력이며 ±7일 검사는 현재도 적분기 회귀에 사용한다.

# GRAIL 구현 검증과 모델 비교

최신 기본 예제의 전체 임무·종말 제약·독립 재적분 결과는 [SUCCESSFUL_DEFAULT.md](SUCCESSFUL_DEFAULT.md)에 기록한다. 아래는 중력장 개발 단계의 검증 이력이다.

현재 Mode B의 전체 임무 평가·유한 연소는 [FINITE_BURNS.md](FINITE_BURNS.md), 최신 검증은 [FINITE_BURN_VALIDATION.md](FINITE_BURN_VALIDATION.md)를 따른다. 이 문서의 기존 충격기동 수치는 이전 검증 이력이다.

2026-11-15 실행 기록. 원본 확보·구조 검사, 독립 중력 평가, 전파 일치도, 임무 제약 검사와 실제 달에서의 정확도는 서로 다른 항목이다. 아래의 PASS는 명시한 수치 모델과 검사 범위에만 해당한다. NASA의 임무 인증을 의미하지 않는다.

최종 `npm test`는 **65/65 통과**(26.24초), `npm run build`는 TypeScript 검사와 Vite 정적 빌드에 성공했다. 배포 Worker는 98.04 kB다. 실제 Chrome에서도 개발 서버의 Mode B/GRAIL 30차 설정과 계산 준비 상태를 확인했다.

## 구현과 실행

Mode B에서 GL1800F를 선택하면 NASA 초기상태, 참조 미리보기, 전이와 STM, LLO 대기, DOI coast, 동력 하강, 최종 재적분이 같은 중력을 사용한다. Mode A와 기존 LLO는 유지하며, 기존 점질량 Mode B도 회귀 기준으로 남긴다. 일반 실행은 TypeScript Worker와 정적 파일만 사용한다.

```powershell
npm install
npm run dev
npm test
npm run build
```

개발 서버 기본 주소는 `http://localhost:5174/`, 배포 폴더는 저장소 루트 `dist/`이다. Vite의 상대 base 경로를 사용하므로 정적 호스트의 하위 경로에도 배포할 수 있다. HTTPS 또는 localhost가 데이터 SHA-256 검사를 위한 Web Crypto 조건이다. Python은 아래 개발용 검증에만 사용한다.

배포 중력 파일은 **164,088 bytes**이며 최대 90차의 전역 계수다. 약 198 MB 원본은 배포 폴더와 Git에 넣지 않는다. 출처·해시·규약·재현 명령은 [GRAVITY_DATA.md](GRAVITY_DATA.md), 구현 설명은 [GRAVITY_MODEL.md](GRAVITY_MODEL.md)를 따른다.

## 중력과 좌표계 검사

| 검사 | 측정 결과 | 허용 기준과 의미 |
|---|---:|---|
| 독립 SciPy와 60개 위치/차수의 퍼텐셜 | 최대 1.3970e-9 m²/s² 차이 | 2e-7; 구현 규약 일치도 |
| 독립 3차원 가속도 성분 | 최대 8.6346e-14 m/s² 차이 | 3e-10; 물리적 모델 정확도 아님 |
| 해석 Hessian 대 독립 4차 유한차분 | 최대 1.7716e-16 s⁻² 차이 | 2e-11; 차분 간격 5/10 m 안정성 별도 확인 |
| PA→J2000, SPICE와 12,960개 내부 시각 대조 | 회전 원소 8.9862e-13 | 1e-10 |
| 회전 직교성 | 3.4639e-14 | 1e-10 |
| 1,738 km 벡터의 회전 위치 차이 | 1.6726e-6 m | 0.001 m; 프레임 오차를 mm 이하로 제한 |
| Rdot 원소 | 2.2151e-15 /s | 1e-11 /s |

별도 테스트에서 같은 GM의 0차, 합성 C20, C22/S22와 홀수 m, 퍼텐셜 유한차분, 정확한 양 극점과 극점 근처, 기준 반지름 아래 위치, 100 km LLO와 NRHO 거리를 검사했다. 회전된 전체 힘의 Jacobian과 STM도 독립 상태 섭동과 비교했다. 상세 수치와 출처는 [gravity-data-validation.json](gravity-data-validation.json)에 있다.

이 기준들은 독립 구현 간 부호·정규화·단위·미분 오류를 검출하기 위한 수치 허용치다. 계수의 통계적 불확실성이나 실제 중력장 오차를 추정한 값이 아니다.

## 동일 초기상태의 차수·적분 정밀화 비교

GL1800F의 같은 GM, 같은 100 km 극궤도 초기상태, 같은 날짜별 지구·태양 섭동으로 7,067.46초를 전파했다. DOPRI 5(4)의 최대 간격을 20→10초, 상대 허용오차를 2e-11→2e-12로 정밀화했다. 실제 스텝 수는 354→707이었다. 최대 종단 차이는 **0.00004675 m / 4.065e-8 m/s**로 0.05 m / 5e-5 m/s 검사 기준을 통과했다. 기준은 적분 오차를 아래 차수 차이보다 충분히 작게 분리하려는 것이다.

| 차수 | 정밀화한 N90 대비 위치 차이 | 속도 차이 |
|---|---:|---:|
| 0, 동일 GM | 2,651.62 m | 2.38192 m/s |
| 20 | 55.32 m | 0.06174 m/s |
| 30 | 74.66 m | 0.04064 m/s |
| 60 | 5.48 m | 0.00477 m/s |

**20→30차의 위치 차이는 단조 감소하지 않는다.** 특정 점의 가속도 차이와 유한 시간 뒤의 벡터 차이는 상쇄와 궤도 위상에 영향을 받는다. N90 역시 절단된 모델이므로 이 표가 전체 실제 중력장에 대한 오차를 제공하지 않는다. 보고서의 `degree_comparison`에는 여러 위치에서의 가속도 차이도 기록한다.

재현: `node scripts/run-gravity-convergence.mjs`. 전체 상태·적분 설정: [gravity-convergence.json](gravity-convergence.json).

## 각 모델에서 다시 최적화한 전체 임무

공통 입력: Connecting Ridge의 -89.4441°, -137.291°, 착륙 UTC 2026-11-16 00:00:00, 100 km LLO, PDI 15 km, LLO 질량 1,500 kg, 건조 질량 650 kg, 최대 추력 12,000 N, Isp 320 s, 전이 범위 0.3–3일, 전이 ΔV 한도 2,500 m/s, 후보당 전이 반복 한도 20, 실행 예산 180초. 입력 질량 기준이 LLO이므로 NRHO 시작 질량은 전이 연료를 포함하여 역산한다.

환경: Windows, AMD Ryzen 5 7430U, 논리 CPU 12개, Node v24.15.0에서 **브라우저와 같은 TypeScript 코드** 실행. 모델별 1회 측정이며 파일 로딩·탐색·검증을 포함한다. OS/다른 작업의 영향을 제거한 벤치마크는 아니다. 메모리는 실행 직후 프로세스 RSS이며 peak 또는 중력장만의 메모리가 아니다.

| 모델 | 결과 | 실행 s | 총 ΔV m/s | 전체 추진제 kg | 접지 위치 잔차 m | 접지 속도 m/s | 종료 RSS MiB |
|---|---|---:|---:|---:|---:|---:|---:|
| 기존 점질량 | 15/15 PASS | 8.09 | 3883.14688 | 2096.00159 | 1.680e-5 | 0.500000 | 145.4 |
| GRAIL 20 | 15/15 PASS | 19.83 | 3883.42143 | 2096.25762 | 2.841e-7 | 0.500000 | 157.6 |
| GRAIL 30 | 15/15 PASS | 27.11 | 3914.22153 | 2125.33370 | 8.294e-7 | 0.500000 | 151.0 |
| GRAIL 60 | 15/15 PASS | 105.15 | 3914.09154 | 2125.29878 | 3.244e-6 | 0.500000 | 150.1 |
| GRAIL 90 | 15/15 PASS | 175.07 | 3914.12167 | 2125.30713 | 2.454e-6 | 0.500000 | 118.4 |

각 실행은 하강 후보 48개, 전이 후보 18개를 탐색했다. 전이 반복의 합은 점질량/20/30/60차에서 158/155/136/129회이며 90차의 개별 기록은 원시 보고서에 있다. 하강 제어는 24개 구간, shooting 반복 한도 10회다. 하강 후보별 실제 반복 횟수는 이번 기록에 계측하지 않았다. 결과는 유한 후보 탐색의 선택이며 전역 최적해를 증명하지 않는다. 서로 다른 차수에서 후보 선택이 바뀌어 ΔV와 연료가 달라질 수 있다.

적분 설정은 모든 차수에 동일하다. 참조 전파 DOPRI는 rtol 2e-12, 위치 atol 1e-5 m, 속도 atol 1e-8 m/s, 최대 300초를 사용한다. 전이 shooting은 2e-11 / 1e-4 m / 1e-7 m/s / 최대 600초와 같은 중력의 해석 STM을 사용하고 더 엄격한 재전파로 검증한다. 실제 스텝은 오차와 거리 조건으로 줄어든다. 하강 shooting은 RK4 2초, 최종 하강은 최대 0.25초, 정밀화는 0.125초다. 낮은 coast와 하강은 이동 거리 120 m 기준으로도 간격을 제한한다. 상세 제약·간격·후보별 결과는 원시 보고서와 코드에 기록한다.

원시 보고서: [점질량](gravity-mission-point.json), [20차](gravity-mission-20.json), [30차](gravity-mission-30.json), [60차](gravity-mission-60.json), [90차](gravity-mission-90.json).

**UI 기본값은 30차**로 선택했다. 이 기기에서 기본 60초 예산에 들어오면서 20차보다 더 많은 중력 구조를 포함한다. 20차는 더 빠른 선택, 60·90차는 계산 예산 확대가 필요할 수 있는 선택이다. N30은 정확도 인증값이 아니며 위 차수 비교도 보편적인 우월성을 보여주지 않는다. 사용자의 하드웨어·임무에서는 시간 예산을 넘을 수 있다. 런타임이 차수를 자동 변경하지 않는다.

## 동일 PDI 상태·동일 명령 비교

각 GRAIL 임무의 실제 PDI 상태와 24개 관성 가속도 명령을 고정하고, 같은 GL1800F GM의 0차 + 같은 지구·태양 힘으로 **원래 GRAIL 종료 시각까지** 재전파한 진단이다.

| GRAIL 차수 | 종단 위치 차이 m | 속도 차이 m/s |
|---|---:|---:|
| 20 | 33.013 | 0.23277 |
| 30 | 45.709 | 0.26886 |
| 60 | 39.868 | 0.22892 |
| 90 | 40.422 | 0.19842 |

질량 차이는 수치 오차 범위다. 이는 다른 중력장에서 재최적화한 착륙 성공이나 별도로 탐지한 접지 오차가 아니다. 비교 경로의 지형·접촉은 검증하지 않으며 3D 성공 궤적으로 출력하지 않는다. 실행 예산이 부족하면 진단을 생략하고 그 상태를 표시한다.

## 독립 전체 임무와 참조 시간창

Python SciPy DOP853 + 독립 각도 구면조화 평가 + 각 RHS의 직접 SPICE 변환으로 N30의 원본 NASA 초기상태부터 모든 기동과 착륙까지 연속 재적분했다. 중간 TypeScript 상태로 리셋하지 않았다. **23/23 PASS**. 종단 위치 차이 **0.053741582 m**, 속도 차이 **4.88248e-5 m/s**, 질량 차이 **3.37e-9 kg**다. 독립 계산의 지형 목표 반지름 잔차는 -0.0144203 m, 목표 위치 차이는 0.0537422 m였다.

전체 상태 비교 기준은 0.1 m / 1e-4 m/s, 질량 1e-7 kg이며, 접촉 반지름에는 기존 0.02 m 제약을 유지했다. 장시간 적분과 구간별 충격 오차의 누적을 비교하는 구현 검증이며 지형·항법·엔진 불확실성을 포함하지 않는다. **독립 Python 검사는 LOLA 충돌 전체를 다시 감사하지 않는다.** 지형 제약은 브라우저의 dense replay 검사로 별도 보고한다. 상세 해시·모든 제약: [gravity-independent-mission-validation.json](gravity-independent-mission-validation.json).

N30의 ±1/±3/±7 TDB일 참조 전파도 직접 SPICE와 대조했다. 독립 최대 간격 300→150초 정밀화 차이는 0.000283840 m, 실제 TypeScript 출발 전파 설정과의 최대 차이는 **0.009872264 m / 1.02223e-7 m/s**로 0.1 m / 1e-5 m/s 기준을 통과했다. 샘플링한 최소 달 고도는 약 1,715 km이며 Earth/Moon 충돌은 없었다. 이는 N30의 참조 전파 지원 창 검사이며 모든 차수·날짜·착륙지에서 전이 수렴을 보증하지 않는다. [시간창 보고서](gravity-reference-window-30.json).

## 실패 시나리오와 브라우저

N30의 극점 근처 -89.99° 사례는 28.33초에 15/15 검증을 통과했다. 연료 700 kg/건조 650 kg, 최대 추력 100 N, 2026-12-02의 범위 밖 날짜, 1초 계산 예산, 전이 반복 한도 1회는 각각 성공 경로 없이 종료했다. 예산·범위 예외는 CLI 보고서에서 `ERROR`와 원문으로 남으며 앱은 해당 원인에 맞는 안내를 제공한다. 미수렴은 물리적 불가능 증명으로 표시하지 않는다. [극점](gravity-mission-30-pole.json), [추력](gravity-mission-30-thrust.json), [연료](gravity-mission-30-fuel.json), [날짜](gravity-mission-30-coverage.json), [예산](gravity-mission-30-budget.json), [미수렴](gravity-mission-30-iterations.json).

손상·누락 파일, 잘못된 프레임·정규화·phase·GM·반지름, NaN/특이 상태는 단위 검사에서 차단했다. 점질량 자동 대체와 실패 경로 생성은 허용하지 않는다.

실제 Codex 내장 Chromium 브라우저에서 localhost:5174를 조작했다. 정확한 Chromium 버전과 브라우저 프로세스 메모리는 도구에서 노출되지 않아 계측하지 않았다. 위 Node 메모리를 브라우저 메모리라고 보고하지 않는다.

- GRAIL 30차: 32.64초와 재실행 32.05초, 15/15 PASS.
- 동일 설정 점질량: 10.24초, 15/15 PASS. 세션 비교표에 두 독립 최적화 결과 표시.
- 동일 PDI 진단: 45.709 m / 0.26886 m/s 및 지형 미검증 범위 설명 확인.
- 계산 중 취소: READY, 빈 경로, 재생 비활성화, 오류 경고 없음.
- 모델 변경과 차수 20→30 변경: 이전 경로 제거, 새 계산 요구, 과거 기록은 비교 요약만 유지.
- 추력 100 N: 경고창과 후보 48개의 초과 근거, 가장 작은 최대 요구 추력 약 3,958.9 N, 설정 조정 제안 확인.
- 궤적 재생·정지·접지 시점 이동 확인. 브라우저 오류 로그 0건.

## 재현 명령과 결과 범위

```powershell
node scripts/run-gravity-validation.mjs --degree=point --budget=180
node scripts/run-gravity-validation.mjs --degree=20 --budget=180
node scripts/run-gravity-validation.mjs --degree=30 --budget=180
node scripts/run-gravity-validation.mjs --degree=60 --budget=180
node scripts/run-gravity-validation.mjs --degree=90 --budget=180
node scripts/run-gravity-validation.mjs --degree=30 --scenario=pole --budget=180
# scenario: thrust, fuel, coverage, budget, iterations 도 지원
node scripts/run-gravity-convergence.mjs
python scripts/independent_verify_gravity.py
python scripts/independent_verify_ephemeris.py --input .cache/gravity-mission-30.json --output docs/gravity-independent-mission-validation.json
python scripts/verify_gravity_reference_window.py
node scripts/compare-gravity-reference-window.mjs
```

Python에는 numpy/scipy/spiceypy와 [데이터 문서](GRAVITY_DATA.md)의 원본 커널 경로가 필요하다. 원본 라벨·해시를 보존한다. 전체 임무 JSON은 `.cache/`, 요약 보고서는 `docs/`에 생성한다. 다시 실행하면 경과시간과 파일 해시가 달라지므로 독립 보고서도 해당 입력으로 다시 생성해야 한다.

남는 오차는 구분한다. 적분 정밀화 잔차는 결정론적 수치 오차다. N90 대비 차이는 유한 차수 간 차이일 뿐 원본 1800차 또는 실제 장에 대한 정확도 보증이 아니다. 계수 불확실성·고체 조석·근지표 외부 전개의 적용 한계, 240 m 지형 격자 사이 장애물, 항법·엔진·자세·짐벌·유한 연소 오차는 이번 검증에 포함하지 않는다. 작은 접지 잔차로 실제 정밀 착륙 능력을 주장하지 않는다.
