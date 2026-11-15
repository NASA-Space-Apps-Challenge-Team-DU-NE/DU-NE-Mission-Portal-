// 설정값 한 곳 (CLAUDE.md 1.1). 팀이 확정하지 않은 값은 PROVISIONAL — 화면에서 바꿀 수 있게 한다.
import type { HardFilters, MapWeights, Requirements, ScenarioWeights } from './core/types';

export const DATA_BASE = `${import.meta.env?.BASE_URL ?? '/'}data/`;

export const DEFAULTS = {
  /** PROVISIONAL */ comm_margin_deg: 2,
  /** PROVISIONAL */ duration_h: 240,
  /** PROVISIONAL */ delay_days: 3,
  /** PROVISIONAL */ alt_span_days: 7,
  /** PROVISIONAL */ alt_radius_km: 200,
  /** PROVISIONAL */ observer_height_m: 2,
  /** PROVISIONAL */ station_min_elev_deg: 10,
  /** PROVISIONAL */ ephemeris_tolerance_deg: 0.1,
  /** 격자 동적 레이어 표본 간격 (h) */ grid_step_h: 6,
  /** 현장 뷰 궤적 기간 (일) */ track_days: 30,
  /** PROVISIONAL: 단층 경고 거리 (km, CLAUDE.md 1.2-6) */ fault_warn_km: 10,
  /** PROVISIONAL */ panel_loss: 0.1,
  /** PROVISIONAL */ power_margin: 0.2,
};

/** PROVISIONAL (CLAUDE.md 1.1) */
export const DEFAULT_REQUIREMENTS: Requirements = { min_illum_frac: 0.6, min_daily_comm_h: 6, max_dark_h: 48, min_ops_h: 168, data_mb: 2000 };
/** PROVISIONAL */
export const DEFAULT_SCENARIO_WEIGHTS: ScenarioWeights = { power: 40, comm: 30, robustness: 30 };
/** PROVISIONAL: 장기 기지 프로파일 (발전·교신·물·금속·안전·지질) */
export const DEFAULT_MAP_WEIGHTS: MapWeights = { power: 40, comm: 25, water: 20, metal: 0, safety: 15, geo: 10 };
/** PROVISIONAL: UI 예시 기본값 (일조 ≥ 60%, 경사 90분위 ≤ 15°) */
export const DEFAULT_FILTERS: HardFilters = { min_illum_frac: 0.6, max_slope_deg: 15 };
/** UI 예시 기본 착륙 시각 (천체력 표 범위 안) · 기본 착륙지 */
export const DEFAULT_LANDING_UTC = '2026-12-02T00:00:00Z';
export const DEFAULT_SITE_ID = 'connecting_ridge';


export type ProfileId = 'long_base' | 'recon' | 'water';
/** 미션 프리셋 (P2-03). 조건 값은 팀 결정 대기 (CLAUDE.md 1.2-6) → 모두 PROVISIONAL */
export const PROFILES: Record<ProfileId, { weights: MapWeights; filters: HardFilters }> = {
  long_base: { weights: DEFAULT_MAP_WEIGHTS, filters: {} },
  recon: { weights: { power: 35, comm: 35, water: 0, metal: 0, safety: 20, geo: 10 }, filters: {} },
  water: { weights: { power: 25, comm: 20, water: 40, metal: 0, safety: 10, geo: 5 }, filters: {} },
};

/** 기능 플래그 (동결 후 미완성 P2·P3 숨김, CLAUDE.md 14절) */
export const FEATURES = {
  waterMap: true, // P2-01
  metalMap: true, // P2-02
  profiles: true, // P2-03
  reverseSearch: true, // P2-04
  panoramaOverlay: true, // P2-05
  basePlanner: true, // P2-06
  mastCompare: true, // P3-01
  lightRelay: true, // P3-02
  landerView: true, // P3-03
  lightTwins: true, // P3-04
  landingEllipse: true, // P3-05
  scienceBalance: true, // P3-06
};


/** 팀 홈페이지(학습 자료·출처). 배포 주소가 정해지면 바꾼다. 비어 있으면 링크를 숨긴다. */
export const HOMEPAGE_URL = '';
