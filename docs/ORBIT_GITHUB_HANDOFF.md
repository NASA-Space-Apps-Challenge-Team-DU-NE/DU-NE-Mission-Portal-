# Orbit GitHub 반영 및 빌드 안내

2026-11-15. 사용자 요청에 따라 Orbit 통합·후속 수정·검증 결과를 미션 포탈 저장소에 반영한다.

- 저장소: https://github.com/NASA-Space-Apps-Challenge-Team-DU-NE/DU-NE-Mission-Portal-
- 업로드 브랜치: `integration/orbit-local`
- PR 대상: `main`. `CLAUDE.md` 12.3 및 16절에 따라 기능 브랜치와 PR을 사용하며 main에 직접 커밋하지 않는다.
- 최초 통합 기준: `ed8146bf3f91f0067f630cc4af9df31ba079d18a`
- 게시 전 최신 main `60255e9`를 fast-forward로 반영했다. 새 Cloudflare 설정의 동작 값은 유지하고 빌드 명령 주석만 갱신했다.

## 포함 사항

Mode B 정적 iframe/Worker 통합, 01/02 임무 입력 전달, 검증 예제 기본값, 카탈로그 ID·전용 지형 마스크 보존, 초기 메타데이터 실패 재연결, Esc 도움말 닫기, EN/KR 동기화, 보고서·순위 CSV의 Orbit 입력/결과/검증 연결을 포함한다.

수치 물리 코드와 과학 데이터는 후속 UI 수정으로 바꾸지 않았다. 다른 순위 후보에 현재 임무 결과를 붙이지 않으며 미계산 상태를 명시한다. 기존 순위 점수와 순서는 유지한다.

## 검증 기록

- [최초 통합](ORBIT_INTEGRATION.md), [통합 검증 JSON](orbit-integration-validation.json), [하위 경로 검증](orbit-integration-subpath.json)
- [후속 수정](ORBIT_REVIEW_FIXES.md), [후속 검증 JSON](orbit-review-fixes-validation.json), [실제 기본 임무 결과](orbit-review-fixes-browser-default.json)
- 포탈 타입·규칙 검사 및 170개 단위 검사, Orbit 76개 회귀 검사 통과.
- Chrome 통합 11개 통과, 마지막 번역 변경 후 관련 3개 재검사 통과.
- 기본 임무: 실제 계산 `VALIDATED`, 필수 물리 검사 20/20, 경로 샘플 6,653개.
- 후속 수정 전후 계산·자료 관련 510개 파일의 SHA-256 동일. 업로드 전 검증 JSON에 기록된 소스 해시도 재확인했다.

JSON의 `remote_commit_or_push: false`와 최초 통합 기록의 원격 상태는 각각 로컬 검증을 수행한 시점의 스냅샷이다. 게시 이후 상태로 과거 검증 기록을 다시 쓰지 않았다. GitHub Actions의 결과는 해당 PR에서 별도로 확인한다.

## Cloudflare 빌드 설정

원격 main의 `wrangler.jsonc`에는 Cloudflare Workers Builds가 기존 `cd web && npm ci && npm run build` 명령을 사용한다고 적혀 있다. 이 명령은 Orbit 의존성 설치와 정적 번들 생성을 포함하지 않으므로 통합본은 다음 설정이 필요하다.

- 빌드 루트: 저장소 루트
- 빌드 명령: `npm ci && npm run build`
- Node.js: 22 이상
- 정적 파일 위치: `web/dist` (기존 `assets.directory` 유지)
- 배포/미리보기 명령과 Worker 이름은 기존 Cloudflare 설정 유지

루트 설치 스크립트가 포탈과 Orbit 의존성을 각각 잠금 파일로 설치한다. 루트 빌드는 Orbit 번들을 준비한 뒤 포탈을 빌드한다. `web/public/orbit`와 `web/dist`는 재생성되는 산출물이라 Git에 포함하지 않는다. 웹사이트 실행에는 Python/Node API 서버나 DB가 필요 없다.

이번 요청은 저장소 업로드다. Cloudflare 계정의 실제 빌드 설정은 조회·변경하지 않았으며, main 병합/배포 시 위 설정을 확인해야 한다.

## GitHub CI에서 추가 확인한 사항

첫 업로드 `0a18a69`의 Ubuntu/Node 22 검사에서 포탈 170개와 기본 GRAIL 임무를 포함한 Orbit 75개 검사는 통과했다. 기존 LLO 회귀 검사 1개만 Windows 기준값과의 `strictEqual` 비교에서 실패했다. 착륙 잔차는 기준 `0.00002241408835785068 m`, Linux 계산 `0.000022414660923714336 m`로 차이는 약 `5.73e-10 m`였다.

두 번째 기준 사례에서도 `2.7169617539e-8 m` 차이를 확인했다. 두 기준 사례가 모두 실행되는지도 명시적으로 검사한다. 해당 테스트의 6개 요약 수치는 유한한 숫자임을 확인하고 `1e-6 + 1e-12 × max(|actual|, |expected|)` 범위에서 비교하도록 수정했다. 상태 비교는 여전히 완전 일치한다. 수치 모델·데이터·최적화·착륙 성공 제약은 변경하지 않았다. 이 수정은 회귀 테스트의 OS/Node 간 반올림 처리이며 비행 허용오차 변경이 아니다. 원래의 로컬 검증 기록과 구별한다.

파이프라인과 Cloudflare Workers의 첫 브랜치 빌드 검사도 성공했다. Cloudflare 검사 통과는 미리보기 사이트에서 Orbit을 실제 실행했다는 검증과 구별하며, 최종 상태는 [PR #10](https://github.com/NASA-Space-Apps-Challenge-Team-DU-NE/DU-NE-Mission-Portal-/pull/10)의 검사를 따른다.
