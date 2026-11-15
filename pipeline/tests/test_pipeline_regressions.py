"""R09–R14: 캐시 복구, 실제 의존성, 배포 계약, 결측 실패와 입력 추적."""

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from luna.config import GridConfig, Settings
from luna.contracts import Provenance, ValidationResult
from luna.geo.polar import GridSpec
from luna.io import geotiff
from luna.paths import DataDir
from luna.provenance import sha256_file
from luna.quality import QualityIndex
from luna.stages import s20_terrain as terrain, s40_grid as grid, s50_layers as layers, s75_local as local, s80_validation as validation, s90_manifest as manifest
from luna.stages.common import Ctx


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


@pytest.fixture
def ctx(tmp_path):
    raw = tmp_path / "drive"
    raw.mkdir()
    settings = Settings(raw, tmp_path / "out", tmp_path / "build", tmp_path / "cache",
                        grid=GridConfig(cell_km=5, lat_limit_deg=-89.8, az_step_deg=90))
    return Ctx(settings, DataDir(raw), QualityIndex([]))


def fixture_prov(path, role, **kwargs):
    return Provenance(str(path), sha256_file(path), "REVIEW_REQUIRED", role,
                      source_crs=kwargs.get("source_crs"))


def make_vrt(ctx):
    vrt = ctx.data.root / "SouthPolar_75S_90S_v1/Regional/Terrain_30m/fixture.vrt"
    tile = vrt.parent / "nested" / "fixture.tif"
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"first")
    vrt.write_text('<VRTDataset><VRTRasterBand><SimpleSource><SourceFilename relativeToVRT="1">nested/fixture.tif</SourceFilename></SimpleSource></VRTRasterBand></VRTDataset>')
    return vrt, tile


def test_s20_restores_build_metadata_and_records_crs(ctx, monkeypatch):
    raw = ctx.data.root / "Raw_Data/LOLA_DEM"
    raw.mkdir(parents=True)
    for name in ("ldem_75s_240m.lbl", "ldem_75s_240m.img"):
        (raw / name).write_bytes(b"fixture")
    reads = []

    def read(*args):
        reads.append(args)
        return SimpleNamespace(data=np.zeros((16, 16)), scale=1, crs=SimpleNamespace(summary=lambda: "verified fixture CRS"))

    monkeypatch.setattr(terrain, "read_pds_image", read)
    monkeypatch.setattr(terrain, "PolarPdsSampler", lambda im: None)
    monkeypatch.setattr(terrain, "_roundtrip_error_km", lambda s: 0)
    monkeypatch.setattr(ctx, "prov", fixture_prov)
    assert terrain.run(ctx) == 0
    meta = ctx.build / "terrain/meta.json"
    assert all(p["source_crs"] == "verified fixture CRS" for p in json.loads(meta.read_text())["provenance"])
    assert terrain.run(ctx) == 0 and len(reads) == 1
    meta.unlink()
    assert terrain.run(ctx) == 0 and meta.exists() and len(reads) == 2


def test_local_dependencies_and_retained_files(ctx, monkeypatch):
    vrt, tile = make_vrt(ctx)
    dump(ctx.data.root / "Catalogs/sites.json", [{"id": sid, "name": sid, "lat_deg": -89.9, "lon_deg": 0} for sid in ("a", "b")])
    assert geotiff.vrt_dependencies(vrt) == sorted([vrt.resolve(), tile.resolve()])
    monkeypatch.setattr(geotiff, "VrtTiles", lambda p: SimpleNamespace(srs="fixture"))
    monkeypatch.setattr(local, "check_polar_srs", lambda s: "fixture CRS")
    monkeypatch.setattr(local, "SIZE_PX", 8)
    monkeypatch.setattr(ctx, "prov", fixture_prov)
    samples = []

    def sample(vrt, lat, lon):
        samples.append(1)
        return np.ones_like(lat) * (1 if tile.read_bytes() == b"first" else 2)

    monkeypatch.setattr(local, "sample_vrt", sample)
    assert local.run(ctx) == 0
    ctx.only = ["a"]
    assert local.run(ctx) == 0
    count = len(samples)
    assert local.run(ctx) == 0 and len(samples) == count
    tile.write_bytes(b"second-changed")
    assert local.run(ctx) == 0 and len(samples) == count + 1
    records = json.loads((ctx.out / "local/local.json").read_text(encoding="utf-8"))["data"]["sites"]
    assert records["a"]["elev_center_m"] == 2 and "b" in records
    (ctx.out / "local/b.jpg").unlink()
    assert local.run(ctx) == 0 and len(samples) == count + 2
    assert "b" not in json.loads((ctx.out / "local/local.json").read_text(encoding="utf-8"))["data"]["sites"]
    # fallback 80 m 값 변경도 VRT 변경 없이 다시 계산한다.
    label, image = ctx.data.root / "80.lbl", ctx.build / "80.img"
    label.write_bytes(b"label")
    image.write_bytes(b"first")
    dump(ctx.build / "terrain/meta.json", {"dem80": {"label": str(label), "image": str(image)}, "provenance": []})
    monkeypatch.setattr("luna.terrain.Terrain", lambda p: SimpleNamespace(dem80=lambda lat, lon: np.ones_like(lat)))
    assert local.run(ctx) == 0
    count = len(samples)
    image.write_bytes(b"second-image")
    assert local.run(ctx) == 0 and len(samples) == count + 1


