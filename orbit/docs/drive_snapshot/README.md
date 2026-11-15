# Lunar Landing Site Navigator 데이터 저장소

## 2026-11-14 경사·Diviner 해석 정정본

검증된 새 사용 파일은 [Science_Interpretation_Resolution_2026-11-14](https://drive.google.com/drive/folders/1UH2sAPmfX7pKfePOdkk-9DP3YT5Udety)에 게시했다. 기존 원자료와 이전 조사 기록은 보존한다. 아래 사항은 이 문서의 일반적인 미검증 안내와 별도로, 해당 해시·제품의 검사 범위에 한해 적용한다.

- **LOLA 경사:** 동일 시기·격자의 거칠기 공식 결측값으로 지원 영역을 판별한 경사 GeoTIFF와 마스크를 사용한다. 지원되지 않는 DN 0을 45°로 읽던 문제를 해소했다. 40m는 격자 간격이며 실제 측정 기준 길이는 30–120m이다.
- **Diviner ST128 V6:** 전송·변환 오류는 없었다. 음수·0을 보존한 온도편차 후보로 분리했으며, 정확한 V6 기준 온도는 미확정이다. `absolute_temperature_eligible=false`를 유지한다. 별도 Tbol 4종은 0.5° 격자의 절대 bolometric 온도로, ST 복원본이 아니다.
- 파생 데이터 8개는 전체 픽셀 검사와 Drive 재다운로드 SHA-256 대조를 통과했다. 이는 착륙 안전 인증이나 미래 시각 온도 예측을 뜻하지 않는다.

[사용 파일·전체 근거](https://drive.google.com/file/d/1Q8SaRZ-qX7SCyZ0SvjrUw-qCyrTlwGfa/view?usp=drivesdk) · [개발자 인계 Markdown](https://drive.google.com/file/d/1lbOY5IhaO4TJRB2hxwUsjRsuOF7xkbkc/view?usp=drivesdk) · [데이터 계약](https://drive.google.com/file/d/1feW9dBOFB7uzPOa7rsmohqneROoRUYQB/view?usp=drivesdk) · [게시 목록·해시](https://drive.google.com/file/d/1ghvdGFpUJLNOXjuXVg-arUuKyWugoZFI/view?usp=drivesdk)


> **파일을 고치거나 추가하기 전에 [`00_데이터_수정_원칙.md`](00_데이터_수정_원칙.md)를 반드시 읽고, [`01_변경_기록.md`](01_변경_기록.md)에 기록한다.**

NASA Space Apps Challenge 2026 "Lunar Landing Site Navigator" 프로젝트의 모든 데이터를 여기에 보관한다.
코드 저장소(Lunar-LandingSIte)의 `pipeline/drive.py`가 이 폴더와 로컬을 맞춘다.

- `python pipeline/drive.py status | pull | push`
- 원자료(Raw_Data)는 로컬로 복사하지 않고 파이프라인이 여기서 직접 읽는다.
- 로컬 경로: Google Drive for Desktop 마운트(`G:\.shortcut-targets-by-id\1zjLFlaLbIKSaiBUYTV8YoZKEmSa9wA0w\DU NE Data`). 다르면 환경 변수 `LUNAR_DRIVE_DIR`.

**프로토타입 데이터다. 수치 대부분이 미검증(`verified: false`)이다.** 최초 업로드 2026-11-13.

## 폴더

| 폴더 | 내용 | 출처 | 만든 방법 |
| --- | --- | --- | --- |
| `Raw_Data/LOLA_DEM/` | `ldem_80s_80m.img`(근거리, 80 m/px, 80°S 이남, 115.5 MB), `ldem_75s_240m.img`(원거리, 240 m/px, 75°S 이남, 29.1 MB)와 각 `.lbl` | PDS Geosciences Node, LRO LOLA GDR polar: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | 원본 그대로. 16비트 정수, 배율 0.5 m, 극 평사도법, 중심 경도 0°, MEAN_ME(DE421) |
| `Raw_Data/LOLA_DEM_Polar_HiRes/` | `ldem_80s_20m`(80°S 이남 20 m), `ldem_85s_10m`(85°S 이남 10 m), `ldem_875s_5m`(87.5°S 이남 5 m)과 짝인 관측 수 지도 `ldec_*`, 85°S 이남 40 m 경사 `ldsm_85s_40m`·거칠기 `ldrm_85s_40m`, 각 `.lbl`·`.xml`. 약 8.0 GB | PDS Geosciences Node, LRO LOLA GDR polar: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ (2026-11-14 받음) | 원본 그대로. 크기·SHA-256은 `receipts.json`. **픽셀 대부분이 보간값(20 m 64%, 10 m 80%, 5 m 93%)이라 반드시 `ldec`와 함께 쓰고 화면에 "측정 밀도 낮음"을 표시한다.** 규칙은 폴더 안 `README.md` |
| `Raw_Data/SPICE_Kernels/` | `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc` | NAIF generic_kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | 원본 그대로 |
| `Catalogs/` | `sites.json`(착륙지 27곳), `missions.json`(과거 미션), `landers.json`(착륙선 프리셋, 근사값), `stations.json`(지상국 4곳) | 직접 작성. `source_url` 대부분 열어 보지 않은 후보 주소 | 손으로 작성, `sites.json`의 고도·`has_terrain`은 DEM으로 갱신 |
| `Horizon_Masks/` | 착륙지 13곳의 지평선 마스크(1° 간격) | 위 LOLA DEM에서 계산 | `pipeline/build_all.py` |
| `Reference_Tables/` | 검증용 태양·지구 방위각·고도각 표. Horizons 3개, SPICE 3개(아폴로 11, 찬드라얀 3, 연결 능선) | JPL Horizons API, SPICE 커널 | `pipeline/horizons_ref.py`, `pipeline/ephemeris_ref.py` |
| `Web_Derived/ephemeris/` | 웹앱이 읽는 천체력 사전 계산 표(미션별, 2026-11-01~2028-01-01 범위) | JPL Horizons API | `pipeline/horizons_table.py` |
| `Workspace/<이름>/` | 개인 작업 공간 | | |
| `Incoming/` | 자리를 정하지 못한 새 데이터 | 출처 필수 | |
| `_Archive/` | 지우는 대신 옮겨 두는 파일 | | |
| `Web_Derived/grid/` | 80°S 이남 5 km 격자: 지평선(5° 간격), 고도, 경사, 셀 색인, 음영기복도 | 위 LOLA DEM에서 계산 | `pipeline/build_all.py` |

## 사용했지만 파일로 보관하지 않는 데이터

| 데이터 | 이유 |
| --- | --- |
| NASA Moon Trek WMTS 타일 `LRO_LOLA_ClrShade_Global_128ppd_v04`(3D 달 표면) | 웹앱이 실행 중에 직접 받는다. https://trek.nasa.gov/tiles/Moon/EQ/ |
| JPL Horizons API 응답 원문 | 가공 결과만 `Reference_Tables/`, `Web_Derived/ephemeris/`에 보관 |

## 고려했지만 아직 쓰지 않은 데이터

| 데이터 | 상태 |
| --- | --- |
| 공식 과제 리소스(Space Apps 과제 리소스 탭) | 받지 못했다. 받으면 `Official_Resources/`(가칭)에 둔다 |
| NASA PGDA LOLA 극지 고해상도 자료 | 열어 보지 않았다 |
| LROC QuickMap | 지형 일치 확인용으로 계획했으나 열어 보지 않았다 |
| Moon Trek 남극 투영(SP) 타일 | 목록 조회가 403이라 쓰지 못했다 |

## Connecting Ridge 지역 데이터 v1 · 2026-11-14 KST

[지역 지도 및 과학 데이터](https://drive.google.com/drive/folders/1VRaMUvIjtP4XgO6z9xr5LG3QW3PS2Nbt) · [수집·검증 보고서](https://drive.google.com/file/d/1GgTrr38p6sNDkK25V68N5UWed_4WDsrW/view?usp=drivesdk)

| 위치 | 추가 자료 | 출처·검증 |
| --- | --- | --- |
| Raw_Data/PGDA78, PGDA69 | LOLA 5 m 지형 원본과 60·240 m 조명 원본 구간 | [NASA PGDA 78](https://pgda.gsfc.nasa.gov/products/78), [PGDA 69](https://pgda.gsfc.nasa.gov/products/69). 원본 및 구간 해시와 원래 격자 검사 |
| Raw_Data/Diviner, PDS_PPI_MAG | 계절 온도 원본 구간 및 극지 자기장 원본 | [Diviner PDS](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm), [PPI 자료](https://doi.org/10.17189/rk57-g992). 온도 셀·자기장 표 검사 |
| Web_Derived/Site01 | Connecting Ridge 지역 GeoTIFF 9개, 고도 PNG, 온도·자기장 JSON | 2.4 km 사각형. 제품별 원래 해상도 유지 |
| Catalogs 및 Reference_Tables/external_checks | data_catalog.csv, data_manifest.json, 지역 관측목록, JPL/PDS/ODE 캐시 | 수집 2026-11-13~14 KST. 파일별 검증 범위는 manifest 및 COLLECTION_REPORT.md 참조 |

## 달 남극 75°~90° 전 경도 지역 데이터 · 2026-11-14 KST

원래 격자를 유지한 LOLA 30·80·240 m 지형, LROC 100 m 표면 영상, 60·120·240 m 조명·가시성, Diviner 온도, 중성자·수소·산화철, 궤도 자기장 및 M³ 분광 자료를 수록했다. 제품별 위도 범위는 목록에 따로 기록했다. 30 m 고도는 같은 폴더 안의 VRT로 36개 타일을 한꺼번에 열 수 있다.

[Drive 데이터 폴더](https://drive.google.com/drive/folders/1SQpXahDxWb3Rg33y8bQGlVcZEFc7Lez5) · [파일별 데이터 목록](https://drive.google.com/file/d/1mP4SCfG2e2wRC-mYXNSTdGYUVyL_u6-_/view?usp=drivesdk) · [범위·단위·검증 안내](https://drive.google.com/file/d/1LckfWDq00tDthWfrQkNI5V9IhS8aavhl/view?usp=drivesdk)


## 2026-11-15 KST 추가 자료 검토·수집 배치

검토·수집 배치명은 `2026-11-14`를 유지한다. 이 절은 개발자가 전달한 `data-gaps.md`의 30개 요구를 실제 보유 자료와 공개 원본에 대조한 후속 기록이다. 앞의 초기 프로토타입 안내와 당시 조사 상태는 역사로 보존하며, 새 자료의 실제 사용 조건은 이 절과 제품별 최신 검증 문서를 따른다. 앱 코드·카탈로그의 검증 플래그·기능을 직접 변경했다는 뜻은 아니다.

- [추가 원본·전송 조각](https://drive.google.com/drive/folders/1eZKbFoi5dVyKcQC2xCN1J6M_WZiMI9GW): `Raw_Data/Gap_Supplements_2026-11-14/` 아래 `science`, `terrain`, `operations`, `diviner`.
- [개발자 인계·검증 문서](https://drive.google.com/drive/folders/1CpHn5pXBs_23lKGekRSfgBnFChDSHtTS): `Workspace/Gap_Review_and_Handoff_2026-11-14/`. 사용자에게 받은 개발자 요구 원문은 `DEVELOPER_DATA_GAPS_AS_RECEIVED.md`로 구별한다.
- [파일목록 Excel](https://docs.google.com/spreadsheets/d/1VG05kpep8w2v2u6lwbpEWqFRDx88w-JF/edit): 기존 ID를 유지한다. 신규 자료를 포함한 2,138개 파일 목록과 점검 결과를 이 파일에서 확인한다.

이번 게시 결과는 **핵심 자료 218개와 최종 지원문서 3개, 합계 221개 파일·3,146,978,070B**다. 원본·분할 조각·검증 문서를 각각 세므로 과학 제품 221종이라는 뜻이 아니다. 신규 221개 모두 Drive 원격 전체 바이트의 크기와 SHA-256이 로컬 게시본과 일치함을 확인했다. `PUBLICATION_MANIFEST.json`은 핵심 큐의 게시 ID·바이트·원격 SHA-256 확인을 담고, `ADDED_DATA_CATALOG.csv`는 같은 범위의 목록이다. 순환 자기해시를 피하기 위해 두 목록과 `DEVELOPER_HANDOFF_GAP_SUPPLEMENTS_2026-11-14.md` 자체의 3문서는 그 핵심 목록에서 제외하고 최종 게시·재읽기 기록에 별도로 확인한다.

사용자가 지정한 상위 [DU:NE Data](https://drive.google.com/drive/folders/1zjLFlaLbIKSaiBUYTV8YoZKEmSa9wA0w) 아래 실제 [DU_NE Data](https://drive.google.com/drive/folders/1u3A21Su1smMEnUlx3kpJC99qzWuxtrX2)를 조사했다. 추가 전 새 파일 열거는 **1,917개**였고 개발자 문서의 2,083개와 집계가 달랐다. 시점·범위 차이를 데이터 누락으로 단정하지 않으며, 기존 1,917개 전체를 이번에 다시 내려받아 MD5 검사한 것은 아니다. 추가 후 확정 수는 최종 Excel과 게시 기록을 따른다.

### 추가 자료와 반드시 유지할 사용 조건

| 묶음 | 로컬 수집·검증 범위 | 적용할 조건 |
| --- | --- | --- |
| `science` | 원본·참고 28파일, 1,369,817,257B. M³, Kaguya SP, WAC TiO₂, 낙석·단층애 | 파일 무결성과 과학 사용 적격성을 분리한다. M³ v4는 유한 픽셀 중 736,350개에 0–100 범위 위반이 있고 지리참조가 미확정이므로 현재 정량 사용 차단. v1 RGB는 좌표 참고용이다. Kaguya는 sidecar adapter와 품질 검증이 필요하며 0–1 광물 분율을 질량 기준 미확인 상태에서 wt%라고 부르지 않는다. |
| `terrain` | 기본 북극 26항목과 추가 자료를 합친 최종 40항목, 1,158,427,589B. PGDA98 4래스터는 808,666,440B | 극지 PDS 고도는 DN×0.5m이고 +1,737,400m는 반지름이다. PGDA98 고도는 이미 m. PGDA69의 북극 CRS 충돌은 문서화한 VRT를 쓰되 분석은 native 해상도로 읽는다. JP2 축소 decode의 overshoot를 물리값으로 쓰지 않는다. |
| `operations` | 연구 GIS·표 4개와 공식/출처 문서 5개, 23,271,473B | 연구 GIS는 NASA 공식 후보경계나 직접 얼음량이 아니다. 22.65MB 연구 파일도 중첩 ZIP 해제 시 약944MB 이상의 파일이 된다. 조명 래스터는 12시간 단위 개수이므로 일수=DN/2이며 속성표는 이미 일수다. |
| `diviner` | 신규 16밴드 TAB 2,499,381,008B의 수치·격자 전수 검사, TAB/LBL/XML/FMT 49개 공개 MD5 일치 | 배포는 무손실 gzip과 라벨이다. Tbol 결측 33.67%, 96개 지방시 완비 셀은 7,703/230,400(3.34%). 관측 bin 평균을 전체 지방시 평균으로 표시하지 않는다. 달의 0–24 지방시는 24지구시간 기록이 아니다. |

WAC TiO₂는 약70°N–70°S 제품이며 75°S 이남을 채우지 않는다. 15wt% 초과 불신뢰 마스크, 2wt% 미만을1로 치환한 규칙과 PDS 특수값을 유지한다. 낙석의 검출 confidence는 미래 붕괴 확률이 아니며 서로 다른 임계치 CSV를 단순 합산하지 않는다.

PGDA69 Sun/Earth는 원반의 일부라도 보인 시간 단계 비율이다. 태양 원반 노출 면적이나 발전량 평균, 특정 지구국의 통신 성공률이 아니다. PGDA98의 유효해상도는 약6.16–1,649.55m로 명목80m 격자와 다르다. 관측수0은 의미 있는 품질 정보이며 자동 결측으로 숨기지 않는다.

Diviner는 `−9999 UNKNOWN`, `−9998 INVALID`, 감도 아래 음의 복사휘도에 따른 채널 밝기온도 코드를 분리한다. 채널별 마스크가 다르므로 한 채널의 결측으로 유효 Tbol을 자동 삭제하지 않는다. 기존 ST128 V6의 정확한 기준 온도 미확정과는 별개 문제다. 앞선 경사 동반 마스크·절대 Tbol 4종(합계2,836,504B)은 계속 재사용한다.

### 기존 보유 범위·운영 해석 정정

- PGDA104는 추가12지역과 기존 A310/Leibnitz Beta를 합친 **13지역**이지만 모든 변수가 완비된 것은 아니다. 후보별 부족 변수만 보강한다. 5m 격자는 발판 규모 장애물·토양 지지력 인증이 아니다.
- 기존 DE440s는 1849–2150년을 포함한다. 앱의 2026–2028 캐시가 없다는 이유만으로 기준 천체력 자료가 없거나 근사 전환이 필수인 것은 아니다. 프레임·UTC/ET·윤초·EOP를 확인한 기준 계산과 캐시 확장이 우선이다.
- USGS 9개 후보지역 공식 릴리스는 존재하지만 이번 원본 파일 목록 접근은403이었다. 이를 공개 자료 부재로 단정하지 않는다. NASA 2026년 계획의 Artemis III 궤도 시험/IV 착륙과 2024년 역사적 제품명을 구분한다.
- KDSA 시뮬레이션 좌표·운용 고도각을 측량 위치나 실측 horizon으로 승격하지 않는다. `verified: true` 일괄 전환, S/M/L 3/6/15km 피해반경 확정, 근거 없는 착륙·붕괴·통신 확률, 간접 수소/CPR/PSR에서 직접 얼음 wt%·깊이 산출은 하지 않는다.
- 39GB FeO, PGDA104 전체약26.6GB, 전체 반사율 큐브약7.1GB 및 전역64ppd 시간축 큐브는 전량 확보·계산하지 않았다. 기존 개요 지도와 선택 ROI·타일·요청 지점 계산을 사용한다. 앱 위치27/검증3·마스크13·과거미션16개라는 기존 수치는 이번에 독립 재실행하지 않았다.

### 파일을 복원하고 검증하는 순서

큰 파일의 `.parts`는 `REASSEMBLY_MANIFEST.json`에 적힌 순서대로 구분자 없이 연결하고 원본 전체 크기·SHA-256을 확인한 다음 읽는다. `.tab.gz`는 원래 TAB 이름으로 풀고 복원 해시와 라벨 참조를 확인한다. `scarps_polar.html.zip`은 HTML을 그대로 게시할 때 발생한 링크 정규화를 피하기 위한 원본 보존 ZIP이다. ZIP의 전송 해시와 내부 HTML 원본 해시를 구분하며, ZIP을 푼 HTML 바이트를 원본과 대조한다.

제품별 `acquisition_manifest`, README, 수치 QA와 메인 개발자 인계서를 함께 읽는다. **로컬 원본 무결성, 과학적 사용 조건, Drive 게시·원격 재읽기 상태는 독립 상태다.** 일부 파일의 PASS를 전체 게시나 앱 통합 완료로 확대하지 않는다. 앱 adapter 연결·캐시 재계산·기능 제한 적용은 별도 개발 작업이다.

최종 개발자 인계서: [30항목 검토·추가 자료·우회 구현 및 비활성화 조건](https://drive.google.com/file/d/1k4Ne-NZI6kH3MuQABUfAveQ_MFGrLivC/view). PGDA69 제품 설명 HTML도 원문 보존 ZIP으로 전달한다. 원격 전송 검증 완료는 과학 사용 제한의 해제나 앱 기능 구현 완료를 뜻하지 않는다.

## Artemis III 후보 착륙 지역 · 2026-11-15 KST

| 위치 | 추가 자료 | 출처·검증 |
| --- | --- | --- |
| `Raw_Data/Artemis_III_Regions_USGS_2024/` | 2024년 Artemis III 후보 9지역 경계 폴리곤(경위도)과 지역별 LGRS 항법 격자(1 km·100 m·10 m), 메타데이터 XML | [USGS DOI 10.5066/P1MEQ6UK](https://doi.org/10.5066/P1MEQ6UK). ZIP CRC·SHA-256 확인, 폴더 `README.md`·`receipts.json` |
