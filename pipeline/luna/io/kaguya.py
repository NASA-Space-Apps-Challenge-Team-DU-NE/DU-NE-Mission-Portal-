"""Kaguya SP + LOLA v2 남극 격자 원본 ZIP 어댑터 (Lemelin, Lucey & Camon 2022, Zenodo 7108163, CC BY 4.0).

원본 TIFF 에는 CRS·변환이 없다. 좌표는 ZIP 안 `.tif.aux.xml` 의 ESRI 기준점 4개에서 읽는다 (작업 5 "함정").
- 기준점의 픽셀 좌표는 TIFF 해상도 태그(XResolution=100 px/inch)로 나뉜 값(25.29)이다 → ×해상도 = 픽셀(2529).
- ESRI 원본 기준점은 영상 좌하단이 원점이다 (y 가 위로 증가). IDL 이 아래 행부터 쓴 TIFF 라서
  TIFF 0행 = 남쪽 끝(평면 Y 최소). north-up 으로 쓰려면 행을 뒤집는다.
- FeO 의 −10 은 결측 표식 (공식 NoData 태그 없음). 관측 수 0 칸은 저자 보간이므로 값으로 쓰지 않는다.
이 모듈은 정규화된 COG 와 독립적으로 원본을 해석해서, 둘이 같은 자리·같은 값을 내는지 확인하는 데 쓴다.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

FEO_MISSING = -10.0


@dataclass
class RawGrid:
    data: np.ndarray            # north-up (0행 = 평면 Y 최대)
    x0_m: float                 # 왼쪽 위 모서리 X
    y0_m: float                 # 왼쪽 위 모서리 Y
    cell_m: float
    wkt: str
    gcps: list[tuple[float, float, float, float]]   # (pixel, line, X, Y) 픽셀 단위로 환산한 값
    flipped: bool


def _parse_aux(xml: str) -> tuple[list[tuple[float, float]], list[tuple[float, float]], str]:
    src = [float(v) for v in re.findall(r"<SourceGCPs[^>]*>(.*?)</SourceGCPs>", xml, re.S)[0].split("<Double>")[1:] for v in [v.split("</Double>")[0]]]
    tgt = [float(v) for v in re.findall(r"<TargetGCPs[^>]*>(.*?)</TargetGCPs>", xml, re.S)[0].split("<Double>")[1:] for v in [v.split("</Double>")[0]]]
    wkt = re.findall(r"<WKT>(.*?)</WKT>", xml, re.S)[0]
    return list(zip(src[0::2], src[1::2])), list(zip(tgt[0::2], tgt[1::2])), wkt


def read_raw_zip(path: Path) -> RawGrid:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    with zipfile.ZipFile(path) as z:
        tif = next(n for n in z.namelist() if n.lower().endswith((".tif", ".tiff")))
        aux = next(n for n in z.namelist() if n.lower().endswith(".aux.xml"))
        im = Image.open(io.BytesIO(z.read(tif)))
        res = float(im.tag_v2.get(282, 1.0))   # XResolution
        arr = np.array(im, dtype=np.float32)
        src, tgt, wkt = _parse_aux(z.read(aux).decode("utf-8", "replace"))
    if "Stereographic_South_Pole" not in wkt or "1737400" not in wkt:
        raise ValueError(f"{path.name}: 기준점 좌표계가 달 남극 평사도법(R=1737.4 km)이 아니다")
    n_rows, n_cols = arr.shape
    gcps = []
    for (sx, sy), (X, Y) in zip(src, tgt):
        # ESRI 영상 좌표: 좌하단 원점, y 위로 증가 → TIFF 행 번호 line = 행 수 − y
        px, line = sx * res, n_rows - sy * res
        gcps.append((px, line, X, Y))
    # 1차 다항식(아핀) 적합: X = a·px + b, Y = c·line + d
    P = np.array([g[0] for g in gcps]); Q = np.array([g[1] for g in gcps])
    Xs = np.array([g[2] for g in gcps]); Ys = np.array([g[3] for g in gcps])
    a, b = np.polyfit(P, Xs, 1)
    c, d = np.polyfit(Q, Ys, 1)
    # 기준점의 끝값(2529)이 픽셀 모서리라고 보면 칸 크기 = 범위/칸 수
    cell_x = (Xs.max() - Xs.min()) / n_cols
    cell_y = (Ys.max() - Ys.min()) / n_rows
    if abs(cell_x - cell_y) > 1e-6 or abs(abs(a) - cell_x) > 1e-6:
        raise ValueError(f"{path.name}: 기준점 해석이 정사각 격자와 맞지 않는다 (a={a}, cell={cell_x},{cell_y})")
    # 행이 내려갈수록 Y 가 커지면(c>0) TIFF 0행은 남쪽 끝 → north-up 으로 뒤집는다.
    flipped = c > 0
    data = arr[::-1].copy() if flipped else arr
    return RawGrid(data, float(Xs.min()), float(Ys.max()), float(cell_x), wkt, gcps, flipped)


def feo_values(raw: RawGrid, counts: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """FeO wt% (−10 → NaN). counts 가 있으면 관측 수 0 칸(보간)도 NaN. 반환: (값, 품질 코드: 0 없음·1 사용·4 보간)."""
    v = raw.data.astype(np.float64)
    q = np.where(np.isclose(v, FEO_MISSING) | ~np.isfinite(v), 0, 1).astype(np.uint8)
    if counts is not None:
        q = np.where((q == 1) & ~(counts > 0), 4, q).astype(np.uint8)
    return np.where(q == 1, v, np.nan), q