def test_grid_all_missing_fails_without_publishing(ctx, monkeypatch):
    dump(ctx.build / "terrain/meta.json", {"provenance": []})
    monkeypatch.setattr(grid, "_init", lambda *a: None)

    def missing(job):
        lat = job[0]
        return np.zeros((len(lat), 4), dtype=np.int16), np.full(len(lat), np.nan), np.zeros(len(lat), bool)

    monkeypatch.setattr(grid, "_chunk", missing)
    assert grid.run(ctx) == 1
    assert not (ctx.out / "grid/manifest.json").exists()
    assert not (ctx.build / "s40/.stamp").exists()


def test_lp_tio2_without_2deg_rows_is_optional(ctx):
    p = ctx.data.root / "Raw_Data/NASA_Gap_Collection_2026-11-14/Polar_Science/LP_GRS_TiO2_native_75S90S.csv"
    p.parent.mkdir(parents=True)
    p.write_text("grid_deg,south_deg,north_deg,west_deg,east_deg,TiO2_wt_pct,TiO2_1sigma_wt_pct\n5,-90,-85,-180,180,2,0.3\n")
    spec = GridSpec(5, -89.8)
    binner = layers.Binner(spec, spec.cell_indices())
    report = {}
    assert layers.lp_tio2(ctx, binner, report) == []
    assert report["tio2_lp"]["reason"] == "no_2deg_rows"
    assert report["tio2_lp"]["grid_cells_without_2deg_cell"] == binner.n_cells


def valid_deployment(out):
    def env(rel, data):
        dump(out / rel, {"schema": manifest.REQUIRED_JSON[rel], "kind": "real", "quality": "VALIDATED", "data": data})

    for rel in manifest.REQUIRED_JSON:
        if rel.startswith("catalog/"):
            env(rel, [{"id": "fixture", "name": "Fixture", "lat_deg": -89, "lon_deg": 0}])
    env("ephemeris/range.json", {"count": 2, "step_h": 1, "start_utc": "2026-01-01T00:00:00Z", "frame": "MOON_ME", "bodies": ["sun", "earth"], "bin": "range.bin"})
    np.tile([0, 0, 100], 4).astype("<f4").tofile(out / "ephemeris/range.bin")
    env("grid/manifest.json", {"n_cells": 1, "nx": 1, "ny": 1, "projection": "AEQD south pole", "cell_km": 5,
                               "x0_km": -2.5, "y0_km": 2.5, "lat_limit_deg": -75, "observer_height_m": 2, "cells": "cells.u32",
                               "horizon": {"file": "horizon.i16", "n_az": 4, "az_step_deg": 90, "scale": .01}})
    np.array([0], "<u4").tofile(out / "grid/cells.u32")
    np.zeros(4, "<i2").tofile(out / "grid/horizon.i16")
    lm = []
    (out / "grid/layers").mkdir()
    for name in sorted(manifest.REQUIRED_LAYERS):
        np.array([1], "<f4").tofile(out / "grid/layers" / f"{name}.f32")
        lm.append({"name": name, "file": f"layers/{name}.f32", "quality": "VALIDATED", "kind": "real", "coverage": {"valid_cells": 1}})
    env("grid/layers.json", lm)


