# 미션 포탈 ↔ 궤도 시뮬레이터 입력 계약

검토 기준: 2026-11-15, 포탈 `cd38551c38dc02ccb48bc166ff812753d0a0498f`.
대상: https://github.com/NASA-Space-Apps-Challenge-Team-DU-NE/DU-NE-Mission-Portal-

이번 작업은 **orbit 저장소의 로컬 UI 수정과 연동 설계**다. 포탈의 파일·상태·배포는 수정하지 않았으며, 두 앱 사이의 데이터 전달 기능은 아직 연결하지 않았다. 아래 필드 이름은 orbit `frontend/src/types.ts`의 `Config` 계약을 따른다. 예제 전체는 `portal-orbit-default-input.json`, 실제 기본값의 단일 원본은 `frontend/src/defaultMission.ts`다.

## 1. 바로 재사용할 수 있는 포탈 입력

| 포탈 원본 | orbit 목적지 | 변환·주의 |
|---|---|---|
| `useResolvedSite().site.lat_deg` | `target.latitude_deg` | 도, 행성중심 위도. 양수 북위 |
| `useResolvedSite().site.lon_deg` | `target.longitude_deg` | 도, 동경 양수, MOON_ME. 두 앱은 같은 좌표 관례 |
| `useApp.landing` | `target.landing_time_utc` | Unix **밀리초** → `new Date(landing).toISOString()`. 보는 시각 `t`를 사용하지 않음 |
| `landerExtra.dry_mass_kg` | `lander.dry_mass_kg` | kg, 양수 |
| `landerExtra.dry_mass_kg + landerExtra.prop_mass_kg` | `lander.initial_mass_kg` | kg. **선택한 질량 기준 시점**의 총질량. 추진제를 두 번 더하지 않음 |
| `landerExtra.thrust_n` | `lander.max_thrust_n` | N. 기존의 '주 엔진 추력'을 최대 추력으로 사용한다는 정의를 명시 |
| `landerExtra.isp_s` | `lander.isp_s` | 초. 배기속도(m/s)가 아님 |

`siteRef`는 `catalog` / `custom` / `cell` 세 형태다. 카탈로그 ID나 격자 번호를 좌표로 해석하지 말고 포탈의 `useResolvedSite`로 해석한 뒤 전달한다. 미선택·좌표 없음·잘못된 값은 계산을 막고 안내한다. 높이는 사용자가 별도 입력하지 않고 orbit의 LOLA DEM에서 얻는다.

포탈의 착륙선 프리셋(`landerId`, `landerEdits`)은 전력·통신용이다. 현재 `setLander`는 `landerExtra`를 변경하지 않는다. 따라서 프리셋 이름만으로 질량·엔진 제원이 바뀌었다고 간주하면 안 된다.

## 2. '01 임무 설정'에 추가할 기본 항목

권장 위치: **착륙선 정보 → 질량·추진**, 별도 **궤도 임무** 카드. 착륙지와 날짜는 기존 '02 착륙지·날짜'를 공유하고 중복 저장하지 않는다.

| UI 항목 | orbit 필드 | 단위 / 허용값 | 현재 검증 예제 |
|---|---|---|---|
| 출발 궤도 | `initial_orbit` | `llo` / `nrho` | `nrho` |
| 계산 모델 (고정) | `nrho.mode` | `b` 고정. 선택 UI 없이 전달하며 생략해도 Mode B. `a` 요청은 거부 | `b` |
| 질량 기준 시점 | `nrho.mass_basis` | `llo`: LLO 진입 후 / `nrho`: NRHO 출발 | `llo` |
| 최소 엔진 추력 | `lander.min_thrust_n` | N, `0 ≤ 최소 ≤ 최대` | `0` (완전 스로틀다운 가정) |
| LLO 기준 고도 | `orbit.altitude_km` | km, 현재 NRHO 연동은 **100 km 고정** | `100` |
| PDI 기준 고도 | `orbit.pdi_altitude_km` | km, 적분기 범위 3–100, 초기 고도보다 낮아야 함 | `15` |
| 목표 위치 오차 상한 | `constraints.position_tolerance_m` | m, 양수 | `100` |
| 접지 상대 속도 상한 | `constraints.speed_tolerance_m_s` | m/s, 양수 | `2` |
| 접지 수평 속도 상한 | `constraints.horizontal_speed_tolerance_m_s` | m/s, 양수 | `1` |
| 착륙 후보 정렬 | `objective` | `fuel` / `time` | `fuel` |
| NRHO 최적화 목표 | `nrho.objective` | `delta_v` / `time` / `balanced` | `delta_v` |

