# 2026-09-18 작업 마감과 이어서 할 일

## 현재 완료된 상태

- [PR #87](https://github.com/gomgomeet/newscomment-ai/pull/87): 새 사본의 공통 챗봇 연결 자동 검사, 연결 오류 구분, 미리보기 주소 복사. 병합 완료.
- [PR #88](https://github.com/gomgomeet/newscomment-ai/pull/88): 자동 복사 성공 여부와 관계없이 미리보기 주소를 직접 선택하는 대안. 병합 완료.
- 앱 버전은 0.12.1이다. 위 두 변경은 배포 템플릿과 기존 테스트 사본에 반영됐다.
- 이번 변경: 4단계에서 웹앱 주소 미확인이 미리보기 비활성화 원인임을 표시하고, **배포 주소 확인** 버튼으로 주소 검사 영역에 이동한다. 비활성 복사 버튼도 회색으로 표시한다. **이 안내 변경은 GitHub 반영 후 중단했으며 Apps Script에는 아직 반영하지 않았다.**

## 사본 구분

| 용도 | 교사 Sheet | Apps Script | 현재 상태 |
| --- | --- | --- | --- |
| 교사 배포 템플릿 | [템플릿](https://docs.google.com/spreadsheets/d/1eUZNfBLOm_1LBu2_HJXx_jV0sqvgPuVMF924whie-mc/edit) | `1oQsMCRUZrPdEH4cw0cTl761s6EAtny_UGWhdRiflQSs_aUa71xIRoyw8` | 0.12.1 소스 반영 |
| 기존 테스트 사본 | [기존 사본](https://docs.google.com/spreadsheets/d/19sdUnxaeWFXWLoT7blnOetX8Ay9LD4Nw3p3QT9dY8HU/edit) | `1QlMC-Sm4Pw7XO6J32UzgoeYVDGOBsxHDVAMe8eh2r0JpQmrKqybS_Z-J` | 웹앱 버전 5, 주소 검사 완료 |
| 사용자가 새로 만든 사본의 사본 | [현재 새 사본](https://docs.google.com/spreadsheets/d/1Qe_sZ47tyF8seN0YtzcxjM4jPez9mZsiHTBhg9DyRU8/edit) | `1pUhE9uhspVsSowDM8SF-WIHdP_8AW_2cUdtPHj80vCDzvfFrDkimNSC0` | 웹앱 버전 1, 주소 검사 완료, 99-999 미리보기 입장 화면 확인 |

새 사본에서 API 연결은 완료됐지만 웹앱 주소를 검사·저장하지 않아 버튼이 비활성화돼 있었다. 실제로 발급한 주소를 입력해 현재 사본·배포 버전을 확인한 뒤 저장했고, 그 사본의 교사 미리보기 링크가 열리는 것을 확인했다. 사용자가 첨부한 화면과 다른 사본을 혼동하지 않도록 위 ID로 구분한다. 교사 미리보기 토큰과 개인 API 키는 이 문서에 기록하지 않는다.

## 저녁에 이어서 할 순서

1. 사용자가 Google 검색창에 노출된 개인 API 키를 폐기하고 새 키로 교체한다. 새 키는 해당 사본의 교사 설정에서 저장·연결 확인한다.
2. 위 세 프로젝트의 최신 상태를 먼저 확인하고 백업한 뒤 **TeacherSetup.html의 이번 안내 변경만** 반영한다. 자료·평가기준·개인 키·학생 기록을 덮어쓰지 않는다. 교사 팝업은 닫고 다시 열어 최신 화면을 읽는다.
3. 새 사본의 4단계에서 배포 주소 확인과 미리보기 활성화가 일치하는지 확인한다. 미확인 상태는 자동 테스트에서 재현했으므로 정상 사본의 확인 기록을 억지로 지우지 않는다.
4. 사용자가 99-999로 지문 관련 질문을 보내 답변을 확인하고, **평가 시작하기**로 필수 두 문항을 진행한다. 교사 설정의 **상태 새로고침**으로 실제 미리보기 완료를 확인한다.
5. 실제 학생 테스트에서 대화와 필수 평가 응답 기록을 확인한 뒤 배포 준비를 마무리한다.

새 사본 소유자의 Google 권한 승인과 최초 웹앱 배포는 한 번 필요하다. 이번 안내 수정은 교사 팝업 HTML만 바꾸므로 학생 웹앱 런타임 변경은 없다. 다른 서버 변경을 추가하면 새 버전 배포 필요 여부를 별도로 확인한다.

## 검증

기존 GAS 점검 31건, 전체 `test:gas-lite`, 교사 설정 UI 및 필수 평가 UI 회귀 테스트를 통과했다. 실제 새 사본의 배포 주소 검증과 미리보기 입장 화면도 확인했다. 유료 학생 질문이나 평가 답변은 대신 제출하지 않았다.
