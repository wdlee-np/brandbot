# BUG-03 — Gemini Context Cache INVALID_ARGUMENT 오류

> 발견일: 2026-03-15
> 심각도: P0 (Critical) — 챗봇 대화 및 퀴즈 자동 생성 완전 불가

---

## 현상

퀴즈 AI 자동 생성 클릭 시 에러:
```
Cache create failed (400): {"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}
```

챗봇 대화 시:
```
서비스 초기화 중 오류가 발생했습니다. (500)
```

---

## 원인

`services/gemini/cache.ts`의 `createCache()`가 Gemini Developer API
(`generativelanguage.googleapis.com/v1beta/cachedContents`)로 context cache 생성을 시도하는데,
현재 사용 중인 **모든 모델이 이 엔드포인트에서 context caching을 지원하지 않음**.

직접 curl 테스트 결과:
| 모델 | generateContent | cachedContents |
|------|----------------|----------------|
| `gemini-3.1-flash-lite-preview` | ✅ 200 OK | ❌ 400 INVALID_ARGUMENT |
| `gemini-2.0-flash-001` | - | ❌ 400 INVALID_ARGUMENT |

Context caching은 특정 안정 버전 모델(`gemini-1.5-pro-001` 등) 또는 Vertex AI에서만 지원.

---

## 영향 범위

- `/api/chat/[projectId]/message` → `getOrCreateCache()` 실패 → 500 에러
- `/api/admin/projects/[id]/generate-quizzes` → 동일 경로로 실패
- 두 기능 완전 동작 불가

---

## 수정 방법

Context cache 의존성 제거. `generateWithContext()` 헬퍼로 교체:

1. **cache 시도 → 실패 시 인라인 폴백** 방식 도입
   - cache 생성 성공 시: `cachedContent` 파라미터로 호출 (기존)
   - cache 생성 실패 시: `systemInstruction` + 브랜드 파일을 요청에 직접 포함

2. **변경 파일**
   - `services/gemini/cache.ts` — `generateWithContext()` 추가, `getOrCreateCache` 에러 시 null 반환
   - `app/api/chat/[projectId]/message/route.ts` — `generateWithContext()` 사용
   - `services/quiz/generate.ts` — `generateWithContext()` 사용

---

## 수정 상태

- [x] 버그 분석 완료
- [x] 코드 수정 완료