`objective`는 착륙 후보 순서를 정하고, Mode B의 최종 전체 임무 선택은 `nrho.objective`로 결정한다. 두 필드를 같은 드롭다운 상태로 덮어쓰지 않는다. Mode B의 `balanced` 점수는 전체 ΔV + 전체 비행 1일당 100 m/s다.

질량·엔진 검증은 `총질량 > 건조질량 > 0`, `추진제 > 0`, `Isp > 0`, `최대 추력 > 0`, 모든 값이 유한수일 것을 요구한다. 실제 기체의 최소 추력이 없다면 0을 인증값처럼 자동 채우지 말고 **시연용 가정**임을 표시한다. 현재 모델은 단일 단계·일정 Isp이며 탱크 용량·단 분리·실제 점화 과도응답을 검증하지 않는다.

`mass_basis='llo'`이면 입력 총질량은 전이 연료를 이미 소모한 뒤의 값이다. 필요한 NRHO 시작 질량은 계산으로 역산되어 더 커질 수 있다. 포탈에서 발사/NRHO 출발 탱크 질량을 입력하려면 반드시 `nrho` 기준을 선택해야 한다. LLO 단독 모드는 질량 기준이 LLO 시작이며 `nrho.mass_basis`는 쓰지 않는다.

## 3. '05 궤도 분석 → 고급 설정' 권장 항목

| UI 항목 | orbit 필드 | 범위 / 의미 | 현재 검증 예제 |
|---|---|---|---|
| 달 중력 모델 | `nrho.gravity_model` | Mode B만: `point_mass` / `grail` | `grail` |
| GRAIL 최대 차수 | `nrho.gravity_degree` | 일반 UI: 20 / 30 / 60 / 90. 0은 동일 GM 검증 전용 | `30` |
| 전이 시간 최소 | `nrho.transfer_tof_min_days` | 일, `0 < 최소 ≤ 최대 ≤ 14` | `3` |
| 전이 시간 최대 | `nrho.transfer_tof_max_days` | 일, 같은 값을 주면 고정 전이 시간 | `3` |
| 최대 전이 ΔV | `nrho.max_transfer_delta_v_m_s` | m/s, `0 < 값 ≤ 20000`; 전체 착륙 ΔV 상한과 다름 | `2500` |
| LLO 대기 궤도 수 | `nrho.parking_revolutions` | rev, 0–5. 현재 UI는 정수 간격, 계산기는 유한 소수도 허용 | `0` |
| 최대 반복 횟수 | `nrho.max_iterations` | 정수 1–100 | `40` |
| 계산 시간 제한 | `nrho.max_computation_seconds` | 초, 1–300. 브라우저 Worker 종료 제한 | `60` |
| 동력 하강 시간 | `nrho.powered_descent_duration_s` | Mode B: 260–1200초 또는 생략하여 탐색 | `880` |
| 착륙 접근 방향 | `nrho.approach_heading_deg` | Mode B: 북쪽 기준 시계방향, `0 ≤ 각도 < 360`도 또는 생략하여 탐색 | `180` |

Mode B는 NASA 참조 궤적에서 각 후보의 출발 시각 위치·속도를 직접 조회한다. `nrho.reference_id`, `departure_phase_mode`, `departure_phase`는 입력 계약에서 제거했다. 포탈은 이 필드를 만들 필요가 없으며 출처는 결과의 `nrho.source`에서 읽는다. 제거된 모델을 요청하면 오류를 표시하고 현재 기본 입력에서 날짜·착륙선 제원을 다시 설정한다.

