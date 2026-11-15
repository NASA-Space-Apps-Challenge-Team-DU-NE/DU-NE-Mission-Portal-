"""검증 입력 추적 검사와 과거 결과 보존. 원본 입력이나 계산 결과를 추정하지 않는다."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from luna.contracts import Provenance
from luna.provenance import sha256_file

LEGACY_ROLE = "legacy_validation_record"
LEGACY_NOTE = "입력 추적 불완전: 과거 검증 기록을 보존한 참고 자료이며 이번에 재검증한 결과가 아님. 기록 당시의 모든 입력 원본 해시·좌표계를 확인하지 못했음."


def legacy_record(original: bytes, name: str) -> tuple[str, Provenance]:
    """원래 envelope 바이트를 식별한다. 과거 raw 입력의 해시를 만드는 함수가 아니다."""
    digest = hashlib.sha256(original).hexdigest()
    rel = f"validation/history/{Path(name).stem}-{digest[:16]}.json.original"
    pv = Provenance(f"artifact:out/{rel}", digest, "REFERENCE_ONLY", LEGACY_ROLE,
                    transform="원래 검증 envelope 바이트 보존. 입력 원본 복원 또는 계산 재실행 아님")
    return rel, pv


def archive_record(ctx, path: Path) -> Provenance:
    original = path.read_bytes()
    rel, pv = legacy_record(original, path.name)
    ctx.out_path(rel).write_bytes(original)
    return pv


def stage_legacy_reports(source: Path, staging: Path, *, exclude=(), include=()) -> list[dict]:
    """검토 가능한 사본만 만든다. 원래 data·시각·판정을 보존하고 품질/설명만 바꾼다.

    기본 대상은 입력 provenance가 비어 있는 결과. include로 부분 추적임을
    확인한 결과를 명시적으로 추가할 수 있다. source 안에는 절대 쓰지 않는다.
    """
    source, staging = source.resolve(), staging.resolve()
    if staging.is_relative_to(source) or source.is_relative_to(staging):
        raise ValueError("staging 과 source 는 겹칠 수 없음")
    plans = []
    for path in sorted((source / "validation").glob("*.json")):
        original = path.read_bytes()
        js = json.loads(original)
        if path.stem in exclude or not isinstance(js, dict) or not js.get("data"):
            continue
        if js.get("provenance") and path.stem not in include:
            continue
        rel, pv = legacy_record(original, path.name)
        archive = staging / rel
        archive.parent.mkdir(parents=True, exist_ok=True)
        archive.write_bytes(original)
        old_prov = js.get("provenance") if isinstance(js.get("provenance"), list) else []
        js["provenance"] = old_prov + [pv.__dict__]
        js["quality"] = "REFERENCE_ONLY"
        js["notes"] = list(js.get("notes") or []) + [LEGACY_NOTE]
        dest = staging / "validation" / path.name
        dest.write_text(json.dumps(js, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        plans.append({"file": f"validation/{path.name}", "original_sha256": pv.sha256,
                      "staged_file": str(dest), "archive": rel, "archive_sha256": pv.sha256,
                      "data_and_verdict_preserved": True, "quality": "REFERENCE_ONLY"})
    return plans


def trace_problems(out: Path, parsed: dict) -> list[str]:
    """검증 기록의 최소 추적 계약. 비어 있지 않은 해시를 과학적 정확성의 증명으로 보지 않는다."""
    out = out.resolve()
    problems = []
    for rel, js in parsed.items():
        if not rel.startswith("validation/") or not isinstance(js, dict) or not str(js.get("schema", "")).startswith("luna.validation."):
            continue
        data, quality = js.get("data"), js.get("quality")
        if not data and quality == "NO_DATA" and js.get("kind") == "missing":
            continue
        if not data:
            problems.append(f"{rel}: 비어 있는 검증을 결과로 표시함")
            continue
        raw = js.get("provenance")
        valid = [p for p in raw if isinstance(p, dict) and isinstance(p.get("drive_path"), str) and p["drive_path"]
                 and isinstance(p.get("role"), str) and p["role"] and isinstance(p.get("sha256"), str)
                 and re.fullmatch(r"[0-9a-fA-F]{64}", p["sha256"])] if isinstance(raw, list) else []
        if not valid:
            problems.append(f"{rel}: 검증 입력 해시 없음; 과거 기록은 archive와 REFERENCE_ONLY 설명 필요")
        legacy = [p for p in valid if p["role"] == LEGACY_ROLE]
        if legacy and (quality != "REFERENCE_ONLY" or LEGACY_NOTE not in (js.get("notes") or [])):
            problems.append(f"{rel}: 과거 검증 기록에 REFERENCE_ONLY 및 추적 한계 설명 필요")
        for pv in valid:
            dp = pv["drive_path"]
            if pv["role"] == LEGACY_ROLE and not dp.startswith("artifact:out/validation/history/"):
                problems.append(f"{rel}: 과거 검증 원본 archive 경로 오류")
            if dp.startswith("artifact:out/"):
                path = (out / dp[len("artifact:out/"):]).resolve()
                if not path.is_relative_to(out) or not path.is_file() or sha256_file(path) != pv["sha256"]:
                    problems.append(f"{rel}: 기록한 산출물 입력 없음 또는 해시 불일치 ({dp})")
        if quality == "VALIDATED" and isinstance(data, list):
            metrics = [r for r in data if isinstance(r, dict) and "pass" in r]
            if metrics and any(r["pass"] is not True for r in metrics):
                problems.append(f"{rel}: 판정 미실시/실패 항목을 VALIDATED 로 표시함")
        # 이 보고서는 커널 해시만으로 Horizons 비교를 재현할 수 없다.
        if js.get("schema") == "luna.validation.ephemeris_spice.v1" and isinstance(data, dict) and not legacy:
            roles = {p["role"] for p in valid}
            for key, role in (("vs_horizons_range", "comparison_horizons_range"), ("vs_horizons_missions", "comparison_horizons_mission")):
                if data.get(key) and role not in roles:
                    problems.append(f"{rel}: {key} 비교 입력 해시 없음")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description="원본 변경 없이 과거 검증 metadata 수정 사본 준비")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--exclude", nargs="*", default=[])
    parser.add_argument("--include", nargs="*", default=[])
    args = parser.parse_args()
    plans = stage_legacy_reports(args.source, args.staging, exclude=args.exclude, include=args.include)
    (args.staging / "migration_plan.json").write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"prepared": len(plans), "staging": str(args.staging)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