@pytest.mark.parametrize("case", ["empty_eph", "empty_grid", "empty_layers", "blocked_layer", "missing_layer", "zero_cells", "bad_shape", "bad_quality_shape", "bad_count", "missing_binary", "nan_eph", "outside_cells", "nan_required", "missing_mission"])
def test_manifest_rejects_incomplete_payloads(ctx, monkeypatch, case):
    valid_deployment(ctx.out)
    assert manifest.check_complete(ctx.out) == []
    paths = {"eph": "ephemeris/range.json", "grid": "grid/manifest.json", "layers": "grid/layers.json"}
    docs = {k: json.loads((ctx.out / rel).read_text()) for k, rel in paths.items()}
    if case.startswith("empty_"):
        k = case[6:]
        docs[k]["data"] = [] if k == "layers" else {}
    elif case == "blocked_layer":
        docs["layers"]["data"][0]["quality"] = "VALIDATION_FAILED"
    elif case == "missing_layer":
        docs["layers"]["data"].pop()
    elif case == "zero_cells":
        docs["grid"]["data"]["n_cells"] = 0
    elif case == "bad_shape":
        docs["layers"]["data"] = [None, "text", {}]
    elif case == "bad_quality_shape":
        docs["layers"]["quality"] = []
        docs["layers"]["data"][0]["quality"] = {}
    elif case == "bad_count":
        docs["eph"]["data"]["count"] = "garbage"
    elif case == "missing_binary":
        (ctx.out / "grid/horizon.i16").unlink()
    elif case == "nan_eph":
        np.full(12, np.nan, "<f4").tofile(ctx.out / "ephemeris/range.bin")
    elif case == "outside_cells":
        np.array([2], "<u4").tofile(ctx.out / "grid/cells.u32")
    elif case == "nan_required":
        np.array([np.nan], "<f4").tofile(ctx.out / "grid" / docs["layers"]["data"][0]["file"])
    elif case == "missing_mission":
        p = ctx.out / "catalog/missions.json"
        m = json.loads(p.read_text())
        m["data"][0]["ephemeris"] = "ephemeris/missions/missing.json"
        dump(p, m)
    for k, rel in paths.items():
        dump(ctx.out / rel, docs[k])
    monkeypatch.setattr(manifest, "REPO_ROOT", ctx.build)
    assert manifest.run(ctx) == 1
    result = json.loads((ctx.out / "manifest.json").read_text(encoding="utf-8"))
    assert not result["complete_ok"] and result["problems"]


def test_validation_provenance_tracks_actual_inputs_and_inherits_sources(ctx, monkeypatch):
    source = ctx.data.root / "reference.csv"
    source.write_text("original reference")
    derived = ctx.out / "masks/site.json"
    pv = Provenance("raw/original.img", "a" * 64, "REVIEW_REQUIRED", "dem", "verified CRS")
    dump(derived, {"quality": "REVIEW_REQUIRED", "provenance": [pv.__dict__], "data": {}})

    def compare(ctx):
        ctx.record_input(source, "comparison_reference")
        ctx.record_input(derived, "comparison_artifact")
        return [ValidationResult("fixture", 1, 0, 0, None, 0, {}, [], True, 1)]

    monkeypatch.setattr(validation, "v_ephemeris", compare)
    for name in ("v_masks", "v_illumination", "v_pa_me", "v_mast_jpl", "v_wueller"):
        monkeypatch.setattr(validation, name, lambda ctx: [])
    monkeypatch.setattr(validation, "write_docs", lambda _: None)
    assert validation.run(ctx) == 0
    result = json.loads((ctx.out / "validation/ephemeris.json").read_text(encoding="utf-8"))
    pvs = {p["drive_path"]: p for p in result["provenance"]}
    assert pvs["reference.csv"]["sha256"] == sha256_file(source)
    assert pvs["artifact:out/masks/site.json"]["sha256"] == sha256_file(derived)
    assert pvs["raw/original.img"]["sha256"] == "a" * 64
    assert not json.loads((ctx.out / "validation/masks.json").read_text())["provenance"]
