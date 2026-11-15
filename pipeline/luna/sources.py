"""화면 출처 패널용 출처 목록 (P1-40). URL 은 CLAUDE.md 19절에 적힌 것만 쓴다."""

from __future__ import annotations

from luna.contracts import SourceEntry

SOURCES: dict[str, SourceEntry] = {s.key: s for s in [
    SourceEntry("spice", "NAIF SPICE (DE440s · MOON_ME, LT+S)", "real", "https://naif.jpl.nasa.gov/naif/data.html", "1 h", "천체력 표 주 경로 (2026-11-01~2031-01-01 · 미션별). 표 밖은 근사 천체력"),
    SourceEntry("jpl_horizons", "JPL Horizons (태양·지구 직하점·거리)", "real", "https://ssd.jpl.nasa.gov/horizons/", "1 h", "SPICE 표 대조용 기준"),
    SourceEntry("analytic_ephemeris", "근사 천체력 (Meeus 해석식 + IAU 달 회전)", "approx", None, None, "표 범위 밖 시각에만 사용"),
    SourceEntry("lola_dem_240m", "LOLA 남극 DEM 240 m (LDEM_75S_240M)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "240 m"),
    SourceEntry("lola_dem_80m", "LOLA 남극 DEM 80 m (LDEM_80S_80M)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "80 m"),
    SourceEntry("lola_dem_30m", "LOLA 남극 DEM 30 m 타일", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "30 m"),
    SourceEntry("lola_slope", "LOLA 경사 (80·240 m)", "real", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm", "80/240 m"),
    SourceEntry("pgda69", "PGDA 69 극지 조명 (장기 평균 일조·지구 가시·영구음영)", "real", "https://pgda.gsfc.nasa.gov/products/69", "60/120/240 m", "약 18.6년 평균 — 특정 날짜 값 아님"),
    SourceEntry("lola_psr_polygons", "LOLA 영구음영 폴리곤 (5 km² 이상, 593개)", "real", None, None, "얼음 가능성 지표 · 검출 아님"),
    SourceEntry("polar_plains", "극지 평원 지질도 (PolarPlains_Mapping)", "real", None, None, "매핑 범위 평사 ±304 km. 지질 단위이며 안전 판정 아님"),
    SourceEntry("shackleton_boulders", "섀클턴 바위 위치 (Gawronska & Boazman 2025)", "real", "https://data.mendeley.com/datasets/3nsyv65hz3/1", None, "섀클턴 연구 범위만, 좌표 QA 이상치 1점 제외"),
    SourceEntry("lroc_wac_ill", "LROC WAC 남극 실측 조명률 (PCT·시간가중 TWI)", "real", "https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH", "100 m", "88–90°S 만"),
    SourceEntry("lroc_wac_mosaic", "LROC WAC 643 nm 남극 여름 모자이크", "real", None, "100 m", "3D 남극 텍스처"),
    SourceEntry("lp_grs", "Lunar Prospector GRS (수소·FeO·TiO₂)", "real", None, "0.5°–2°", "해상도 거침. TiO₂ 는 2° 등면적 셀(약 60 km). 수소는 얼음 가능성 지표 · 검출 아님"),
    SourceEntry("kaguya_sp_lola", "Kaguya SP + LOLA v2 남극 FeO (Lemelin 외 2022)", "real", "https://doi.org/10.5281/zenodo.7108163", "1002 m", "모델 추정값, CC BY 4.0. 관측 수 0(보간) 칸 제외"),
    SourceEntry("jaxa_mi_tio2", "JAXA/ISAS DARTS Kaguya MI TiO₂ (공식 저해상도 내보내기)", "real", "https://vp.darts.isas.jaxa.jp/guide_en.html", "16 ppd (약 1.9 km)", "남극 고위도 정량 미검증 — 연구용 보기 전용. ISAS Data Policy"),
    SourceEntry("lroc_scarps", "LROC 극지 단층애 목록 (Watters 외 2015)", "real", None, None, "남쪽 점 12개. 점 자료라 단층선까지 거리보다 길게 나온다"),
    SourceEntry("bickel_rockfalls", "Bickel 외 2020 낙석 검출 (신뢰도 0.6)", "real", "https://doi.org/10.17617/3.OG927P", None, "80°S 이남은 검출 범위 밖 · CC BY 4.0"),
    SourceEntry("mission_evidence", "미션 필드 근거표 (NASA·JAXA·ISRO·운영사 공식 기록 대조)", "real", None, None, "필드별 근거 수준과 출처"),
    SourceEntry("wueller_2026", "Wueller 외 2026 착륙 후보점 (JGR Planets)", "real", "https://doi.org/10.5281/zenodo.17084058", None, "일부 아르테미스 후보 좌표 · CC BY 4.0, 공식 착륙점 아님"),
    SourceEntry("moon_trek", "NASA Moon Trek LOLA 색상 지형 타일", "real", "https://trek.nasa.gov/moon/", None, "3D 전구 텍스처 (원격)"),
    SourceEntry("nasa_svs_4720", "NASA SVS 4720 CGI Moon Kit", "real", "https://svs.gsfc.nasa.gov/4720/", None, "3D 텍스처 대체"),
    SourceEntry("drive_catalog", "팀 Drive 카탈로그 (공식 기록 대조본)", "real", None, None, "항목별 verified 확인"),
    SourceEntry("dsn", "NASA DSN 안테나 좌표·지평선 마스크", "real", None, None),
    SourceEntry("kari_kdsa", "KARI 여주 심우주 안테나 공개 자료", "real", None, None),
    SourceEntry("nasa_artemis_2024", "NASA 아르테미스 III 후보 지역 (2024-10-28)", "real", "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/", None, "지역 이름만 공개, 대표점은 카탈로그 출처"),
    SourceEntry("lander_specs", "착륙선 프리셋 (대표 유형)", "approx", None, None, "제원 근거표에 대응 행이 없어 데이터는 null. 화면은 근사값(PROVISIONAL)으로 시작"),
    SourceEntry("power_concepts", "기지 전력 개념 (NASA 자료)", "real", None, None),
]}
