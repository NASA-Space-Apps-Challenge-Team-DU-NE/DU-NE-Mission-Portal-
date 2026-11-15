# 데이터 출처 링크 모음

작성일: 2026-11-15. 개발에 쓴 데이터마다 원 출처 링크를 정리한 문서다.

- 범위: 파이프라인이 실제로 읽은 파일(`web/public/data/sources.json`, `docs/sources.md`의 자동 표)과 화면이 직접 불러오는 자산.
- 링크는 데이터 파일의 `source_url`, 카탈로그, 팀 Drive(`DU NE Data`)의 README·라벨·수집 기록에 적힌 것을 옮겼다. 이 문서를 만들면서 링크를 하나씩 열어 보지는 않았다. 제출 전에 한 번 열어 확인한다.
- "Drive 경로"는 팀 Drive `DU NE Data/DU_NE Data/` 아래 경로다. 파일별 품질 표시는 `DU-NE_Drive_파일목록_2026-11-14.xlsm`에 있다.
- 출처를 찾지 못한 항목은 "출처 링크 없음"으로 적었다. 합성 값으로 채운 데이터는 없다.

## 1. 지형 (고도·경사)

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| LOLA 남극 DEM 240 m (`ldem_75s_240m`) | 남극 지평선 마스크, 남극 격자, 3D 남극 지형 음영 | `Raw_Data/LOLA_DEM/` | PDS Geosciences LOLA GDR 극지: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ |
| LOLA 남극 DEM 80 m (`ldem_80s_80m`) | 남극 근거리 지평선 | `Raw_Data/LOLA_DEM/` (zip) | 위와 같은 폴더 |
| LOLA 남극 고해상도 DEM 20 m·10 m와 측정 밀도(`ldem_80s_20m`, `ldem_85s_10m`, `ldec_*`) | 착륙지 주변 지형, "측정 밀도 낮음" 표시 | `Raw_Data/LOLA_DEM_Polar_HiRes/` | 위와 같은 폴더 |
| LOLA 남극 30 m DEM (VRT) | 착륙지 국지 지형 | `SouthPolar_75S_90S_v1/Regional/Terrain_30m/` | PGDA 90: https://pgda.gsfc.nasa.gov/products/90 |
| LOLA 북극 DEM 240 m·80 m (`ldem_75n_240m`, `ldem_80n_80m`) | 북극 격자, 3D·2D 북극 지형 음영 | `Raw_Data/LOLA_DEM_North_2026-11-15/` | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ (PDS 미러: 위 PDS Geosciences 극지 폴더) |
| LOLA 북극 경사 120 m (`ldsm_75n_120m`) | 북극 경사 레이어 | `Raw_Data/LOLA_Slope_2026-11-15/` | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ |
| LOLA 전역 DEM 64·128 화소/도 (`ldem_64`, `ldem_128`) | 전역 격자(75°S–75°N), 3D·2D 전역 지형 음영 | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/` | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ |
| SLDEM2015 전역 경사 (128 화소/도) | 전역 경사 레이어, LOLA 경사와 교차 확인 | `Raw_Data/SLDEM2015_Slope_2026-11-15/` | https://imbrium.mit.edu/DATA/SLDEM2015_SLOPE/GLOBAL/FLOAT_IMG/ |
| 남극 경사 240 m·80 m (`slope_75s_240m`, `slope_80s_80m_*`) | 남극 착륙 안전(경사) 레이어 | `SouthPolar_75S_90S_v1/Regional/Terrain/` | LOLA 극지 DEM에서 만든 파생 자료. 팀 정리본(`SouthPolar_75S_90S_v1` README)에 원 링크 없음 |
| 아르테미스 III 후보지 항법 격자 (A3CLR22, 12곳) | 남극 후보지 지평선 마스크 | `Raw_Data/NASA_Gap_Collection_2026-11-14/` | Zenodo 17954508: https://doi.org/10.5281/zenodo.17954508 |

LOLA 자료 소개 페이지: https://pds-geosciences.wustl.edu/missions/lro/lola.htm · NASA PGDA: https://pgda.gsfc.nasa.gov/

## 2. 일조·지구 가시·영구음영

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| PGDA 69 남극 평균 일조·지구 가시·영구음영 (75°S 120 m, 85°S 60 m) | 일조 지도, 교신 지도, 영구음영(물·얼음) 레이어 | `SouthPolar_75S_90S_v1/Regional/Illumination/` | PGDA 69: https://pgda.gsfc.nasa.gov/products/69 · PDS: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/ |
| PGDA 69 65°S·65°N 240 m (`AVGVISIB_65*`, `LPSR_65*`) | 전역 격자의 55°–75° 띠 일조·교신·영구음영 | `Raw_Data/PGDA69_65deg_2026-11-15/` | 위와 같음 |
| PGDA 69 북극 (`AVGVISIB_75N_120M`, `AVGVISIB_85N_060M`, `LPSR_*N`) | 북극 일조·교신·영구음영 | `Raw_Data/PGDA69_North_2026-11-15/` | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/ |
| 하늘 가시 비율 (`sky_visibility_75s_240m`) | 남극 하늘 가림 참고 | `SouthPolar_75S_90S_v1/Regional/Illumination/` | PDS LOLA extras/illumination (`skyv_65s_240m`): https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/ |
| PGDA 78 (극지 조명) | 검증 참고 | `Raw_Data/PGDA78/` | https://pgda.gsfc.nasa.gov/products/78 |
| LROC WAC 남극 조명률·여명 (`WAC_POLE_ILL_PCT_SOUTH`, `WAC_POLE_ILL_TWI_SOUTH`) | 검증: 우리 일조 계산과 실측 조명률 비교 | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/` | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH |
| LROC NAC 남극 영구음영 폴리곤 | 영구음영 경계 | `Workspace/Codex_Data_Collection/01_NASA_Downloads/Illumination/NAC_POLE_PSR_SOUTH/` | https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_POLE_PSR_SOUTH |

