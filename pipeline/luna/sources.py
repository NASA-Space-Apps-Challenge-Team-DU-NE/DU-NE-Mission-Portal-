"""화면 출처 패널용 출처 목록 (P1-40). URL 은 CLAUDE.md 19절에 적힌 것만 쓴다."""

from __future__ import annotations

from luna.contracts import SourceEntry

SOURCES: dict[str, SourceEntry] = {s.key: s for s in [
    SourceEntry("jpl_horizons", "JPL Horizons (태양·지구 직하점·거리)", "real", "https://ssd.jpl.nasa.gov/horizons/", "1 h", "사전 수신 표. 표 밖은 근사 천체력"),
    SourceEntry("analytic_ephemeris", "근사 천체력 (Meeus 해석식 + IAU 달 회전)", "approx", None, None, "표 범위 밖 시각에만 사용"),
    SourceEntry("lola_dem_240m", "LOLA 남극 DEM 240 m (LDEM_75S_240M)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "240 m"),
    SourceEntry("lola_dem_80m", "LOLA 남극 DEM 80 m (LDEM_80S_80M)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "80 m"),
    SourceEntry("lola_dem_30m", "LOLA 남극 DEM 30 m 타일", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "30 m"),
    SourceEntry("lola_slope", "LOLA 경사 (80·240 m)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "80/240 m"),
    SourceEntry("pgda69", "PGDA 69 극지 조명 (장기 평균 일조·지구 가시·영구음영)", "real", "https://pgda.gsfc.nasa.gov/products/69", "60/120/240 m", "약 18.6년 평균 — 특정 날짜 값 아님"),
    SourceEntry("lola_psr_polygons", "LOLA 영구음영 폴리곤 (5 km² 이상)", "real", None, None),
    SourceEntry("lroc_wac_ill", "LROC WAC 남극 실측 조명률", "real", "https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH", "100 m", "88–90°S 만"),
    SourceEntry("lroc_wac_mosaic", "LROC WAC 643 nm 남극 여름 모자이크", "real", None, "100 m", "3D 남극 텍스처"),
    SourceEntry("lp_grs", "Lunar Prospector GRS (수소·FeO·TiO₂)", "real", None, "0.5°–20°", "해상도 거침. 수소는 얼음 가능성 지표 · 검출 아님"),
    SourceEntry("lroc_scarps", "LROC 극지 단층애 목록", "real", None, None, "지점·군집 3곳"),
    SourceEntry("bickel_rockfalls", "Bickel 낙석 목록", "real", None, None),
    SourceEntry("moon_trek", "NASA Moon Trek LOLA 색상 지형 타일", "real", "https://trek.nasa.gov/moon/", None, "3D 전구 텍스처 (원격)"),
    SourceEntry("nasa_svs_4720", "NASA SVS 4720 CGI Moon Kit", "real", "https://svs.gsfc.nasa.gov/4720/", None, "3D 텍스처 대체"),
    SourceEntry("drive_catalog", "팀 Drive 카탈로그 (공식 기록 대조본)", "real", None, None, "항목별 verified 확인"),
    SourceEntry("dsn", "NASA DSN 안테나 좌표·지평선 마스크", "real", None, None),
    SourceEntry("kari_kdsa", "KARI 여주 심우주 안테나 공개 자료", "real", None, None),
    SourceEntry("nasa_artemis_2024", "NASA 아르테미스 III 후보 지역 (2024-10-28)", "real", "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/", None, "지역 이름만 공개, 대표점은 카탈로그 출처"),
    SourceEntry("assumed_dust", "착륙 먼지 반경", "assumed", None, None, "공식 기준이 없는 가정값"),
    SourceEntry("lander_specs", "착륙선 제원 (공개 수치)", "approx", None, None, "근사값"),
    SourceEntry("power_concepts", "기지 전력 개념 (NASA 자료)", "real", None, None),
]}
