"""명령: python -m luna <s00|s10|…|s90|all> [--only id1,id2] [--force] [--workers N]"""

from __future__ import annotations

import argparse
import importlib

from luna import log
from luna.config import load_settings
from luna.paths import DataDir

STAGES = [
    ("s00", "s00_inventory"), ("s10", "s10_ephemeris"), ("s20", "s20_terrain"), ("s30", "s30_masks"), ("s35", "s35_ellipse"), ("s40", "s40_grid"),
    ("s50", "s50_layers"), ("s60", "s60_textures"), ("s70", "s70_catalogs"), ("s75", "s75_local"), ("s80", "s80_validation"), ("s90", "s90_manifest"),
]
ALIASES = {"inventory": "s00", "ephemeris": "s10", "terrain": "s20", "masks": "s30", "ellipse": "s35", "grid": "s40", "layers": "s50", "local": "s75",
           "textures": "s60", "catalogs": "s70", "validation": "s80", "manifest": "s90"}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="luna", description="LUNA-NAV 사전 계산 파이프라인")
    ap.add_argument("stage", help="s00…s90, 이름(inventory…manifest) 또는 all")
    ap.add_argument("--only", default="", help="일부 착륙지만 (쉼표 구분 id)")
    ap.add_argument("--force", action="store_true", help="건너뛰기 무시")
    ap.add_argument("--workers", type=int, default=1, help="s40 병렬 작업자 수")
    ap.add_argument("--regions", default="south", help="s20·s40 지역 (쉼표 구분): south, north, global. 기본 south")
    a = ap.parse_args(argv)

    st = load_settings()
    if st.data_dir is None or not st.data_dir.exists():
        log.warn("cli", "LUNA_DATA_DIR 이 없거나 경로가 틀리다. 저장소 루트 .env.local 에 적는다 (CLAUDE.md 4.2)")
        return 2
    from luna.quality import QualityIndex, find_inventory
    from luna.stages.common import Ctx

    qi = QualityIndex.from_xlsx(find_inventory(st.data_dir))
    regions = tuple(x.strip() for x in a.regions.split(",") if x.strip())
    bad = [r for r in regions if r not in ("south", "north", "global")]
    if bad or not regions:
        ap.error(f"알 수 없는 지역: {bad or a.regions}")
    ctx = Ctx(st, DataDir(st.data_dir), qi, force=a.force, only=[x for x in a.only.split(",") if x], workers=a.workers, regions=regions)
    want = ALIASES.get(a.stage, a.stage)
    todo = [s for s in STAGES if want in ("all", s[0])]
    if not todo:
        ap.error(f"알 수 없는 단계: {a.stage}")
    rc = 0
    for code, mod in todo:
        log.info(code, "시작")
        r = importlib.import_module(f"luna.stages.{mod}").run(ctx)
        rc = rc or r
        log.info(code, "끝" if r == 0 else f"끝 (코드 {r})")
        if r and code in ("s00", "s20") and want == "all":
            log.warn(code, "앞 단계가 실패해서 멈춘다")
            break
    return rc
