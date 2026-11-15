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
  { id: 'illum_mission', g: '햇빛', name: '임무 기간 일조율', desc: '착륙 후 임무 기간 동안 해가 보이는 시간의 비율. 착륙 날짜에 따라 바뀝니다.', lo: '0% (늘 그늘)', hi: '100% (늘 햇빛)', unit: '%', kind: '계산', res: '5 km 격자', src: 'Horizons 천체력 + LOLA 240 m 지평선' },
  { id: 'sun_now', g: '햇빛', name: '지금 햇빛', desc: '위쪽 "보는 시각"에 해가 보이는 정도. 재생하면 움직입니다.', lo: '해 없음', hi: '해 전부 보임', unit: '%', kind: '계산', res: '5 km 격자', src: 'Horizons 천체력 + LOLA 240 m 지평선' },
  { id: 'illum_avg', g: '햇빛', name: '장기 평균 일조율', tag: 'PGDA69', desc: '여러 해를 평균한 값. 날짜와 상관없는 그 땅의 기본 체질입니다.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '120 m → 5 km', src: 'NASA PGDA 69 (Mazarico 등)' },
  { id: 'wac_ill_pct', g: '햇빛', name: 'WAC 실측 조명률', tag: '88–90°S만', desc: '궤도 사진에서 실제로 밝게 찍힌 비율. 계산 검증용이며 남위 88° 안쪽만 있습니다.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '100 m → 5 km', src: 'LROC WAC 남극 조명 지도' },
  { id: 'comm_mission', g: '지구 교신', name: '임무 기간 교신율', desc: '임무 기간 중 지구가 지형 위로 보여(여유각 포함) 직접 교신할 수 있는 시간 비율.', lo: '0%', hi: '100%', unit: '%', kind: '계산', res: '5 km 격자', src: 'Horizons 천체력 + LOLA 240 m 지평선' },
  { id: 'earth_vis_avg', g: '지구 교신', name: '장기 평균 지구 가시율', tag: 'PGDA69', desc: '여러 해 평균으로 지구가 보이는 비율.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '120 m → 5 km', src: 'NASA PGDA 69' },
  { id: 'safety', g: '착륙 안전', name: '착륙 안전 (평균 경사)', desc: '칸 안의 평균 경사. 완만할수록 초록입니다.', lo: '30° 이상', hi: '0° (평탄)', unit: '°', kind: '실제', res: '240 m → 5 km', src: 'LOLA 경사 지도 240 m' },
  { id: 'slope_p90_deg', g: '착륙 안전', name: '경사 90분위', desc: '칸 안에서 가장 가파른 10% 지점의 경사. 평균보다 엄격하게 봅니다.', lo: '30° 이상', hi: '0°', unit: '°', kind: '실제', res: '240 m → 5 km', src: 'LOLA 경사 지도 240 m' },
  { id: 'geo_hazard', g: '착륙 안전', name: '지질 위험', desc: '단층애(지각이 밀려 생긴 절벽)에서 떨어진 거리와 낙석 밀도. 경고용이며 안전을 보장하지 않습니다.', lo: '단층애 가까움', hi: '20 km 이상 떨어짐', unit: 'km', kind: '실제', res: '목록 → 5 km', src: 'LROC 극지 단층애 목록(Watters 외 2015), Bickel 외 2020 낙석 검출 (80°S 이남은 검출 범위 밖)' },
  { id: 'water', g: '물·자원', name: '물·얼음 지표', warn: '얼음 가능성 지표 · 검출 아님', desc: '영구음영 지역에 가까울수록 높음. 얼음이 있을 만한 곳이지 실제 확인이 아닙니다.', lo: '멀다', hi: '가깝다', unit: '0–1', kind: '실제', res: '120 m → 5 km', src: 'PGDA 영구음영 지도' },
  { id: 'psr_dist_km', g: '물·자원', name: '영구음영까지 거리', desc: '1년 내내 해가 들지 않는 곳(영구음영)까지 거리.', lo: '60 km 이상', hi: '0 km', unit: 'km', kind: '실제', res: '120 m → 5 km', src: 'PGDA 영구음영 지도' },
  { id: 'h_ppm', g: '물·자원', name: '수소 (LP)', warn: '얼음 가능성 지표 · 검출 아님', desc: '중성자 분광기로 잰 수소 농도. 얼음 가능성 지표입니다.', lo: '20 ppm', hi: '150 ppm', unit: 'ppm', kind: '실제', res: '0.5° (원 격자 거침)', src: 'Lunar Prospector NS', range: [20, 150] },
  { id: 'metal', g: '물·자원', name: '금속 지표', desc: 'FeO와 TiO₂를 합친 지표. 높을수록 금속 자원이 많을 가능성.', lo: '낮음', hi: '높음', unit: '0–1', kind: '실제', res: '0.5–2° (원 격자 거침)', src: 'Lunar Prospector GRS' },
  { id: 'feo_wt', g: '물·자원', name: 'FeO · LP 0.5°', tag: '원 격자 거침', desc: '산화철 함량 (감마선 분광, 추정 분포). 착륙지 규모의 차이는 보이지 않습니다.', lo: '4 wt%', hi: '20 wt%', unit: 'wt%', kind: '실제', res: '0.5° (약 15 km)', src: 'Lunar Prospector GRS', range: [4, 20] },
  { id: 'feo_wt_kaguya', g: '물·자원', name: 'FeO · Kaguya SP 약 1 km', tag: '모델 추정', warn: '추정 분포 · 실제량 아님', desc: '분광 관측으로 추정한 산화철 함량. 관측이 없어 저자가 보간한 곳과 결측(−10)은 뺐습니다. LP 값으로 빈칸을 메우지 않습니다.', lo: '4 wt%', hi: '20 wt%', unit: 'wt%', kind: '실제', res: '1002 m → 5 km', src: 'Lemelin 외 2022 (Zenodo 7108163, CC BY 4.0)', range: [4, 20] },
  { id: 'tio2_wt', g: '물·자원', name: 'TiO₂ · LP 원 격자', tag: '원 격자 2–20°', desc: '산화티타늄 함량 (감마선 분광, 추정 분포). 원 격자가 넓어 착륙지 값처럼 읽지 않습니다.', lo: '0 wt%', hi: '8 wt%', unit: 'wt%', kind: '실제', res: '2–20° (최대 약 150 km)', src: 'Lunar Prospector GRS', range: [0, 8] },
  { id: 'tio2_wt_jaxa', g: '물·자원', name: 'TiO₂ · JAXA MI', tag: '2 wt% 이상만', warn: '추정 분포 · 85°S 이남 자료 없음', desc: '칸 안 신뢰 화소의 중앙값. 15 wt% 초과는 이상치로 빼고, 중앙값이 2 wt% 미만인 칸은 수치 없이 비워 둡니다(대부분의 칸).', lo: '2 wt%', hi: '15 wt%', unit: 'wt%', kind: '실제', res: '약 1.9 km → 5 km', src: 'JAXA/ISAS DARTS Kaguya MI (ISAS Data Policy)', range: [2, 15] },
  { id: 'tio2_jaxa_ge2_frac', g: '물·자원', name: 'TiO₂ 2 wt% 이상 비율', tag: 'JAXA MI', warn: '추정 분포 · 85°S 이남 자료 없음', desc: '칸 안 신뢰 화소 중 2 wt% 이상인 비율. 남극에서는 대부분 2 wt% 미만이라 "어디가 2 wt% 이상인가"를 보는 데 씁니다.', lo: '0%', hi: '100%', unit: '%', kind: '실제', res: '약 1.9 km → 5 km', src: 'JAXA/ISAS DARTS Kaguya MI (ISAS Data Policy)' },
];

export const LAYER_UI = Object.fromEntries(L.map((l) => [l.id, l])) as Record<string, LayerUi>;
export const HUD_LAYERS: LayerName[] = ['composite', 'illum_mission', 'sun_now', 'comm_mission', 'safety', 'water'];