## 3. 자원 (물·얼음, 철·티타늄)

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| Lunar Prospector 중성자 수소 (`hydrogenhd`, `hydrogenlow`) | 얼음 가능성 지시자 | `SouthPolar_75S_90S_v1/Regional/Composition/`, `Raw_Data/Lunar_Prospector_Global/` | https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html · https://pds-geosciences.wustl.edu/missions/lunarp/reduced/hydrogenlow.txt |
| Lunar Prospector 철 (`ironhd`) | 철 레이어 (남극) | `SouthPolar_75S_90S_v1/Regional/Composition/` | https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html |
| Lunar Prospector GRS 원소 함량 2° (`lpgrs_high1_elem_abundance_2deg`) | 철·티타늄 전역 레이어, 남극 TiO₂ | `Raw_Data/LP_GRS_2deg_2026-11-15/`, `Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/` | https://pds-geosciences.wustl.edu/lunar/lp-l-grs-5-elem-abundance-v1/lp_9001/data/ |
| Kaguya SP + LOLA 극지 FeO 모자이크 | 남극 철 레이어 | `Raw_Data/Gap_Supplements_2026-11-14/science/Kaguya_SP_LOLA_v2/` | Zenodo 7108163: https://doi.org/10.5281/zenodo.7108163 |
| JAXA Kaguya MI TiO₂·FeO (광물 번들) | 철·티타늄 레이어 (75–85°S 정량은 보류) | `Web_Derived/Mineral_Resources_3D_2026-11-15/` | JAXA DARTS: https://vp.darts.isas.jaxa.jp/guide_en.html · 이용 조건: https://www.isas.jaxa.jp/en/researchers/data-policy/ |
| LROC WAC TiO₂ (광물 번들) | 티타늄 레이어 (저위도) | 위와 같음 | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_TIO2 |

