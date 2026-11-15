import type { Config, SimulationResult } from '../types';

export interface FailureGuidance {
  title: string;
  summary: string;
  issues: Array<{ title: string; detail: string; recommendations: string[] }>;
  technicalDetails?: string;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const rows = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const number = (value: unknown, digits = 1) => finite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '확인되지 않음';
const failed = (value: unknown) => value === false || record(value).passed === false || record(value).pass === false || record(value).status === 'FAIL';
const cancelled = (status: string) => /CANCELLED|CANCELED|ABORTED/i.test(status);
const budgetMessage = (message: string) => /time budget|time limit|computation.*limit|maximum computation|step budget|evaluation budget|최대 계산 시간|시간.*초과/i.test(message);

function searchAdvice(config: Config): string[] {
  if (config.initial_orbit !== 'nrho') return [
    'PDI 기준 고도를 조정해 감속을 시작하는 위치를 바꾸거나, 주변의 다른 착륙 목표로 다시 계산하세요.',
    '실제 착륙선의 추력·추진제·비추력으로 가능한 조합인지 확인하세요. 현재의 제한된 후보 탐색으로 모든 경로를 확인한 것은 아닙니다.',
  ];
  return [
    '지원 기간 안에서 목표 착륙 UTC 또는 전이 시간의 최소·최대 범위를 바꿔 다른 출발 시각을 탐색하세요.',
    '날짜별 기준 궤적의 출발 지원 기간과 전체 비행의 천체력 지원 기간을 함께 확인하세요.',
    '최대 반복 횟수와 계산 시간을 늘려 재탐색하세요 (각각 최대 100회, 300초). 성공을 보장하는 조정은 아닙니다.',
  ];
}

function messageIssues(message: string, config: Config): FailureGuidance['issues'] {
  const issues: FailureGuidance['issues'] = [];
  const add = (title: string, detail: string, recommendations: string[]) => issues.push({ title, detail, recommendations });
  if (/UNSUPPORTED MISSION MODEL/.test(message)) add('지원하지 않는 계산 모델', '현재 NRHO 계산은 날짜 기반 Mode B만 지원합니다. 다른 모델의 입력을 자동으로 바꿔 계산하지 않습니다.', ['검증된 기본 입력을 불러오고 지원 기간 안의 착륙 UTC와 착륙선 제원을 다시 확인하세요.']);
  const gravityData = /GRAVITY[_ ]DATA/i.test(message);
  if (gravityData) add('GRAIL 중력 데이터 확인 필요', '중력 계수, 정규화·좌표계 정보 또는 정적 파일의 무결성을 확인하지 못했습니다. 이 오류로 착륙 가능 여부를 판단할 수 없습니다.', [
    '검증된 gravity 정적 파일과 매니페스트가 배포 결과에 포함됐는지 확인하고 원본 전처리 결과로 복구하세요.',
    '오류 원문의 해시·스키마·프레임 정보를 확인하세요. 무결성 검사를 끄거나 누락 계수를 임의로 0으로 채우지 마세요.',
    '기존 점질량을 직접 선택해 별도 모델을 계산할 수 있지만, GRAIL 오류가 해결되거나 같은 결과가 보장되는 것은 아닙니다.',
  ]);
  if (/GRAVITY[_ ]NUMERICS/i.test(message)) add('중력 가속도 수치 계산 오류', '선택한 중력장의 가속도 또는 미분을 유한하고 일관된 값으로 계산하지 못해 전파를 중단했습니다. 성공 경로로 판정하지 않습니다.', [
    '선택한 모델·차수, 입력값과 오류 원문을 보관하고 중력 계수의 단위·정규화·좌표계 검증 결과를 확인하세요.',
    '독립 중력 평가 및 극점 검사를 확인한 뒤 다시 계산하세요. 점질량으로 바꾸면 다른 모델을 계산하는 것입니다.',
  ]);
  if (/GRAVITY[_ ]CONFIG/i.test(message)) add('중력 모델 설정 오류', '지원하지 않는 중력 모델 또는 차수가 입력됐습니다.', ['Mode B의 중력 모델과 지원 차수 20·30·60·90 중 하나를 다시 선택하세요. 0차는 동일 GM 검증용입니다.']);
  if (/EPHEMERIS COVERAGE/i.test(message)) add('Mode B 날짜 지원 범위 밖', '선택한 착륙 UTC, 출발 시각 또는 전체 비행 구간이 정적 천체력 데이터의 지원 기간을 벗어났습니다.', [
    '목표 착륙 시각을 화면에 표시된 천체력·자세 표 지원 기간 안으로 변경하세요. 출발부터 접지까지의 전체 시간도 기간 안에 있어야 합니다.',
    'NRHO 기준 궤적의 출발 지원 기간을 확인하고 착륙 UTC, 전이 시간 범위 또는 LLO 체류 시간을 조정하세요.',
  ]);
  if (/EPHEMERIS DATA/i.test(message)) add('Mode B 천체력 데이터 확인 필요', '지구·달·태양 천체력 또는 달 자세의 정적 파일을 읽거나 검증하지 못했습니다.', [
    '로컬 서버가 실행 중인지 확인하고 새로고침하세요. 배포할 때는 ephemeris 정적 데이터 파일도 함께 포함해야 합니다.',
    '오류 원문의 파일·해시·스키마 정보를 확인하고 검증된 전처리 결과로 복구하세요.',
  ]);
  if (/EPHEMERIS REFERENCE/i.test(message)) add('날짜별 NRHO 기준 궤적 확인 필요', '출발 시각이 NASA 참조 궤적의 지원 범위를 벗어나거나 원본의 미세 공백에 해당해 출발 상태를 조회하지 못했습니다. 원본 구간 사이를 임의로 보간하지 않습니다.', [
    '표시된 기준 궤적 출발 지원 기간 안으로 출발 시각이 들어오도록 착륙 UTC와 전이 시간 범위를 조정하세요.',
    '기간 안에서도 반복되면 출발 시각과 원본 구간·공백 진단을 확인하고 다른 착륙 UTC 또는 전이 시간으로 다시 계산하세요.',
  ]);
  const stepBudget = /step budget|evaluation budget/i.test(message);
  if (budgetMessage(message)) add(stepBudget ? '계산량 한도 도달' : '계산 시간 제한 도달', `${stepBudget ? '허용된 적분 계산량' : '제한 시간'} 안에 검증된 전체 경로를 찾지 못했습니다. 이는 물리적으로 불가능하다는 뜻이 아닙니다.`, [
    stepBudget ? '다른 착륙 UTC나 전이 시간 범위로 재탐색하세요. 시간 제한을 늘리는 것만으로 내부 적분 횟수 한도가 늘어나지는 않습니다.' : `NRHO 설정의 계산 시간 제한을 늘리세요${config.nrho ? ` (현재 ${number(config.nrho.max_computation_seconds, 0)}초, 최대 300초)` : ' (최대 300초)'}.`,
    '다른 작업으로 브라우저가 느려진 경우 해당 작업을 줄이고 다시 계산하세요.',
    ...(config.initial_orbit === 'nrho' && config.nrho?.gravity_model === 'grail' ? ['중력장을 20차 또는 30차로 직접 선택해 계산량을 줄일 수 있습니다. 차수를 낮추면 중력장 세부 구조도 줄어드는 속도·정확도 절충이며, 수렴이나 실제 착륙 정확도를 보장하지 않습니다.'] : []),
  ]);
  if (/trajectory intersects the (Moon|Earth) collision envelope/i.test(message)) add('천체 충돌 경계 진입', '전파한 경로가 달 또는 지구의 충돌 경계에 들어가 계산을 중단했습니다.', ['지원 기간 안의 다른 착륙 UTC나 전이 시간 범위를 선택해 다시 탐색하세요.', '충돌 경계를 무시하거나 위치를 목표 상태로 옮겨 성공 처리하지 마세요.']);
  if (/orientation table|SPICE.*cover|Invalid UTC|valid UTC/i.test(message)) add('착륙 시각의 자세 데이터 부족', '입력한 UTC 또는 전체 비행 구간이 제공된 SPICE 자세 표로 계산 가능한 범위에 들지 않습니다.', [
    '목표 착륙 시각 아래 표시된 자세 표 지원 기간 안의 UTC를 선택하세요. 비행 시작 시각도 기간 안에 들어야 하므로 시작 경계보다 충분히 뒤의 착륙 시각을 사용하세요.',
  ]);
  if (/precise landing targets|south-polar LOLA|75°S|entire landing-view ROI/i.test(message)) add('정밀 지형 데이터 범위 밖', '현재 포함된 정밀 LOLA DEM은 남위 75°–90° 지역입니다. 선택한 지점 또는 주변 하강 구간의 지형을 검증할 수 없습니다.', [
    '남극 지역의 착륙지를 선택하세요. 범위 경계에서는 경로가 벗어날 수 있으므로 남극 쪽의 목표로 이동해 다시 계산하세요.',
    '다른 지역을 사용하려면 해당 지역의 검증된 정적 LOLA ROI 데이터를 추가해야 합니다.',
  ]);
  if (!gravityData && /integrity|invalid byte length|Invalid JSON|metadata is invalid|static NASA asset|tile missing|reference JSON|Failed to fetch|NetworkError|HTTP \d|fetch/i.test(message)) add('정적 데이터 로드 또는 무결성 오류', '필요한 NASA 정적 파일을 읽거나 무결성을 확인하지 못했습니다. 경로의 물리적 가능 여부는 아직 판단할 수 없습니다.', [
    '로컬 개발 서버가 실행 중인지 확인한 뒤 새로고침하고 다시 계산하세요.',
    '계속 실패하면 오류 원문에 나온 파일이 정적 data 폴더에 포함되어 있는지 확인하고 원본 전처리 결과로 복구하세요. 무결성 검사를 끄지 마세요.',
  ]);
  if (/Web Crypto|HTTPS or localhost/i.test(message)) add('데이터 검증을 지원하지 않는 접속 방식', '브라우저의 Web Crypto 기능을 사용할 수 없어 데이터 검증을 진행하지 못했습니다.', ['localhost 또는 127.0.0.1로 실행하거나 HTTPS 주소를 사용하세요.']);
  if (/Initial mass must exceed/i.test(message)) add('초기 질량과 건조 질량 설정 오류', `초기 총질량 ${number(config.lander.initial_mass_kg)} kg, 건조 질량 ${number(config.lander.dry_mass_kg)} kg입니다. 양의 건조 질량보다 초기 총질량이 커야 합니다.`, ['초기 총질량에는 건조 질량과 탑재 추진제를 함께 입력하세요. 실제 착륙선 제원에 맞게 두 값을 수정하세요.']);
  if (/positive Isp and maximum thrust/i.test(message)) add('엔진 입력 범위 오류', '비추력과 최대 추력은 양수여야 하며 최소 추력은 0 이상, 최대 추력 이하여야 합니다.', ['최소·최대 추력과 비추력을 실제 엔진 제원에 맞게 입력하세요.']);
  if (/existing 100 km LLO/i.test(message)) add('NRHO 연결 궤도 고도 미지원', `현재 NRHO 모드는 100 km LLO에만 연결됩니다. 입력한 초기 원궤도는 ${number(config.orbit.altitude_km)} km입니다.`, ['초기 원궤도를 100 km로 설정한 뒤 다시 계산하세요.']);
  if (/Initial altitude must exceed|solver supports initial altitude/i.test(message)) add('초기 궤도와 PDI 고도 설정 오류', '초기 원궤도는 양의 PDI 기준 고도보다 높아야 하며 계산기의 지원 고도 범위 안이어야 합니다.', ['입력창의 지원 범위를 확인하고 PDI 기준 고도를 초기 원궤도보다 낮게 설정하세요.']);
  if (/Transfer interval must satisfy/i.test(message)) add('전이 비행 시간 범위 오류', '최소 시간은 0일 초과, 최대 시간은 최소 시간 이상·14일 이하여야 합니다.', ['NRHO 전이 비행 시간의 최소·최대 값을 순서대로 수정하세요.']);
  if (/Powered descent duration must|Approach heading must|All coordinates.*finite|NRHO settings must be finite|Latitude must|Landing tolerances must|Parking:|Unsupported NRHO setting/i.test(message)) add('입력값 확인 필요', '좌표, 착륙선 제원 또는 계산 제한 중 지원 범위를 벗어난 값이 있습니다.', ['빈 입력이나 숫자가 아닌 값이 없는지 확인하고 각 입력창의 범위에 맞춰 수정하세요. 착륙 허용오차는 양수로 유지하세요.']);
  if (/consume the available propellant/i.test(message)) add('착륙 전 추진제 소진', '계산된 NRHO 이탈·LLO 진입 기동만으로 가용 추진제가 소진되어 건조 질량을 유지한 착륙이 불가능합니다.', [
    'NRHO 출발 질량 기준을 확인하고 실제 탱크 용량 안에서 추진제를 늘리거나 건조 질량을 줄일 수 있는지 검토하세요.',
    '실제 엔진에서 가능한 비추력을 사용하고, 총 ΔV 우선으로 다른 착륙 UTC·전이 시간 조합을 탐색하세요.',
  ]);
  return issues;
}

export function diagnoseResult(result: SimulationResult, config: Config): FailureGuidance | null {
  if (result.status === 'VALIDATED' || cancelled(result.status)) return null;
  const raw = result as unknown as RecordValue;
  const landing = record(raw.landing_diagnostic), transfer = record(raw.transfer_diagnostic);
  const landingInput = record(landing.input), landingLander = record(landingInput.lander);
  const lander = { ...config.lander };
  for (const key of Object.keys(lander) as Array<keyof typeof lander>) if (finite(landingLander[key])) lander[key] = landingLander[key];
  const message = [result.message, landing.message, transfer.message].filter(x => typeof x === 'string').join('\n');
  const failureMessage = [result.message, landing.message, transfer.status !== 'TRANSFER VALIDATED' ? transfer.message : undefined].filter(x => typeof x === 'string').join('\n');
  const issues = messageIssues(failureMessage, config);
  const add = (title: string, detail: string, recommendations: string[]) => { if (!issues.some(issue => issue.title === title)) issues.push({ title, detail, recommendations }); };
  if (transfer.status !== 'TRANSFER VALIDATED' && transfer.timed_out === true && !issues.some(i => i.title === '계산 시간 제한 도달')) issues.push(...messageIssues('Time budget reached', config));
  const checks = { ...record(landing.validation), ...record(result.validation) };
  if (Array.isArray(result.validation)) result.validation.forEach((entry, index) => { checks[String(entry.name ?? index)] = entry; });
  // Rejected alternatives are not causes of failure once an admissible candidate
  // was selected. In that case diagnose only the selected path's checks.
  const noAdmissibleLanding = (status: unknown) => status === 'INFEASIBLE UNDER ASSUMPTIONS' || status === 'NOT CONVERGED';
  const lloCandidates = [
    ...(noAdmissibleLanding(result.status) && !Object.keys(landing).length ? rows(raw.candidates) : []),
    ...(noAdmissibleLanding(landing.status ?? result.status) ? rows(landing.candidates) : []),
  ];
  // Candidate engine_constraints_passed also includes shooting residuals. Only
  // use actual converged residuals and numeric limit violations to name a cause.
  const converged = lloCandidates.filter(c => finite(c.position_error_m) && c.position_error_m < .5 && finite(c.velocity_residual_m_s) && c.velocity_residual_m_s < .02);
  const heavyBurns = converged.filter(c => finite(c.max_thrust_n) && c.max_thrust_n > lander.max_thrust_n);
  const lowBurns = converged.filter(c => finite(c.min_thrust_n) && c.min_thrust_n < lander.min_thrust_n);
  const fuelShortage = converged.filter(c => finite(c.final_mass_kg) && c.final_mass_kg < lander.dry_mass_kg);
  if (failed(checks.thrust) || heavyBurns.length || lowBurns.length) {
    const check = record(checks.thrust);
    const maximum = check.maximum_n ?? (heavyBurns.length ? Math.min(...heavyBurns.map(c => c.max_thrust_n as number)) : undefined);
    const minimum = check.minimum_powered_n ?? check.minimum_n ?? (lowBurns.length ? Math.max(...lowBurns.map(c => c.min_thrust_n as number)) : undefined);
    const detail = heavyBurns.length
      ? `수치적으로 수렴한 후보 중 ${heavyBurns.length}개의 최대 요구 추력이 설정값 ${number(lander.max_thrust_n)} N을 초과했습니다. 이들 후보의 가장 작은 최대 요구 추력은 ${number(maximum)} N입니다.${lowBurns.length ? ` 또한 ${lowBurns.length}개 후보는 최소 추력보다 낮은 추력을 요구합니다.` : ''}`
      : lowBurns.length ? `수치적으로 수렴한 후보 중 ${lowBurns.length}개가 엔진의 최소 추력 ${number(lander.min_thrust_n)} N보다 낮은 추력을 요구했습니다.`
        : `추력 검증을 통과하지 못했습니다. 최대 요구 추력 ${number(maximum)} N / 설정 최대 ${number(lander.max_thrust_n)} N${finite(minimum) ? `, 최소 요구 추력 ${number(minimum)} N / 설정 최소 ${number(lander.min_thrust_n)} N` : ''}.`;
    add('엔진 추력 조건 미충족', detail, [
      '실제 엔진이 허용하는 범위에서 최대 추력을 늘리거나 착륙 시 질량을 줄일 수 있는지 확인하세요.',
      '최소 추력이 문제라면 더 낮게 조절할 수 있는 엔진 제원을 사용하세요. PDI 기준 고도를 바꾸어 감속 경로를 다시 탐색하는 방법도 있습니다.',
    ]);
  }
  const mass = record(checks.mass), totalFuel = record(checks.total_fuel);
  const finalMass = mass.final_kg ?? totalFuel.final_mass_kg;
  if (failed(checks.mass) || fuelShortage.length || (failed(checks.total_fuel) && finite(finalMass) && finalMass < lander.dry_mass_kg)) add('추진제 부족',
    fuelShortage.length ? `수치적으로 수렴한 후보 중 ${fuelShortage.length}개는 최종 질량이 건조 질량 ${number(lander.dry_mass_kg)} kg보다 낮아 가용 추진제를 초과했습니다.` : `최종 질량 ${number(finalMass)} kg이 건조 질량 ${number(lander.dry_mass_kg)} kg 조건을 만족하지 못했습니다.`,
    ['실제 탱크 용량 안에서 추진제를 늘리거나 건조 질량을 줄일 수 있는지 검토하세요. 총질량이 커지면 필요한 추력도 다시 확인해야 합니다.', '실제 엔진의 비추력을 확인하고 추진제 소모량 우선으로 다시 탐색하세요. NRHO 모드에서는 총 ΔV 우선과 다른 착륙 UTC·전이 시간도 비교하세요.']);
  else if (failed(checks.total_fuel)) add('질량 연결 검증 미충족', '전이 후 질량과 착륙 시작 질량 또는 전체 경로의 질량 일관성을 확인하지 못했습니다. 이를 단순한 추진제 부족으로 단정할 수 없습니다.', ['다른 착륙 UTC·전이 시간을 탐색하고 다시 계산하세요. 반복되면 검증 상세의 질량 잔차와 JSON 결과를 확인하세요.']);
  const transferCandidates = rows(transfer.candidates);
  const cap = config.nrho?.max_transfer_delta_v_m_s ?? 2500;
  const aboveCap = transferCandidates.filter(c => finite(c.total_delta_v_m_s) && c.total_delta_v_m_s > cap);
  if (transfer.status !== 'TRANSFER VALIDATED' && aboveCap.length) add('전이 ΔV 한도 초과 후보', `계산된 전이 후보 중 ${aboveCap.length}개가 ΔV 한도 ${number(cap)} m/s를 초과했습니다. 이 후보들 중 최소값은 ${number(Math.min(...aboveCap.map(c => c.total_delta_v_m_s as number)))} m/s이며 다른 검증 조건 충족은 보장되지 않습니다.`, [
    '총 ΔV 우선으로 다른 착륙 UTC 선택과 다른 전이 시간 범위를 시도하세요.',
    '착륙에 필요한 연료까지 확보 가능한 경우에만 실제 추진계 성능에 맞춰 전이 ΔV 한도를 높이세요. 한도 변경만으로 추진제가 늘어나지는 않습니다.',
  ]);
  if (failed(checks.low_altitude_speed)) {
    const v = rows(record(checks.low_altitude_speed).violations)[0];
    add('저고도 속도 제한 위반', v ? `접촉 여유 ${number(v?.clearance_m, 2)} m에서 속도 ${number(v?.actual, 2)} m/s가 해당 제한 ${number(v?.limit, 2)} m/s를 초과했습니다. 최종 속도만 맞아도 이 경로는 통과하지 않습니다.` : '검사 표본이 없거나 유효하지 않아 저고도 속도 제한을 확인하지 못했습니다.', ['저고도에 도달하기 전에 감속하도록 PDI 고도·접근 경로를 재탐색하세요.', '현재 제어 탐색은 종말 하강 제약을 만족하는 경로를 찾지 못할 수 있습니다. 제한을 자동으로 완화하지 않으며, 조건을 만족하는 유도 설계가 필요합니다.']);
  }
  if (failed(checks.thrust_tilt)) {
    const v = rows(record(checks.thrust_tilt).violations)[0];
    add('저고도 추력 기울기 제한 위반', v ? `국소 수직 대비 추력 기울기 ${number(v?.actual, 2)}° / 해당 구간 제한 ${number(v?.limit, 2)}°입니다. 기체 자세 자체를 계산한 값은 아닙니다.` : '검사 표본 또는 추력 방향이 유효하지 않아 저고도 기울기 제한을 확인하지 못했습니다.', ['수평 감속을 더 높은 고도에서 완료하는 경로를 탐색하세요.', '시연용 제한을 통과해도 실제 기체의 짐벌·자세 응답은 별도로 검증해야 합니다.']);
  }
  if (failed(checks.terminal_descent)) add('종말 하강 구간 미검증', '저고도 하강 방향, 구간 길이 또는 촘촘한 검사 표본 조건을 충족하지 못했습니다.', ['하강 중 재상승하거나 마지막 순간에만 속도를 맞추는 경로는 통과시키지 않습니다.', '검증 상세의 표본 간격·하강 구간 길이·위반 위치를 확인하고 종말 하강 경로를 다시 설계하세요.']);
  const contactCheck = record(checks.contact);
  if (failed(checks.contact) && contactCheck.model === 'radial_support_point') add('접촉 기준점 조건 위반', `질량중심 아래 ${number(contactCheck.center_to_contact_m)} m의 가정된 접촉점이 너무 일찍 지면에 닿거나, 지면을 통과하거나, 최종 접지 조건을 만족하지 못했습니다.`, ['접촉 이전에 수평·수직 감속을 완료해야 합니다. 기체 기준점만 지표에 맞추지 마세요.', '2 m는 시연용 가정입니다. 실제 착륙 다리·경사·장애물 검증을 대신하지 않습니다.']);
  const terrain = record(checks.terrain);
  if (failed(checks.terrain)) {
    if ((finite(terrain.collision_samples) && terrain.collision_samples > 0)) add('하강 중 지형 충돌', `접지 전 ${number(terrain.collision_samples, 0)}개 표본이 DEM 지형과 충돌했습니다.`, ['주변의 다른 착륙 목표나 PDI 기준 고도를 선택해 하강 경로를 다시 계산하세요.', '충돌 검사를 무시하거나 착륙 오차 허용값을 늘려 통과시키지 마세요.']);
    if ((finite(terrain.unavailable_samples) && terrain.unavailable_samples > 0) || (finite(terrain.low_resolution_below_12km) && terrain.low_resolution_below_12km > 0)) add('하강 구간의 정밀 지형 부족', '경로 일부에 지형 데이터가 없거나 저고도에서 전역 저해상도 데이터만 제공됩니다.', ['남극 정밀 DEM 범위 안에서 하강 구간 전체가 유지되도록 착륙 목표를 조정하세요.', '해당 지역을 유지해야 한다면 검증된 정적 LOLA ROI 데이터를 추가해야 합니다.']);
    if (!issues.some(i => /지형/.test(i.title))) add('지형 검증 미충족', '하강 경로의 지형 안전 조건을 확인하지 못했습니다.', ['검증 상세의 지형 항목을 확인하고 주변 착륙 목표나 PDI 기준 고도를 바꿔 다시 계산하세요.']);
  }
  if (['position', 'speed', 'horizontal_speed', 'contact'].some(key => failed(checks[key]))) add('접지 조건 미충족', [
    failed(checks.position) ? `위치 오차 ${number(record(checks.position).actual_m)} m` : '',
    failed(checks.speed) ? `접지 속도 ${number(record(checks.speed).actual_m_s, 3)} m/s` : '',
    failed(checks.horizontal_speed) ? `수평 속도 ${number(record(checks.horizontal_speed).actual_m_s, 3)} m/s` : '',
    failed(checks.contact) ? '지표 접촉·하강 방향 조건 미충족' : '',
  ].filter(Boolean).join(' · ') + '. 성공한 착륙으로 판정할 수 없습니다.', ['다른 PDI 기준 고도 또는 착륙 목표로 재탐색하고 추력·추진제에 여유가 있는지 확인하세요.', '접지 허용오차를 임의로 완화하기보다 경로가 원래 요구 조건을 만족하도록 조정하세요.']);
  if (['continuity', 'forward_propagation', 'nrho_reference', 'nrho_coast', 'transfer_coast', 'llo_insertion'].some(key => failed(checks[key]))) add('궤도 연결 또는 수치 검증 미충족', '기준 궤도, 전이·LLO 연결 또는 정밀 재적분 검증 중 통과하지 못한 항목이 있습니다.', ['검증 상세에서 실패한 항목과 잔차를 확인하세요. NRHO라면 다른 착륙 UTC·전이 시간으로 재탐색하세요.', '같은 오류가 반복되면 JSON 결과와 입력값을 보관하여 모델과 데이터 검증에 사용하세요.']);
  const dataFailure = /DATA UNAVAILABLE/.test(result.status);
  if (!issues.length && dataFailure) add('필수 데이터 확인 필요', '계산에 필요한 정밀 지형 또는 자세 데이터가 제공되지 않아 검증을 완료할 수 없습니다.', ['착륙 목표가 정밀 DEM 범위 안인지, UTC가 제공된 자세 표 기간 안인지 확인하세요.', '정적 data 파일이 모두 포함되어 있고 로컬 서버에서 정상적으로 읽히는지 확인하세요.']);
  if (!issues.length) add(Object.keys(landing).length ? '착륙 구간을 검증하지 못함' : '검증된 경로를 찾지 못함',
    Object.keys(landing).length ? 'NRHO 전이를 연결하기 전에 LLO부터 지표까지의 착륙 구간이 조건을 통과하지 못했습니다. 제공된 진단만으로 세부 원인을 단정할 수 없습니다.' : '현재 탐색 범위에서 모든 제약을 통과한 경로가 없습니다. 수렴 실패만으로 물리적 불가능이 입증되는 것은 아닙니다.', searchAdvice(Object.keys(landing).length ? { ...config, initial_orbit: 'llo' } : config));
  return {
    title: result.status === 'LANDING CONSTRAINT VIOLATION' ? '종말 하강·접촉 제약을 위반했습니다' : dataFailure ? '데이터 부족으로 계산을 검증할 수 없습니다' : result.status === 'INFEASIBLE UNDER ASSUMPTIONS' ? '현재 조건에서 착륙 가능한 경로를 찾지 못했습니다' : '착륙 경로 계산을 완료하지 못했습니다',
    summary: dataFailure ? '필요한 데이터가 없어 가능 여부를 판단하지 못했습니다. 아래 원인과 해결 방법을 확인하세요.' : result.status === 'NUMERICALLY CONVERGED' ? '수치 계산은 수렴했지만 착륙 검증에 실패했습니다. 표시되는 경로가 있다면 진단용이며 성공 경로가 아닙니다.' : '검사한 후보가 현재 조건을 만족하지 못했습니다. 제한된 탐색의 결과이므로 모든 경로가 불가능하다는 뜻은 아닙니다.',
    issues,
    technicalDetails: [result.status, message].filter(Boolean).join('\n'),
  };
}

export function diagnoseError(error: unknown, config: Config): FailureGuidance | null {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'CalculationCancelled')) return null;
  const message = error instanceof Error ? error.message : String(error);
  const issues = messageIssues(message, config);
  return {
    title: /step budget|evaluation budget/i.test(message) ? '계산량 한도에 도달했습니다' : budgetMessage(message) ? '계산 제한 시간에 도달했습니다' : '계산을 진행할 수 없습니다',
    summary: '입력 또는 계산 환경 문제로 계산이 중단되었습니다. 물리적으로 불가능한 경로라고 판정한 결과는 아닙니다.',
    issues: issues.length ? issues : [{ title: '계산 오류', detail: '계산을 완료하기 전에 오류가 발생했습니다. 현재 정보만으로 착륙 가능 여부나 원인을 확정할 수 없습니다.', recommendations: ['입력값과 로컬 서버 실행 상태를 확인하고 다시 계산하세요.', '같은 오류가 계속되면 아래 오류 원문과 입력값을 보관해 확인하세요.'] }],
    technicalDetails: message,
  };
}
