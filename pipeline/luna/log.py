"""간단한 로그 (단계 이름을 앞에 붙인다)."""

import sys
import time

_t0 = time.time()


def info(stage: str, msg: str) -> None:
    print(f"[{time.time() - _t0:7.1f}s] {stage:<5} {msg}", flush=True)


def warn(stage: str, msg: str) -> None:
    print(f"[{time.time() - _t0:7.1f}s] {stage:<5} 경고: {msg}", file=sys.stderr, flush=True)
