// 화면 전용 상태 (계산 입력이지만 페이지 사이에서 공유되는 값). 계산 값은 저장하지 않는다 (화면 배치만 기억).
import { create } from 'zustand';

export interface UiState {
  demand_kw: number;
  eff: number;
  siteTab: 'rank' | 'list' | 'coord';
  help: boolean;
  /** 03 기지 배치 끔: 기지를 따로 놓지 않고 착륙지를 기지 위치로 본다 */
  baseOff: boolean;
  /** 03 기지 배치 지도 한 변 (m). 착륙지 중심 정사각형 */
  baseViewM: number;
  /** 04 착륙 날짜: 시각을 직접 정하거나(time) 기간을 주고 그 안의 윈도에서 고른다(period) */
  dateMode: 'time' | 'period';
  /** 기간 모드 시작·끝 (YYYY-MM-DD, UTC). 빈 문자열이면 착륙 시각 기준으로 채운다 */
  periodFrom: string;
  periodTo: string;
  /** 화면 모드: explore = 달 지도가 가운데 전체, plan = 단계 | 단계 화면 | 오른쪽 달 */
  mode: 'explore' | 'plan';
  /** 달 화면: 3D 지구본 또는 2D 남극 지도 */
  dim: '3d' | '2d';
  /** 계획 모드 왼쪽 단계 목록을 번호만 남기고 접기 */
  sideCollapsed: boolean;
  /** 05 지상국 통신 창의 지구본을 전체화면으로 (3D 달에서 지구를 눌러 왔을 때) */
  gsFull: boolean;
  /** 계획 모드 왼쪽 단계 목록·오른쪽 달 영역 너비 (px). 0 이면 기본값 */
  sideW: number;
  railW: number;
  set(p: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>((set) => ({
  demand_kw: 10, // PROVISIONAL
  eff: 0.3, // PROVISIONAL
  siteTab: 'rank',
  help: false,
  baseOff: false,
  baseViewM: 1000,
  dateMode: 'time',
  periodFrom: '',
  periodTo: '',
  dim: '3d',
  gsFull: false,
  ...loadLayout(),
  mode: new URLSearchParams(window.location.search).get('p') ? 'plan' : 'explore',
  set: (p) => {
    set(p);
    if ('sideCollapsed' in p || 'sideW' in p || 'railW' in p) saveLayout();
  },
}));

// 화면 배치(접기·너비)만 브라우저에 기억한다. 계산 값은 저장하지 않는다.
const LAYOUT_KEY = 'dune.layout';
function loadLayout(): { sideCollapsed: boolean; sideW: number; railW: number } {
  const d = { sideCollapsed: false, sideW: 0, railW: 0 };
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    if (v && typeof v === 'object') return { sideCollapsed: v.sideCollapsed === true, sideW: Number(v.sideW) || 0, railW: Number(v.railW) || 0 };
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return d;
}
function saveLayout() {
  try {
    const { sideCollapsed, sideW, railW } = useUi.getState();
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ sideCollapsed, sideW, railW }));
  } catch { /* 무시 */ }
}

export const STEPS = [
  { id: 'cond', g: '1 · 준비', n: '01', t: '조건 정하기', d: '어떤 임무인지, 꼭 지켜야 할 조건과 중요하게 볼 것을 정합니다. 여기서 정한 값으로 지도 색과 후보 순위가 매겨집니다.' },
  { id: 'site', g: '1 · 준비', n: '02', t: '착륙지 고르기', d: '지도·순위표·목록 중 편한 방법으로 착륙지를 고릅니다. 고른 곳의 점수와 그 이유가 아래에 나옵니다.' },
  { id: 'base', g: '1 · 준비', n: '03', t: '기지 배치', d: '착륙지 주변 지도에 착륙장·발전·물 채굴·거주 기지를 놓고, 기지 사이 거리와 관측된 단층애 근접 경고를 봅니다. 기지가 필요 없으면 위 스위치를 끄세요.' },
  { id: 'date', g: '1 · 준비', n: '04', t: '착륙 날짜 정하기', d: '착륙 시각을 직접 정하거나, 착륙 가능한 기간을 주고 그 안에서 햇빛과 지구 교신이 동시에 되는 구간(착륙 윈도)을 골라 착륙 시각을 정합니다.' },
  { id: 'sim', g: '2 · 결과', n: '05', t: '임무 시뮬레이션', d: '착륙부터 임무 끝까지 배터리·교신·전송량을 따라가며 표면 운용 요구 조건 충족 여부를 판정합니다. 아래로 내리면 전력 계획(패널·배터리)과 통신(지구 교신·지상국 창)이 이어집니다.' },
  { id: 'delay', g: '3 · 검토', n: '06', t: '일정 변경 대응', d: '발사가 밀리면 원래 안이 여전히 괜찮은지 다시 평가하고, 같은 곳 다른 날짜·다른 곳 같은 날짜 대안을 차이와 함께 보여 줍니다.' },
  { id: 'compare', g: '3 · 검토', n: '07', t: '후보 비교', d: '"비교에 추가"로 모은 착륙지+날짜 조합을 같은 지표로 나란히 비교합니다.' },
  { id: 'missions', g: '3 · 검토', n: '08', t: '과거 미션', d: '과거 착륙 미션의 그때 하늘을 재현하고, 내 계획과 조건이 비슷한 참고 사례를 결과와 원인과 함께 봅니다.' },
  { id: 'valid', g: '3 · 검토', n: '09', t: '검증', d: '이 도구의 계산을 NASA 실측 일조 지도·JPL Horizons와 비교한 결과입니다.' },
] as const;

export const PROFILE_UI = {
  custom: { name: '사용자 설정', desc: '아래 가중치를 직접 움직여 정합니다 (기본)' },
  long_base: { name: '장기 기지', desc: '발전과 교신을 가장 중요하게, 물은 그다음' },
  recon: { name: '착륙 정찰', desc: '짧게 머무는 착륙. 발전·교신·안전 위주' },
  water: { name: '물 탐사', desc: '영구음영 지역 가까이. 물을 가장 중요하게' },
} as const;

export const CRIT = { power: '발전(일조)', comm: '지구 교신', water: '물(영구음영 거리)', metal: '금속', safety: '착륙 안전(경사)', geo: '지질(단층애 거리)' } as const;
export const CRIT_COL = { power: '#E3A63B', comm: '#58B8CE', water: '#6F8FE0', metal: '#B08A6A', safety: '#3BB89B', geo: '#9A7BD0' } as const;
export const CAT: Record<string, string> = { apollo: '아폴로', clps: 'CLPS', international: '다른 나라', artemis: '아르테미스 후보', other: '기타', custom: '사용자', cell: '격자 칸' };
