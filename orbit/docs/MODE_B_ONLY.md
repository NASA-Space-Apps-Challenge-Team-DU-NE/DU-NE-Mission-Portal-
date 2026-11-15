# NRHO Mode B 전용 정리

2026-11-15. 로컬 `C:\Users\hach0\Projects\Lunar-Landing-Orbit-Simulator`에서 수정·검증했다. NRHO 계산은 날짜 기반 Mode B로 고정했다. 별도의 100 km LLO 시작 기능과 백엔드 없는 정적 실행 구조는 유지한다. 미션 포탈 저장소는 수정하지 않았다.

## 의존성 확인과 코드 정리

기존 Mode B가 Mode A 폴더에서 가져오던 항목을 확인한 뒤 다음 위치로 옮겼다.

| 유지한 기능 | 현재 위치 | 처리 |
|---|---|---|
| 0회전 Lambert 초기 추정과 Stumpff 함수 | `frontend/src/physics/lambert.ts` | 기존 수치 구현을 그대로 이동. 최종 전이는 실제 날짜 모델로 재적분 |
| `IntegrationError`, `CalculationTimeout`, `CalculationCancelled` | `frontend/src/physics/errors.ts` | 모든 Mode B 적분·유한 연소·전이에서 같은 오류 클래스를 사용 |
| NRHO 엔진 기본값·입력 정리 | `frontend/src/physics/ephemeris/settings.ts` | Mode B 전용 계약. 실행 예제의 물리 입력은 기존 값 유지 |

Mode A 전용 CR3BP 적분·좌표변환·전이·임무·타입 파일 5개, 전처리/실행/독립검증 스크립트 3개, 전용 테스트 파일 4개, 공개 `data/nrho/reference.json` 1개를 제거했다. 삭제 파일 목록과 Worker 실제 의존성은 [동등성 보고서](mode-b-only-equivalence.json)에 기록한다. 새 Worker가 `physics/nrho`를 가져오지 않으며 배포 `dist`에도 해당 참조 JSON이 없음을 확인했다.

공통 수학·지형·LLO 계산은 현재 계산에서 사용하므로 유지했다. 과거 NASA/JPL 조사 원본과 검증 보고서는 이력 자료로 보존하며 런타임에 읽지 않는다. `NRHO_MODEL.md`와 `TRANSFER_OPTIMIZATION.md`에는 과거 구현 문서임을 표시했다.

## 화면과 입력 계약

- 모델 선택기, 수동 출발 위상, Mode A 주기·근월점·원월점 통계, 고정 L1/L2 표시·메타데이터와 전용 스타일을 제거했다.
- NRHO에서는 항상 UTC·DE440 천체력·선택한 달 중력 모델을 사용한다. 날짜 지원 범위와 단일 13.16 MB 천체력 팩은 이전 확장 그대로다.
- 입력의 `reference_id`, `departure_phase_mode`, `departure_phase`를 제거했다. 과거 Mode B 요청에 남아 있어도 정리 과정에서 버리며 계산 결과의 입력에 재출력하지 않는다. 실제 참조 출처는 `result.nrho.source`에 유지한다.
- `nrho.mode`는 `b`만 허용한다. 생략도 B로 해석하지만 명시적인 `a`나 알 수 없는 모델은 데이터를 읽거나 계산하기 전에 오류로 거부한다. 과거 임무를 조용히 다른 물리 모델로 바꾸지 않는다.
- 실패 안내는 현재 화면에서 조정할 수 있는 UTC·전이 시간·착륙선 제원을 안내한다. 삭제된 모델이나 위상 설정을 권하지 않는다.
- 포탈 전달 예제 [Config JSON](portal-orbit-default-input.json), [입력 항목](MISSION_PORTAL_INTEGRATION.md), [Worker 계약](INTERFACE.md)을 함께 갱신했다.

## 검증

`npm test` **76/76 통과**, 실패·건너뜀 0, 약 32.10초. 이전 84개에서 Mode A 전용 10개를 제거하고, 공유 Lambert의 해석적 원궤도 대조·실제 수치 전파와 Mode B 입력 계약 검사 2개를 추가했다. 기존 LLO, GRAIL, 유한 연소, 날짜 경계, 실패 처리, 위험한 종말 하강 거부 검사는 유지한다.

TypeScript 검사와 Vite 정적 빌드도 통과했다. Worker는 약 **119.8 kB → 92.9 kB** (현재 92,867 bytes)다. npm 의존성이나 백엔드 프로세스를 추가하지 않았다.

기본 사례를 새 엔진으로 다시 계산해 **VALIDATED · 20/20 검사 통과**했다. 같은 컴퓨터에서 정리 직전의 확장된 Mode B 결과와 비교했을 때 다음이 모두 정확히 동일했다.

- 전체 궤적 표본 배열
- 96구간 추력 가속도 제어 배열
- 이탈·진입·DOI 유한 연소의 전체 결과 배열
- 전체 ΔV, 사용 추진제, 최종 질량, 접지 위치 잔차·속도

Lambert 함수 본문도 이동 전후가 문자 단위로 동일하다. [기본 임무 보고서](finite-mission-30-default-mode-b-only.json), [수치 동등성·빌드 의존성](mode-b-only-equivalence.json). 안전 정책과 중력/적분 식은 변경하지 않았으므로 이번 정리는 전체 SPICE 자료를 다시 생성하거나 이미 완료한 독립 물리 검증을 반복하지 않았다.

Chrome에서 빌드된 정적 사이트를 실행해 **18개 화면·실행 검사**를 통과했다. 모델/위상 선택기 제거, 390/1440 px 배치, LLO↔NRHO 전환, 실제 기본 Mode B 계산, 구모델 요청의 Worker 오류, 1월 1일 미수렴 경고·빈 궤적, 구 Mode A 데이터 요청 없음과 외부 런타임 요청 없음을 확인했다. [브라우저 보고서](mode-b-only-browser-validation.json).

Chrome 기본 실행은 제한 시간 내 검증된 후보를 반환했고 탐색 미완료 표시를 보존했다. 로컬 엔진 실행에서는 후보 탐색을 완료했다. 두 경우 모두 검증된 경로만 성공으로 표시하며 전역 최적해나 실제 비행 안전을 인증하지 않는다.

## 실행

```powershell
cd C:\Users\hach0\Projects\Lunar-Landing-Orbit-Simulator
npm install
npm run dev
# 개발 검증
npm test
npm run build
node scripts/run-finite-validation.mjs --degree=30 --budget=60 --tag=mode-b-only
```
