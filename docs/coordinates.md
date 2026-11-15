# 좌표계 확인표 (TASKS P01b, CLAUDE.md 4.6)

데이터 담당 팀원이 Drive 파일을 열어 채운다. 확인 전 항목은 파이프라인이 "확인 필요"로 기록한다.

| 파일 | 원래 좌표계 (라벨·CRS 그대로) | 경도 범위 | 고도 기준 | 변환 | 확인자·날짜 |
| --- | --- | --- | --- | --- | --- |
| `Raw_Data/LOLA_DEM/ldem_75s_240m.lbl` | | | | `io/pds.py` PolarPdsSampler | |
| `Raw_Data/LOLA_DEM/ldem_80s_80m.lbl` | | | | 같음 | |
| `…/Terrain_30m/*.vrt` | | | | `io/geotiff.py` (pyproj) | |
| `…/Illumination/*.tif` | | | | 같음 | |
| `…/Composition/LP_*.csv` | | | | 경도 통일 → 최근접 | |
| `…/LROC_Polar_Lobate_Scarps_75S90S.csv` | | | | 경도 통일 | |
| `Raw_Data/SPICE_Kernels/moon_de440_250416.tf` | | | | PA→ME (`geo/frames.py`) | |
| Horizons 응답 머리말 | | | | s10 `check_frame` | |

## 꼭 확인할 것
1. **PDS 극평사 픽셀 규칙**: `io/pds.py` 는 `x = (sample − S0 − 1)·scale`, `y = (1 − line + L0)·scale`, `경도 = CENTER_LONGITUDE + atan2(x, y)` 로 가정한다. 라벨 주석과 대조하고, s20 이 기록하는 왕복 오차·80 m 대 240 m 고도 차이(`build/terrain/meta.json`)로 확인한다.
2. **PA→ME 회전 방향**: `geo/frames.py tk_matrix` 를 s80 이 `spiceypy.pxform` 과 대조한다 (`validation/frames.json` 의 `direction_ok`).
3. **Horizons 직하점 경도 방향**: s10 이 머리말 문구를 provenance 에 남긴다. s80 천체력 검증에서 각거리가 허용 오차를 넘으면 경도 부호부터 본다.

## 확인 결과 (2026-11-14, 실제 Drive 데이터)
- `ldem_75s_240m.lbl`·`ldem_80s_80m.lbl`: POLAR STEREOGRAPHIC, 중심 경도 0°, 반지름 1737.4 km, `MAP_SCALE` 240·80 <m/pix>, 투영 원점 픽셀 1905.5·3799.5, **좌표계 "MEAN EARTH/POLAR AXIS OF DE421"**, 동경 +. 높이 = DN × 0.5 m (기준 반지름 1737.4 km).
- 픽셀 규칙 확인: 섀클턴 바닥 −2.78 km, 말라페르트 산 +4.84 km, 몽 무통 +5.04 km 로 지형 상식과 맞고, 80 m 와 240 m DEM 의 같은 지점 고도 차이 평균 0.23 m · 95% 6.8 m.
- 지평선 방위 규칙(북 0°, 시계 방향) 확인: 섀클턴 가장자리 마스크가 Drive `Horizon_Masks/shackleton_rim.json` 과 상관 0.86 (좌우 반전·180° 회전이면 0.03·0.16). RMS 0.32°, 최대 1.0° — 일부 방위에서 우리 지평선이 더 높다(원거리 봉우리 표본 차이로 추정, s80 에서 13곳 전체 대조 예정).
- 남은 확인: LOLA 의 ME 는 DE421 기준 — 앱 기준(MOON_ME, SPICE 는 DE440)과의 차이는 s80 `frames` 검증에서 기록.
