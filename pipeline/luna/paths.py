"""Drive "DU_NE Data" 상대 경로 (CLAUDE.md 4.4) 와 쓰기 위치 보호.

경로는 모두 LUNA_DATA_DIR 기준 상대 경로다. 절대 경로를 하드코딩하지 않는다.
파일 이름이 Drive 와 다르면 이 파일만 고친다.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

INVENTORY_XLSX_GLOB = "DU-NE_Drive_*2026-11-14*.xlsx"

SP = "SouthPolar_75S_90S_v1"
GAP = "Raw_Data/NASA_Gap_Collection_2026-11-14"
REF_GAP = "Reference_Tables/NASA_Gap_Collection_2026-11-14"


@dataclass(frozen=True)
class Need:
    """파이프라인이 쓰는 Drive 파일 (glob 허용)."""

    role: str
    pattern: str
    required: bool = True
    note: str = ""


NEEDS: list[Need] = [
    # 지형 (s20, s30, s40)
    Need("dem240", "Raw_Data/LOLA_DEM/ldem_75s_240m.img"),
    Need("dem240_label", "Raw_Data/LOLA_DEM/ldem_75s_240m.lbl"),
    Need("dem80", "Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip"),
    Need("dem80_label", "Raw_Data/LOLA_DEM/ldem_80s_80m.lbl"),
    Need("dem30_tiles", f"{SP}/Regional/Terrain_30m/LOLA_LDEM_75S_30m_r*_c*.tif", note="36장"),
    Need("slope240", f"{SP}/Regional/Terrain/slope_75s_240m.tif"),
    Need("slope80", f"{SP}/Regional/Terrain/slope_80s_80m_*.tif", note="4타일"),
    # 장기 평균 조명 (s50)
    Need("illum_75s", f"{SP}/Regional/Illumination/solar_illumination_75s_120m.tif"),
    Need("illum_85s", f"{SP}/Regional/Illumination/solar_illumination_85s_60m.tif", required=False),
    Need("earthvis_75s", f"{SP}/Regional/Illumination/earth_visibility_75s_120m.tif"),
    Need("earthvis_85s", f"{SP}/Regional/Illumination/earth_visibility_85s_60m.tif", required=False),
    Need("psr_75s", f"{SP}/Regional/Illumination/permanent_shadow_75s_120m.tif"),
    Need("psr_85s", f"{SP}/Regional/Illumination/permanent_shadow_85s_60m.tif", required=False),
    Need("psr_polygons", "Workspace/Codex_Data_Collection/01_NASA_Downloads/Illumination/NAC_POLE_PSR_SOUTH/LOLA_PSR_75S90S_complete_features.zip", required=False),
    Need("sky_vis", f"{SP}/Regional/Illumination/sky_visibility_75s_240m.tif", required=False),
    Need("wac_ill_pct", f"{GAP}/Terrain_Geology/WAC_POLE_ILL_PCT_SOUTH_100M.IMG", required=False),
    # 조성 (s50, P2)
    Need("lp_hydrogen", f"{SP}/Regional/Composition/LP_hydrogenhd_75S90S_0p5deg.csv", required=False),
    Need("lp_iron", f"{SP}/Regional/Composition/LP_ironhd_75S90S_0p5deg.csv", required=False),
    Need("lp_tio2", f"{GAP}/Polar_Science/LP_GRS_TiO2_native_75S90S.csv", required=False),
    # 지질 (s50)
    Need("scarps", f"{GAP}/Terrain_Geology/LROC_Polar_Lobate_Scarps_75S90S.csv", required=False),
    Need("rockfalls", f"{GAP}/Terrain_Geology/Bickel_Rockfalls_75S90S_*.csv", required=False),
    # 텍스처 (s60)
    Need("wac_mosaic", f"{SP}/Regional/Imaging/wac_south_summer_75s_100m_*.tif", required=False, note="4타일"),
    # 카탈로그 (s70)
    Need("sites_seed", "Catalogs/sites.json"),
    Need("missions_seed", "Catalogs/missions.json", required=False),
    Need("mission_coords", f"{REF_GAP}/LUNA_HISTORICAL_SITE_COORDINATES_16.csv", required=False),
    Need("mission_evidence", f"{REF_GAP}/LUNA_MISSION_FIELD_EVIDENCE.csv", required=False),
    Need("landers_specs", f"{REF_GAP}/LUNA_LANDER_TECHNICAL_SPECS.csv", required=False),
    Need("landers_seed", "Catalogs/landers.json", required=False),
    Need("power_refs", f"{REF_GAP}/LUNAR_BASE_POWER_CONCEPT_PARAMETERS.csv", required=False),
    Need("dsn_coords", f"{REF_GAP}/DSN_ITRF93_ANTENNA_COORDINATES.csv", required=False),
    Need("dsn_masks", f"{REF_GAP}/DSN_HORIZON_MASKS_301O.csv", required=False),
    Need("station_audit", f"{REF_GAP}/EARTH_STATION_LEGACY_FIELD_AUDIT.csv", required=False),
    Need("stations_seed", "Catalogs/stations.json", required=False),
    # 검증 (s10, s30, s80)
    Need("drive_masks", "Horizon_Masks/*.json", required=False, note="REVIEW_REQUIRED, 대조용"),
    Need("drive_ephemeris", "Web_Derived/ephemeris/range_*.json", required=False, note="대조용"),
    Need("ref_horizons", "Reference_Tables/horizons_*.csv", required=False),
    Need("ref_spice", "Reference_Tables/spice_*.csv", required=False),
    Need("spice_frames", "Raw_Data/SPICE_Kernels/moon_de440_250416.tf", required=False),
    Need("spice_kernels", "Raw_Data/SPICE_Kernels/de440s.bsp", required=False, note="s10 천체력 표 원천 (작업 4)"),
    # 2026-11-15 추가 자료 (남은 작업 1·5·6·7)
    Need("lroc_objects", "Raw_Data/Additional_Global_Science/Mission_History/ANTHROPOGENIC_OBJECTS_180.ZIP", required=False, note="착륙지 좌표 교차 확인"),
    Need("wueller_sites", "Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Landing_Sites.zip", required=False, note="아르테미스 후보점"),
    Need("mission_recon", "Workspace/Codex_Data_Collection/00_Existing_Audit/LANDING_MISSION_RECONCILIATION.csv", required=False),
    Need("mineral_bundle", "Web_Derived/Mineral_Resources_3D_2026-11-15/DOWNLOAD_AND_INSTALL.json", required=False, note="Kaguya FeO·JAXA MI 분할 묶음"),
    Need("kaguya_raw", "Raw_Data/Gap_Supplements_2026-11-14/science/Kaguya_SP_LOLA_v2/gridded_feo_mosaic_south_pole.tif.zip", required=False),
    Need("rockfalls_global", "Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_06.csv", required=False),
    Need("polar_plains", f"{GAP}/Terrain_Geology/PolarPlains_Mapping.7z", required=False, note="극지 평원 비율 레이어"),
    Need("shackleton_boulders", f"{GAP}/Terrain_Geology/Boulder_locations_in_shackleton_Gawronska_Boazman_2025.xlsx", required=False),
    Need("geo_coord_qa", f"{GAP}/Terrain_Geology/Lunar_Geologic_Catalog_Coordinate_QA.csv", required=False, note="바위 좌표 이상치"),
    Need("wac_ill_twi", f"{GAP}/Terrain_Geology/WAC_POLE_ILL_TWI_SOUTH_100M.IMG", required=False),
    Need("rockfalls_global_08", "Raw_Data/Gap_Supplements_2026-11-14/science/Bickel_Global_Rockfalls/Bickel_et_al_2020_i80_08.csv", required=False, note="신뢰도 민감도"),
    Need("horizons_im", f"{GAP}/Terrain_Geology/Horizons_IM*_*.json", required=False, note="천체력 대조"),
    Need("wueller_illum", "Raw_Data/Gap_Supplements_2026-11-14/operations/Zenodo_17084058/Illumination_Modeling.zip", required=False, note="원 래스터 (검증은 후보점 속성 사용)"),
    Need("scarps_polar", "Raw_Data/Gap_Supplements_2026-11-14/science/LROC_Scarps/POLAR_SCARP_LOCATIONS_180.ZIP", required=False),
    Need("mast_tables", f"{GAP}/Terrain_Geology/JPL_IPN_42_176C_*Height_Tables*.csv", required=False),
]

#: 쓰면 안 되는 파일 (CLAUDE.md 4.5). 경로 일부가 일치하면 차단한다.
FORBIDDEN = [
    "Raw_Data/LOLA_DEM_Global/ldem_128.img",
    "LADEE_LDEX_",
]
FORBIDDEN_HINTS = {
    "Diviner ST": "Diviner ST 온도 제품은 분석 제외",
    "PRP": "Diviner PRP 는 얼음 검출로 쓰지 않는다",
}


class DataDir:
    """LUNA_DATA_DIR 아래 상대 경로만 다룬다. 이 폴더에는 쓰지 않는다."""

    def __init__(self, root: Path):
        self.root = root

    def path(self, rel: str) -> Path:
        return self.root / rel

    def glob(self, pattern: str) -> list[Path]:
        return sorted(self.root.glob(pattern))

    def first(self, pattern: str) -> Path | None:
        hits = self.glob(pattern)
        return hits[0] if hits else None

    def rel(self, p: Path) -> str:
        return p.resolve().relative_to(self.root.resolve()).as_posix()

    def need(self, role: str) -> list[Path]:
        for n in NEEDS:
            if n.role == role:
                return self.glob(n.pattern)
        raise KeyError(role)


def assert_writable(target: Path, data_root: Path | None) -> None:
    """Drive 원본 폴더 안에 쓰려고 하면 막는다 (CLAUDE.md 3-5)."""
    if data_root is None:
        return
    try:
        target.resolve().relative_to(data_root.resolve())
    except ValueError:
        return
    raise PermissionError(f"Drive 원본 폴더에는 쓰지 않는다: {target}")
