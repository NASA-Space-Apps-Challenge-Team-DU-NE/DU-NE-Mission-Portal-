"""s90 manifest: 산출물 목록·sha256·provenance 통합, sources.json·quality.json, 용량 예산 검사, docs/sources.md."""

from __future__ import annotations

import json

from luna import log
from luna.config import REPO_ROOT
from luna.contracts import to_plain, utc_now, write_json
from luna.provenance import sha256_file
from luna.sources import SOURCES
from luna.stages.common import Ctx

NAME = "s90"


def run(ctx: Ctx) -> int:
    out = ctx.out
    files = []
    total = 0
    over = []
    drive_paths: dict[str, set[str]] = {}
    quality: dict[str, dict] = {}
    for p in sorted(out.rglob("*")):
        rel = p.relative_to(out).as_posix()
        # 맨 위 manifest.json 만 뺀다 (grid/manifest.json 은 목록에 넣어야 한다).
        # sources.json·quality.json 은 이 단계에서 새로 쓰므로 쓴 뒤에 따로 해시한다.
        if not p.is_file() or p.name in (".gitkeep", "README.md") or rel in ("manifest.json", "sources.json", "quality.json"):
            continue
        size = p.stat().st_size
        total += size
        if size > ctx.settings.budget_file_mb * 1e6:
            over.append(rel)
        files.append({"path": rel, "bytes": size, "sha256": sha256_file(p)})
        if p.suffix == ".json":
            try:
                js = json.loads(p.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                continue
            if isinstance(js, dict) and "schema" in js:
                quality[rel] = {"kind": js.get("kind"), "quality": js.get("quality"), "caution": "; ".join(js.get("notes", []))[:300] or None}
                for pv in js.get("provenance", []):
                    drive_paths.setdefault(pv.get("role", ""), set()).add(pv.get("drive_path", ""))
                if rel == "grid/layers.json":
                    for lm in js["data"]:
                        quality[f"grid/{lm['file']}"] = {"kind": lm["kind"], "quality": lm["quality"], "caution": lm.get("caution")}
    src = [to_plain(s) for s in SOURCES.values()]
    write_json(ctx.out_path("sources.json"), {"schema": "luna.sources.v1", "generated_utc": utc_now(), "data": src})
    write_json(ctx.out_path("quality.json"), {"schema": "luna.quality.v1", "generated_utc": utc_now(), "data": quality})
    for rel in ("sources.json", "quality.json"):
        p = out / rel
        size = p.stat().st_size
        total += size
        files.append({"path": rel, "bytes": size, "sha256": sha256_file(p)})
    files.sort(key=lambda f: f["path"])
    budget_ok = total <= ctx.settings.budget_total_mb * 1e6 and not over
    write_json(ctx.out_path("manifest.json"), {
        "schema": "luna.manifest.v1", "generated_utc": utc_now(), "total_bytes": total, "budget_ok": budget_ok,
        "files": files,
    })
    # docs/sources.md 자동 구역
    doc = REPO_ROOT / "docs" / "sources.md"
    lines = ["<!-- AUTO:s90 시작 (파이프라인이 덮어씀) -->", "| 역할 | Drive 경로 |", "| --- | --- |"]
    for role in sorted(drive_paths):
        for dp in sorted(drive_paths[role]):
            if dp:
                lines.append(f"| {role} | `{dp}` |")
    lines.append("<!-- AUTO:s90 끝 -->")
    if doc.exists():
        import re

        text = doc.read_text(encoding="utf-8")
        block = "\n".join(lines)
        text = re.sub(r"<!-- AUTO:s90 시작.*?<!-- AUTO:s90 끝 -->", block, text, flags=re.S) if "<!-- AUTO:s90 시작" in text else text + "\n\n## 실제로 쓴 Drive 파일 (s90 자동)\n\n" + block + "\n"
        doc.write_text(text, encoding="utf-8")
    log.info(NAME, f"파일 {len(files)}개, 합계 {total / 1e6:.1f} MB (예산 {ctx.settings.budget_total_mb} MB) {'통과' if budget_ok else '초과'}")
    for o in over:
        log.warn(NAME, f"단일 파일 예산 초과: {o}")
    return 0 if budget_ok else 1
