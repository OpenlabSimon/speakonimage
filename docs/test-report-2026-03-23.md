# SpeakOnImage Test Report

Date: 2026-03-23

## Scope

This round focused on release readiness for:

- invite-gated production access on `https://www.dopling.ai`
- topic generation
- coach review generation
- Gemini TTS coach audio
- profile access
- automated unit/integration coverage

## Test Design

The test plan was split into four layers:

1. Automated unit and integration tests via `vitest`
2. End-to-end browser checks via Playwright
3. Production smoke checks against `dopling.ai`
4. Risk review for blocked or unverified areas

## Executed Checks

### 1. Automated Tests

Command:

```bash
npm test
```

Result:

- `46` test files passed
- `491/491` tests passed

Notes:

- `__tests__/integration/api/coach-review-audio.test.ts` needed an update to clear local auth secrets so token-gated audio routes were tested deterministically.

### 2. Production Smoke Checks

Executed directly against `https://www.dopling.ai` with a valid invite cookie.

Verified:

- root redirects to `/beta/access`
- invite link sets `speakonimage_invite`
- `/profile` returns `200`
- `/api/topics/generate` returns `200`
- `/api/coach/round` returns `200`

Observed timings:

- `POST /api/topics/generate`: about `9.93s`
- `POST /api/coach/round`: about `24.32s`

Observed coach review payload:

- `audioReview.provider = "gemini"`
- `audioReview.voiceId = "Puck"`

### 3. Browser E2E Attempts

Attempted:

- local Playwright suite via `npm run test:e2e`
- direct Playwright browser smoke against production

Blocked by environment:

- local web server start failed with `listen EPERM 0.0.0.0:3000`
- Chromium launch failed with macOS sandbox permission error:
  `bootstrap_check_in ... Permission denied (1100)`

These failures were environmental, not application assertion failures.

## Current Release Assessment

### Passed

- invite flow
- guest beta access
- topic generation
- coach review generation
- profile page delivery
- coach audio provider routing to Gemini
- automated unit/integration coverage

### Still Not Fully Verified in This Environment

- real browser interaction on production pages
- actual speaker output quality from the browser audio element
- mobile-browser tactile interaction

## Risk Notes

- `coach/round` is still relatively slow for first-time users at around `24s`
- browser-level E2E remains unverified because the current machine cannot launch Playwright reliably
- local `next build` is still blocked unless a valid `DATABASE_URL` is restored into local env

## Recommendation

The app is in a good state for limited invite-only beta use.

Recommended rollout:

1. send a small batch of invites
2. collect feedback on wait time and teacher voice quality
3. keep rollback available through Vercel alias reassignment
