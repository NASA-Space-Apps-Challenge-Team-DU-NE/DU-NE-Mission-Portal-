"""Read-only NASA source adapters used during static preprocessing, never at runtime."""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import spiceypy as spice

PROJECT = Path(__file__).resolve().parents[1]
R_MOON_M = 1737400.0


def config():
    return json.loads((PROJECT / "data/config.json").read_text(encoding="utf-8"))


def label_value(text, key):
    match = re.search(r"^\s*" + re.escape(key) + r"\s*=\s*([^\r\n]+)", text, re.M)
    if not match:
        raise ValueError(f"Missing PDS key: {key}")
    value = match.group(1).split("<")[0].strip().strip('"').strip("'")
    try:
        return float(value)
    except ValueError:
        return value


class LolaTerrain:
    """LOLA southern polar DEM, original pixels with bilinear interpolation.

    PDS one-based sample/line map to zero-based col/row by subtracting 1.
    The pole lies between the four central pixels for even-sized images.
    Elevation is DN*0.5, and radius is 1737400 + elevation; no geoid added.
    """

    def __init__(self, image_path=None, label_path=None):
        cfg = config()["dem"]
        self.image_path = Path(image_path or cfg["image"])
        self.label_path = Path(label_path or cfg["label"])
        self.label = self.label_path.read_text(encoding="ascii")
        val = lambda key: label_value(self.label, key)
        for key, expected in (("SAMPLE_TYPE", "LSB_INTEGER"), ("SAMPLE_BITS", 16),
                              ("MAP_PROJECTION_TYPE", "POLAR STEREOGRAPHIC"),
                              ("CENTER_LATITUDE", -90), ("POSITIVE_LONGITUDE_DIRECTION", "EAST")):
            if val(key) != expected:
                raise ValueError(f"Unsupported {key}: {val(key)}")
        self.rows = int(val("LINES"))
        self.cols = int(val("LINE_SAMPLES"))
        self.pixel_m = val("MAP_SCALE")
        self.scale_m = val("SCALING_FACTOR")
        self.reference_radius_m = val("OFFSET")
        self.row0 = val("LINE_PROJECTION_OFFSET")
        self.col0 = val("SAMPLE_PROJECTION_OFFSET")
        self.lon0 = val("CENTER_LONGITUDE")
        self.maximum_latitude = val("MAXIMUM_LATITUDE")
        self.minimum_latitude = val("MINIMUM_LATITUDE")
        if self.image_path.stat().st_size != self.rows * self.cols * 2:
            raise ValueError("DEM is truncated or size differs from PDS label")
        self.dn = np.memmap(self.image_path, dtype="<i2", mode="r", shape=(self.rows, self.cols))

    def latlon_to_pixel(self, lat, lon):
        lat, lon = np.asarray(lat), np.asarray(lon)
        rho = 2 * self.reference_radius_m * np.tan(np.radians(90 + lat) / 2)
        angle = np.radians(lon - self.lon0)
        return self.row0 - rho * np.cos(angle) / self.pixel_m, self.col0 + rho * np.sin(angle) / self.pixel_m

    def pixel_to_latlon(self, row, col):
        x = (np.asarray(col) - self.col0) * self.pixel_m
        y = (self.row0 - np.asarray(row)) * self.pixel_m
        return np.degrees(2 * np.arctan(np.hypot(x, y) / (2 * self.reference_radius_m))) - 90, np.degrees(np.arctan2(x, y)) + self.lon0

    def elevations(self, lat, lon):
        lat, lon = np.broadcast_arrays(np.asarray(lat, float), np.asarray(lon, float))
        row, col = self.latlon_to_pixel(lat, lon)
        valid = (np.isfinite(lat) & np.isfinite(lon) & (lat >= self.minimum_latitude) &
                 (lat <= self.maximum_latitude) & (row >= 0) & (col >= 0) &
                 (row < self.rows - 1) & (col < self.cols - 1))
        out = np.full(lat.shape, np.nan)
        rr, cc = np.floor(row[valid]).astype(int), np.floor(col[valid]).astype(int)
        fr, fc = row[valid] - rr, col[valid] - cc
        cells = np.stack([self.dn[rr, cc], self.dn[rr, cc + 1], self.dn[rr + 1, cc], self.dn[rr + 1, cc + 1]]).astype(float)
        weights = np.stack([(1 - fr) * (1 - fc), (1 - fr) * fc, fr * (1 - fc), fr * fc])
        vals = np.sum(cells * weights, axis=0) * self.scale_m
        vals[np.any(cells == -32768, axis=0)] = np.nan
        out[valid] = vals
        return out

    def elevation(self, lat, lon):
        result = float(self.elevations(lat, lon))
        return result if np.isfinite(result) else None

    def roi(self, lat, lon, size_km=30, resolution=65):
        row, col = self.latlon_to_pixel(lat, lon)
        delta = np.linspace(-size_km * 500 / self.pixel_m, size_km * 500 / self.pixel_m, resolution)
        cols, rows = np.meshgrid(col + delta, row + delta)
        la, lo = self.pixel_to_latlon(rows, cols)
        elev = self.elevations(la, lo)
        if not np.all(np.isfinite(elev)):
            return {"status": "TERRAIN DATA UNAVAILABLE"}
        la, lo = np.radians(la), np.radians(lo)
        rad = self.reference_radius_m + elev
        xyz = np.stack([rad * np.cos(la) * np.cos(lo), rad * np.cos(la) * np.sin(lo), rad * np.sin(la)], axis=-1)
        indices = []
        for i in range(resolution - 1):
            for j in range(resolution - 1):
                a = i * resolution + j
                indices.extend([a, a + resolution, a + 1, a + 1, a + resolution, a + resolution + 1])
        return {"status": "AVAILABLE", "positions_m": xyz.reshape(-1, 3).tolist(), "indices": indices,
                "width": resolution, "height": resolution, "source": "NASA LOLA LDEM_75S_240M V2.0",
                "coordinate_frame": "MOON_ME", "vertical_exaggeration": 1, "grid_spacing_m": self.pixel_m}


