"""LUNA-NAV 사전 계산 파이프라인.

Drive "DU_NE Data"(LUNA_DATA_DIR)를 읽기만 하고, 산출물은 web/public/data 와 build/ 에만 쓴다.
좌표는 모두 MOON_ME(평균 지구-극)로 변환한 뒤 쓴다 (CLAUDE.md 4.6).
"""

__version__ = "0.1.0"