## 4. 지질 위험

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| LROC 단층 절벽 (극지 단층, 엽상 단층) | 지질 위험 지도, 단층 근접 경고 | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/` | https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_POLAR_SCARP_LOCATIONS · https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_LOBATE_SCARPS |
| 전역 낙석 목록 (Bickel et al., 2020) | 지질 위험 지도 | `Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/` | 논문: https://doi.org/10.1038/s41467-020-16653-3 · 자료: https://edmond.mpg.de/dataset.xhtml?persistentId=doi:10.17617/3.OG927P |
| 섀클턴 일대 바위 위치 (Gawronska·Boazman, 2025) | 착륙 위험 참고 | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/` | Drive 수집 기록에 Edmond 자료(https://edmond.mpg.de/dataset.xhtml?persistentId=doi:10.17617/3.OG927P)와 함께 적혀 있다. 이 파일 단독의 출처 링크는 확인 필요 |
| 극지 평원 지도 (PolarPlains_Mapping) | 지질 참고 | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/` | Zenodo 10799097: https://zenodo.org/records/10799097 |

## 5. 배경 영상 (계산에는 쓰지 않음)

| 자료 | 쓴 곳 | 출처 |
| --- | --- | --- |
| LROC WAC 남극 여름 모자이크 100 m | 2D 남극 지도 배경, 3D 남극 캡 | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER |
| NASA SVS 4720 CGI Moon Kit (`lroc_color_poles_8k`) | 3D 달 표면, 2D 전역·북극 지도의 밝기 | https://svs.gsfc.nasa.gov/4720/ (파일: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_8k.tif) |
| 지형 음영 그림 (`relief_*`) | 3D 달과 2D 북극·전역 지도의 음영 | 1절의 LOLA DEM(`ldem_75s_240m`, `ldem_75n_240m`, `ldem_64`)에서 파이프라인이 만든 그림 |
| 지구 텍스처 (`earth_atmos_2048.jpg`, NASA Blue Marble 기반) | 3D 장면의 지구 | three.js 예제 텍스처: https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg · 원본: NASA Visible Earth Blue Marble (https://visibleearth.nasa.gov/collection/1484/blue-marble) |

## 6. 천체력·좌표계

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| NAIF SPICE 커널 (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`) | 태양·지구 방위각·고도각 사전 계산 표, 검증 기준 | `Raw_Data/SPICE_Kernels/` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ · 안내: https://naif.jpl.nasa.gov/naif/data.html |
| JPL Horizons 출력 (아폴로 11, 찬드라얀 3, 연결 능선, IM-1, IM-2) | 천체력 검증 | `Reference_Tables/`, `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/` | https://ssd.jpl.nasa.gov/horizons/ · API 문서: https://ssd-api.jpl.nasa.gov/doc/horizons.html |
| IM-2 착륙·표면 운용 SPICE 커널 | IM-2 착륙 위치 확인 | — | https://naif.jpl.nasa.gov/pub/naif/pds/pds4/clps/clps_spice/spice_kernels/ |

## 7. 착륙지 카탈로그 (`sites.json`, 32곳)

| 착륙지 | 출처 |
| --- | --- |
| 아르테미스 III 후보 9지역 경계와 2024 후보 5곳 (몽 무통, 노빌레 가장자리 2, 카베우스 B 인근 봉우리, 슬레이터 평원, 드 제를라슈 가장자리 2) | USGS 2024: https://doi.org/10.5066/P1MEQ6UK · NASA 발표: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ |
| 2022 후보 (섀클턴 가장자리, 호어스, 말라페르트 산괴, 노빌레 가장자리 1) | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ |
| 연결 능선, 섀클턴 인근 봉우리, 드 제를라슈 가장자리, 파우스티니 가장자리 A, 아문센 가장자리 | Zenodo 17084058: https://doi.org/10.5281/zenodo.17084058 |
| 몽 무통 고원 | https://en.wikipedia.org/wiki/Mons_Mouton (1차 자료로 바꾸는 편이 좋다) |
| IM-1 Odysseus | LRA 위치: https://pds-geosciences.wustl.edu/clps/urn-nasa-pds-lra/data_clps_to2_im/LRA_CLPS_TO2_IM_calib_location.csv |
| IM-2 Athena | LRA 위치: https://pds-geosciences.wustl.edu/clps/urn-nasa-pds-lra/data_clps_to_prime1/LRA_CLPS_TO_PRIME1_calib_location.csv |
| LCROSS 충돌 지점 | https://doi.org/10.1029/2024GL110355 |
| Blue Ghost M1 | https://lroc.im-ldi.com/images/1407 |
| 아폴로 11·15·17호 | NSSDC 착륙지 목록: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html |
| 창어 3·4·5·6호, 찬드라얀 2·3호, 루나 25호, SLIM, 베레시트, 하쿠토-R M1 | NSSDC 인공물 충돌·착륙 목록: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html |
| 착륙지 좌표 대조 | LROC 인공물 위치 `ANTHROPOGENIC_OBJECTS_180.ZIP`: https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/SHAPEFILE/ANTHROPOGENIC_OBJECTS/ |

