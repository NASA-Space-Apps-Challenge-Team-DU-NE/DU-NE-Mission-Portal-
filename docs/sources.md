# 데이터 출처 (제출용, CLAUDE.md 15절)

## NASA 데이터
- JPL Horizons — https://ssd.jpl.nasa.gov/horizons/
- LOLA DEM (PDS Geosciences) — https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- PGDA 69 극지 조명 — https://pgda.gsfc.nasa.gov/products/69 · PGDA 78 — https://pgda.gsfc.nasa.gov/products/78
- LROC WAC 남극 조명률 — https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH
- Moon Trek — https://trek.nasa.gov/moon/ · NASA SVS 4720 — https://svs.gsfc.nasa.gov/4720/
- NAIF SPICE — https://naif.jpl.nasa.gov/naif/data_generic.html
- NASA 아르테미스 III 후보 지역 (2024-10-28)

## 그 밖의 자료
- 팀 Drive `DU_NE Data` 스냅샷 2026-11-14 (파일별 품질은 `DU-NE_Drive_파일목록_2026-11-14.xlsx`)

## AI 도구 사용 내역
- (제출 전 작성)

## 실제로 쓴 Drive 파일 (s90 자동)

<!-- AUTO:s90 시작 (파이프라인이 덮어씀) -->
| 역할 | Drive 경로 |
| --- | --- |
| artemis_regions | `Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip` |
| dem10 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldem_85s_10m.lbl` |
| dem20 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldem_80s_20m.lbl` |
| dem240 | `Raw_Data/LOLA_DEM/ldem_75s_240m.img` |
| dem240_label | `Raw_Data/LOLA_DEM/ldem_75s_240m.lbl` |
| dem30 | `SouthPolar_75S_90S_v1/Regional/Terrain_30m/LOLA_LDEM_75S_30m.vrt` |
| dem80 | `Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip` |
| dem80_label | `Raw_Data/LOLA_DEM/ldem_80s_80m.lbl` |
| dsn_coords | `Reference_Tables/NASA_Gap_Collection_2026-11-14/DSN_ITRF93_ANTENNA_COORDINATES.csv` |
| dsn_masks | `Reference_Tables/NASA_Gap_Collection_2026-11-14/DSN_HORIZON_MASKS_301O.csv` |
| earthvis | `SouthPolar_75S_90S_v1/Regional/Illumination/earth_visibility_75s_120m.tif` |
| earthvis | `SouthPolar_75S_90S_v1/Regional/Illumination/earth_visibility_85s_60m.tif` |
| feo_wt | `SouthPolar_75S_90S_v1/Regional/Composition/LP_ironhd_75S90S_0p5deg.csv` |
| globe_color | `Raw_Data/LROC_Global/lroc_color_poles_8k.tif` |
| h_ppm | `SouthPolar_75S_90S_v1/Regional/Composition/LP_hydrogenhd_75S90S_0p5deg.csv` |
| illum | `SouthPolar_75S_90S_v1/Regional/Illumination/solar_illumination_75s_120m.tif` |
| illum | `SouthPolar_75S_90S_v1/Regional/Illumination/solar_illumination_85s_60m.tif` |
| jaxa_mi_tio2_bundle_manifest | `Web_Derived/Mineral_Resources_3D_2026-11-15/DOWNLOAD_AND_INSTALL.json` |
| kaguya_feo_bundle_manifest | `Web_Derived/Mineral_Resources_3D_2026-11-15/DOWNLOAD_AND_INSTALL.json` |
| kaguya_feo_raw | `Raw_Data/Gap_Supplements_2026-11-14/science/Kaguya_SP_LOLA_v2/gridded_feo_mosaic_south_pole.tif.zip` |
| lander_specs | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_LANDER_TECHNICAL_SPECS.csv` |
| landers_seed | `Catalogs/landers.json` |
| ldec10 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldec_85s_10m.lbl` |
| ldec20 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldec_80s_20m.lbl` |
| mission_coords | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv` |
| mission_evidence | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_MISSION_FIELD_EVIDENCE.csv` |
| mission_evidence | `Workspace/Codex_Data_Collection/00_Existing_Audit/LANDING_MISSION_RECONCILIATION.csv` |
| missions_seed | `Catalogs/missions.json` |
| power_refs | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv` |
| psr | `SouthPolar_75S_90S_v1/Regional/Illumination/permanent_shadow_75s_120m.tif` |
| psr | `SouthPolar_75S_90S_v1/Regional/Illumination/permanent_shadow_85s_60m.tif` |
| rockfalls | `Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv` |
| scarps | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP` |
| site_reference | `Raw_Data/Additional_Global_Science/Mission_History/ANTHROPOGENIC_OBJECTS_180.ZIP` |
| site_reference | `Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip` |
| site_reference | `Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip` |
| site_reference | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv` |
| site_seed | `Catalogs/sites.json` |
| sites | `Catalogs/sites.json` |
| sky_vis | `SouthPolar_75S_90S_v1/Regional/Illumination/sky_visibility_75s_240m.tif` |
| slope240 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_75s_240m.tif` |
| slope80 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_80s_80m_NE.tif` |
| slope80 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_80s_80m_NW.tif` |
| slope80 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_80s_80m_SE.tif` |
| slope80 | `SouthPolar_75S_90S_v1/Regional/Terrain/slope_80s_80m_SW.tif` |
| spice_de440s.bsp | `Raw_Data/SPICE_Kernels/de440s.bsp` |
| spice_moon_de440_250416.tf | `Raw_Data/SPICE_Kernels/moon_de440_250416.tf` |
| spice_moon_pa_de440_200625.bpc | `Raw_Data/SPICE_Kernels/moon_pa_de440_200625.bpc` |
| spice_naif0012.tls | `Raw_Data/SPICE_Kernels/naif0012.tls` |
| spice_pck00011.tpc | `Raw_Data/SPICE_Kernels/pck00011.tpc` |
| stations_seed | `Catalogs/stations.json` |
| tio2_wt | `Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/LP_GRS_TiO2_native_75S90S.csv` |
| wac_ill | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_PCT_SOUTH_100M.IMG` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_NE.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_NW.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_SE.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_SW.tif` |
<!-- AUTO:s90 끝 -->
