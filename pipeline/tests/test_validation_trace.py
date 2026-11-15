import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from luna.config import Settings
from luna.contracts import Provenance, ValidationResult
from luna.paths import DataDir
from luna.provenance import sha256_file
from luna.quality import QualityIndex
from luna.stages import s10_ephemeris as ephemeris, s80_validation as validation
from luna.stages.common import Ctx
from luna.validation_trace import LEGACY_NOTE, stage_legacy_reports, trace_problems


def make_ctx(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    return Ctx(Settings(raw, tmp_path / "out", tmp_path / "build", tmp_path / "cache"), DataDir(raw), QualityIndex([]))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def legacy_result():
    return {"schema": "luna.validation.masks.v1", "generated_utc": "2026-01-01T00:00:00Z", "kind": "real",
            "quality": "VALIDATED", "notes": [], "provenance": [], "data": [{"metric": "legacy", "pass": None, "rmse": 1.23}]}


def test_legacy_migration_preserves_bytes_and_requires_honest_metadata(tmp_path):
    source, staged = tmp_path / "source", tmp_path / "staged"
    path = source / "validation/masks.json"
    write(path, legacy_result())
    original = path.read_bytes()
    assert trace_problems(source, {"validation/masks.json": legacy_result()})
    plan = stage_legacy_reports(source, staged)
    migrated = json.loads((staged / "validation/masks.json").read_text(encoding="utf-8"))
    assert path.read_bytes() == original
    assert (staged / plan[0]["archive"]).read_bytes() == original
    assert migrated["data"] == legacy_result()["data"]
    assert migrated["generated_utc"] == legacy_result()["generated_utc"]
    assert migrated["quality"] == "REFERENCE_ONLY" and LEGACY_NOTE in migrated["notes"]
    assert trace_problems(staged, {"validation/masks.json": migrated}) == []
    migrated["quality"] = "VALIDATED"
    assert trace_problems(staged, {"validation/masks.json": migrated})
    migrated["quality"] = "REFERENCE_ONLY"
    (staged / plan[0]["archive"]).write_bytes(b"altered history")
    assert any("해시 불일치" in p for p in trace_problems(staged, {"validation/masks.json": migrated}))


def test_no_data_and_invalid_trace_are_distinguished(tmp_path):
    no_data = {"schema": "luna.validation.masks.v1", "data": [], "kind": "missing", "quality": "NO_DATA", "provenance": []}
    assert trace_problems(tmp_path, {"validation/masks.json": no_data}) == []
    no_data["quality"] = "VALIDATED"
    assert trace_problems(tmp_path, {"validation/masks.json": no_data})
    with pytest.raises(ValueError):
        stage_legacy_reports(tmp_path, tmp_path / "nested")


def test_spice_kernel_hashes_do_not_claim_horizons_input_trace(tmp_path):
    js = {"schema": "luna.validation.ephemeris_spice.v1", "quality": "REVIEW_REQUIRED",
          "data": {"vs_horizons_range": {"n": 2}}, "provenance": [Provenance("kernel", "a" * 64, "REVIEW_REQUIRED", "spice_kernel").__dict__]}
    assert any("vs_horizons_range" in p for p in trace_problems(tmp_path, {"validation/ephemeris_spice.json": js}))
    js["provenance"].append(Provenance("reference", "b" * 64, "REVIEW_REQUIRED", "comparison_horizons_range").__dict__)
    assert trace_problems(tmp_path, {"validation/ephemeris_spice.json": js}) == []


@pytest.mark.parametrize("passed,quality,exit_code", [(True, "VALIDATED", 0), (None, "REVIEW_REQUIRED", 0), (False, "VALIDATION_FAILED", 1)])
def test_s80_quality_reflects_actual_verdict(tmp_path, monkeypatch, passed, quality, exit_code):
    ctx = make_ctx(tmp_path)
    source = ctx.data.root / "reference.txt"
    source.write_text("reference")

    def compare(ctx):
        ctx.record_input(source, "reference")
        return [ValidationResult("test", 1, 0, 0, None, 0, {}, [], passed, 1)]

    monkeypatch.setattr(validation, "v_ephemeris", compare)
    for name in ("v_masks", "v_illumination", "v_pa_me", "v_mast_jpl", "v_wueller"):
        monkeypatch.setattr(validation, name, lambda ctx: [])
    monkeypatch.setattr(validation, "write_docs", lambda _: None)
    assert validation.run(ctx) == exit_code
    result = json.loads((ctx.out / "validation/ephemeris.json").read_text())
    assert result["quality"] == quality


def test_s10_carried_comparison_records_history_hash(tmp_path, monkeypatch):
    ctx = make_ctx(tmp_path)
    previous = {"schema": "luna.validation.ephemeris_spice.v1", "quality": "REVIEW_REQUIRED", "provenance": [],
                "data": {"vs_horizons_range": {"n": 2, "earth_subpoint_max_deg": .005}}}
    prev_path = ctx.out / "validation/ephemeris_spice.json"
    write(prev_path, previous)
    original = prev_path.read_bytes()
    kdir = ctx.data.root / "Raw_Data/SPICE_Kernels"
    kdir.mkdir(parents=True)
    (kdir / "fixture").write_text("kernel")
    times = [f"2026-01-01T0{h}:00:00Z" for h in range(7)]
    fake = SimpleNamespace(coverage=lambda: {}, common_window_et=lambda: (0, 1),
                           sp=SimpleNamespace(et2utc=lambda *a: "2026-01-01T00:00:00Z"),
                           rows=lambda ts: np.tile([0, 0, 1e8, 0, 0, 4e5], (len(ts), 1)))
    monkeypatch.setattr("luna.io.spice_eph.KERNELS", ["fixture"])
    monkeypatch.setattr("luna.io.spice_eph.SpiceEphemeris", lambda _: fake)
    monkeypatch.setattr("luna.io.spice_eph.hourly_times", lambda *a: times)
    monkeypatch.setattr(ephemeris, "load_missions", lambda *a: ([], None))
    assert ephemeris.run_spice(ctx) == 0
    result = json.loads(prev_path.read_text(encoding="utf-8"))
    assert result["quality"] == "REFERENCE_ONLY" and LEGACY_NOTE in result["notes"]
    assert result["data"]["vs_horizons_range"] == previous["data"]["vs_horizons_range"]
    pv = next(p for p in result["provenance"] if p["role"] == "legacy_validation_record")
    archive = ctx.out / pv["drive_path"][len("artifact:out/"):]
    assert archive.read_bytes() == original and sha256_file(archive) == pv["sha256"]
    assert trace_problems(ctx.out, {"validation/ephemeris_spice.json": result}) == []
