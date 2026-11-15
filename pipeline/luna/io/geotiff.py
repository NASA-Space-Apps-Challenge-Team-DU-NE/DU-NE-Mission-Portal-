"""GeoTIFF·VRT 읽기 (rasterio·pyproj 필요, 지연 import). 좌표 변환은 pyproj 로 달 위경도 ↔ 파일 CRS."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

import numpy as np

from luna.constants import MOON_GEOG_PROJ4


def band_scale(ds, band: int = 1) -> tuple[float, float]:
    """GDAL 밴드 배율·오프셋 (값 = DN·scale + offset). PGDA69 GeoTIFF 는 int16 + 배율이다
    (예: 일조율 scale 4e-5, 하늘 입체각 scale 2e-4·offset 6.2832). 없으면 (1, 0)."""
    s = ds.scales[band - 1] if ds.scales else None
    o = ds.offsets[band - 1] if ds.offsets else None
    return (1.0 if s in (None, 0) else float(s)), (0.0 if o is None else float(o))


def _transformer(crs, inverse: bool = False):
    from pyproj import CRS, Transformer

    geog = CRS.from_proj4(MOON_GEOG_PROJ4)
    return Transformer.from_crs(crs, geog, always_xy=True) if inverse else Transformer.from_crs(geog, crs, always_xy=True)


class GeoTiffSampler:
    """관측점 주변 창만 읽는 쌍선형 표본기 (30 m 타일·VRT 용). 범위 밖 NaN."""

    def __init__(self, path: Path, center_lat: float, center_lon: float, radius_km: float, band: int = 1, to_meters: float = 1.0):
        import rasterio
        from rasterio.windows import Window

        self.ds = rasterio.open(path)
        self.fwd = _transformer(self.ds.crs)
        from luna.geo.frames import destination

        lats, lons = destination(center_lat, center_lon, np.arange(0, 360, 15), np.full(24, radius_km))
        xs, ys = self.fwd.transform(np.append(lons, center_lon), np.append(lats, center_lat))
        inv = ~self.ds.transform
        cols, rows = zip(*[inv * (x, y) for x, y in zip(xs, ys)])
        c0 = max(0, int(np.floor(min(cols))) - 2)
        r0 = max(0, int(np.floor(min(rows))) - 2)
        c1 = min(self.ds.width, int(np.ceil(max(cols))) + 2)
        r1 = min(self.ds.height, int(np.ceil(max(rows))) + 2)
        self.r0, self.c0 = r0, c0
        if c1 <= c0 or r1 <= r0:
            self.arr = np.zeros((0, 0))
        else:
            a = self.ds.read(band, window=Window(c0, r0, c1 - c0, r1 - r0), masked=True).astype(np.float64)
            sc, of = band_scale(self.ds, band)
            self.arr = (np.where(np.ma.getmaskarray(a), np.nan, a.filled(np.nan)) * sc + of) * to_meters
        self.inv = inv

    def __call__(self, lat, lon) -> np.ndarray:
        xs, ys = self.fwd.transform(np.asarray(lon, float), np.asarray(lat, float))
        a, b, c, d, e, f = self.inv.a, self.inv.b, self.inv.c, self.inv.d, self.inv.e, self.inv.f
        col = a * xs + b * ys + c - 0.5 - self.c0  # 픽셀 중심 기준
        row = d * xs + e * ys + f - 0.5 - self.r0
        out = np.full(np.shape(col), np.nan)
        if self.arr.size == 0:
            return out
        r0 = np.floor(row).astype(np.int64)
        c0 = np.floor(col).astype(np.int64)
        ok = (r0 >= 0) & (c0 >= 0) & (r0 < self.arr.shape[0] - 1) & (c0 < self.arr.shape[1] - 1)
        if ok.any():
            rr, cc, fr, fc = r0[ok], c0[ok], row[ok] - r0[ok], col[ok] - c0[ok]
            A = self.arr
            out[ok] = A[rr, cc] * (1 - fr) * (1 - fc) + A[rr + 1, cc] * fr * (1 - fc) + A[rr, cc + 1] * (1 - fr) * fc + A[rr + 1, cc + 1] * fr * fc
        return out


def iter_blocks(path: Path, band: int = 1, rows_per_block: int = 1024) -> Iterator[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """래스터를 행 묶음으로 읽어 (값, 위도, 경도) 를 내보낸다 (칸 집계용)."""
    import rasterio
    from rasterio.windows import Window

    with rasterio.open(path) as ds:
        inv = _transformer(ds.crs, inverse=True)
        T = ds.transform
        nod = ds.nodata
        sc, of = band_scale(ds, band)
        cols = np.arange(ds.width) + 0.5
        for r0 in range(0, ds.height, rows_per_block):
            h = min(rows_per_block, ds.height - r0)
            a = ds.read(band, window=Window(0, r0, ds.width, h)).astype(np.float64)
            if nod is not None:
                a[a == nod] = np.nan
            a = a * sc + of
            rows = np.arange(r0, r0 + h) + 0.5
            C, R = np.meshgrid(cols, rows)
            X = T.a * C + T.b * R + T.c
            Y = T.d * C + T.e * R + T.f
            lon, lat = inv.transform(X, Y)
            yield a, np.asarray(lat), np.asarray(lon)


def read_downsampled(path: Path, out_shape: tuple[int, int], band: int = 1):
    import rasterio
    from rasterio.enums import Resampling

    with rasterio.open(path) as ds:
        sc, of = band_scale(ds, band)
        a = ds.read(band, out_shape=out_shape, resampling=Resampling.average, masked=True).astype(np.float64)
        a = np.where(np.ma.getmaskarray(a), np.nan, a.filled(np.nan)) * sc + of
        return a, ds.crs, ds.transform, ds.shape


class VrtTiles:
    """GDAL VRT(SimpleSource 타일 모음)를 rasterio 없이 읽는다 (LOLA 30 m 남극 타일용).

    - 타일은 Pillow 로 연다 (float32 TIFF). 최근에 쓴 타일 몇 장만 메모리에 둔다.
    - read(r0, r1, c0, c1): VRT 전체 화소 좌표 [r0, r1) × [c0, c1) 창. 없는 곳은 NaN.
    - 좌표계 확인(SRS 문자열)은 호출하는 쪽이 한다 (CLAUDE.md 4.6 규칙 3).
    """

    def __init__(self, vrt: Path, cache_tiles: int = 4):
        import xml.etree.ElementTree as ET

        root = ET.parse(vrt).getroot()
        self.path = vrt
        self.width, self.height = int(root.get("rasterXSize")), int(root.get("rasterYSize"))
        self.srs = (root.findtext("SRS") or "").strip()
        self.transform = [float(x) for x in (root.findtext("GeoTransform") or "").split(",")]
        band = root.find("VRTRasterBand")
        nd = band.findtext("NoDataValue") if band is not None else None
        self.nodata = None if nd in (None, "", "nan", "NaN") else float(nd)
        self.sources = []
        for s in band.findall("SimpleSource") if band is not None else []:
            fn = s.find("SourceFilename")
            p = (vrt.parent / fn.text) if fn.get("relativeToVRT", "0") == "1" else Path(fn.text)
            src, dst = s.find("SrcRect").attrib, s.find("DstRect").attrib
            self.sources.append((p, {k: int(float(v)) for k, v in src.items()}, {k: int(float(v)) for k, v in dst.items()}))
        self._cache: dict[Path, np.ndarray] = {}
        self._order: list[Path] = []
        self._max = cache_tiles

    def _tile(self, p: Path) -> np.ndarray:
        if p not in self._cache:
            from PIL import Image

            Image.MAX_IMAGE_PIXELS = None
            with Image.open(p) as im:
                a = np.asarray(im, dtype=np.float32)
            if self.nodata is not None:
                a = np.where(a == self.nodata, np.nan, a)
            self._cache[p] = a
            self._order.append(p)
            while len(self._order) > self._max:
                self._cache.pop(self._order.pop(0), None)
        return self._cache[p]

    def read(self, r0: int, r1: int, c0: int, c1: int) -> np.ndarray:
        out = np.full((r1 - r0, c1 - c0), np.nan, dtype=np.float32)
        for p, src, dst in self.sources:
            dr0, dc0 = dst["yOff"], dst["xOff"]
            dr1, dc1 = dr0 + dst["ySize"], dc0 + dst["xSize"]
            a0, a1, b0, b1 = max(r0, dr0), min(r1, dr1), max(c0, dc0), min(c1, dc1)
            if a0 >= a1 or b0 >= b1:
                continue
            t = self._tile(p)
            sr, sc = src["yOff"] - dr0, src["xOff"] - dc0
            out[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = t[a0 + sr:a1 + sr, b0 + sc:b1 + sc]
        return out
