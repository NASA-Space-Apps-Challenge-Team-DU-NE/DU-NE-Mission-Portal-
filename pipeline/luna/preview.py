"""확인용 PNG (build/preview/). 사람이 눈으로 지형·마스크·레이어를 확인하는 용도."""

from __future__ import annotations

from pathlib import Path

import numpy as np


def save_gray(arr: np.ndarray, path: Path, lo: float | None = None, hi: float | None = None) -> Path:
    from PIL import Image

    a = np.asarray(arr, dtype=float)
    fin = np.isfinite(a)
    if not fin.any():
        a = np.zeros_like(a)
        fin = np.ones_like(a, bool)
    lo = np.nanpercentile(a[fin], 1) if lo is None else lo
    hi = np.nanpercentile(a[fin], 99) if hi is None else hi
    g = np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1)
    img = np.where(fin, (g * 255).astype(np.uint8), 0).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(path)
    return path


def save_mask_plot(az: np.ndarray, el: np.ndarray, path: Path, ref: np.ndarray | None = None, width: int = 1080, height: int = 240) -> Path:
    """지평선 마스크 그림 (회색 = 우리 계산, 빨강 = Drive 대조 마스크)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), (247, 249, 248))
    d = ImageDraw.Draw(img)
    vals = np.concatenate([el, ref if ref is not None else el])
    lo, hi = float(np.floor(np.nanmin(vals) - 1)), float(np.ceil(np.nanmax(vals) + 1))

    def pt(a, e):
        return (a / 360.0 * (width - 1), (1 - (e - lo) / (hi - lo)) * (height - 1))

    d.line([pt(a, e) for a, e in zip(az, el)], fill=(18, 33, 43), width=2)
    if ref is not None:
        raz = np.linspace(0, 360, ref.size, endpoint=False)
        d.line([pt(a, e) for a, e in zip(raz, ref)], fill=(201, 100, 87), width=1)
    y0 = pt(0, 0)[1]
    d.line([(0, y0), (width, y0)], fill=(46, 139, 131), width=1)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path
