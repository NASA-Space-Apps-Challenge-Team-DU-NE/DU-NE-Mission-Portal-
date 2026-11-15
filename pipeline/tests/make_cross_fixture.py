"""Python↔TS 교차 테스트 입력·기대값 생성: python tests/make_cross_fixture.py

입력은 테스트용 합성 값이다 (화면 노출 금지). 같은 입력으로 web/src/core/cross.test.ts 가 같은 결과를 내야 한다.
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from luna.sky import body_vector, sky_state

OUT = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "cross" / "sky_cases.json"


def cases():
    rng = np.random.default_rng(20261114)
    mask = [round(float(x), 3) for x in 1.5 * np.sin(np.radians(np.arange(0, 360, 5)) * 3) + 0.5]
    out = []
    for _ in range(40):
        lat = float(rng.uniform(-89.9, -80))
        lon = float(rng.uniform(-180, 180))
        elev = float(rng.uniform(-3000, 6000))
        sun = [float(rng.uniform(-1.5, 1.5)), float(rng.uniform(-180, 180)), float(rng.uniform(1.47e8, 1.52e8))]
        earth = [float(rng.uniform(-7, 7)), float(rng.uniform(-8, 8)), float(rng.uniform(3.6e5, 4.06e5))]
        out.append({"lat": lat, "lon": lon, "elev_m": elev, "obs_h_m": 2.0, "margin_deg": 2.0,
                    "sun_sub": sun, "earth_sub": earth})
    return mask, out


def expected(mask, c):
    s = body_vector(c["sun_sub"][1], c["sun_sub"][0], c["sun_sub"][2])
    e = body_vector(c["earth_sub"][1], c["earth_sub"][0], c["earth_sub"][2])
    r = sky_state(c["lat"], c["lon"], c["elev_m"], c["obs_h_m"], mask, 5.0, s, e, c["margin_deg"])
    return {k: (bool(v) if k == "earth_visible" else float(v)) for k, v in r.items()}


def build():
    mask, cs = cases()
    return {"mask": {"az_step_deg": 5.0, "elevation_deg": mask}, "cases": [dict(c, expected=expected(mask, c)) for c in cs]}


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), indent=1), encoding="utf-8")
    print(OUT)
