# 변경 기록

수정·추가 전에 `00_데이터_수정_원칙.md`를 읽는다. 새 줄은 표의 맨 아래에 추가한다.
상태: `작업 중` → `완료`. 같은 파일에 `작업 중`인 줄이 있으면 그 사람에게 먼저 묻는다.

| 날짜(KST) | 이름 | 파일·폴더 | 상태 | 내용 |
| --- | --- | --- | --- | --- |
| 2026-11-13 | 송상현 | 전체 | 완료 | 프로토타입 데이터 최초 업로드(Raw_Data, Catalogs, Horizon_Masks, Reference_Tables, Web_Derived), README 작성 |
| 2026-11-13 | 송상현 | `00_데이터_수정_원칙.md`, `01_변경_기록.md` | 완료 | 충돌 방지 원칙과 변경 기록 추가 |
| 2026-11-14 | LUNA-NAV 데이터 작업 | Raw_Data, Catalogs, Reference_Tables, Web_Derived/Site01 | 완료 | Connecting Ridge 2.4 km 지역 데이터·과학 관측 목록 및 검증 기록 추가. 초안은 _Archive/2026-11-14_Site01_초안에 보관 |
| 2026-11-14 | 송상현 | `Raw_Data/SPICE_Kernels/de440s.bsp` | 완료 | 드라이브에서 사라진 것을 발견(_Archive에도 없음). 로컬 원본(2026-11-13 업로드와 같은 파일)으로 복원 |
| 2026-11-14 | 송상현 | 신규 `Validation_Images/PILOT_LROC_NAC/` | 보류 | USGS PILOT LROC NAC 검증 영상. 선별 774장 중 19장만 드라이브에 있음(나머지는 G: 계정 용량 초과로 업로드되지 못한 채 캐시와 함께 삭제). 목록·스크립트는 `_lists/`, `_scripts/`. 다시 받는 일은 추후 요청 시 |
| 2026-11-14 | 송상현 | 신규 `Raw_Data/LOLA_DEM_Global/` | 중지 | PDS LOLA GDR 전역 `ldem_128`(약 237 m)과 극 지역 `ldem_60s_240m`, `ldem_60n_240m` 원본 다운로드. 요청으로 중지. 불완전한 `ldem_128.img`는 2026-11-14 삭제(아래 줄 참조) |
| 2026-11-14 | LUNA-NAV 데이터 작업 | [SouthPolar_75S_90S_v1](https://drive.google.com/drive/folders/1SQpXahDxWb3Rg33y8bQGlVcZEFc7Lez5) | 완료 | 남위 75°~90° 전 경도. 30 m 고도 36타일, 제품별 원래 해상도, Drive 파일 134개의 경로·크기 확인. [목록](https://drive.google.com/file/d/1mP4SCfG2e2wRC-mYXNSTdGYUVyL_u6-_/view?usp=drivesdk) |
| 2026-11-14 | 송상현 | `Raw_Data/CRaTER/`, `Incoming/CRaTER_derived/` | 완료 | LRO CRaTER 원본(하루 선량률 표 2, L2 SEC·HK 각 14일, L3 SEC 7일, PDS 형식 문서)과 L3 하루 요약표 업로드. 파일별 출처·sha256은 `receipts.json` |
| 2026-11-14 | 송상현 | `Reference_Tables/SPICE_기준표_사용법.md` | 완료 | SPICE 기준표(`spice_*.csv` 3개) 사용법 문서 추가. CSV 3개는 드라이브에 이미 같은 내용으로 있어 다시 올리지 않음 |
| 2026-11-14 | 송상현 | `Raw_Data/LOLA_DEM_Global/ldem_128.img`, `Raw_Data/LOLA_DEM/ldem_80s_80m.img` | 완료 | 불완전한 전역 DEM 앞부분(63 MB) 삭제(남극권은 같은 폴더의 `LOLA_LDEM128_75S_90S_native_rows.zip` 사용). 80 m DEM zip을 풀어 `.img`를 옆에 추가(zip은 유지). Diviner ST TIFF는 품질 기록만 두고 그대로 둠 |
| 2026-11-14 | 송상현 | 신규 `Raw_Data/LOLA_DEM_Polar_HiRes/` | 완료 | PDS LOLA 극지 고해상도 DEM(80°S 20 m, 85°S 10 m, 87.5°S 5 m)과 짝인 관측 수 지도(ldec), 85°S 40 m 경사·거칠기 원본 24개(약 8.0 GB). 서버 크기 일치, SHA-256은 `receipts.json`. 보간 픽셀 20 m 64%·10 m 80%·5 m 93%라 ldec와 함께 쓰고 화면에 "측정 밀도 낮음"을 표시하는 규칙을 폴더 `README.md`에 적음. 최상위 `README.md` 폴더 표에 행 추가 |
| 2026-11-14 | 송상현 | `Catalogs/sites.json`, `Catalogs/missions.json`, `Horizon_Masks/im1_odysseus.json`, `Horizon_Masks/im2_athena.json` | 완료 | IM-1·IM-2·Blue Ghost 착륙 좌표와 착륙 시각을 PDS CLPS SPICE 커널 값으로 교체(출처 URL 변경, 착륙지 3곳 verified: true, Blue Ghost 고도 0 → -3650 m). IM-1·IM-2 마스크를 새 좌표로 재계산. 미션 3개는 기간·결과가 아직 Wikipedia 출처라 verified: false 유지 |
| 2026-11-14 | 과학 자료 검증·게시 작업 | [Science_Interpretation_Resolution_2026-11-14](https://drive.google.com/drive/folders/1UH2sAPmfX7pKfePOdkk-9DP3YT5Udety), 최상위 README, 파일목록 엑셀 | 완료 | 파생8개와 조사·인계·해시 자료 게시, 경사 동반 결측 마스크 적용, Diviner 상대 편차 후보와 절대 Tbol 분리(V6 기준 미확정), 원자료 보존. 기존 엑셀 ID를 유지하며 새 파일·폴더·임무 집계 반영. |


## 2026-11-15 KST 후속 배치 기록

검토·수집 폴더명은 `2026-11-14`를 유지한다. 아래는 추가 자료의 검토·검증 및 게시 기록이다. 신규 221개·3,146,978,070B의 Drive 원격 크기·SHA-256 일치를 확인했다. 핵심 218개 ID·해시는 게시 manifest에, 전체 파일과 기존 이력은 Excel에 기록한다. 이전 표의 모든 이력은 보존한다.

| 날짜(KST) | 이름 | 파일·폴더 | 상태 | 내용 |
| --- | --- | --- | --- | --- |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | [추가 원본 폴더](https://drive.google.com/drive/folders/1eZKbFoi5dVyKcQC2xCN1J6M_WZiMI9GW) | 로컬 수집·검증 기록 | 개발자30항목을 보유 자료에 대조. 과학28파일1,369,817,257B, 북극 최종40항목1,158,427,589B, 운영9파일23,271,473B 및 Diviner 신규16밴드를 수집·검증. 제품 수와 조각/문서 파일 수를 구별한다. 기존 PGDA104는13지역, 절대 Tbol4종은2,836,504B로 보유 정정. |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | [인계·검증 문서 폴더](https://drive.google.com/drive/folders/1CpHn5pXBs_23lKGekRSfgBnFChDSHtTS) | 게시·원격 검증 완료 | 핵심 자료218개 + 최종 manifest/CSV/개발자MD3개, 합계221개 파일의 원격 크기·SHA-256 일치. 최종3문서는 순환 자기해시를 피하여 핵심 목록에서 제외하고 별도로 확인한다. 사용자 개발자 요구 원문도 별도 보존. |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | `science`, `terrain`, `diviner`, `operations` | 사용 조건 인계 | M³ v4 범위 위반736,350픽셀·좌표 미확정으로 정량 사용 차단, Kaguya sidecar adapter·분율 단위, WAC15wt% 초과 마스크, PGDA69 북극 CRS/native읽기, PGDA98 동일세대 품질층 조건 기록. Diviner16/16 수치 검사·49개 공식MD5 일치, Tbol결측33.67%·완비3.34%이며 달 지방시 평균과 미래 날짜 온도를 구별. |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | 전송 `.parts`, `.tab.gz`, `scarps_polar.html.zip` | 원본 보존 포장 | 큰 원본은 순서·조각/전체 해시가 있는 분할 manifest로, Diviner TAB은 무손실 gzip으로 전달. 그대로 게시한 HTML의 링크 정규화 문제는 같은 자료의 원본 바이트를 ZIP에 보존하는 방식으로 처리하고 ZIP과 HTML 원본 해시를 각각 기록. 과학 원본값은 임의 clipping·0치환하지 않음. |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | 최상위 README·변경 기록·[파일목록 Excel](https://docs.google.com/spreadsheets/d/1VG05kpep8w2v2u6lwbpEWqFRDx88w-JF/edit) | 기존 ID로 목록 연계 | 추가 전 새 목록1,917파일과 개발자 문서2,083의 범위/시점 차이를 기록. 기존 설명·품질·58개 점검 이력과4탭 보존, 신규221개·점검15개 추가 및 임무별 수식 범위 확장 대상. 새 파일·폴더·18개 과학임무 집계는 실제 최종 Drive 메타데이터에 맞춘다. Excel 자신의 크기는 새 저장 전 스냅샷임을 명시한다. |
| 2026-11-15 | 데이터 부족 검토·추가 수집 작업 | 앱 기능·카탈로그 해석 | 구현 인계 | 앱 코드와 검증 플래그는 이 자료 게시 작업에서 직접 수정하지 않음. KDSA 시뮬레이션 입력을 측량값으로 승격하지 않고, 근거 없는 피해반경·안전/통신 확률·직접 빙량 기능을 제한하도록 전달. USGS 공식 경계 접근 미해결과 연구 GIS 대안을 구분하고 기존 SPICE 기준 계산·선택 ROI를 우선하도록 기록. |
| 2026-11-15 | 송상현 | 신규 `Raw_Data/Artemis_III_Regions_USGS_2024/` | 완료 | USGS Artemis III 후보 9지역(2024, DOI 10.5066/P1MEQ6UK) 항법 격자 ZIP 9개·경계 폴리곤 ZIP·메타데이터 XML 원본 11개(2,140,046,811 B) 업로드. 업로드 후 Drive 사본 SHA-256 11/11 일치, `receipts.json`·폴더 `README.md` 추가. 경계 폴리곤은 팀 확인으로 공식 경계로 사용. 파일목록 Excel 은 갱신하지 않음 |
| 2026-11-15 | 송상현 | `Catalogs/sites.json` | 완료 | USGS 2024 Artemis III 후보 지역 중 카탈로그에 없던 5곳(Mons Mouton, Nobile Rim 2, Peak Near Cabeus B, Slater Plain, de Gerlache Rim 2) 추가. 좌표는 공식 경계(`Raw_Data/Artemis_III_Regions_USGS_2024/`)의 면적 중심으로 지역 대표점이며 정밀 착륙점 아님, verified: false. 고도는 LOLA DEM 지면 고도(파이프라인 s30). 지평선 마스크는 코드 저장소 파이프라인 산출물(web/public/data/masks)로 만들었고 Drive `Horizon_Masks/`에는 올리지 않음. 기존 10곳은 그대로 둠 |
| 2026-11-15 | 송상현 (LUNA-NAV 파이프라인 대조) | `Catalogs/sites.json`, `Catalogs/missions.json`, `Catalogs/landers.json` | 완료 | 출처 대조 결과 반영(사용자 확인). sites: 미션 착륙지 9곳 좌표를 `LUNA_HISTORICAL_SITE_COORDINATES_16.csv`(NSSDCA·LROC) 값으로 교체(35–430 m), 아폴로 3·SLIM·루나25 verified true, 2022 지역 이름만 있던 아르테미스 5곳(연결 능선·섀클턴 인근 봉우리·드 제를라슈 1·파우스티니 A·아문센)을 같은 지역 Wueller 외 2026 착륙 후보점(Zenodo 17084058)으로 교체(179–1055 m), 섀클턴 가장자리는 출처 없음 유지, 지형 밖 고도 0 → null. missions: 근거표(`LUNA_MISSION_FIELD_EVIDENCE.csv`·`LANDING_MISSION_RECONCILIATION.csv`)로 착륙 시각 6건·아폴로 전원(배터리)·운용 기간(근거 없는 11개 null, IM-1 168 h 근사, IM-2 12.77 h 유도) 수정, lighting_related 는 근거 문장 있을 때만 true/false 나머지 null. landers: 근거 없는 숫자 8개와 dust_radius_km 를 null. 필드 이름 변경 없음. 상세 표는 코드 저장소 `docs/validation.md` |
