import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseError, diagnoseResult } from '../frontend/src/services/failureGuidance';
import type { Config, SimulationResult } from '../frontend/src/types';

const config: Config = {
  initial_orbit: 'llo',
  target: { latitude_deg: -89.4441, longitude_deg: -137.291, landing_time_utc: '2026-11-16T00:00:00Z' },
  lander: { initial_mass_kg: 1500, dry_mass_kg: 650, max_thrust_n: 12000, min_thrust_n: 0, isp_s: 320 },
  orbit: { altitude_km: 100, pdi_altitude_km: 15 },
  constraints: { position_tolerance_m: 100, speed_tolerance_m_s: 2, horizontal_speed_tolerance_m_s: 1 },
  objective: 'fuel',
};
const nrho: Config = { ...config, initial_orbit: 'nrho', nrho: { mode: 'b', transfer_tof_min_days: .3, transfer_tof_max_days: 3, max_transfer_delta_v_m_s: 100, parking_revolutions: 0, objective: 'delta_v', max_iterations: 20, max_computation_seconds: 60, mass_basis: 'nrho' } };
function result(extra: Partial<SimulationResult> & Record<string, unknown> = {}): SimulationResult {
  return { status: 'NOT CONVERGED', trajectory: [], summary: {}, validation: {}, ...extra };
}
const text = (value: unknown) => JSON.stringify(value);

test('Failure guidance does not warn for validated results or a user cancellation', () => {
  assert.equal(diagnoseResult(result({ status: 'VALIDATED', warnings: ['DEMONSTRATION LANDER'] }), config), null);
  assert.equal(diagnoseResult(result({ status: 'TRANSFER CANCELLED' }), nrho), null);
  const abort = new Error('계산을 취소했습니다.'); abort.name = 'AbortError';
  assert.equal(diagnoseError(abort, nrho), null);
});

test('Converged LLO candidates expose overlapping thrust and fuel violations without changing inputs', () => {
  const input = structuredClone(config), before = structuredClone(input);
  const guidance = diagnoseResult(result({ status: 'INFEASIBLE UNDER ASSUMPTIONS', candidates: [
    { position_error_m: .01, velocity_residual_m_s: .001, final_mass_kg: 600, max_thrust_n: 14000, min_thrust_n: 1000, engine_constraints_passed: false },
    { position_error_m: .02, velocity_residual_m_s: .002, final_mass_kg: 630, max_thrust_n: 13000, min_thrust_n: 1200, engine_constraints_passed: false },
  ] }), input)!;
  assert.match(text(guidance), /엔진 추력 조건 미충족/);
  assert.match(text(guidance), /추진제 부족/);
  assert.match(text(guidance), /13,000/);
  assert.match(guidance.summary, /모든 경로가 불가능하다는 뜻은 아닙니다/);
  assert.deepEqual(input, before);
});

test('Unconverged or missing candidate diagnostics never imply a known engine or fuel violation', () => {
  const guidance = diagnoseResult(result({ candidates: [
    { position_error_m: 100000, velocity_residual_m_s: 200, final_mass_kg: 10, max_thrust_n: 99999, engine_constraints_passed: false },
    { error: 'Singular linear system' },
  ] }), config)!;
  assert.doesNotMatch(text(guidance.issues), /추진제 부족|엔진 추력 조건 미충족/);
  assert.match(guidance.issues[0].detail, /수렴 실패만으로 물리적 불가능이 입증되는 것은 아닙니다/);
});

test('Nested NRHO landing diagnostics use the recomputed landing input and minimum-thrust evidence', () => {
  const guidance = diagnoseResult(result({ status: 'INFEASIBLE UNDER ASSUMPTIONS', landing_diagnostic: {
    status: 'INFEASIBLE UNDER ASSUMPTIONS', input: { ...config, lander: { ...config.lander, initial_mass_kg: 900, dry_mass_kg: 700, min_thrust_n: 3000 } },
    candidates: [{ position_error_m: .001, velocity_residual_m_s: .0001, final_mass_kg: 680, max_thrust_n: 7000, min_thrust_n: 2500, engine_constraints_passed: false }],
    summary: {}, validation: {},
  } }), nrho)!;
  assert.match(text(guidance), /700 kg/);
  assert.match(text(guidance), /최소 추력 3,000 N/);
  assert.doesNotMatch(text(guidance), /설정값 12,000 N을 초과/);
});

test('Transfer timeout and observed delta-V excess are distinct from impossible missions', () => {
  const guidance = diagnoseResult(result({ status: 'TRANSFER NOT CONVERGED', transfer_diagnostic: {
    status: 'TRANSFER NOT CONVERGED', timed_out: true,
    candidates: [{ converged: true, valid: false, total_delta_v_m_s: 812.5 }, { converged: false, valid: false }],
  } }), nrho)!;
  assert.match(text(guidance), /계산 시간 제한 도달/);
  assert.match(text(guidance), /ΔV 한도 100 m\/s/);
  assert.match(text(guidance), /한도 변경만으로 추진제가 늘어나지는 않습니다/);
  assert.match(text(guidance), /물리적으로 불가능하다는 뜻이 아닙니다/);
  const timerOnly = diagnoseResult(result({ status: 'TRANSFER NOT CONVERGED', message: '최대 계산 시간 1초에 도달하여 Worker를 종료했습니다. 성공 경로는 생성하지 않았습니다.' }), nrho)!;
  assert.equal(timerOnly.issues[0].title, '계산 시간 제한 도달');
});

