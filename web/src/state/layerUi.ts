// 지도 레이어 16개의 설명·좋은 방향·출처 (UI 예시 LAYERS 와 같은 목록, id 는 실제 LayerName).
import type { LayerName } from '../core/types';

export interface LayerUi {
  id: LayerName;
  g: string;
  name: string;
  desc: string;
  lo: string;
  hi: string;
  unit: string;
  kind: '실제' | '계산';
  res: string;
  src: string;
  tag?: string;
  warn?: string;
  /** 색 정규화 범위 (layerView 에 범위가 없을 때) */
  range?: [number, number];
}

export const LGROUPS = ['추천', '햇빛', '지구 교신', '착륙 안전', '물·자원'];

const L: LayerUi[] = [
  { id: 'composite', g: '추천', name: '종합 점수', desc: '01 단계의 필수 조건과 가중치를 합친 점수. 처음엔 이걸 보세요.', lo: '조건에 덜 맞음', hi: '잘 맞음', unit: '0–100', kind: '계산', res: '5 km 격자', src: '아래 레이어를 가중 합산' },
  { id: 'illum_mission', g: '햇빛', name: '임무 기간 일조율', desc: '착륙 후 임무 기간 동안 해가 보이는 시간의 비율. 착륙 날짜에 따라 바뀝니다.', lo: '0% (늘 그늘)', hi: '100% (늘 햇빛)', unit: '%', kind: '계산', res: '5 km 격자', src: '천체력 표(MOON_ME), 표 밖은 근사 + 지형 지평선' },
  { id: 'sun_now', g: '햇빛', name: '지금 햇빛', desc: '위쪽 "보는 시각"에 해가 보이는 정도. 재생하면 움직입니다.', lo: '해 없음', hi: '해 전부 보임', unit: '%', kind: '계산', res: '5 km 격자', src: '천체력 표(MOON_ME), 표 밖은 근사 + 지형 지평선' },
  { id: 'illum_avg', g: '햇빛', name: '장기 평균 일조율', tag: 'PGDA69', desc: '여러 해를 평균한 값. 날짜와 상관없는 그 땅의 기본 체질입니다.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '120 m → 5 km', src: 'NASA PGDA 69 (Mazarico 등)' },
  { id: 'wac_ill_pct', g: '햇빛', name: 'WAC 실측 조명률', tag: '88–90°S만', desc: '궤도 사진에서 실제로 밝게 찍힌 비율. 계산 검증용이며 남위 88° 안쪽만 있습니다.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '100 m → 5 km', src: 'LROC WAC 남극 조명 지도' },
  { id: 'wac_ill_twi', g: '햇빛', name: 'WAC 시간가중 조명률', tag: '88–90°S만', desc: '궤도 사진의 조명 비율을 관측 간격에 따라 가중하고, 관측 공백은 앞뒤 관측으로 보간한 판입니다. 계산 검증용.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '100 m → 5 km', src: 'LROC WAC 남극 조명 지도 (Speyerer & Robinson 2013)' },
  { id: 'comm_mission', g: '지구 교신', name: '임무 기간 교신율', desc: '임무 기간 중 지구가 지형 위로 보여(여유각 포함) 직접 교신할 수 있는 시간 비율.', lo: '0%', hi: '100%', unit: '%', kind: '계산', res: '5 km 격자', src: '천체력 표(MOON_ME), 표 밖은 근사 + 지형 지평선' },
  { id: 'earth_vis_avg', g: '지구 교신', name: '장기 평균 지구 가시율', tag: 'PGDA69', desc: '여러 해 평균으로 지구가 보이는 비율.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '120 m → 5 km', src: 'NASA PGDA 69' },
  { id: 'safety', g: '착륙 안전', name: '착륙 안전 (경사 90분위)', desc: '칸 안에서 가장 가파른 10% 지점의 경사(90분위)로 본 안전도. 완만할수록 초록입니다. 평균 경사가 아닙니다.', lo: '30° 이상', hi: '0° (평탄)', unit: '°', kind: '실제', res: '240 m → 5 km', src: 'LOLA 경사 지도 240 m' },
  { id: 'slope_p90_deg', g: '착륙 안전', name: '경사 90분위', desc: '칸 안에서 가장 가파른 10% 지점의 경사. 평균보다 엄격하게 봅니다.', lo: '30° 이상', hi: '0°', unit: '°', kind: '실제', res: '240 m → 5 km', src: 'LOLA 경사 지도 240 m' },
  { id: 'geo_hazard', g: '착륙 안전', name: '지질 위험', desc: '단층애(지각이 밀려 생긴 절벽)에서 떨어진 거리와 낙석 밀도. 경고용이며 안전을 보장하지 않습니다.', lo: '단층애 가까움', hi: '20 km 이상 떨어짐', unit: 'km', kind: '실제', res: '목록 → 5 km', src: 'LROC 극지 단층애 목록(Watters 외 2015), Bickel 외 2020 낙석 검출 (80°S 이남은 검출 범위 밖)' },
  { id: 'plains_frac', g: '착륙 안전', name: '극지 평원 비율', tag: '지질도', desc: '칸 면적 중 극지 평원(밝은 평원) 지질 단위가 차지하는 비율. 착륙 안전을 뜻하지 않습니다. 매핑 범위 밖은 자료 없음.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '폴리곤 → 5 km', src: '극지 평원 매핑 (PolarPlains_Mapping)' },
  { id: 'boulder_count', g: '착륙 안전', name: '섀클턴 바위 수', tag: '섀클턴만', warn: '매핑 범위 밖·바위 없는 칸은 자료 없음', desc: '섀클턴 분화구 연구에서 매핑한 바위 위치를 5 km 칸별로 센 값. 연구 범위 경계가 없어 0 을 표시하지 않습니다. 경고용이며 안전을 보장하지 않습니다.', lo: '적음', hi: '많음', unit: '개', kind: '실제', res: '점 → 5 km', src: 'Gawronska & Boazman 2025 (ShadowCam)', range: [0, 800] },
  { id: 'water', g: '물·자원', name: '물·얼음 지표', warn: '얼음 가능성 지표 · 검출 아님', desc: '영구음영 지역에 가까울수록 높음. 얼음이 있을 만한 곳이지 실제 확인이 아닙니다.', lo: '멀다', hi: '가깝다', unit: '0–1', kind: '실제', res: '120 m → 5 km', src: 'PGDA 영구음영 지도' },
  { id: 'psr_dist_km', g: '물·자원', name: '영구음영까지 거리', desc: '1년 내내 해가 들지 않는 곳(영구음영)까지 거리.', lo: '60 km 이상', hi: '0 km', unit: 'km', kind: '실제', res: '120 m → 5 km', src: 'PGDA 영구음영 지도' },
  { id: 'psr_poly_dist_km', g: '물·자원', name: '영구음영까지 거리 (폴리곤)', tag: '5 km² 이상', warn: '얼음 가능성 지표 · 검출 아님', desc: '면적 5 km² 이상인 영구음영 지역 경계까지 거리. 작은 그늘까지 세는 래스터 거리(대부분 칸이 0)보다 큰 영구음영을 찾는 데 맞습니다.', lo: '60 km 이상', hi: '0 km', unit: 'km', kind: '실제', res: '폴리곤 → 5 km', src: 'LOLA 영구음영 폴리곤 (Mazarico 외)' },
  { id: 'h_ppm', g: '물·자원', name: '수소 (LP)', warn: '얼음 가능성 지표 · 검출 아님', desc: '중성자 분광기로 잰 수소 농도. 얼음 가능성 지표입니다.', lo: '20 ppm', hi: '150 ppm', unit: 'ppm', kind: '실제', res: '0.5° (원 격자 거침)', src: 'Lunar Prospector NS', range: [20, 150] },
  { id: 'metal', g: '물·자원', name: '금속 지표', desc: 'FeO와 TiO₂를 합친 지표. 높을수록 금속 자원이 많을 가능성.', lo: '낮음', hi: '높음', unit: '0–1', kind: '실제', res: '0.5–2° (원 격자 거침)', src: 'Lunar Prospector GRS' },
  { id: 'feo_wt', g: '물·자원', name: 'FeO · LP 0.5°', tag: '원 격자 거침', desc: '산화철 함량 (감마선 분광, 추정 분포). 착륙지 규모의 차이는 보이지 않습니다.', lo: '4 wt%', hi: '20 wt%', unit: 'wt%', kind: '실제', res: '0.5° (약 15 km)', src: 'Lunar Prospector GRS', range: [4, 20] },
  { id: 'feo_wt_kaguya', g: '물·자원', name: 'FeO · Kaguya SP 약 1 km', tag: '모델 추정', warn: '추정 분포 · 실제량 아님', desc: '분광 관측으로 추정한 산화철 함량. 관측이 없어 저자가 보간한 곳과 결측(−10)은 뺐습니다. LP 값으로 빈칸을 메우지 않습니다.', lo: '4 wt%', hi: '20 wt%', unit: 'wt%', kind: '실제', res: '1002 m → 5 km', src: 'Lemelin 외 2022 (Zenodo 7108163, CC BY 4.0)', range: [4, 20] },
  { id: 'tio2_wt_lp', g: '물·자원', name: 'TiO₂ · LP 2° 셀', tag: '약 60 km 셀', desc: '산화티타늄 지역 조성 (감마선 분광, 추정 분포). 원래 2° 등면적 셀 그대로이며 착륙지 규모의 값이 아닙니다. 셀 1σ 는 tio2_lp_sigma.', lo: '0 wt%', hi: '8 wt%', unit: 'wt%', kind: '실제', res: '2° 셀 (약 60 km)', src: 'Lunar Prospector GRS (Prettyman 외 2006)', range: [0, 8] },
  { id: 'tio2_jaxa_mi_research', g: '물·자원', name: 'JAXA MI TiO₂ (연구용)', tag: '정량 미검증', warn: 'JAXA MI TiO₂ 추정값 — 남극 고위도 정량 미검증', desc: '칸 중심에 가장 가까운 원래 화소 값(source_estimate)입니다. 칸 대표값이 아니고, 0~2 wt% 와 15 wt% 초과도 그대로 둡니다. 점수·필터·순위·내보내기에 쓰지 않습니다. 85°S 이남은 자료 없음.', lo: '0 wt%', hi: '15 wt% 이상', unit: 'wt%', kind: '실제', res: '16 ppd (약 1.9 km), 칸 중심 표본', src: 'JAXA/ISAS DARTS Kaguya MI (ISAS Data Policy)', range: [0, 15] },
];

export const LAYER_UI = Object.fromEntries(L.map((l) => [l.id, l])) as Record<string, LayerUi>;
export const HUD_LAYERS: LayerName[] = ['composite', 'illum_mission', 'sun_now', 'comm_mission', 'safety', 'water'];

/** 북극·전역 격자에서 바뀌는 해상도·출처 문구 (s50_regions, 2026-11-15). 없는 항목은 남극 문구를 그대로 쓴다 */
const REGION_UI: Record<'north' | 'global', Partial<Record<string, Partial<LayerUi>>>> = {
  north: {
    illum_avg: { res: '60–120 m → 5 km' },
    earth_vis_avg: { res: '60–120 m → 5 km' },
    safety: { res: '120 m → 5 km', src: 'LOLA 북극 경사 LDSM 120 m' },
    slope_p90_deg: { res: '120 m → 5 km', src: 'LOLA 북극 경사 LDSM 120 m' },
    geo_hazard: { src: 'LROC 극지 단층애 점(Watters 외 2015), Bickel 외 2020 낙석 검출 (80°N 이북은 검출 범위 밖)' },
    water: { res: '60–120 m → 5 km', src: 'PGDA 69 북극 영구음영 지도' },
    psr_dist_km: { res: '60–120 m → 5 km', src: 'PGDA 69 북극 영구음영 지도' },
    h_ppm: { res: '2° 등면적 셀 (약 60 km)', src: 'Lunar Prospector NS (Hydrogen_low)' },
    metal: { res: '2° 셀 (원 격자 거침)' },
    feo_wt: { name: 'FeO · LP 2° 셀', res: '2° 셀 (약 60 km)' },
  },
  global: {
    illum_avg: { res: '240 m → 15 km', tag: '|위도| 55.2° 이상만' },
    earth_vis_avg: { res: '240 m → 15 km', tag: '|위도| 55.2° 이상만' },
    safety: { res: '약 237 m → 15 km', src: 'SLDEM2015 경사 128 화소/도 (60° 밖은 LOLA 단독)' },
    slope_p90_deg: { res: '약 237 m → 15 km', src: 'SLDEM2015 경사 128 화소/도 (60° 밖은 LOLA 단독)' },
    geo_hazard: { res: '목록 → 15 km', src: 'LROC 단층애 선(60°S–60°N, Watters 외) + 극지 점, Bickel 외 2020 낙석 검출' },
    water: { res: '240 m → 15 km', tag: '|위도| 55.2° 이상만', src: 'PGDA 69 65° 영구음영 지도' },
    psr_dist_km: { res: '240 m → 15 km', tag: '|위도| 55.2° 이상만', src: 'PGDA 69 65° 영구음영 지도' },
    h_ppm: { res: '2° 등면적 셀 (약 60 km)', src: 'Lunar Prospector NS (Hydrogen_low)' },
    metal: { res: '2° 셀 (원 격자 거침)' },
    feo_wt: { name: 'FeO · LP 2° 셀', res: '2° 셀 (약 60 km)' },
  },
};

/** 지역에 맞춘 레이어 설명 */
export function layerUiFor(id: string, region: 'south' | 'north' | 'global'): LayerUi {
  const base = LAYER_UI[id] ?? LAYER_UI.composite;
  if (region === 'south') return base;
  const o = REGION_UI[region][id];
  return o ? { ...base, ...o } : base;
}
