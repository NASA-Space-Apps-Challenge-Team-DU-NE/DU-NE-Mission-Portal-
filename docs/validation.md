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
| illum_vs_illum_avg | 25992 | -0.0017 | 0.0600 | 0.8997 | 0.4504 | — | {"ref": "PGDA69 장기 평균", "ours": "격자 지평선(5°) + Horizons 표 1520일, 60 h 간격", "observer_height_m": 2.0, "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"} |
| illum_vs_wac_ill_pct | 468 | 0.0157 | 0.0625 | 0.8963 | 0.3575 | — | {"ref": "WAC 실측 (88–90°S)", "ours": "격자 지평선(5°) + Horizons 표 1520일, 60 h 간격", "observer_height_m": 2.0, "note": "기간·관측 높이·해상도가 다르다 (CLAUDE.md 18절)"} |
| frame_pa_to_me | 1 |  |  |  | 0.0289 | 미달 | {"kernel": "Raw_Data/SPICE_Kernels/moon_de440_250416.tf", "matrix": "TK MOON_PA_DE440→MOON_ME angles=[67.8526, 78.6944, 0.2785] ARCSECONDS axes=[3, 2, 1]", "rot |
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