test('Failed terrain and touchdown validation reports every supported cause and keeps safety constraints', () => {
  const guidance = diagnoseResult(result({ status: 'NUMERICALLY CONVERGED', validation: {
    terrain: { passed: false, collision_samples: 5, unavailable_samples: 0, low_resolution_below_12km: 3 },
    position: { passed: false, actual_m: 150, limit_m: 100 },
    speed: { passed: true, actual_m_s: .5, limit_m_s: 2 },
    contact: { passed: false, final_dem_clearance_m: 1, vertical_speed_m_s: -.5 },
  } }), config)!;
  assert.match(guidance.summary, /진단용이며 성공 경로가 아닙니다/);
  assert.match(text(guidance), /하강 중 지형 충돌/);
  assert.match(text(guidance), /하강 구간의 정밀 지형 부족/);
  assert.match(text(guidance), /위치 오차 150 m/);
  assert.match(text(guidance), /허용오차를 임의로 완화하기보다/);
});

test('Terrain, SPICE coverage, file corruption, and supported LLO altitude receive actionable distinct guidance', () => {
  const terrain = diagnoseResult(result({ status: 'DATA UNAVAILABLE', message: 'TERRAIN DATA UNAVAILABLE — precise landing targets require the supplied south-polar LOLA 240m DEM (75°S–90°S).' }), config)!;
  assert.match(text(terrain), /남위 75°–90°/);
  assert.match(terrain.summary, /가능 여부를 판단하지 못했습니다/);
  const unspecified = diagnoseResult(result({ status: 'DATA UNAVAILABLE' }), config)!;
  assert.equal(unspecified.issues[0].title, '필수 데이터 확인 필요');
  assert.doesNotMatch(text(unspecified.issues), /PDI|제원|추력/);
  const spice = diagnoseError(new Error('SPICE orientation table does not cover the complete flight. Select a date within the supplied range.'), config)!;
  assert.match(text(spice), /비행 시작 시각도 기간 안/);
  const corrupt = diagnoseError(new Error('LOLA data integrity check failed: tiles/tile.bin'), config)!;
  assert.match(text(corrupt), /무결성 검사를 끄지 마세요/);
  const unsupported = diagnoseError(new Error('NRHO integration currently targets the existing 100 km LLO mode.'), { ...nrho, orbit: { ...nrho.orbit, altitude_km: 150 } })!;
  assert.match(text(unsupported), /150 km/);
  assert.match(text(unsupported), /100 km로 설정/);
});

test('Whole-mission mass continuity failure is not misreported as propellant shortage', () => {
  const guidance = diagnoseResult(result({ status: 'NUMERICALLY CONVERGED', validation: { total_fuel: { passed: false, final_mass_kg: 800, mass_continuity_error_kg: 1 }, mass: { passed: true, final_kg: 800, dry_kg: 650 } } }), nrho)!;
  assert.ok(guidance.issues.some(i => i.title === '질량 연결 검증 미충족'));
  assert.ok(!guidance.issues.some(i => i.title === '추진제 부족'));
});

test('Rejected alternative candidates are not attributed to a selected path that failed a different check', () => {
  const guidance = diagnoseResult(result({ status: 'NUMERICALLY CONVERGED',
    candidates: [{ position_error_m: .001, velocity_residual_m_s: .001, final_mass_kg: 20, max_thrust_n: 99999 }],
    transfer_diagnostic: { status: 'TRANSFER VALIDATED', timed_out: true, message: 'Time budget reached; returning the best fully verified candidate found.', candidates: [{ converged: true, valid: false, total_delta_v_m_s: 9999 }] },
    validation: { terrain: { passed: false, collision_samples: 2 }, mass: { passed: true }, thrust: { passed: true } },
  }), nrho)!;
  assert.deepEqual(guidance.issues.map(i => i.title), ['하강 중 지형 충돌']);
});

test('Unknown failure and integrator exception remain honest without invented diagnosis', () => {
  const guidance = diagnoseError(new Error('Nonfinite adaptive integration state.'), nrho)!;
  assert.equal(guidance.issues[0].title, '계산 오류');
  assert.equal(guidance.technicalDetails, 'Nonfinite adaptive integration state.');
  assert.match(diagnoseResult(result({ status: 'UNEXPECTED FAILURE' }), config)!.issues[0].detail, /모든 제약을 통과한 경로가 없습니다/);
});

