"""승인된 대조 결과(관문 G1, 2026-11-15)로 Catalogs 시드 3개를 build/catalog_seed/ 에 만든다.

Drive 반영은 이 파일을 보고 사람이 01_변경_기록.md 절차대로 복사한다 (파이프라인은 Drive 에 쓰지 않는다).
실행: python -m luna.tools_apply_seed
"""

from __future__ import annotations

import json

from luna import reconcile as R
from luna.catalogs import load_missions, load_sites
from luna.config import REPO_ROOT, load_settings
from luna.io.tables import read_csv

CLPS = {"im1_odysseus", "im2_athena", "blue_ghost_m1"}


def main() -> None:
    DD = load_settings().data_dir
    out = REPO_ROOT / "build" / "catalog_seed"
    out.mkdir(parents=True, exist_ok=True)
    sites, _ = load_sites(DD / "Catalogs/sites.json")
    W = R.load_wueller_sites(DD / R.WUELLER_ZIP)
    checks = R.check_sites(sites, R.read_site_coords(DD / R.SITE_COORDS_CSV), R.load_lroc_objects(DD / R.LROC_OBJECTS_ZIP),
                           R.load_artemis_polygons(DD / "Raw_Data/Artemis_III_Regions_USGS_2024/A3_9regions-lonlat-simplified.zip"), W, CLPS)
    ns, ch_s = R.updated_site_seed(json.loads((DD / "Catalogs/sites.json").read_text(encoding="utf-8")), checks, W)
    ms, _ = load_missions(DD / "Catalogs/missions.json", DD / R.SITE_COORDS_CSV)
    _, adopt = R.check_missions(ms, read_csv(DD / R.MISSION_EVIDENCE_CSV), read_csv(DD / R.MISSION_RECON_CSV))
    nm, ch_m = R.updated_mission_seed(json.loads((DD / "Catalogs/missions.json").read_text(encoding="utf-8")), adopt)
    nl, ch_l = R.updated_lander_seed(json.loads((DD / "Catalogs/landers.json").read_text(encoding="utf-8")))

    def dump(items, name):
        (out / name).write_text("[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in items) + "\n]\n", encoding="utf-8")

    dump(ns, "sites.json")
    dump(nm, "missions.json")
    dump(nl, "landers.json")
    (out / "changes.json").write_text(json.dumps({"sites": ch_s, "missions": ch_m, "landers": ch_l}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    for k, v in (("sites", ch_s), ("missions", ch_m), ("landers", ch_l)):
        print(f"== {k} ({len(v)})")
        for r in v:
            print(" ", r["id"], r["field"], r["before"], "->", r["after"], r.get("diff_m", ""))


if __name__ == "__main__":
    main()
