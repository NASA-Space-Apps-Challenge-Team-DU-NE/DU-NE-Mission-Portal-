"""CLAUDE.md 7절 상수. web/src/core/constants.ts 와 같은 값."""

R_MOON_KM = 1737.4
R_MOON_M = R_MOON_KM * 1000.0
S0_W_M2 = 1361.0
R_SUN_KM = 695700.0
R_EARTH_KM = 6378.137
AU_KM = 149597870.7
SYNODIC_DAYS = 29.530588853
DARK_FRAC = 0.01

# 달 지리 좌표계 (pyproj 용, 구 반지름 1737.4 km)
MOON_GEOG_PROJ4 = "+proj=longlat +R=1737400 +no_defs +type=crs"
# 남극 방위 등거리 (격자 정의, ARCHITECTURE 5.4): x = ρ sinλ, y = ρ cosλ
MOON_SOUTH_AEQD_PROJ4 = "+proj=aeqd +lat_0=-90 +lon_0=0 +R=1737400 +units=m +no_defs +type=crs"
