# 결정 기록

형식: `YYYY-MM-DD HH:MM | 결정 | 이유 | 영향 파일 | 결정한 사람` (ARCHITECTURE 11절)

- 2026-11-14 | 새 코드베이스 뼈대 작성 (CLAUDE.md v4 · ARCHITECTURE · TASKS 기준) | 기존 nasa_project 코드를 복사하지 않고 새로 작성 | 전체 | 팀
- 2026-11-14 | 표 밖 시각의 천체력은 `astronomy-engine` 대신 core 안 해석적 근사(`web/src/core/ephemeris.ts` AnalyticEphemeris: Meeus 47·25장 + IAU 달 회전 모델)로 구현 | 의존성 없이 Worker·테스트에서 같은 코드를 쓰기 위해. 아폴로 11호 태양 고도 10.70°(기록 약 10.8°)로 상식 검사 통과. 정확도는 s80 검증으로만 말한다 | `core/ephemeris.ts`, `core/stations.ts` | 확인 필요 (팀)
- 2026-11-14 | 격자 manifest 의 원점은 `x0_km`(왼쪽)·`y0_km`(위쪽) 모서리, 평면 규칙 x=ρ·sinλ, y=ρ·cosλ | 2D 지도·3D 캡·파이프라인이 같은 규칙을 쓰도록 | `types.ts`, `contracts.py`, ARCHITECTURE 5.4 | 팀 공지 필요
- 2026-11-14 | 린트는 의존성 없는 규칙 검사(`web/scripts/check-rules.mjs`: 금지 문구, core 의존 방향, 난수)로 시작 | ESLint 버전 고정 전까지 | `package.json` | 확인 필요
- 2026-11-14 | Vercel 배포 보류, 로컬 실행으로 확인 | 팀 결정 | CLAUDE.md 1.1·6.1·12, ARCHITECTURE 10절, README, TASKS T05, web/vercel.json 삭제 | 팀
- 2026-11-14 | 착륙지 지평선 마스크: 관측점 150 m 안 표본 제외, 지면 고도는 반경 150 m 원판 평균 (PROVISIONAL, `MaskConfig.near_exclude_km`·`ground_radius_km`) | 대표 좌표가 30 m DEM 의 작은 구덩이에 떨어지면 지평선이 수 ° 높아진다 (shackleton_rim: 반경 90 m 안이 5–8 m 높아 Drive 대비 RMS 5.47°, 적용 후 약 0.37°) | `horizon.py`, `config.py`, `s30_masks.py` | 확인 필요 (팀)
- 2026-11-14 | GeoTIFF 값은 밴드 scale/offset 을 적용해서 쓴다. 비율 레이어는 0–1 밖이면 멈춘다 | PGDA69 GeoTIFF 는 int16 + 배율(일조율 4e-5, 하늘 입체각 2e-4 + 6.2832). 예전 블록별 퍼센트 추측은 틀렸다 | `io/geotiff.py`, `s50_layers.py` | —
- 2026-11-15 | 착륙지 주변 국지 음영기복을 파이프라인 s75 로 만든다 (s70 카탈로그 다음) (LOLA 30 m 남극 타일 → 착륙지 중심 20 km 정사각형, 1024 px ≈ 19.5 m/px, 조명 북서 35°는 보기용) | 03 기지 배치 지도(1 km 기본)에서 WAC 모자이크(약 440 m/px)로는 지형이 안 보인다. rasterio 없이도 돌도록 VRT 타일을 Pillow 로 읽는다. 카탈로그 착륙지(75°S 이남)만 만들고, 격자 칸·직접 입력 좌표는 WAC 로 대신한다 | `pipeline/luna/stages/s75_local.py`, `io/geotiff.py`, `cli.py`, `web/src/components/LocalMap.tsx` | 확인 필요 (팀)