## 8. 과거 미션 카탈로그 (`missions.json`, 16개)

| 미션 | 출처 |
| --- | --- |
| 아폴로 11·15·17호 | NASA SP-4029: https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm · https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_15a_Summary.htm · https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_17a_Summary.htm · NTRS: https://ntrs.nasa.gov/api/citations/20190031985/downloads/20190031985_rev1.pdf |
| 창어 3·4·5·6호, 베레시트, 찬드라얀 2호, 루나 25호 | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html |
| 하쿠토-R M1 | 위 NSSDC 목록 · ispace 발표: https://www.ispace-inc.com/2023/05/26/ispace-announces-results-of-the-hakuto-r-mission-1-lunar-landing/ |
| 찬드라얀 3호 | https://www.isro.gov.in/Chandrayaan3_Details.html · https://www.isro.gov.in/media_isro/pdf/APXS_CH3.pdf |
| SLIM | https://www.isas.jaxa.jp/en/outreach/announcements/files/SLIM-pressconf-20240125.pdf |
| IM-1 Odysseus | https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/ · https://www.nasa.gov/news-release/nasa-intuitive-machines-to-discuss-historic-moon-mission-today/ · https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ |
| Blue Ghost M1 | https://fireflyspace.com/news/blue-ghost-mission-1-live-updates/ · https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/ |
| IM-2 Athena | https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/ · SPICE 커널(6절) |

## 9. 지상국·착륙선·전력 참고값

| 자료 | 쓴 곳 | Drive 경로 | 출처 |
| --- | --- | --- | --- |
| DSN 안테나 좌표 (ITRF93) | 지상국 통신 창 (골드스톤 DSS-14, 마드리드 DSS-63, 캔버라 DSS-43) | `Reference_Tables/NASA_Gap_Collection_2026-11-14/DSN_ITRF93_ANTENNA_COORDINATES.csv` | DSN 810-005 모듈 301: https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/ · NAIF 지상국 커널: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/stations/earthstns_itrf93_260814.cmt |
| DSN 수신 지평선 마스크 (301O) | 지상국별 최소 고도각 | `Reference_Tables/NASA_Gap_Collection_2026-11-14/DSN_HORIZON_MASKS_301O.csv` | https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/Horizon-Masks-Download-V2-301O.xlsx |
| 여주 심우주 안테나 | 지상국 통신 창 | `Catalogs/stations.json` | 좌표는 확인 전 값(`verified: false`). 참고: https://www.kari.re.kr/KOR/contents/70 · https://www.janss.kr/download/download_pdf?pid=jass-39-4-181 |
| 착륙선 제원 근거표 | 착륙선 프리셋 (숫자는 화면 입력, 근사 표시) | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_LANDER_TECHNICAL_SPECS.csv` | https://ntrs.nasa.gov/api/citations/20190031985/downloads/20190031985_rev1.pdf · IM-2 보도자료집: https://www.nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf |
| 달 기지 전력 개념 수치 (VSAT, 이동식 태양전지 배열, 핵분열 표면 전원) | 전력 계산 참고값 | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv` | https://ntrs.nasa.gov/api/citations/20210011743/downloads/NASA-TM-20210011743.pdf · https://ntrs.nasa.gov/api/citations/20220005105/downloads/SWEDE%20Lunar%20Surface%20Power%20Draft%203-30-22.pdf |

## 10. 과제·비교 도구

- NASA Space Apps Challenge 2026: https://www.spaceappschallenge.org/2026/
- LROC QuickMap: https://quickmap.lroc.asu.edu/
- NASA Moon Trek: https://trek.nasa.gov/moon/

## 확인이 더 필요한 항목

- 남극 경사 240 m·80 m(`slope_*`): 팀 정리본에 원 링크가 없다. LOLA 경사(`ldsm`)인지 팀이 DEM에서 직접 계산한 것인지 확인한다.
- 섀클턴 바위 위치(Gawronska·Boazman 2025): 파일 단독의 자료 링크를 확인한다.
- 몽 무통 고원: 위키백과 대신 NASA·USGS 1차 자료로 바꾼다.
- 여주 안테나 좌표: 측량 좌표를 받으면 바꾼다.
- 지구 텍스처: three.js 예제 파일이다. NASA Blue Marble 원본 링크로 바꾸거나 이용 조건을 함께 적는다.
