"""하늘 상태 수식 (CLAUDE.md 8.2·8.3). web/src/core/sky.ts·horizon.ts 와 같은 수식 — 교차 테스트로 확인."""

from __future__ import annotations

import math

import numpy as np

from luna.constants import AU_KM, R_EARTH_KM, R_SUN_KM, S0_W_M2
from luna.geo.frames import local_frame


def horizon_at(mask_el, az_step: float, az):
    m = np.asarray(mask_el, dtype=float)
    n = m.size
    f = (np.asarray(az, dtype=float) % 360.0) / az_step
    i0 = np.floor(f).astype(int) % n
    i1 = (i0 + 1) % n
    w = f - np.floor(f)
    return m[i0] * (1 - w) + m[i1] * w


def disk_fraction(el, horizon, ang_radius):
    x = np.clip((np.asarray(el) - np.asarray(horizon)) / np.asarray(ang_radius), -1.0, 1.0)
    return 1.0 - (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / math.pi


def topocentric(lat: float, lon: float, elevation_m: float, observer_height_m: float, target_km):
    p, u, e, n = local_frame(lat, lon, elevation_m, observer_height_m)
    d = np.asarray(target_km, dtype=float) - p
    dist = np.linalg.norm(d, axis=-1)
    dh = d / dist[..., None]
    az = np.degrees(np.arctan2(dh @ e, dh @ n)) % 360.0
    el = np.degrees(np.arcsin(np.clip(dh @ u, -1, 1)))
    return az, el, dist


def sky_state(lat, lon, elevation_m, observer_height_m, mask_el, az_step, sun_km, earth_km, margin_deg):
    saz, sel, sd = topocentric(lat, lon, elevation_m, observer_height_m, sun_km)
    eaz, eel, ed = topocentric(lat, lon, elevation_m, observer_height_m, earth_km)
    sr = np.degrees(np.arcsin(R_SUN_KM / sd))
    er = np.degrees(np.arcsin(np.minimum(1.0, R_EARTH_KM / ed)))
    hs = horizon_at(mask_el, az_step, saz)
    he = horizon_at(mask_el, az_step, eaz)
    frac = disk_fraction(sel, hs, sr)
    S = S0_W_M2 * (AU_KM / sd) ** 2 * frac
    return {
        "sun_az_deg": saz, "sun_el_deg": sel, "sun_ang_radius_deg": sr,
        "earth_az_deg": eaz, "earth_el_deg": eel, "earth_ang_radius_deg": er,
        "sun_frac": frac, "earth_visible": eel > he + margin_deg,
        "irr_horizontal_w_m2": S * np.maximum(0, np.sin(np.radians(sel))),
        "irr_vertical_w_m2": S * np.maximum(0, np.cos(np.radians(sel))),
    }


def body_vector(sub_lon_deg, sub_lat_deg, dist_km):
    p = np.radians(sub_lat_deg)
    l = np.radians(sub_lon_deg)
    d = np.asarray(dist_km, dtype=float)
    return np.stack([d * np.cos(p) * np.cos(l), d * np.cos(p) * np.sin(l), d * np.sin(p)], axis=-1)