하강 시간/방향의 '자동'은 JSON에서 필드를 **생략**한다. `null`, 0, 빈 문자열로 대체하지 않는다. 전이 최소·최대나 날짜 범위를 입력해도 성공이 보장되지는 않으며 제한 시간 안의 탐색 실패는 물리적 불가능의 증명이 아니다.

LLO 단독의 계산기 상한은 초기 고도 1000 km, PDI 3–100 km이며 초기 고도 > PDI여야 한다. 현재 standalone UI는 초기 30–300 km, PDI 5–50 km로 더 좁다. 이 범위는 입력 검증 범위이지 모든 조합의 수렴/안전 보증이 아니다.

## 4. 가장 먼저 처리해야 할 날짜·지역 불일치

**포탈 기본 날짜 `2026-12-02T00:00:00Z`는 확장된 orbit Mode B 자료 범위 안이다.** 해당 날짜의 orbit 기본 착륙선 검증은 통과했지만, 포탈의 다른 착륙선 제원까지 검증했다는 뜻은 아니다. 포탈 코드는 변경하지 않았다.

현재 정적 데이터팩 기준:

- Mode B 착륙 UTC: `2026-11-01T00:00:00Z` ~ `2027-01-31T23:59:59.999Z` (`landing_coverage_utc`).
- Mode B 환경/NRHO 자료: `2026-10-16T00:00:00Z` ~ `2027-02-01T00:00:00Z`. 앞쪽 16일은 전이·대기용이며 착륙 선택 범위가 아니다. NRHO 원본 구간·공백도 검사한다.
- LLO 단독 자세 표: `2026-11-15T00:00:00Z` ~ `2026-11-22T00:00:00Z`.
- 정밀 착륙 목표: 현재 LOLA 240 m 자료가 있는 남위 75–90°. 목표만 아니라 경로의 지형 검증 범위도 충족해야 함.

날짜 범위는 포탈 코드에 고정 복사하지 말고 orbit의 `data/ephemeris/index.json`과 `data/manifest.json`에서 읽는다. 착륙 날짜가 지원 범위 안이어도 전이·LLO 대기·하강을 거슬러 올라간 **출발부터 접지까지 전체 구간**, 특히 NRHO 출발 범위를 별도로 확인해야 한다. 날짜를 몰래 잘라 맞추거나 다른 계산 모델로 자동 전환하지 않는다. 착륙 입력 범위는 반드시 `landing_coverage_utc`에서 읽는다. 범위 안에서도 실패할 수 있으며 [대표 날짜 검증](EPHEMERIS_EXPANSION.md)의 성공/미수렴을 구분해 표시한다.

포탈의 현재 추진 기본값은 건조 700 kg + 추진제 1300 kg, 추력 4400 N, Isp 320 s다. 아래 orbit 검증 예제와 다르며, 이 값들이 같은 성공 사례라고 설명하면 안 된다. 프리셋 이름과 출처/가정 상태도 함께 보존한다.

## 5. 혼동하면 안 되는 입력과 고정 안전 정책

| 포탈 값 | 구별해야 하는 orbit 값 |
|---|---|
| `duration_h` (달 표면 운용 기간) | 전이 시간 `transfer_tof_*_days`, 하강 시간 `powered_descent_duration_s`와 다름 |
| `margin_deg` (통신 여유각) | 추력 기울기 제한/접근 방향과 다름 |
| `t` (현재 보는 시각) | 착륙 시각 `landing`과 다름 |
| 관측자 높이 `observer_height_m` | 질량중심–접촉점 거리 2 m와 다름 |
| 후보지 경사·일조·교신 필터, 평가 가중치 | 궤도 접지 오차·추력 제한·연료 목적함수와 다름 |
| 발전용 `fuel_wh` | 로켓 추진제 `prop_mass_kg`와 다름 |
| 통신 수평선/포탈의 간략 지형 | orbit의 지형 충돌 검증용 DEM을 대체하지 못함 |

