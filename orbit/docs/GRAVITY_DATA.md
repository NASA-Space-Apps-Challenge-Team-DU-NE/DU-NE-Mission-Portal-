# GL1800F 정적 중력장 데이터

Mode B의 달 중력장 입력은 NASA/JPL GRAIL GL1800F의 **DE440 PA** 계수다. `frontend/public/data/gravity/index.json`에는 최대 90차까지의 전역 계수, 물리 규약과 PA→ME 고정 회전만 포함한다. 원본 약 198 MB 대신 **164,088 bytes**를 배포하며 런타임에 Python, Drive 로그인, NASA API가 필요하지 않다. 이 자료는 실제 관측으로 추정한 유한 차수 모델이며 실제 착륙 정확도 또는 안전 인증이 아니다.

## 출처와 실제 보유 자료

- [NASA PDS 계수 TAB](https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.tab), 같은 이름의 [PDS4 라벨](https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.xml), [PDS3 라벨](https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/jggrx_1800f_sha.lbl).
- [Park 외, 2025, 모델 논문](https://doi.org/10.1038/s41586-025-08949-5): 정규화와 DE440 PA 프레임, 고차 지형 기반 제약을 설명한다.
- [프로젝트 Drive의 GL1800F 원본](https://drive.google.com/drive/folders/1YAquBRR4JxP6cD7sW02gdj6qDMo7_3wy): `jggrx_1800f_sha.tab.gz`는 공식 TAB의 무손실 포장이다. 앱 배포에는 포함하지 않는다.
- 기존 [남극 과학자료 geodesy 폴더](https://drive.google.com/drive/folders/1yVM-t7sg5Hw2fV4DQCdBoq5YNkXErOFm)에도 GRGM1200A 전체 계수가 있다. 상위 카탈로그의 `catalog_only`는 실제 보유 상태와 다르다. GRGM1200A의 **DE430 PA**를 DE440 PA에 무변환 적용하지 않는다. 기존 원본은 보존한다.

## 데이터 계약

| 항목 | 값 |
|---|---|
| 스키마 | `lunar.gravity.v1` |
| 제품 | `GL1800F`, 원본 최대 degree/order 1800/1800 |
| 배포 최대 degree/order | 90/90; 20/30/60/90 및 동일 GM의 degree-0 검증 기준 지원 |
| GM | 4902800306330.2 m³/s² |
| 계수 기준 반지름 | 1,738,000 m |
| 좌표계 | 달 질량중심, `MOON_PA_DE440` |
| 정규화 | `4pi`, fully normalized real geodesy harmonics |
| 위상 | `csphase=1`, Condon–Shortley `(-1)^m` 제외 |
| 경도·각도 | 동경 양수, planetocentric latitude |
| 배열 | `c[i]`, `s[i]`, `i=n(n+1)/2+m`, 0≤m≤n≤90 |
| 숫자 | JSON 실수 → JavaScript IEEE754 binary64; byte endian 해당 없음 |
| 중심항 | 원본에 없는 `c[0]=1`을 명시적으로 삽입; 중심항 한 번만 합산 |
| degree 1 | 원본의 0 계수 보존 |
| 조석 | 원본 degree 2/3에 permanent tide 없음; 시간가변 고체 조석 추가 없음 |

`c[0]=1`과 별도의 달 점질량 가속도를 동시에 더하지 않는다. GRAIL 모드는 중앙항·고차항에 모두 위 GM을 쓴다. 기존 점질량 모드의 GM은 회귀를 위해 유지하므로, 고차항만 비교할 때는 같은 GL1800F GM의 degree-0 결과를 별도로 쓴다.

구면조화 계수는 전역 기저다. 위도 ROI로 자르는 데이터가 아니며 전역 차수 절단을 사용한다. LOLA 지형은 별도의 ROI를 사용할 수 있다. 계수 반지름 1,738 km와 LOLA 고도 기준 1,737.4 km는 다른 값이다. 중력 기준 반지름을 지형 충돌 경계로 사용하지 않는다. 근지표의 외부 전개·하향 연장과 낮은 차수에는 모델 오차가 남아 있으며 N90을 물리적 참값으로 간주하지 않는다.

## PA–ME–J2000 관계

정적 자산의 `pa_to_me_rotation`은 다음 직접 SPICE 호출의 결과를 row-major 3×3으로 저장한다.

```python
spice.pxform('MOON_PA_DE440', 'MOON_ME_DE440_ME421', epoch_et)
```

열벡터에 대해 `r_ME = pa_to_me_rotation @ r_PA`다. 기존 천체력의 `R_ME→J2000(t)`와 곱하면 `R_PA→J2000(t)`가 된다. 적분 각 단계의 실제 ET/TDB에서 이 회전을 사용한다. 중력 벡터만 회전할 때 Rdot 항이나 원심력·코리올리항을 추가하지 않는다. 표면 상대 속도에는 기존 올바른 Rdot 상태변환을 유지한다.

사용 커널은 기존 `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`이며 각 SHA-256을 자산에 기록한다. 이름이 비슷한 `MOON_ME` 또는 DE430 프레임을 추측으로 대체하지 않는다.

기존 ME 표에 고정 PA→ME 회전을 곱한 결과를 원본 `sxform(PA,J2000,t)`에 대조했다. 2026-11-01–12-01 UTC 범위 내 **12,960개 내부 시각**에서 최대 회전 원소 오차는 `8.9862e-13`, 직교성 잔차 `3.4639e-14`, 1,738 km 표면 벡터 위치 차이 `1.6726e-6 m`, Rdot 원소 차이 `2.2151e-15 /s`였다. 양쪽 지원 경계도 별도 golden fixture에 포함한다. 이는 기존 천체력 지원 기간을 확대하지 않는다.

## 원본 검사와 재현

원본 TAB은 **197,969,644 bytes**, SHA-256:

```text
d2a552067a78bf1d2755807ae14ee1d6843a8f6a4228e01ce59a665516738fec
```

`prepare_gravity.py`는 `.tab` 또는 `.tab.gz`를 읽고 전체 1,622,700행의 순서·인덱스·유한값·불확실성 비음수 여부를 검사한다. 필요한 90차까지만 저장하더라도 전체 원본 해시와 끝까지의 레코드 완전성을 검사한다. 계수는 원본 10진값을 binary64로 해석해 JSON round-trip으로 저장하며 별도 자릿수 반올림을 하지 않는다.

원본 PDS3의 `FILE_RECORDS=1622704`는 실제 122-byte 레코드 수 `1622702`와 다르다. PDS4의 `offset=244` 및 `1622700 × 122` 계수 바이트는 실제 파일과 일치한다. 원본 라벨을 고치거나 끝에 가짜 행을 추가하지 않는다. 이 알려진 차이는 자산 및 검사 보고서에 남긴다.

프로젝트 루트에서 개발용 Python 환경에 `numpy`, `scipy`, `spiceypy`를 준비하고 실행한다. 기존 `data/config.json`이 원본 SPICE 커널 위치를 가리켜야 한다.

```powershell
python scripts/prepare_gravity.py --source /path/to/jggrx_1800f_sha.tab.gz
python scripts/independent_verify_gravity.py
```

전처리 결과:

- `frontend/public/data/gravity/index.json`: 배포 계수와 규약
- `frontend/public/data/gravity/manifest.json`: 배포 파일 크기와 SHA-256
- `data/gravity/source-inspection.json`: 전체 원본 구조 검사
- `data/gravity/reference-fixtures.json`: 독립 가속도·퍼텐셜·Jacobian 및 SPICE 기준값
- `docs/gravity-data-validation.json`: 독립 검사 방법, 허용 기준, 수치 결과

현재 배포 `index.json` SHA-256:

```text
52127cccb74dd3c26d3ceac6e7099d63d818d31e22653fe79cdea6023282c848
```

원본 모델·규약·계수 또는 회전 자료를 바꾸면 자산 해시, 브라우저의 고정 해시, fixture와 검증 보고서를 함께 재생성해야 한다. 해시 오류 시 점질량으로 조용히 대체하지 않는다. 일반 사용자 실행은 Python 없이 `npm install`, `npm run dev`, `npm run build`만 사용한다.

`.gitattributes`는 배포 과학 데이터와 원본 NASA 라벨·상수 커널의 줄바꿈 자동 변환을 끈다. Windows의 `core.autocrlf=true` 환경에서도 체크아웃한 바이트와 검증 해시가 같아야 한다.

## 독립 평가 방법과 해석 범위

Python 기준값은 [SciPy `sph_harm_y_all(diff_n=1)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.sph_harm_y_all.html)의 복소 정규직교 각도 함수 및 도함수를 사용하며, 배치 인덱스·규약을 [개별 `sph_harm_y`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.sph_harm_y.html) 호출과 대조한다. 브라우저의 Cartesian solid-harmonic recurrence와 다른 평가 경로다. m=0은 √(4π), m>0은 √(8π)(−1)^m을 곱하고 실수·허수 성분을 C/S에 대응시켜 [실수 geodesy 4π/no-CS 정의](https://shtools.github.io/SHTOOLS/real-spherical-harmonics.html)로 바꾼다.

정확한 극점의 수평 가속도는 경도 0과 π/2 방향의 해석적 θ 미분으로 구한다. 극점에서 0으로 나누거나 평가점을 epsilon만큼 옮기지 않는다. Jacobian 기준은 독립 가속도의 4차 중앙차분 h=5 m이며 h=10 m 결과와 대조한다.

60개 기준 사례는 degree 0/20/30/60/90 × 12개 위치다. 정확한 양 극점, 극점에서 약 0.76 m 떨어진 점, 적도, 연결 능선과 유사한 숫자 경위도의 PA 시험 방향, 계수 반지름보다 낮은 점, 100 km LLO, NRHO 거리와 일반 3차원 점을 포함한다. 모든 점은 PA 좌표의 합성 시험점이며 `connectingridge_like_PA_direction`은 실제 MOON_ME 착륙 좌표나 해당 LOLA 고도가 아니다. 기준 평가기의 degree-0 가속도 오차는 최대 `4.4409e-16 m/s²`, Jacobian h5/h10 차이는 `2.2112e-16 /s²`다.

브라우저 대조 허용치는 퍼텐셜 `2e-7 m²/s²`, 가속도 성분 `3e-10 m/s²`, Jacobian 성분 `2e-11 /s²`다. 이는 구현 일치도 검사 한계이며 달 중력 모델의 물리적 오차나 착륙 정확도 한계가 아니다. 각 차수와 N90의 가속도 차이는 보고서 `degree_comparison`에 기록하며, N90 자체의 오차는 이 비교로 알 수 없다.

현재 TypeScript 코어의 60개 사례를 실제로 내보내 독립 Python 평가와 대조했으며 모두 통과했다. 최대 차이는 퍼텐셜 `1.3970e-9 m²/s²`, 가속도 성분 `8.6346e-14 m/s²`, Jacobian 성분 `1.7716e-16 /s²`다. SciPy 배치 및 개별 함수의 기준 대조 차이는 0이었다. 이 결과는 `docs/gravity-data-validation.json`의 `browser_comparison`에 기록한다.

독립 브라우저 평가를 JSON으로 내보낸 경우 다음 명령으로 같은 60개 사례를 대조할 수 있다.

```powershell
python scripts/independent_verify_gravity.py --compare path/to/browser-evaluations.json
```

입력은 `cases` 배열이며 각 원소는 fixture와 같은 `name`, `degree`, `potential_m2_s2`, `acceleration_m_s2`, 필요 시 row-major `jacobian_s2`를 포함한다. 보고서의 `browser_comparison`이 없으면 기준값 생성만 완료된 상태다. 실제 전체 임무의 수렴·연료·착륙 오차·브라우저 성능은 별도 임무 검증 보고서를 함께 확인한다.

## N30 적분기 회귀 시간창

아래 ±7일 창은 고정된 초기상태로 적분기를 검사하는 회귀 자료다. 현재 Mode B의 출발 지원 기간 제한이 아니다. 실제 출발은 확장된 NASA type-9 표에서 직접 조회하며 [날짜 확장 검증](EPHEMERIS_EXPANSION.md)을 따른다. 아래의 과거 수치와 현재 원시 보고서는 각각의 생성 시점을 구분한다.

`scripts/verify_gravity_reference_window.py --degree 30`은 원본 NASA SPK 초기상태에서 양방향 7 TDB일을 직접 SPICE + 독립 SciPy 중력장/DOP853으로 전파한다. 최대 적분 간격 300 s와 150 s를 대조했고, 40,002개의 달 거리 표본에서 유한 상태·충돌 여유를 확인했다. 위치 정밀화 차이는 최대 `0.000283841 m`, 속도 차이는 `2.802e-9 m/s`이며 최소 표본 달 고도는 약 1,715 km였다. 표본 검사는 연속 구간의 충돌 안전 증명이 아니다.

정확한 범위는 **2026-11-05T00:00:00.000111Z–2026-11-18T23:59:59.999869Z**다. 이는 초기시각 기준 ±7 TDB일이며 정확히 ±7 UTC일로 반올림하지 않는다. `data/gravity/reference-window-30.json`에 ±1/±3/±7일의 독립 기준 상태를 기록한다.

`node scripts/compare-gravity-reference-window.mjs`와 `tests/gravity-reference-window.test.ts`는 실제 coast와 같은 적분 설정(`rtol=2e-12`, 위치 절대오차 `1e-5 m`, 속도 절대오차 `1e-8 m/s`, 최대 간격 300 s)으로 6개 기준 상태를 대조한다. 최대 위치 차이 **0.009873 m**, 속도 차이 **1.023e-7 m/s**로 허용치 0.1 m / 1e-5 m/s를 통과했다. 더 엄격한 테스트 전용 설정으로 생산 코드의 오차를 숨기지 않았다. 결과는 `docs/gravity-reference-window-30.json`의 `browser_comparison`에 저장한다.

이는 **N30의 이 초기상태 전파 시간창**을 검증한 결과다. 모든 날짜·착륙지에서 전이/하강이 수렴한다는 보장, 정확한 주기궤도 증명 또는 실제 궤도 유지 검증이 아니다. 다른 차수의 전체 시간창은 이 보고서의 검증 범위에 포함되지 않는다.

이전 기본 N30 전체 임무도 원본 NASA 초기상태부터 이탈·진입·DOI·하강을 끊김 없이 재적분한 독립 검사 23개를 통과했다. 당시 TypeScript 결과와의 위치 차이는 약 0.053742 m다. `docs/gravity-independent-mission-validation.json`에는 검증한 임무 파일 해시와 실제 검사 범위를 기록한다. 이 수치 역시 구현 일치도이며 실제 착륙 정확도가 아니다.
