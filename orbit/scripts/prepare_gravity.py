"""Create a small, deterministic GL1800F coefficient asset for browser use.

Development only. Requires numpy/spiceypy and the existing SPICE kernels.
Read-only NASA source: pass --source pointing at the original .tab or .tab.gz.
No source download or Drive/API request occurs when the website is running.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import spiceypy as spice
from nasa_data import PROJECT, SpiceFrames

SOURCE_SHA256 = "d2a552067a78bf1d2755807ae14ee1d6843a8f6a4228e01ce59a665516738fec"
SOURCE_BYTES = 197969644
SOURCE_ROWS = 1622700
SOURCE_BASE = "https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/"
PA = "MOON_PA_DE440"
ME = "MOON_ME_DE440_ME421"


def save(path: Path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                              indent=2 if pretty else None,
                              separators=None if pretty else (",", ":")), encoding="utf-8")


def read_source(path: Path, max_degree: int):
    """Inspect every source row even though only a short prefix is retained."""
    size = (max_degree+1)*(max_degree+2)//2
    c, s = [0.0]*size, [0.0]*size
    c[0] = 1.0
    digest = hashlib.sha256()
    byte_count = 0
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rb") as stream:
        def read(count):
            nonlocal byte_count
            raw = stream.read(count)
            digest.update(raw)
            byte_count += len(raw)
            return raw

        header = read(244)
        fields = [x.strip() for x in header[:137].decode("ascii").split(",")]
        if len(header) != 244 or len(fields) != 8:
            raise ValueError("Invalid GL1800F header")
        radius_km, gm_km3_s2, sigma_gm = map(float, fields[:3])
        degree, order, normalization = map(int, fields[3:6])
        if (radius_km, gm_km3_s2, degree, order, normalization) != (1738., 4902.8003063302, 1800, 1800, 1):
            raise ValueError("Unexpected source constants or normalization")
        if list(map(float, fields[6:])) != [0., 0.]:
            raise ValueError("Nonzero source reference longitude/latitude")
        rows = 0
        for n in range(1, 1801):
            for m in range(n+1):
                line = read(122)
                if len(line) != 122 or line[-2:] != b"\r\n":
                    raise ValueError(f"Invalid source record ({n},{m})")
                fields = line[:107].decode("ascii").split(",")
                if len(fields) != 6 or (int(fields[0]), int(fields[1])) != (n, m):
                    raise ValueError(f"Missing, duplicated or reordered coefficient ({n},{m})")
                cv, sv, dc, ds = map(float, fields[2:])
                if not all(map(math.isfinite, (cv, sv, dc, ds))) or min(dc, ds) < 0:
                    raise ValueError(f"Invalid numeric coefficient ({n},{m})")
                if n == 1 and (cv != 0 or sv != 0):
                    raise ValueError("Unexpected nonzero degree-one coefficient")
                if n <= max_degree:
                    i = n*(n+1)//2+m
                    c[i], s[i] = cv, sv
                rows += 1
        if read(1):
            raise ValueError("Trailing data after complete coefficient table")
    if byte_count != SOURCE_BYTES or rows != SOURCE_ROWS or digest.hexdigest() != SOURCE_SHA256:
        raise ValueError("Source size, row count or SHA-256 mismatch")
    return c, s, {"bytes": byte_count, "sha256": digest.hexdigest(), "coefficient_rows": rows,
                  "gm_uncertainty_km3_s2": sigma_gm, "all_indices_finite_values_checked": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--max-degree", type=int, default=90, choices=[20, 30, 60, 90])
    args = parser.parse_args()
    c, s, inspected = read_source(args.source, args.max_degree)
    frames = SpiceFrames()
    ephemeris_path = PROJECT / "frontend/public/data/ephemeris/index.json"
    ephemeris = json.loads(ephemeris_path.read_text("utf-8"))
    if ephemeris["resolved_frame"] != ME:
        raise ValueError("Existing ephemeris uses an incompatible fixed frame")
    epoch = ephemeris["epoch_et"]
    matrix = spice.pxform(PA, ME, epoch)
    rotation_constancy = max(float(np.max(np.abs(spice.pxform(PA, ME, epoch+t)-matrix)))
                            for t in [0, ephemeris["coverage_s"][1]/2, ephemeris["coverage_s"][1]])
    if rotation_constancy > 1e-14:
        raise ValueError("PA-to-ME transform is not constant over the supplied interval")
    kernels = []
    for name in ["moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "naif0012.tls"]:
        file = frames.kernel_dir/name
        kernels.append({"file": name, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
    data = {
        "schema": "lunar.gravity.v1", "schema_version": 1, "model": "GL1800F",
        "gm_m3_s2": 4902800306330.2, "reference_radius_m": 1738000.,
        "max_degree": args.max_degree, "max_order": args.max_degree, "source_max_degree": 1800,
        "supported_degrees": [n for n in [0,20,30,60,90] if n <= args.max_degree],
        "normalization": "4pi", "condon_shortley_phase": False, "csphase": 1,
        "phase_convention": "Geodesy real harmonics: Pbar_nm(sin(latitude)) [Cnm cos(m longitude)+Snm sin(m longitude)]; no (-1)^m Condon-Shortley factor",
        "tide_convention": "Source degree 2 and 3 exclude permanent tide; no time-variable solid tide added",
        "frame": PA, "fixed_frame": ME, "inertial_frame": "J2000", "origin": "MOON_CENTER_OF_MASS",
        "pa_to_me_rotation": matrix.ravel().tolist(),
        "rotation_direction": "column r_ME = pa_to_me_rotation * column r_PA; row-major storage",
        "rotation_source": "CSPICE pxform(MOON_PA_DE440, MOON_ME_DE440_ME421, epoch_et); constant FK relation",
        "matrix_order": "row-major", "coefficient_index": "n*(n+1)/2+m",
        "coefficient_units": "dimensionless", "numeric_encoding": "JSON numbers parsed as IEEE754 binary64; byte-order not applicable",
        "c00": "Explicitly inserted as 1; source has no n=0 row. Include lunar central GM term once only",
        "source_file": "jggrx_1800f_sha.tab", "source_url": SOURCE_BASE+"jggrx_1800f_sha.tab",
        "source_sha256": SOURCE_SHA256, "source_bytes": SOURCE_BYTES,
        "source_label_urls": [SOURCE_BASE+"jggrx_1800f_sha.lbl", SOURCE_BASE+"jggrx_1800f_sha.xml"],
        "source_paper_url": "https://doi.org/10.1038/s41586-025-08949-5",
        "source_metadata_caveat": "PDS3 FILE_RECORDS=1622704 differs from actual1622702; PDS4 offset244 +1622700rows*122 matches full source and every index",
        "normalization_reference": "https://shtools.github.io/SHTOOLS/real-spherical-harmonics.html",
        "generator": "scripts/prepare_gravity.py", "generator_version": 1,
        "source_inspection": inspected, "rotation_kernels": kernels,
        "ephemeris_sha256": hashlib.sha256(ephemeris_path.read_bytes()).hexdigest(),
        "reference_radius_caveat": "1738000m coefficient scaling is distinct from 1737400m LOLA elevation reference and is not a collision boundary",
        "domain_caveat": "Finite external spherical-harmonic approximation; near-surface downward continuation and degree truncation have unquantified physical errors. No terrain-density model or solid tides.",
        "c": c, "s": s,
    }
    output = PROJECT / "frontend/public/data/gravity/index.json"
    save(output, data)
    manifest = {"schema": "lunar.gravity.manifest.v1", "schema_version": 1, "file": "index.json",
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "bytes": output.stat().st_size,
                "model": data["model"], "max_degree": args.max_degree, "source_sha256": SOURCE_SHA256}
    save(output.parent / "manifest.json", manifest, True)
    save(PROJECT / "data/gravity/source-inspection.json", {**inspected, "pa_to_me_rotation": data["pa_to_me_rotation"],
         "pa_to_me_rotation_constancy_max": rotation_constancy, "output": manifest}, True)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
