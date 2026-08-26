# Google 로그인 설정 안내

교사용 평가 대시보드(`/dashboard`)에 Google 로그인을 붙이는 절차다. 앱 코드는 이미 들어가 있고, 이 문서의 설정을 마치면 버튼이 실제로 동작한다.

## 왜 붙였나

기존 이메일/비밀번호 가입은 관문이 다섯 개였다.

```
① 이름·이메일·비밀번호(8자 이상) 입력
② Supabase가 확인 메일 발송
③ 교사가 메일함으로 나감 — 스팸함 확인
④ 링크 클릭 → /auth/callback 에서 code 교환
⑤ /login 으로 돌아와 다시 입력
```

연수 현장에서는 여기에 더 큰 벽이 있다. **Supabase 내장 메일 발송은 프로젝트당 시간당 2건으로 제한된다.** Pro 요금제로 올려도 내장 발송기는 같다. 교사 20명이 동시에 가입하면 2명만 메일을 받고 나머지는 `429 email rate limit exceeded`로 막힌다.

Google 로그인은 메일을 쓰지 않으므로 이 한도와 무관하다. 비밀번호를 새로 만들 필요도, 기억할 필요도 없다.

## 앱이 이미 갖춘 것

| 파일 | 역할 |
| --- | --- |
| `app/(auth)/actions.ts` | `signInWithGoogle` 서버 액션. `signInWithOAuth`로 Google 동의 화면 주소를 받아 이동한다 |
| `components/auth/google-sign-in-button.tsx` | 버튼과 구분선 |
| `app/(auth)/login/page.tsx` · `sign-up/page.tsx` | 이메일 폼 위에 버튼 배치 |
| `app/auth/callback/route.ts` | **손대지 않았다.** 이미 하던 code 교환을 그대로 쓴다 |

기존 이메일/비밀번호 로그인은 그대로 남아 있다. 이미 계정이 있는 교사가 막히지 않는다.

설정을 마치기 전에 배포해도 안전하다. 버튼은 보이지만 눌러도 Supabase가 거부하고, 오류 문구와 함께 `/login`으로 돌아온다.

## 1. Supabase에서 콜백 주소 복사

`Authentication → Sign In / Providers → Google`을 연다. 화면 아래 **Callback URL (for OAuth)** 을 복사한다.

```text
https://<프로젝트ref>.supabase.co/auth/v1/callback
```

Google에 등록할 값이다. 이 창은 열어 둔다.

## 2. Google Cloud에서 동의 화면 만들기

<https://console.cloud.google.com> → 프로젝트 선택 → **API 및 서비스 → OAuth 동의 화면**(새 UI 이름은 **Google 인증 플랫폼**).

마법사 네 단계를 채운다.

| 단계 | 넣는 값 |
| --- | --- |
| 앱 정보 | **앱 이름** — 교사가 동의 화면에서 보는 이름이다. `NewsComment AI` 처럼 알아볼 수 있게 쓴다. 이름에 `Google`은 넣을 수 없다. **사용자 지원 이메일** — 드롭다운에서 본인 계정 |
| 대상 | **외부(External)**. 개인 Gmail이면 내부는 선택 자체가 안 된다 |
| 연락처 정보 | 본인 이메일. 사용자에게 보이지 않는다 |
| 완료 | 정책 동의 후 만들기 |

## 3. 클라이언트 만들기

왼쪽 **클라이언트 → 클라이언트 만들기**.

- 애플리케이션 유형: **웹 애플리케이션**
- 이름: 아무거나. 사용자에게 보이지 않는다
- **승인된 리디렉션 URI**: 1단계에서 복사한 주소를 그대로 붙여 넣는다

만들면 **클라이언트 ID**와 **클라이언트 보안 비밀번호**가 팝업으로 뜬다. 창을 닫기 전에 둘 다 복사한다.

## 4. Supabase에 값 넣기

`Authentication → Sign In / Providers → Google`로 돌아가 토글을 켜고 두 값을 넣은 뒤 저장한다.

## 5. 돌아올 주소 허용하기

`Authentication → URL Configuration`. 이 단계를 빠뜨리면 Google 로그인은 되는데 앱으로 돌아오지 못한다.

- **Site URL**: `https://newscomment-ai.vercel.app`
- **Redirect URLs**:
  ```text
  https://newscomment-ai.vercel.app/auth/callback
  http://localhost:3000/auth/callback
  https://newscomment-ai-*.vercel.app/auth/callback
  ```

세 번째 줄은 Vercel 미리보기 배포용이다. 와일드카드를 지원한다.

`signInWithGoogle`은 돌아올 주소를 요청 헤더에서 만든다. 미리보기와 운영이 서로 다른 호스트에서 도는데도 각각 자기 주소로 돌아오게 하려는 것이다. 그래서 **여기 등록한 호스트에서만 동작한다.**

## 6. 게시하기

Google Cloud의 **대상** 탭에서 게시 상태를 확인한다. 기본값인 **테스트** 상태에서는 등록한 테스트 사용자만 로그인된다. 연수처럼 여러 교사가 쓰려면 **프로덕션으로 푸시**를 눌러야 한다.

`openid`, `userinfo.email`, `userinfo.profile`만 쓰므로 민감한 범위가 아니고, Google 심사 없이 바로 게시된다.

## 7. 확인

1. `/login`을 연다
2. **Google로 계속하기**를 누른다
3. Google 동의 화면에서 계정을 고른다
4. `/dashboard`로 들어오면 성공이다

## 문제 해결

| 증상 | 원인 |
| --- | --- |
| `redirect_uri_mismatch` | 3단계의 승인된 리디렉션 URI가 Supabase 콜백 주소와 다르다. 끝의 슬래시까지 맞춘다 |
| Google 화면에 "이 앱은 차단되었습니다" | 6단계 게시를 안 했거나, 테스트 사용자에 그 계정이 없다 |
| 로그인 뒤 `/login`으로 되돌아옴 | 5단계 Redirect URLs에 그 호스트가 없다. 미리보기 배포에서 자주 걸린다 |
| 버튼을 눌렀는데 오류 문구가 뜸 | Supabase에서 Google 제공자가 아직 꺼져 있다 |
| 학교 계정만 안 됨 | 교육청·학교 Workspace가 외부 앱 로그인을 막아 둔 경우가 있다. 개인 Gmail로 먼저 확인하고, 연수 전에 실제 학교 계정으로 한 번 시험한다 |

## 남은 과제

- **비밀번호 재설정 흐름이 없다.** 이메일/비밀번호 경로를 계속 쓸 거라면 `resetPasswordForEmail`과 재설정 페이지가 필요하다. Google 로그인을 주 경로로 삼으면 후순위여도 된다.
- **이메일 확인 끄기**를 함께 검토할 만하다. `Authentication → Providers → Email → Confirm email`을 끄면 이메일 가입도 메일 왕복 없이 끝난다. 코드 변경은 필요 없다 — `signUp`이 이미 세션이 있으면 바로 대시보드로 보낸다.
