# 검증 결과 (CLAUDE.md 13절)

파이프라인 `python -m luna s80` 이 아래 "자동 결과" 구역을 덮어쓴다. 사람이 쓴 해석은 구역 밖에 적는다.

## 천체력 (Horizons·SPICE 기준 표)
| 위치 | 대상 | 기간 | 간격 | 최대 각거리(°) | 평균(°) | 허용 | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 지평선 마스크 (Drive `Horizon_Masks` 13곳, REVIEW_REQUIRED)
| 착륙지 | RMS(°) | 최대(°) | 그림(build/preview/masks) | 판정 | 메모 |
| --- | --- | --- | --- | --- | --- |

## 일조율 (PGDA69 장기 평균 · WAC 실측 88–90°S)
| 참조 | 표본 수 | 평균 차이 | RMSE | r | 조건 차이 |
| --- | --- | --- | --- | --- | --- |

## 과거 미션 재현 (3건 이상)
| 미션 | 기록(출처) | 우리 계산 | 차이 | 판정 |
| --- | --- | --- | --- | --- |

## 마스트 높이 (JPL IPN 42-176C 표)
| 착륙지 | 높이 | 우리 | 표 | 차이 |
| --- | --- | --- | --- | --- |

## 좌표계 미확인 (CLAUDE.md 4.6 규칙 3)
| 파일 | 이유 | 조치 |
| --- | --- | --- |

## 자동 결과 (s80)