class SpiceFrames:
    """SPICE state transformations; every external state uses metres and m/s."""

    def __init__(self, kernel_dir=None):
        self.kernel_dir = Path(kernel_dir or config()["kernel_dir"])
        self.kernels = ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
        for name in self.kernels:
            spice.furnsh(str(self.kernel_dir / name))
        self.fixed_frame = "MOON_ME"
        self.resolved_frame = str(spice.gcpool("TKFRAME_31001_RELATIVE", 0, 1)[0])
        if self.resolved_frame != "MOON_ME_DE440_ME421":
            raise ValueError(f"Unexpected lunar frame alias: {self.resolved_frame}")
        spk = spice.spkcov(str(self.kernel_dir / "de440s.bsp"), 301)
        pck = spice.pckcov(str(self.kernel_dir / "moon_pa_de440_200625.bpc"), 31008)
        self.coverage_start = max(float(spk[0]), float(pck[0]))
        self.coverage_end = min(float(spk[-1]), float(pck[-1]))

    def ensure_coverage(self, et):
        if not self.coverage_start <= et <= self.coverage_end:
            raise ValueError("SPICE date outside loaded kernel coverage")

    def utc_to_et(self, utc):
        et = float(spice.str2et(utc))
        self.ensure_coverage(et)
        return et

    def et_to_utc(self, et):
        self.ensure_coverage(et)
        return spice.et2utc(et, "ISOC", 6) + "Z"

    def sxform(self, et, inverse=False):
        self.ensure_coverage(et)
        return spice.sxform("J2000" if inverse else self.fixed_frame, self.fixed_frame if inverse else "J2000", et)

    def fixed_to_inertial(self, state6, et):
        return self.sxform(et) @ np.asarray(state6, float)

    def inertial_to_fixed(self, state6, et):
        return self.sxform(et, inverse=True) @ np.asarray(state6, float)

    def target_state(self, lat_deg, lon_deg, elevation_m, et):
        lat, lon = np.radians([lat_deg, lon_deg])
        r = R_MOON_M + elevation_m
        return self.fixed_to_inertial([r * np.cos(lat) * np.cos(lon), r * np.cos(lat) * np.sin(lon), r * np.sin(lat), 0, 0, 0], et)

    def info(self):
        return {"fixed_frame": self.fixed_frame, "resolved_frame": self.resolved_frame,
                "inertial_frame": "J2000", "coverage_utc": [self.et_to_utc(self.coverage_start), self.et_to_utc(self.coverage_end)],
                "time_standard": "ET/TDB seconds past J2000; UTC converted by NAIF LSK", "state_units": ["m", "m/s"]}