test('Mode B distinguishes ephemeris coverage, missing data and dated reference failures', () => {
  const dated: Config = { ...nrho, nrho: { ...nrho.nrho!, mode: 'b' } };
  const coverage = diagnoseError(new Error('EPHEMERIS COVERAGE: departure outside supported UTC interval'), dated)!;
  assert.match(text(coverage), /전체 비행 구간|전체 시간/);
  assert.match(text(coverage), /착륙 UTC/);
  assert.match(text(diagnoseError(new Error('EPHEMERIS DATA: invalid schema'), dated)), /천체력 데이터 확인 필요/);
  assert.match(text(diagnoseError(new Error('EPHEMERIS REFERENCE: departure outside reference window'), dated)), /기준 궤적 출발 지원 기간/);
  assert.doesNotMatch(text(coverage), /추진제 부족|추력 조건 미충족/);
});

test('Mode B failed searches recommend UTC changes, never removed phase controls', () => {
  const dated: Config = { ...nrho, nrho: { ...nrho.nrho!, mode: 'b' } };
  const guidance = diagnoseResult(result({ status: 'TRANSFER NOT CONVERGED' }), dated)!;
  assert.match(text(guidance.issues), /착륙 UTC/);
  assert.doesNotMatch(text(guidance.issues), /출발 위상/);
  const deltaV = diagnoseResult(result({ status: 'TRANSFER NOT CONVERGED', transfer_diagnostic: { status: 'TRANSFER NOT CONVERGED', candidates: [{ total_delta_v_m_s: 900 }] } }), dated)!;
  assert.doesNotMatch(text(deltaV.issues), /출발 위상/);
});

test('GRAIL data corruption and numerical failure remain distinct from infeasibility and do not silently switch models', () => {
  const grail: Config = { ...nrho, nrho: { ...nrho.nrho!, mode: 'b', gravity_model: 'grail', gravity_degree: 60 } };
  const data = diagnoseError(new Error('GRAVITY_DATA: integrity hash mismatch'), grail)!;
  assert.deepEqual(data.issues.map(issue => issue.title), ['GRAIL 중력 데이터 확인 필요']);
  assert.match(text(data), /착륙 가능 여부를 판단할 수 없습니다/);
  assert.match(text(data), /무결성 검사를 끄거나/);
  assert.doesNotMatch(text(data), /추진제 부족|추력 조건 미충족|20차 또는 30차/);
  const numerics = diagnoseError(new Error('GRAVITY_NUMERICS: nonfinite Hessian'), grail)!;
  assert.equal(numerics.issues[0].title, '중력 가속도 수치 계산 오류');
  assert.match(text(numerics), /다른 모델을 계산하는 것입니다/);
  const selection = diagnoseError(new Error('GRAVITY CONFIG: unsupported degree 120'), grail)!;
  assert.equal(selection.issues[0].title, '중력 모델 설정 오류');
});

test('GRAIL computation budget advice names the degree tradeoff without changing configuration', () => {
  const grail: Config = { ...nrho, nrho: { ...nrho.nrho!, mode: 'b', gravity_model: 'grail', gravity_degree: 90 } };
  const before = structuredClone(grail);
  const guidance = diagnoseError(new Error('Mode B adaptive integration step budget reached.'), grail)!;
  assert.match(text(guidance), /20차 또는 30차/);
  assert.match(text(guidance), /속도·정확도 절충/);
  assert.match(text(guidance), /물리적으로 불가능하다는 뜻이 아닙니다/);
  assert.deepEqual(grail, before);
  assert.doesNotMatch(text(diagnoseError(new Error('Time budget reached'), nrho)), /20차 또는 30차/);
});

test('Mode B collision envelope errors name collision rather than an invented fuel failure', () => {
  const guidance = diagnoseError(new Error('Mode B trajectory intersects the Moon collision envelope.'), { ...nrho, nrho: { ...nrho.nrho!, mode: 'b' } })!;
  assert.equal(guidance.issues[0].title, '천체 충돌 경계 진입');
  assert.doesNotMatch(text(guidance), /추진제 부족|추력 조건 미충족/);
});


test('terminal-constraint failures explain low-altitude speed, tilt and contact without recommending relaxed limits',()=>{
  const b={...nrho,nrho:{...nrho.nrho!,mode:'b' as const}};
  const guidance=diagnoseResult(result({status:'LANDING CONSTRAINT VIOLATION',validation:{
    low_altitude_speed:{passed:false,violations:[{clearance_m:2.05,actual:11.66,limit:.5}]},
    thrust_tilt:{passed:false,violations:[{clearance_m:0,actual:70.8,limit:5}]},
    contact:{passed:false,model:'radial_support_point',center_to_contact_m:2,premature_contact_samples:3},
  }}),b)!;
  assert.match(guidance.title,/종말 하강/);assert.match(text(guidance),/11.66/);assert.match(text(guidance),/70.8/);
  assert.match(text(guidance),/접촉 기준점/);assert.match(text(guidance),/제한을 자동으로 완화하지/);
  assert.doesNotMatch(text(guidance),/추력을 늘리거나|출발 위상/);
});

test('missing terminal inspection evidence is not described as a measured speed excess',()=>{
  const guidance=diagnoseResult(result({status:'LANDING CONSTRAINT VIOLATION',validation:{low_altitude_speed:{passed:false,violations:[]},thrust_tilt:{passed:false,violations:[]}}}),config)!;
  assert.match(text(guidance),/확인하지 못했습니다/);assert.doesNotMatch(text(guidance),/초과했습니다/);
});
