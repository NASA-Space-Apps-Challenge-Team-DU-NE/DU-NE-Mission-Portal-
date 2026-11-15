"""s90 manifest: 산출물 목록·sha256·provenance 통합, sources.json·quality.json, 용량 예산 검사, docs/sources.md."""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import numpy as np

from luna import log
from luna.config import REPO_ROOT
from luna.contracts import USABLE_QUALITY, to_plain, utc_now, write_json
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
                notes = js.get("notes")
                quality[rel] = {"kind": js.get("kind"), "quality": js.get("quality"), "caution": "; ".join(str(n) for n in notes)[:300] if isinstance(notes, list) else None}
                for pv in js.get("provenance", []) if isinstance(js.get("provenance"), list) else []:
                    if isinstance(pv, dict) and isinstance(pv.get("drive_path"), str) and isinstance(pv.get("role"), str):
                        drive_paths.setdefault(pv["role"], set()).add(pv["drive_path"])
                if rel == "grid/layers.json" and isinstance(js.get("data"), list):
                    for lm in js["data"]:
                        if isinstance(lm, dict) and isinstance(lm.get("file"), str):
                            quality[f"grid/{lm['file']}"] = {"kind": lm.get("kind"), "quality": lm.get("quality"), "caution": lm.get("caution")}
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
    problems = check_complete(out)
    for pr in problems:
        log.warn(NAME, f"배포 검사: {pr}")
    write_json(ctx.out_path("manifest.json"), {
        "schema": "luna.manifest.v1", "generated_utc": utc_now(), "total_bytes": total, "budget_ok": budget_ok,
        # budget_ok 는 용량 조건만. complete_ok 는 필수 파일·스키마·길이 검사 결과
        "complete_ok": not problems, "problems": problems,
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
    return 0 if budget_ok and not problems else 1


# 웹이 시작에 꼭 읽는 산출물
REQUIRED_JSON = {
    "catalog/sites.json": "luna.sites.v1", "catalog/missions.json": "luna.missions.v1", "catalog/landers.json": "luna.landers.v1",
    "catalog/stations.json": "luna.stations.v1", "ephemeris/range.json": "luna.ephemeris.v1", "grid/manifest.json": "luna.grid.v1",
    "grid/layers.json": "luna.layers.v1",
}


# 필수 지형·조명 자료에서 항상 생성되는 기본 레이어. 선택 광물·지질 자료는 제외.
REQUIRED_LAYERS = {"elev_m", "slope_mean_deg", "slope_p90_deg", "illum_avg", "earth_vis_avg", "psr_frac", "psr_dist_km"}


def check_complete(out: Path) -> list[str]:
    """배포 계약을 검사한다. 잘못된 payload도 예외 대신 구체적인 문제로 반환한다."""
    out = out.resolve()
    probs: list[str] = []
    parsed = {}
    for p in sorted(out.rglob("*.json")):
        rel = p.relative_to(out).as_posix()
        if rel == "manifest.json":
            continue
        try:
            parsed[rel] = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            probs.append(f"{rel}: JSON 을 읽을 수 없음 ({e})")

    def number(value, positive=False):
        return type(value) in (int, float) and math.isfinite(value) and (not positive or value > 0)

    def integer(value, minimum=1):
        return type(value) is int and value >= minimum

    def binary(folder, name, size, label, dtype=None):
        if not isinstance(name, str) or not name or Path(name).is_absolute():
            probs.append(f"{label}: 파일 경로 없음 또는 잘못된 경로")
            return None
        p = (out / folder / name).resolve()
        if not p.is_relative_to(out / folder):
            probs.append(f"{label}: 허용 폴더 밖 파일 경로")
            return None
        if not p.is_file() or p.stat().st_size != size:
            probs.append(f"{label}: 길이가 계약과 다름 (기대 {size} bytes)")
            return None
        return np.fromfile(p, dtype=dtype) if dtype else p

    docs = {}
    for rel, schema in REQUIRED_JSON.items():
        if not (out / rel).is_file():
            probs.append(f"{rel}: 필수 파일 없음")
            continue
        js = parsed.get(rel)
        if not isinstance(js, dict):
            probs.append(f"{rel}: envelope 객체가 아님")
            continue
        docs[rel] = js
        if js.get("schema") != schema:
            probs.append(f"{rel}: 스키마 {js.get('schema')} (기대 {schema})")
        if not isinstance(js.get("quality"), str) or js["quality"] not in USABLE_QUALITY:
            probs.append(f"{rel}: 품질 {js.get('quality')}")
        if js.get("kind") not in ("real", "approx", "assumed"):
            probs.append(f"{rel}: 사용할 수 없는 kind {js.get('kind')}")
        data = js.get("data")
        if rel.startswith("catalog/"):
            if not isinstance(data, list) or not data:
                probs.append(f"{rel}: 비어 있거나 잘못된 카탈로그 배열")
                continue
            seen = set()
            for i, row in enumerate(data):
                if not isinstance(row, dict):
                    probs.append(f"{rel}[{i}]: 항목 객체가 아님")
                    continue
                sid = row.get("id")
                if not isinstance(sid, str) or not sid or sid in seen:
                    probs.append(f"{rel}[{i}]: id 없음 또는 중복")
                else:
                    seen.add(sid)
                if not isinstance(row.get("name"), str) or not row["name"]:
                    probs.append(f"{rel}[{i}]: name 없음")
                if rel != "catalog/landers.json":
                    lat, lon = row.get("lat_deg"), row.get("lon_deg")
                    if not number(lat) or not -90 <= lat <= 90 or not number(lon) or not -180 <= lon <= 180:
                        probs.append(f"{rel}[{i}]: 위경도 없음 또는 범위 밖")

    def object_data(rel):
        data = docs.get(rel, {}).get("data")
        if not isinstance(data, dict) or not data:
            probs.append(f"{rel}: 비어 있거나 잘못된 data 객체")
            return {}
        return data

    def ephemeris(data, rel):
        count, step = data.get("count"), data.get("step_h")
        if not integer(count, 2) or not number(step, positive=True):
            probs.append(f"{rel}: count ≥ 2 정수 및 step_h > 0 필요")
            return
        if data.get("frame") != "MOON_ME" or data.get("bodies") != ["sun", "earth"]:
            probs.append(f"{rel}: frame/bodies 계약 불일치")
        try:
            datetime.strptime(data.get("start_utc", ""), "%Y-%m-%dT%H:%M:%SZ")
        except (ValueError, TypeError):
            probs.append(f"{rel}: 잘못된 start_utc")
        arr = binary(str(Path(rel).parent), data.get("bin"), count * 24, f"{rel}: bin", "<f4")
        if arr is not None:
            a = arr.reshape(count, 2, 3)
            if not np.isfinite(a).all() or (np.abs(a[:, :, 0]) > 180).any() or (np.abs(a[:, :, 1]) > 90).any() or (a[:, :, 2] <= 0).any():
                probs.append(f"{rel}: 천체력 비유한 값 또는 좌표/거리 범위 오류")

    ephemeris(object_data("ephemeris/range.json"), "ephemeris/range.json")
    # 과거 임무 카탈로그가 가리키는 표도 배포에 포함되어야 한다.
    missions = docs.get("catalog/missions.json", {}).get("data")
    for mission in missions if isinstance(missions, list) else []:
        if not isinstance(mission, dict) or not mission.get("ephemeris"):
            continue
        name = mission["ephemeris"]
        if not isinstance(name, str):
            probs.append("catalog/missions.json: 잘못된 ephemeris 참조")
            continue
        rel = name
        js = parsed.get(rel)
        if not isinstance(js, dict) or js.get("schema") != "luna.ephemeris.v1" or not isinstance(js.get("quality"), str) or js["quality"] not in USABLE_QUALITY or not isinstance(js.get("data"), dict):
            probs.append(f"{rel}: 참조 천체력 없음 또는 계약 오류")
        else:
            ephemeris(js["data"], rel)

    g = object_data("grid/manifest.json")
    n, nx, ny = g.get("n_cells"), g.get("nx"), g.get("ny")
    size_ok = all(integer(v) for v in (n, nx, ny)) and n <= nx * ny
    if not size_ok:
        probs.append("grid/manifest.json: 양의 정수 n_cells/nx/ny 및 n_cells ≤ nx×ny 필요")
    if not isinstance(g.get("projection"), str) or not g.get("projection") or not number(g.get("cell_km"), True):
        probs.append("grid/manifest.json: projection 또는 cell_km 오류")
    for field in ("x0_km", "y0_km", "lat_limit_deg", "observer_height_m"):
        if not number(g.get(field)):
            probs.append(f"grid/manifest.json: {field} 없음 또는 비유한 값")
    hz = g.get("horizon")
    hz = hz if isinstance(hz, dict) else {}
    naz, az, scale = hz.get("n_az"), hz.get("az_step_deg"), hz.get("scale")
    horizon_ok = integer(naz) and number(az, True) and number(scale, True) and math.isclose(naz * az, 360, abs_tol=1e-6)
    if not horizon_ok:
        probs.append("grid/manifest.json: horizon 방위/스케일 계약 오류")
    if size_ok:
        cells = binary("grid", g.get("cells"), n * 4, "grid cells", "<u4")
        if cells is not None and ((cells >= nx * ny).any() or np.unique(cells).size != n):
            probs.append("grid cells: 중복 또는 격자 밖 인덱스")
        if horizon_ok:
            binary("grid", hz.get("file"), n * naz * 2, "grid horizon")

    layers = docs.get("grid/layers.json", {}).get("data")
    names, paths = set(), set()
    if not isinstance(layers, list) or not layers:
        probs.append("grid/layers.json: 비어 있거나 잘못된 레이어 배열")
        layers = []
    for i, lm in enumerate(layers):
        if not isinstance(lm, dict):
            probs.append(f"grid/layers.json[{i}]: 레이어 객체가 아님")
            continue
        name, path = lm.get("name"), lm.get("file")
        if not isinstance(name, str) or not name or name in names:
            probs.append(f"grid/layers.json[{i}]: name 없음 또는 중복")
        else:
            names.add(name)
        if not isinstance(path, str) or not path or path in paths:
            probs.append(f"grid/layers.json[{i}]: file 없음 또는 중복")
        else:
            paths.add(path)
        if not isinstance(lm.get("quality"), str) or lm["quality"] not in USABLE_QUALITY or lm.get("kind") not in ("real", "approx", "assumed"):
            probs.append(f"grid/layers.json[{i}] {name}: 사용할 수 없는 품질/kind")
        if size_ok:
            values = binary("grid", path, n * 4, f"grid layer {name}", "<f4")
            if values is not None:
                valid = int(np.isfinite(values).sum())
                coverage = lm.get("coverage")
                if np.isinf(values).any() or not isinstance(coverage, dict) or coverage.get("valid_cells") != valid:
                    probs.append(f"grid layer {name}: Infinity 또는 coverage.valid_cells 불일치")
                if name in REQUIRED_LAYERS and valid == 0:
                    probs.append(f"grid layer {name}: 필수 레이어 유효 칸 0개")
    missing = REQUIRED_LAYERS - names
    if missing:
        probs.append(f"grid/layers.json: 필수 레이어 없음 {', '.join(sorted(missing))}")
    from luna.validation_trace import trace_problems

    probs.extend(trace_problems(out, parsed))
    return probs
