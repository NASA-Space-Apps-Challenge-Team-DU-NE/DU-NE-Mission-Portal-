> **Historical design record — Mode A is retired.** Its executable code, runtime reference asset and dedicated tools/tests have been removed. See [current Mode B cleanup](docs/MODE_B_ONLY.md) and [current dynamics](docs/EPHEMERIS_MODEL.md). Descriptions and paths below document the former implementation.

# NRHO 기준 궤도와 CR3BP 모델

이 문서는 유지되는 **Mode A — CR3BP Reference Mission**을 설명합니다. 지구와 달이 원형 공전하는 제한 3체 문제를 브라우저 Web Worker에서 적분합니다. 실제 UTC 날짜의 Gateway 운용 궤도나 정밀 천체력 임무가 아닙니다. 기존 100 km 착륙 모드도 별도로 유지됩니다. 추가된 **Mode B — 날짜 기반 임무**는 NASA 참조 초기상태와 DE440 지구·태양 천체력을 사용하며, 모델과 지원 날짜는 [docs/EPHEMERIS_MODEL.md](docs/EPHEMERIS_MODEL.md)에 설명합니다.

## 원본 초기조건과 선정

공식 [JPL Three-Body Periodic Orbits API 문서](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html)와 [실제 요청](https://ssd-api.jpl.nasa.gov/periodic_orbits.api?sys=earth-moon&family=halo&libr=2&branch=S&periodmin=6&periodmax=7&periodunits=d)에서 Earth–Moon L2 Southern Halo 후보 102개를 확보했습니다. 응답 버전은 1.0이며 원본 크기는 22,919 bytes입니다. 원본 응답은 `data/nrho/jpl-earth-moon-l2-southern-halo-6-7days.json`, 선택 결과는 `frontend/public/data/nrho/reference.json`에 있습니다. 획득 시각·SHA-256·응답 필드·선정 절차도 함께 보존합니다. 실행 중 외부 API에 접속하지 않습니다.

모든 후보를 Python/SciPy DOP853으로 한 주기 전파하고, 달 반경 교차·주기 폐합·Jacobi 오차를 검사한 뒤 근월점과 원월점을 국소 최소화로 정밀화했습니다. [NASA Gateway FAQ](https://www.nasa.gov/gateway-frequently-asked-questions/)의 대략적인 1,500 km / 70,000 km / 6.5일을 비교 목표로 사용했습니다. 무차원 선정 점수는 다음과 같습니다.

```
((h_peri - 1500)/1500)^2
+ ((h_apo - 70000)/70000)^2
+ ((period_days - 6.5)/0.5)^2
```

99개 적격 후보 중 원본 응답의 **0부터 세는 행 번호 42**가 선택되었습니다. 원본 초기상태에 보정값을 덧붙이지 않았습니다.

| 항목 | 선택된 원본 값 |
|---|---:|
| 질량비 μ | 0.01215058560962404 |
| LU | 389,703.264829278 km |
| TU | 382,981.289129055 s |
| JPL 달 반지름 | 1,737.1 km |
| 정규화 주기 | 1.4844142287293904 TU |
| 주기 | 6.57989438565일 |
| 최근월점 고도, JPL 반지름 기준 | 1,244.024941 km |
| 원월점 고도, JPL 반지름 기준 | 69,774.396034 km |
| Jacobi 상수 | 3.0485582675124885 |

정규화된 초기상태 `[x,y,z,vx,vy,vz]`는 다음과 같습니다.

```text
[1.0199980623062246,
 2.1160308577002953e-27,
 -0.1806643468271845,
 -2.5788917015758105e-13,
 -0.09880598885992746,
 -3.991534879589688e-12]
```

NASA의 대략적인 설명값을 정확히 만족시키기 위해 수치를 조작하지 않았습니다. 이 궤도는 Gateway와 유사한 주기·형상의 기준 Halo이며 Gateway 운영 궤도의 확정 자료가 아닙니다. LOLA 지형 기준 반지름은 1,737.4 km이므로 같은 반경의 LOLA 기준 고도는 표보다 0.3 km 낮습니다.

## 좌표계와 운동방정식

원점은 지구·달 질량중심입니다. 정규화된 회전좌표계에서 지구는 `(-μ,0,0)`, 달은 `(1-μ,0,0)`에 고정되고 회전 각속도는 1입니다.

```text
r1 = sqrt((x+mu)^2 + y^2 + z^2)
r2 = sqrt((x-1+mu)^2 + y^2 + z^2)

dx/dt  = vx
dy/dt  = vy
dz/dt  = vz
dvx/dt =  2*vy + x - (1-mu)*(x+mu)/r1^3 - mu*(x-1+mu)/r2^3
dvy/dt = -2*vx + y - (1-mu)*y/r1^3 - mu*y/r2^3
dvz/dt =           - (1-mu)*z/r1^3 - mu*z/r2^3
```

물리 단위 변환은 `r_km=LU*r`, `t_s=TU*t`, `v_km_s=(LU/TU)*v`입니다. LU/TU를 임의의 평균 지구–달 거리나 자전 주기로 대체하지 않습니다. 달 중심 관성좌표로 변환할 때 달의 위치를 빼고 회전항 `ω×r`을 속도에 포함합니다. 자세한 정·역변환은 `COORDINATE_FRAMES.md`에 있습니다.

## 적응형 적분과 변분방정식

`frontend/src/physics/nrho/cr3bp.ts`는 Dormand–Prince RK5(4)를 구현합니다. 5차 상태를 채택하고 4차 내장해와의 차이를 성분별 `atol + rtol*max(|y_old|,|y_new|)`로 나누어 시간 간격을 조절합니다. 기본 `rtol=2e-11`, `atol=1e-13`, 최대 간격은 0.01 TU입니다. 설정에 따라 더 엄격한 허용오차로 재전파합니다.

달 가까이에서는 한 간격의 이동 거리를 현재 달 중심 거리의 약 3% 이하로 제한합니다. 최대 적분 단계 수, 계산 시간, 취소 조건, 최소 시간 간격, 비정상 상태를 검사합니다. 양·음의 전파 시간을 지원하므로 출발 전 NRHO 애니메이션도 실제 역적분 상태를 사용합니다.

전이 shooting에서는 해석적인 동역학 Jacobian `A=∂f/∂y`와 상태 천이행렬 `dΦ/dt=AΦ`, `Φ(0)=I`를 함께 적분합니다. 계산된 최종 위치의 초기 속도 민감도를 Newton 보정에 사용합니다. Jacobian은 별도의 유한차분 회귀 검사와 비교합니다.

## 보존량과 기준 궤도 검증

무추력 구간의 Jacobi 상수는 다음과 같습니다.

```
C = x^2 + y^2 + 2*(1-mu)/r1 + 2*mu/r2 - (vx^2+vy^2+vz^2)
```

기동 전후에는 속도가 변하므로 같은 C를 강제하지 않습니다. 각 무추력 구간에서 그 구간 초기값 대비 최대 변화를 측정합니다.

개발 중 실제 기본 TypeScript 적분으로 얻은 한 주기 위치 폐합 오차는 약 **0.00644 m**, 속도 폐합 오차는 약 **4.0×10⁻⁸ m/s**, 최대 Jacobi 변화는 약 **1.49×10⁻¹¹**입니다. 더 엄격한 허용오차를 쓰는 통합 임무의 실제 수치는 `docs/nrho-validation-results.json`에 기록합니다.

원본 초기조건을 독립 SciPy DOP853으로 전파한 17개 중간 상태를 정적 자료에 포함하고, 테스트에서 비행 중간 상태와 주기 끝 상태를 대조합니다. Python 정밀 기준의 폐합 오차는 약 0.000131 m입니다. 두 적분기의 작은 수치 차이는 실제 항법·중력 모델 정확도를 뜻하지 않습니다.

화면에 표시하는 브라우저 근월점·원월점은 실제 채택된 적응형 표본의 최솟값·최댓값입니다. 전처리 문서의 값은 추가 국소 정밀화 결과이므로 몇 m 차이가 날 수 있습니다.

## 시간과 모델 범위

Mode A의 시간은 상대 시간입니다. 정적 SPICE 원본에서 한 번 추출한 달 지도 축 정렬을 고정하고 CR3BP의 균일 회전을 적용합니다. 이 정렬을 추출한 UTC를 전체 임무의 실제 날짜로 붙이지 않습니다. Mode B를 선택하면 별도의 날짜 기반 초기상태·천체력·달 자세 표와 전 구간 지구·달·태양 점질량 모델을 사용합니다. 위의 JPL 주기·Jacobi 보존 기준을 Mode B에 적용하지 않습니다.

전이까지는 CR3BP를 쓰고 LLO 진입 뒤에는 기존의 달 중심 2체+추력 모델로 명시적으로 전환합니다. 상태의 위치·속도·질량은 연결되지만, 이후 지구의 조석 가속도는 생략됩니다. 이 모델 차이를 숨기지 않으며, 전체 임무 `VALIDATED`는 이 구간별 모델 안에서 정의한 검증 상태입니다.

Mode A에는 태양 섭동과 실제 지구–달 궤도 이심률을 포함하지 않습니다. 두 모드 모두 달 중력장 고차항, stationkeeping, 유한 시간 NRHO 이탈·LLO 진입 연소, 자세·짐벌 제한, 실제 발사창을 포함하지 않습니다. NRHO 임무 해는 교육용 기준 임무이며 운용 또는 안전 인증에 사용할 수 없습니다.
