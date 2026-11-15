> 이 문서는 날짜 확장 당시의 검증 기록이다. 이후 Mode A 제거와 최신 회귀 검사는 [MODE_B_ONLY.md](MODE_B_ONLY.md)를 따른다.

# NRHO 출발 상태 직접 조회·3개월 확장 검증

2026-11-15 로컬 검증. 수정 위치는 `C:\Users\hach0\Projects\Lunar-Landing-Orbit-Simulator`이며 GitHub 업로드·미션 포탈 변경은 하지 않았다.

## 변경 범위

Mode B 착륙 UTC를 **2026-11-01 00:00부터 2027-01-31 23:59:59.999까지** 확장했다. 필요한 환경·NRHO 자료는 **단일 `frontend/public/data/ephemeris/index.json`** (13,155,940 bytes, 약 13.16 MB)에 담았다. 최대 14일 전이·LLO 대기·출발 전 3시간 계산 coast를 위해 10월 16일부터 2월 1일까지 자료를 포함한다. 여유 데이터 날짜를 착륙 입력으로 허용하지는 않는다.

NASA 원본 SPK type-9의 51개 구간·14,451개 상태와 7차 보간 규칙을 추출했다. 각 후보의 실제 출발 시각에 위치·속도를 직접 조회하고 Earth 중심에서 Moon 중심으로 변환한다. 11월 12일 한 상태를 수개월 적분하는 방식은 사용하지 않는다. 이탈 이후 전이·유한 연소·질량·하강은 기존 TypeScript 운동방정식으로 계산하며 원본 표의 후속 상태로 재설정하지 않는다. 출발 전 3시간 coast와 참조 미리보기는 별도의 수치 적분 경로이며 원본의 유지 기동 이력을 뜻하지 않는다.

Mode A, LLO 단독 물리 코드, 기본 입력, 종말 제약 및 npm 의존성은 변경하지 않았다. 정적 사이트의 Web Worker 계산 구조를 유지했고 Python은 전처리·개발 검증에만 사용했다. 자세한 데이터·출처·재현 계약은 [EPHEMERIS_DATA.md](EPHEMERIS_DATA.md), 포탈에서 읽을 필드는 [MISSION_PORTAL_INTEGRATION.md](MISSION_PORTAL_INTEGRATION.md)에 기록했다.

## 대표·경계 날짜의 실제 전체 임무

모든 행은 같은 기본 입력(Connecting Ridge, GRAIL 30차, LLO 질량 1,500 kg, 건조 650 kg, 최대 추력 12,000 N, Isp 320 s, 전이 3일, 하강 880초, 접근 180°, 계산 예산 60초)에서 날짜만 바꿨다. 성공은 접촉·저고도 속도·추력 기울기·연료·지형·연속성 검사를 포함한다. ΔV는 이탈·진입·DOI·하강 전체 값이며, 실패 후보의 전이 ΔV 제한과 다르다.

| 착륙 UTC | 실제 결과 | 전체 ΔV (m/s) | 로컬 실행 (s) |
|---|---|---:|---:|
| 2026-11-01T00:00:00Z | VALIDATED · 20/20 통과 | 3,742.916 | 11.66 |
| 2026-11-16T00:00:00Z | VALIDATED · 20/20 통과 | 3,415.993 | 21.52 |
| 2026-12-02T00:00:00Z | VALIDATED · 20/20 통과 | 3,374.932 | 14.52 |
| 2027-01-01T00:00:00Z | TRANSFER NOT CONVERGED · 경로 없음 | — | 6.04 |
| 2027-01-31T23:59:59.999Z | VALIDATED · 20/20 통과 | 3,601.463 | 9.67 |

[입력·후보·검사 원시 보고서](ephemeris-expansion-validation.json). 시간은 이 PC의 관측값이며 브라우저/장치별 성능 보증이 아니다.

1월 1일은 데이터가 부족해서 실패한 것이 아니다. 3일 고정 후보의 일부 전이는 미수렴했고, 수렴한 충격기동 초기 후보도 전이 ΔV 약 3,995 m/s로 기존 2,500 m/s 한도를 초과해 유한 연소 후보로 채택하지 않았다. 반환 경로는 빈 배열이며 경고창이 표시된다. 다른 전이 시간·접근 방향을 탐색할 수 있지만, 이 검증은 다른 설정의 성공이나 해당 날짜의 물리적 불가능을 주장하지 않는다. 안전 제약이나 기본 입력을 바꿔 성공으로 만들지 않았다.