Mode B의 `demo-terminal-v1`은 일반 입력으로 풀 수 없는 고정 설계 정책이다. 사용자 종단 허용값보다 더 엄격한 정책 조건도 동시에 적용한다. 정책이 적용되는 모드와 버전을 검증 화면에 표시한다.

| 접촉점–지형 여유 | 수평 속도 | 하강 속도 | 추력 기울기 |
|---|---|---|---|
| 1000 m 이하 | ≤50 m/s | ≤30 m/s | ≤45° |
| 100 m 이하 | ≤5 m/s | ≤5 m/s | ≤15° |
| 10 m 이하 | ≤0.5 m/s | ≤1 m/s | ≤5° |

질량중심 아래 2 m의 방사방향 접촉점, 접촉 오차 ±0.02 m, 종단 최소 10초·최대 표본 간격 0.25초, 조기 접촉 및 저고도 재상승 거부도 유지한다. 이 정책은 시연용 설계 가정이며 NASA 인증 기준이나 실제 다리·자세·미세 장애물 모델이 아니다. LLO 단독에 같은 종말 검증이 적용된다고 표시하면 안 된다.

## 6. 연동 구현 권장 순서 (이번 작업에서는 미구현)

1. 포탈의 지점·착륙 UTC·`landerExtra`를 단일 원본으로 두고, 추가 궤도 필드를 별도 `orbitSettings` 상태로 보관한다. 위 목록의 조건부 필드만 활성화한다.
2. 사용자가 계산을 누를 때 입력을 검증한 뒤 독립적인 `Config` 스냅샷을 만든다. 입력 변경 중 이전 결과는 '이전 입력의 결과'로 표시한다. 중력 모델을 바꾸면 이전 경로를 지운다.
3. orbit Worker와 정적 데이터 경로를 연결한다. Worker도 정적 자산이며 API 서버는 필요 없다. 기존 `runSimulation`의 취소·시간 제한·실패 안내를 유지한다.
4. 결과·입력 스냅샷·데이터/중력 모델·안전 정책 버전을 함께 보관한다. `VALIDATED` 및 검증 항목 통과 여부를 확인한 뒤 경로를 표시하며, 수렴 실패를 성공으로 꾸미지 않는다.
5. 합칠 때 포탈의 기존 헤더·단계 제목을 쓰고 orbit standalone 헤더는 제외한다. 현재 orbit 스타일은 전역 선택자를 포함하므로 **포탈 전체에 CSS를 그대로 import하지 않는다.** 별도 iframe 또는 스타일 스코프/컴포넌트 분리가 먼저 필요하다. iframe 방식이면 명시적 origin·메시지 스키마 검증을 갖춘 브리지를 별도 구현한다. 현재 메시지 브리지는 없다.
6. 포탈의 React 18.3.1/Three 0.160.0, orbit의 React 18.3.1/Three 0.170.0 + R3F 차이를 검토한다. 직접 통합 시 Three 버전·자산 상대 경로를 통일하고 실제 하위 배포 경로에서 다시 검증한다.

예제 선택은 명시적인 '검증된 예제 불러오기' 동작으로 제공한다. 현재 orbit 예제는 Connecting Ridge, 2026-11-16 00:00 UTC, LLO 총질량 1500 kg(건조 650 + 추진제 850), 최대/최소 추력 12000/0 N, Isp 320 s다. **이 사례도 저장된 성공 궤적을 재생하지 않고 브라우저에서 다시 계산한다.**

## 코드 근거

포탈: `web/src/pages/Cond.tsx`, `web/src/pages/Orbit.tsx`, `web/src/state/store.ts`, `web/src/state/hooks.ts`, `web/src/config.ts`, `web/src/core/types.ts`.

Orbit: `frontend/src/types.ts`, `frontend/src/defaultMission.ts`, `frontend/src/components/NRHOSettings.tsx`, `frontend/src/physics/simulator.ts`, `frontend/src/physics/ephemeris/settings.ts`, `frontend/src/physics/ephemeris/mission.ts`, `frontend/src/physics/ephemeris/landing.ts`, `frontend/src/physics/ephemeris/terminalDescent.ts`.