<!-- AUTO:s80 시작 (파이프라인이 덮어씀) -->
| 항목 | n | 평균 차이 | RMSE | r | 최대 | 판정 | 조건 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ephemeris_horizons_apollo11_sun | 73 | 0.0002 | 0.0002 | 1.0000 | 0.0002 | 통과 | {"ref": "Reference_Tables/horizons_apollo11_1969-07-20.csv", "site": "apollo11", "observer": [0.67416, 23.47314], "ref_header": "# Horizons observer table, cent |
| ephemeris_horizons_apollo11_earth | 73 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/horizons_apollo11_1969-07-20.csv", "site": "apollo11", "observer": [0.67416, 23.47314], "ref_header": "# Horizons observer table, cent |
| ephemeris_horizons_chandrayaan3_sun | 337 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/horizons_chandrayaan3_2023-08-23.csv", "site": "chandrayaan3", "observer": [-69.373, 32.319], "ref_header": "# Horizons observer table |
| ephemeris_horizons_chandrayaan3_earth | 337 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/horizons_chandrayaan3_2023-08-23.csv", "site": "chandrayaan3", "observer": [-69.373, 32.319], "ref_header": "# Horizons observer table |
| ephemeris_horizons_connecting_ridge_sun | 721 | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/horizons_connecting_ridge_2026-11-14.csv", "site": "connecting_ridge", "observer": [-89.45, -137.31], "ref_header": "# Horizons observ |
| ephemeris_horizons_connecting_ridge_earth | 721 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/horizons_connecting_ridge_2026-11-14.csv", "site": "connecting_ridge", "observer": [-89.45, -137.31], "ref_header": "# Horizons observ |
| ephemeris_spice_apollo11_sun | 73 | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_apollo11_1969-07-20.csv", "site": "apollo11", "observer": [0.674, 23.473], "ref_header": "# SPICE azlcpo ELLIPSOID lat=0.674 lon |
| ephemeris_spice_apollo11_earth | 73 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_apollo11_1969-07-20.csv", "site": "apollo11", "observer": [0.674, 23.473], "ref_header": "# SPICE azlcpo ELLIPSOID lat=0.674 lon |
| ephemeris_spice_chandrayaan3_sun | 337 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_chandrayaan3_2023-08-23.csv", "site": "chandrayaan3", "observer": [-69.373, 32.319], "ref_header": "# SPICE azlcpo ELLIPSOID lat |
| ephemeris_spice_chandrayaan3_earth | 337 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_chandrayaan3_2023-08-23.csv", "site": "chandrayaan3", "observer": [-69.373, 32.319], "ref_header": "# SPICE azlcpo ELLIPSOID lat |
| ephemeris_spice_connecting_ridge_sun | 721 | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_connecting_ridge_2026-11-14.csv", "site": "connecting_ridge", "observer": [-89.45, -137.31], "ref_header": "# SPICE azlcpo ELLIP |
| ephemeris_spice_connecting_ridge_earth | 721 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Reference_Tables/spice_connecting_ridge_2026-11-14.csv", "site": "connecting_ridge", "observer": [-89.45, -137.31], "ref_header": "# SPICE azlcpo ELLIP |
| ephemeris_horizons_im1_earth | 193 | 0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM1_Earth_2024-02-22.json", "observer": [-80.1276, 1.4367], "ref_header": "Horizons AP |
| ephemeris_horizons_im1_sun | 193 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM1_Sun_2024-02-22.json", "observer": [-80.1276, 1.4367], "ref_header": "Horizons API  |
| ephemeris_horizons_im2_earth | 121 | -0.0006 | 0.0006 | 1.0000 | 0.0006 | 통과 | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM2_Earth_2025-03-06.json", "observer": [-84.79059, 29.19567], "ref_header": "Horizons |
| ephemeris_horizons_im2_sun | 121 | -0.0000 | 0.0000 | 1.0000 | 0.0000 | 통과 | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM2_Sun_2025-03-06.json", "observer": [-84.79059, 29.19567], "ref_header": "Horizons A |
| mask_amundsen_rim | 360 |  | 4.9756 |  | 11.1090 | — | {"drive_file": "Horizon_Masks/amundsen_rim.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_connecting_ridge | 360 |  | 0.9138 |  | 2.4835 | — | {"drive_file": "Horizon_Masks/connecting_ridge.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_de_gerlache_rim | 360 |  | 1.4222 |  | 3.3945 | — | {"drive_file": "Horizon_Masks/de_gerlache_rim.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_faustini_rim_a | 360 |  | 0.8392 |  | 2.5222 | — | {"drive_file": "Horizon_Masks/faustini_rim_a.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_haworth | 360 |  | 0.3837 |  | 1.0338 | — | {"drive_file": "Horizon_Masks/haworth.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_im1_odysseus | 360 |  | 0.4031 |  | 1.1036 | — | {"drive_file": "Horizon_Masks/im1_odysseus.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_im2_athena | 360 |  | 0.0406 |  | 0.1497 | — | {"drive_file": "Horizon_Masks/im2_athena.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_lcross_cabeus | 360 |  | 0.0286 |  | 0.0906 | — | {"drive_file": "Horizon_Masks/lcross_cabeus.json", "drive_quality": "REVIEW_REQUIRED", "note": "Drive 마스크는 이전 좌표 기준 — 좌표 교체(2026-11-15) 뒤라 차이에 이동 효과가 섞인다"} |
| mask_malapert_massif | 360 |  | 0.3496 |  | 1.1802 | — | {"drive_file": "Horizon_Masks/malapert_massif.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_mons_mouton | 360 |  | 0.2890 |  | 1.2739 | — | {"drive_file": "Horizon_Masks/mons_mouton.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_nobile_rim_1 | 360 |  | 0.4167 |  | 1.3926 | — | {"drive_file": "Horizon_Masks/nobile_rim_1.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_peak_near_shackleton | 360 |  | 2.5905 |  | 4.8386 | — | {"drive_file": "Horizon_Masks/peak_near_shackleton.json", "drive_quality": "REVIEW_REQUIRED"} |
| mask_shackleton_rim | 360 |  | 0.6705 |  | 2.0395 | — | {"drive_file": "Horizon_Masks/shackleton_rim.json", "drive_quality": "REVIEW_REQUIRED"} |
| illum_vs_illum_avg | 25992 | -0.0017 | 0.0600 | 0.8997 | 0.4504 | — | {"ref": "PGDA69 장기 평균", "ours": "격자 지평선(5°) + SPICE 범위 표 1520일, 60 h 간격", "observer_height_m": 2.0, "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"} |
| illum_vs_wac_ill_pct | 468 | 0.0157 | 0.0625 | 0.8963 | 0.3575 | — | {"ref": "WAC 실측 (88–90°S)", "ours": "격자 지평선(5°) + SPICE 범위 표 1520일, 60 h 간격", "observer_height_m": 2.0, "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"} |
| illum_vs_wac_ill_twi | 468 | 0.0157 | 0.0627 | 0.8983 | 0.3528 | — | {"ref": "WAC 시간가중 실측 (88–90°S)", "ours": "격자 지평선(5°) + SPICE 범위 표 1520일, 60 h 간격", "observer_height_m": 2.0, "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"} |
| frame_pa_to_me | 1 |  |  |  | 0.0289 | 통과 | {"kernel": "Raw_Data/SPICE_Kernels/moon_de440_250416.tf", "matrix": "TK MOON_PA_DE440→MOON_ME angles=[67.8526, 78.6944, 0.2785] ARCSECONDS axes=[3, 2, 1] (전치)", |
| mast_jpl_b1_sun_any_disk | 14 | -27.8643 | 37.4902 | 0.9664 | 56.9089 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| mast_jpl_b1_sun_half_disk | 14 | -28.6150 | 38.0368 | 0.9727 | 57.3421 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| mast_jpl_b1_sun_whole_disk | 14 | -29.1438 | 38.1903 | 0.9834 | 57.1508 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| mast_jpl_b1_earth_any_disk | 14 | -5.7383 | 5.7426 | 0.9999 | 6.2782 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| mast_jpl_b1_earth_half_disk | 14 | -5.3735 | 5.3752 | 0.9999 | 5.7030 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| mast_jpl_b1_earth_whole_disk | 14 | -5.1254 | 5.1259 | 1.0000 | 5.2932 | — | {"ref": "Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/JPL_IPN_42_176C_B1_Sun_Earth_Height_Tables.csv", "site": "B1", "observer": [-89.3911, -132.1902 |
| wueller_sun_max_consecutive_days | 1040 | 6.6490 | 9.8469 | 0.6011 | 26.0000 | — | {"ref": "Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip", "points": 130, "years": "2025–2032", "spearman_all": 0.4594393685076 |
| wueller_sun_earth_max_consecutive_days | 1038 | 0.2794 | 7.5934 | 0.3495 | 19.5000 | — | {"ref": "Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip", "points": 130, "years": "2025–2032", "spearman_all": 0.3138469742097 |
<!-- AUTO:s80 끝 -->

## 2026-11-14 버그 수정 기록 (s80 1차 실행 후)

| 항목 | 1차 결과 | 원인 | 수정 | 수정 후 (개발 PC 사전 확인) |
| --- | --- | --- | --- | --- |
| 일조율 vs PGDA69 | RMSE 84, r 0.89 | GeoTIFF 밴드 배율(4e-5) 미적용 + 블록별 퍼센트 추측 | `band_scale` 적용, `_check_frac` | 85°S 이남 근사 대조 RMSE 약 0.066, r 약 0.90 (s80 재실행으로 확정) |
| WAC 실측 조명률 | 값 약 1e36 | PDS 실수 특수값(CORE_NULL ≈ −3.4e38)이 평균에 섞임 | −1e30 미만 결측 처리, 라벨대로 % → 0–1 | 원본 범위 0–71.6 % 확인 |
| Shackleton 마스크 | Drive 대비 RMS 5.47° | 대표 좌표가 30 m DEM 의 5–8 m 구덩이 안 | 근거리 150 m 제외 + 지면 150 m 평균 | 같은 계산을 개발 PC 에서 재현: RMS 약 0.37° |
| 천체력 검증 | 0행 | 기준 CSV 첫 줄 `#` 주석 | `comment="#"`, 관측점은 머리줄 좌표 | 12개 표 모두 각거리 최대 0.006° 이하 (허용 0.1°) |
| PA→ME 프레임 | 0행 | MOON_ME 가 단위행렬 MATRIX 별칭 | 별칭을 따라 ANGLES 프레임 읽기 | 회전 0.0289° (표면 약 875 m). spiceypy 대조는 설치 시 |
| 하늘 입체각 `sky_sr` | 음수 수천 | 밴드 배율·오프셋 미적용 (위와 같음) | 같음 | s50 재실행 후 확인 |

## 2026-11-15 남은 작업 1~7 대조 기록 (사람이 씀)

차이를 기록할 뿐 합격·불합격을 판정하지 않는다. 화면: 09 검증 ④~⑦. 원자료 표: `web/public/data/validation/catalog_*.json`, `ephemeris_spice.json`, `layers_minerals.json`.

- **착륙지 좌표 (작업 1).** 미션 착륙지 9곳을 공식 대조본으로 교체(35–430 m, 창어 4호가 가장 큼). 아폴로 3·SLIM·루나 25호 일치. CLPS 3곳은 SPICE 커널 값 유지(IM-1 은 LROC 와 48 m 차이, 원인 미확인). 2022 지역 이름만 있던 아르테미스 5곳은 Wueller 외 2026 후보점으로 교체(179–1055 m). 섀클턴 가장자리는 출처 없음. 좌표를 옮긴 남극권 6곳은 마스크를 다시 만들었다: 아문센 RMS 4.75°(최대 −11.1°, 방위 74°), 섀클턴 인근 봉우리 2.65°, 드 제를라슈 1.44°, 파우스티니 A 1.01°, 연결 능선 0.77°, LCROSS 0.03°. Drive `Horizon_Masks` 는 이전 좌표 기준이라 이 6곳의 Drive 대조값에는 이동 효과가 섞인다.
- **미션 필드 (작업 2).** 착륙 시각 6건 수정, 아폴로 전원 배터리, 근거 없는 운용 기간 11개 null(계획 기간으로 대신하지 않음), IM-1 168 h(약 7일, 근사), IM-2 12.77 h(착륙~종료 시각에서 유도). 조명 관련 yes 4(SLIM·IM-2·찬드라얀 3호·Blue Ghost), no 1(하쿠토-R), 나머지 unknown. verified 는 IM-2 만(다른 미션은 결과 근거가 없다).
- **착륙선 (작업 3).** 근거표 33행 중 프리셋 필드에 대응하는 행 없음(배터리 개수·Ah·실제 착륙선 발전 W 는 환산하지 않음). 데이터 숫자는 null, dust_class 제거.
- **천체력 (작업 4).** SPICE 표 2026-11-01~2031-01-01(36,529행). 커널 공통 기간 1849-12-26~2150-01-21. 이전 Horizons 범위 표와 겹치는 10,225시각: 태양 직하점 최대 0.0002°, 지구 직하점 최대 0.006°, 지구 거리 최대 81 km. 미션 표 16개도 지구 쪽에 같은 크기(약 0.0055°, 78 km)의 일정한 차이 — 정의 차이로 보이나 원인 미확인. 간격을 6 h 로 넓히면 지구 직하점 보간 오차 최대 0.005°.
- **FeO (작업 5).** 원본 ZIP 어댑터와 정규화 COG 가 같은 값(최대 차이 0, 3,344,014 화소). 품질 코드 차이 23,328 화소는 모두 50°S 북쪽 모서리(COG 가 공칭 범위로 자름). 방향 확인: 보간 화소 비율 ↔ 영구음영 상관 0.58(행을 뒤집으면 0.03). LP 0.5° 와 차이 중앙값 +0.40 wt%, 상관 0.70.
- **TiO₂ (작업 6).** JAXA MI 75–85°S 정량 사용 보류(계획서 결정). 연구용 레이어만: 칸 중심 원래 화소, 0~2 wt% 보존, 15 wt% 초과(449칸)는 자르지 않고 플래그. LP 2° 셀이 지역 조성 레이어(`tio2_wt_lp`, 1σ `tio2_lp_sigma`). WAC 품질 규칙은 원본 한 타일(E350S0450, 3,640만 화소)에서 정규화본과 100% 같은 판정.
- **낙석·단층애 (작업 7).** 새 전역 낙석 목록의 75°S 이남 821행은 이전 추출본과 같다. README 는 80°S 까지라고 적었지만 80°S 이남 검출 145개 있음 → 검출 있는 칸은 값, 없는 칸은 자료 없음. 25 m 안 근접 쌍 0, 50 m 안 3쌍 — 거리로 묶지 않음. 단층애 입력 3곳 → 남쪽 점 12개(75°S 이남은 같은 3곳).

## 2026-11-15 미연결 자료 연결 (사람이 씀)

- **영구음영 폴리곤** (593개, 5 km² 이상) → `psr_poly_dist_km`. 폴리곤 안 칸(816)의 평균 영구음영 비율 0.69, 밖 0.02 — 위치 정합 확인. 래스터 기반 `psr_dist_km` 은 작은 그늘 화소 하나만 있어도 0 이라 칸의 62%(16,050)가 0 이다. 두 레이어 상관 0.34, 폴리곤 거리가 중앙값 12.6 km 길다(정의 차이).
- **극지 평원** → `plains_frac` (매핑 범위 14,872칸 중 4,756칸에 평원). **섀클턴 바위** → `boulder_count` (5,746점, 21칸, 좌표 QA 이상치 1점 제외). **WAC 시간가중 조명률** → `wac_ill_twi`, 우리 일조율과 RMSE 0.063·r 0.898 (PCT 판과 거의 같음).
- **낙석 신뢰도 0.8** 목록(179행)은 0.6 목록의 부분집합. 검출 있는 칸 4,546 → 1,194, 밀도 상관 0.87.
- **IM-1·IM-2 Horizons 표** (착륙지 겉보기 방위·고도): 우리 천체력과 최대 각거리 태양 4e-6°, 지구 6e-4°.
- **JPL IPN 42-176C 지점 B1** (높이 2–3000 m): 지구 가시 비율은 전 높이에서 우리가 약 5%p 낮고 상관 1.00. 태양은 우리 35–40% 대 JPL 97% 로 크게 다르다. B1 평사 좌표의 축 규약이 문서에 없어 8가지 해석을 모두 시험했으나 DEM 고도가 문서(1261 m)와 100 m 이상 다르다. 같은 점에서 PGDA69 장기 평균(0.32·0.40·0.20)이 우리 계산(36·40·20%)과 맞으므로, 태양 쪽 차이는 위치 해석 실패(또는 2009 GSSR DEM 차이)로 보고 우리 계산 오류의 증거로 보지 않는다. 좌표 규약을 확인하면 다시 대조한다.
- **Wueller 외 2026 후보점 130개 × 2025–2032** 한여름 최장 연속 일조: 순위 상관 0.46(일조), 0.31(일조+교신), 우리 쪽이 평균 6.7일 길다. 원 자료에 한여름 기간·판정 기준이 없어 "최남단 직하 위도 ±20일, 원반 50%, 12 h" 가정을 둔 비교이므로 결론을 내리지 않는다.
- **PA→ME 행렬 버그 수정**: `geo/frames.pa_to_me_matrix` 가 ME→PA 를 돌려주고 있었다(SpiceyPy pxform 의 정확한 전치). 전치로 고쳐 성분 차이 0. 이 행렬은 s80 검증에만 쓰였고 천체력 표는 SPICE MOON_ME 를 직접 쓰므로 산출물에는 영향이 없다. s80 의 SpiceyPy 대조는 커널을 한글 경로로 직접 열어 그동안 실행되지 않았다.