## 검증 결과

- `npm test`: **84/84 통과**, 실패·건너뜀 0, 약 42.34초. Mode A/LLO 회귀, 위험 하강 거부, 원본 구간 경계·우선순위·공백·손상 데이터 검사를 포함한다.
- TypeScript 검사와 `npm run build`: 통과. Vite 정적 빌드 약 8.35초.
- 환경 비격자 시각 46,656개, NRHO 시각 14,275개를 직접 SPICE와 대조. NRHO 최대 위치 차이 약 **0.000166 m**, 속도 차이 약 **2.76e-8 m/s**. TypeScript도 원본 SPICE 357개 기준값과 대조했다. [데이터 검증](ephemeris-data-validation.json).
- 11월 1일 시작과 1월 31일 마지막 밀리초를 포함하며 바로 바깥 날짜는 거부한다. 원본의 약 0.119마이크로초 공백도 임의 연결하지 않는다. 달 자세·GRAIL PA 회전의 확장 구간 독립 검사를 갱신했다.
- 과거 GRAIL/위험 하강 회귀 자료는 원래 ET 원점을 보존하도록 수정했다. 데이터 epoch가 11월 1일에서 10월 16일로 바뀌어도 과거 상태를 다른 날짜에 놓지 않는다. ±7일 자료는 적분기 회귀이며 출발 지원 기간 제한이 아니다. [GRAIL 적분 대조](gravity-reference-window-30.json), [과거 위험 사례 독립 거부](terminal-independent-regression.json).

원본 SPICE 출발 상태·직접 천체력/자세·독립 GRAIL·SciPy DOP853으로 중간 상태 재설정 없이 전체 임무를 재계산했다. 소스 출발 상태 오차와 전체 경로 오차는 별도 검사하며, 종말/엔진/지형 및 기존 0.1 m·0.0001 m/s 경로 대조 한도는 유지했다.

| 독립 검증 사례 | 검사 | 최종 위치 차이 | 최종 속도 차이 |
|---|---:|---:|---:|
| 기본 · 2026-11-16 | 30/30 통과 | 0.0013856 m | 2.381775e-06 m/s |
| 종료 경계 · 2027-01-31 23:59:59.999 | 30/30 통과 | 0.0126642 m | 1.561908e-05 m/s |

[기본 독립 보고서](ephemeris-expanded-independent-default.json), [종료 경계 독립 보고서](ephemeris-expanded-independent-end.json).

빌드된 `dist`를 Vite preview로 제공하고 Chrome에서 실제 Worker 계산을 실행했다. 12월 2일 성공·20개 검사·JSON의 직접 출발 상태 출처, 1월 1일 실패 경고·빈 궤적 진단, 날짜 입력 경계와 Mode A 상대 시간 화면을 확인했다. 브라우저 예외 및 외부 런타임 요청은 0개였다. [정적 브라우저 검사 16개](ephemeris-expanded-browser-validation.json).

검증은 대표 5개 날짜와 데이터/구간 경계 중심이며 모든 날짜·착륙지·착륙선의 성공을 확인한 것은 아니다. 미리 계산한 성공 경로를 런타임에서 읽지 않는다. 수치 일치도는 실제 항법·엔진·지형 오차나 비행 인증을 뜻하지 않는다.

## 실행과 재현

```powershell
cd C:\Users\hach0\Projects\Lunar-Landing-Orbit-Simulator
npm install
npm run dev
# 별도 터미널
npm test
node scripts/validate-ephemeris-expansion.mjs
npm run build
```

새 검증 실행기는 요약을 `docs/ephemeris-expansion-validation.json`, 전체 경로를 `.cache/expanded-mission-YYYY-MM-DD.json`에 기록한다. 독립 Python 재현은 [데이터 문서](EPHEMERIS_DATA.md)의 명령을 따른다. 일반 실행과 정적 호스팅에는 Python이 필요 없다.
