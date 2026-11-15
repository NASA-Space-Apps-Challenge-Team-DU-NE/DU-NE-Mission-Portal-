# 데이터 출처 (제출용, CLAUDE.md 15절)

자료별 원 출처 링크 전체는 [data-sources.md](data-sources.md)에 정리했다.

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
| AVGVISIB_65N_240M_201608 | `Raw_Data/PGDA69_65deg_2026-11-15/AVGVISIB_65N_240M_201608.IMG` |
| AVGVISIB_65N_240M_201608_EARTH | `Raw_Data/PGDA69_65deg_2026-11-15/AVGVISIB_65N_240M_201608_EARTH.IMG` |
| AVGVISIB_65S_240M_201608 | `Raw_Data/PGDA69_65deg_2026-11-15/AVGVISIB_65S_240M_201608.IMG` |
| AVGVISIB_65S_240M_201608_EARTH | `Raw_Data/PGDA69_65deg_2026-11-15/AVGVISIB_65S_240M_201608_EARTH.IMG` |
| AVGVISIB_75N_120M_201608 | `Raw_Data/PGDA69_North_2026-11-15/AVGVISIB_75N_120M_201608.TIF` |
| AVGVISIB_75N_120M_201608_EARTH | `Raw_Data/PGDA69_North_2026-11-15/AVGVISIB_75N_120M_201608_EARTH.TIF` |
| AVGVISIB_85N_060M_201608 | `Raw_Data/PGDA69_North_2026-11-15/AVGVISIB_85N_060M_201608.TIF` |
| AVGVISIB_85N_060M_201608_EARTH | `Raw_Data/PGDA69_North_2026-11-15/AVGVISIB_85N_060M_201608_EARTH.TIF` |
| LPSR_65N_240M_201608 | `Raw_Data/PGDA69_65deg_2026-11-15/LPSR_65N_240M_201608.IMG` |
| LPSR_65S_240M_201608 | `Raw_Data/PGDA69_65deg_2026-11-15/LPSR_65S_240M_201608.IMG` |
| LPSR_75N_120M_201608 | `Raw_Data/PGDA69_North_2026-11-15/LPSR_75N_120M_201608.TIF` |
| LPSR_85N_060M_201608 | `Raw_Data/PGDA69_North_2026-11-15/LPSR_85N_060M_201608.TIF` |
| artemis_regions | `Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip` |
| boulders | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Boulder_locations_in_shackleton_Gawronska_Boazman_2025.xlsx` |
| dem10 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldem_85s_10m.lbl` |
| dem128 | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_128.img` |
| dem128_label | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_128.lbl` |
| dem20 | `Raw_Data/LOLA_DEM_Polar_HiRes/ldem_80s_20m.lbl` |
| dem240 | `Raw_Data/LOLA_DEM/ldem_75s_240m.img` |
| dem240_label | `Raw_Data/LOLA_DEM/ldem_75s_240m.lbl` |
| dem240n | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_75n_240m.img` |
| dem240n_label | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_75n_240m.lbl` |
| dem30 | `SouthPolar_75S_90S_v1/Regional/Terrain_30m/LOLA_LDEM_75S_30m.vrt` |
| dem64 | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64.img` |
| dem64_fill | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64.img` |
| dem64_fill_label | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64.lbl` |
| dem64_label | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64.lbl` |
| dem80 | `Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip` |
| dem80_label | `Raw_Data/LOLA_DEM/ldem_80s_80m.lbl` |
| dem80n | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_80n_80m.img` |
| dem80n_label | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_80n_80m.lbl` |
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
| ldem_128 | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_128.img` |
| ldem_75n_240m | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_75n_240m.img` |
| ldem_80n_80m | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_80n_80m.img` |
| ldsm_75n_120m | `Raw_Data/LOLA_Slope_2026-11-15/ldsm_75n_120m.img` |
| legacy_validation_record | `artifact:out/validation/history/ephemeris_spice-7f15e0f6ffea65d1.json.original` |
| legacy_validation_record | `artifact:out/validation/history/illumination-96df2b325f1a3c3a.json.original` |
| legacy_validation_record | `artifact:out/validation/history/layers_minerals-1a7dbbcc37d82d0a.json.original` |
| legacy_validation_record | `artifact:out/validation/history/masks-0c4571fe1b8335c6.json.original` |
| legacy_validation_record | `artifact:out/validation/history/mast-84f0cec20ca6c6dd.json.original` |
| legacy_validation_record | `artifact:out/validation/history/wueller-5e729a55a849847f.json.original` |
| lp_grs_2deg | `Raw_Data/LP_GRS_2deg_2026-11-15/lpgrs_high1_elem_abundance_2deg.tab` |
| lp_hydrogen_low | `Raw_Data/Lunar_Prospector_Global/hydrogenlow.txt` |
| mission_coords | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv` |
| mission_evidence | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_MISSION_FIELD_EVIDENCE.csv` |
| mission_evidence | `Workspace/Codex_Data_Collection/00_Existing_Audit/LANDING_MISSION_RECONCILIATION.csv` |
| missions_seed | `Catalogs/missions.json` |
| polar_plains | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/PolarPlains_Mapping.7z` |
| power_refs | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv` |
| psr | `SouthPolar_75S_90S_v1/Regional/Illumination/permanent_shadow_75s_120m.tif` |
| psr | `SouthPolar_75S_90S_v1/Regional/Illumination/permanent_shadow_85s_60m.tif` |
| psr_polygons | `Workspace/Codex_Data_Collection/01_NASA_Downloads/Illumination/NAC_POLE_PSR_SOUTH/LOLA_PSR_75S90S_complete_features.zip` |
| relief_global | `Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64.img` |
| relief_north | `Raw_Data/LOLA_DEM_North_2026-11-15/ldem_75n_240m.img` |
| relief_south | `Raw_Data/LOLA_DEM/ldem_75s_240m.img` |
| rockfalls | `Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv` |
| scarps | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP` |
| scarps_lobate | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/LOBATE_SCARPS_180.ZIP` |
| scarps_polar | `Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP` |
| site_reference | `Raw_Data/Additional_Global_Science/Mission_History/ANTHROPOGENIC_OBJECTS_180.ZIP` |
| site_reference | `Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip` |
| site_reference | `Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip` |
| site_reference | `Reference_Tables/NASA_Gap_Collection_2026-11-14/LUNA_HISTORICAL_SITE_COORDINATES_16.csv` |
| site_seed | `Catalogs/sites.json` |
| sites | `Catalogs/sites.json` |
| sky_vis | `SouthPolar_75S_90S_v1/Regional/Illumination/sky_visibility_75s_240m.tif` |
| sldem2015_slope_128 | `Raw_Data/SLDEM2015_Slope_2026-11-15/SLDEM2015_128_SL_90S_90N_000_360.IMG` |
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
| tio2_lp | `Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/LP_GRS_TiO2_native_75S90S.csv` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/apollo11.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/apollo15.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/apollo17.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/beresheet.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/blue_ghost_m1.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/chandrayaan2.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/chandrayaan3.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/change3.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/change4.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/change5.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/change6.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/hakuto_r_m1.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/im1.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/im2.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/luna25.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/missions/slim.json` |
| validation_ephemeris_metadata | `artifact:out/ephemeris/range.json` |
| validation_ephemeris_reference | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM1_Earth_2024-02-22.json` |
| validation_ephemeris_reference | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM1_Sun_2024-02-22.json` |
| validation_ephemeris_reference | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM2_Earth_2025-03-06.json` |
| validation_ephemeris_reference | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/Horizons_IM2_Sun_2025-03-06.json` |
| validation_ephemeris_reference | `Reference_Tables/horizons_apollo11_1969-07-20.csv` |
| validation_ephemeris_reference | `Reference_Tables/horizons_chandrayaan3_2023-08-23.csv` |
| validation_ephemeris_reference | `Reference_Tables/horizons_connecting_ridge_2026-11-14.csv` |
| validation_ephemeris_reference | `Reference_Tables/spice_apollo11_1969-07-20.csv` |
| validation_ephemeris_reference | `Reference_Tables/spice_chandrayaan3_2023-08-23.csv` |
| validation_ephemeris_reference | `Reference_Tables/spice_connecting_ridge_2026-11-14.csv` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/apollo11.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/apollo15.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/apollo17.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/beresheet.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/blue_ghost_m1.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/chandrayaan2.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/chandrayaan3.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/change3.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/change4.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/change5.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/change6.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/hakuto_r_m1.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/im1.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/im2.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/luna25.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/missions/slim.bin` |
| validation_ephemeris_values | `artifact:out/ephemeris/range.bin` |
| validation_frame_definition | `Raw_Data/SPICE_Kernels/moon_de440_250416.tf` |
| validation_site_seed | `Catalogs/sites.json` |
| validation_spice_kernel | `Raw_Data/SPICE_Kernels/de440s.bsp` |
| validation_spice_kernel | `Raw_Data/SPICE_Kernels/moon_de440_250416.tf` |
| validation_spice_kernel | `Raw_Data/SPICE_Kernels/moon_pa_de440_200625.bpc` |
| validation_spice_kernel | `Raw_Data/SPICE_Kernels/naif0012.tls` |
| validation_spice_kernel | `Raw_Data/SPICE_Kernels/pck00011.tpc` |
| wac_ill | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_PCT_SOUTH_100M.IMG` |
| wac_ill_twi | `Raw_Data/NASA_Gap_Collection_2026-11-14/Terrain_Geology/WAC_POLE_ILL_TWI_SOUTH_100M.IMG` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_NE.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_NW.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_SE.tif` |
| wac_mosaic | `SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_SW.tif` |
<!-- AUTO:s90 끝 -->
