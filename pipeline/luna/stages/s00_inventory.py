"""s00 inventory: Drive 목록 엑셀로 필요한 파일·품질·금지 파일을 확인한다 (CLAUDE.md 4.2-4)."""

from __future__ import annotations

import csv

from luna import log
from luna.paths import NEEDS
from luna.quality import QualityError, check_forbidden
from luna.stages.common import Ctx

NAME = "s00"


def run(ctx: Ctx) -> int:
    rows = []
    missing_required = 0
    for n in NEEDS:
        hits = ctx.data.glob(n.pattern)
        if not hits:
            rows.append([n.role, n.pattern, "없음", "", "", "필수" if n.required else "선택", n.note])
            if n.required:
                missing_required += 1
            continue
        for p in hits:
            rel = ctx.data.rel(p)
            try:
                check_forbidden(rel)
                q = ctx.qi.quality_of(rel) or "목록에 없음"
            except QualityError as e:
                q = f"금지: {e}"
            size = p.stat().st_size
            status = "있음" if size > 0 else "크기 0 (온라인 전용일 수 있음)"
            rows.append([n.role, rel, status, q, size, "필수" if n.required else "선택", n.note])
    out = ctx.build_path("inventory.csv")
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["role", "path", "status", "quality", "bytes", "need", "note"])
        w.writerows(rows)
    bad_q = [r for r in rows if str(r[3]).startswith(("VALIDATION_FAILED", "NO_DATA", "금지"))]
    log.info(NAME, f"확인 {len(rows)}건 → {out}")
    for r in rows:
        if r[2] != "있음" or r[3] in ("목록에 없음",) or str(r[3]).startswith(("금지", "VALIDATION_FAILED", "NO_DATA")):
            log.warn(NAME, f"{r[0]:<16} {r[2]:<6} {r[3]:<18} {r[1]}")
    if missing_required:
        log.warn(NAME, f"필수 파일 {missing_required}종이 없다. Drive 에서 '오프라인으로 사용 가능'을 켜고 다시 실행")
    if bad_q:
        log.warn(NAME, f"사용 금지 품질 {len(bad_q)}건이 경로 패턴에 걸렸다 (paths.py NEEDS 확인)")
    return 1 if missing_required or bad_q else 0
