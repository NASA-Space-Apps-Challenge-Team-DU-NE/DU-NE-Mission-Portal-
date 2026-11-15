"""교차 테스트 기대값이 현재 Python 수식과 같은지 확인 (TS 쪽은 web/src/core/cross.test.ts)."""

import json
from pathlib import Path

import pytest

from make_cross_fixture import OUT, build, expected


def test_fixture_matches_python():
    if not OUT.exists():
        pytest.skip("python tests/make_cross_fixture.py 로 먼저 만든다")
    fx = json.loads(Path(OUT).read_text(encoding="utf-8"))
    for c in fx["cases"]:
        e = expected(fx["mask"]["elevation_deg"], c)
        for k, v in c["expected"].items():
            assert e[k] == pytest.approx(v, abs=1e-9), k


def test_build_is_deterministic():
    assert build() == build()
