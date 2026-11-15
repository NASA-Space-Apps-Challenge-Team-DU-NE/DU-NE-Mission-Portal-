"""검토 F16·F24: 완료 도장과 배포 검사."""

import json
from types import SimpleNamespace

from luna.stages.common import Ctx
from luna.stages.s90_manifest import check_complete


def _ctx(tmp_path, out_name="out"):
    st = SimpleNamespace(out_dir=tmp_path / out_name, build_dir=tmp_path / "build")
    data = SimpleNamespace(root=tmp_path / "drive")
    return Ctx(st, data, qi=None)  # type: ignore[arg-type]


def test_stamp_detects_lost_output_and_out_dir_change(tmp_path):
    ctx = _ctx(tmp_path)
    key = ctx.stamp_key("sX", [], {"a": 1})
    assert not ctx.up_to_date("sX", key)
    ctx.out_path("x/a.json").write_text("{}")
    ctx.mark_done("sX", key)
    assert ctx.up_to_date("sX", key)
    # 산출물 유실 → 다시 계산
    (ctx.out / "x" / "a.json").unlink()
    assert not ctx.up_to_date("sX", key)
    # 출력 폴더 변경 → 키가 달라짐
    ctx2 = _ctx(tmp_path, "out2")
    assert ctx2.stamp_key("sX", [], {"a": 1}) != key


def test_check_complete_reports_broken_and_missing(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "broken.json").write_text("{not json")
    probs = check_complete(out)
    assert any("broken.json" in p for p in probs)
    assert any("catalog/sites.json" in p and "없음" in p for p in probs)
    (out / "catalog").mkdir()
    (out / "catalog" / "sites.json").write_text(json.dumps({"schema": "luna.sites.v99", "data": []}))
    probs = check_complete(out)
    assert any("luna.sites.v99" in p for p in probs)
