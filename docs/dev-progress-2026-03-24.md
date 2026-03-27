# SpeakOnImage Development Progress

Date: 2026-03-24

## Current Production Status

- Production domain:
  - `https://www.dopling.ai`
  - `https://dopling.ai`
- Current deployment:
  - `https://speakonimage-d1vh96tpt-openlabsimons-projects.vercel.app`
- Invite-only beta is active.
- Common invite link for testing:
  - `https://www.dopling.ai/invite/friend-1-8e6b0ba5f241a2a0`

### Vercel Routing Note

As of 2026-03-24:

- `vercel inspect dopling.ai` resolves to:
  - `https://speakonimage-d1vh96tpt-openlabsimons-projects.vercel.app`
- Live checks confirm `www.dopling.ai` serves the SpeakOnImage beta app.
- However, `vercel domains inspect dopling.ai` still reports the domain resource under the older `esl-games` project.

Operationally, treat this as:

- production traffic is already cut over to `speakonimage`
- Vercel domain ownership metadata is not fully normalized yet
- any future domain cleanup or rollback should verify both alias routing and project-level domain assignment before changes

## What Is Working

### 1. Full Review

The standard non-live review path is usable in production.

- Topic generation works.
- Text and voice full-review flows work.
- `/api/coach/round` returns:
  - `reviewText`
  - `speechScript`
  - `audioReview`
  - `htmlArtifact`
- Teacher audio provider is now Gemini on the main review path.
- Full review remains the stable default path for real users.

### 2. Gemini Live on Desktop

Desktop Gemini Live is functionally connected in production.

Verified in browser smoke:

- `setupComplete`
- `inputTranscription`
- `modelTurn.text`
- `outputTranscription`
- `audio/pcm;rate=24000` response chunks
- `generationComplete`
- `turnComplete`

Desktop Live is now structured as a single-turn interaction:

- `连接 Live`
- `开始这一轮`
- `结束这一轮`
- `老师回应中...`

### 3. Local / Preview Debug Status

As of 2026-03-24:

- a fresh Vercel Preview deployment now builds successfully again
- however, the Preview URL is still protected by Vercel preview auth and returns `401` without access
- Preview env coverage is still incomplete; only `BLOB_READ_WRITE_TOKEN` is present outside Production
- local fake-mic smoke now captures structured failure diagnostics even when Live fails before recording starts

Latest local fake-mic sample shows:

- `captureStatus=connect_failed_before_start`
- current state ends at `failed`
- fallback is activated automatically
- failure happens in `token_fetch`
- `/api/live/token` returns `500`
- token fetch latency is about `5.0s`

The current local blocker is not the frontend state machine.
The blocker is server-side connectivity from Node to Google's Gemini token endpoint, which currently fails with:

- `TypeError: fetch failed`
- cause: `ECONNRESET`
- detail: `Client network socket disconnected before secure TLS connection was established`

After rerunning the probe through the local Clash egress (`127.0.0.1:7897`) with `NODE_USE_ENV_PROXY=1`:

- Node can now reach Google Gemini endpoints
- both model listing and ephemeral token requests return Google JSON responses
- the next blocker is credential validity rather than egress
- current upstream response is:
  - `API_KEY_INVALID`

After rerunning the full native-audio smoke through the same proxy path with a known-valid local Google key:

- ephemeral token creation succeeds
- WebSocket opens successfully
- `setupComplete` arrives
- `inputTranscription` arrives
- `modelTurn` arrives
- session closes cleanly with code `1000`

This confirms the proxy-backed egress path is viable for both the REST token flow and the Gemini Live WebSocket flow.

After adding explicit server-side proxy support via `GEMINI_LIVE_PROXY_URL` and rebuilding the app:

- the real application path now works under local fake-mic smoke
- `/api/live/token` succeeds from the app server
- browser Live reaches:
  - `token_fetch_ok`
  - `websocket_open`
  - `setup_complete`
  - `first_input_transcript`
  - `first_model_text`
  - `first_output_transcript`
  - `first_output_audio_chunk`
  - `turn_complete`
- latest local app sample:
  - `/tmp/dopling-local-proxy-fake-mic.json`
- measured timings from that sample:
  - token fetch about `1.1s`
  - websocket open about `2.6s`
  - setup complete about `3.1s`
  - first model text about `8.3s`
  - turn complete about `15.1s`

### Preview Verification

Vercel Preview has now been partially brought up to support Gemini Live verification.

Done:

- added `GEMINI_OFFICIAL_API_KEY` to Preview
- added `NEXT_PUBLIC_ENABLE_GEMINI_LIVE=true` to Preview
- deployed a fresh Preview build:
  - `https://speakonimage-pvob6519u-openlabsimons-projects.vercel.app`
- verified through `vercel curl` that Preview protection can be bypassed for authenticated CLI checks
- verified:
  - `GET /api/live/health?probe=1`
    - returns `success=true`
    - returns `stage=token_ok`
  - `POST /api/live/token`
    - returns `success=true`
    - returns a Gemini Live token payload

This means Preview server-side Gemini Live is now working with the replacement AI Studio key.

Still true:

- Preview remains behind Vercel deployment protection for normal browser access
- Preview still does not mirror the full Production env set
- browser-level Preview smoke has not been completed yet

### 4. Mobile Policy

iPhone / mobile WebKit is intentionally blocked from Gemini Live.

Current behavior:

- Gemini Live is not offered as an active path on iPhone.
- Mobile users should use the standard voice submission flow.
- This avoids repeated `1007` audio format failures on iPhone browsers.

## Major Changes Already Completed

### Live Architecture

- Added Gemini Live ephemeral token API.
- Added Gemini Live health probe API.
- Added browser Live client and integrated it into `/topic/practice`.
- Added feature-flagged Live mode alongside the standard review mode.
- Added fallback behavior when Live fails.

### Full Review Resilience

- Added safe JSON response parsing:
  - `src/lib/http/parse-json-response.ts`
- This prevents UI crashes when an API returns plain text instead of JSON.
- Fixed the previous:
  - `Unexpected token 'R', "Request En"... is not valid JSON`

### Live UX Cleanup

- Removed the confusing two-button flow.
- Replaced it with one primary action button that changes by state.
- Simplified waiting language to match a single-turn conversation model.
- Hid raw technical messages like:
  - `Gemini Live websocket failed`
  - `socket is not connected`
  - raw close codes such as `1007`, `1008`

### Audio Handling

- Live input is sent as PCM16 at 16kHz.
- Live output audio is buffered and played as a full turn, instead of chunk-by-chunk playback.
- This reduced the previous “broken / stuttering” playback behavior.

## Important Files

### Live

- [src/components/input/GeminiLiveVoicePanel.tsx](/Users/huiliu/Projects/speakonimage/src/components/input/GeminiLiveVoicePanel.tsx)
- [src/lib/live/client.ts](/Users/huiliu/Projects/speakonimage/src/lib/live/client.ts)
- [src/lib/live/gemini-live.ts](/Users/huiliu/Projects/speakonimage/src/lib/live/gemini-live.ts)
- [src/app/api/live/token/route.ts](/Users/huiliu/Projects/speakonimage/src/app/api/live/token/route.ts)
- [src/app/api/live/health/route.ts](/Users/huiliu/Projects/speakonimage/src/app/api/live/health/route.ts)
- [scripts/smoke-live-page.js](/Users/huiliu/Projects/speakonimage/scripts/smoke-live-page.js)
- [docs/gemini-live-beta.md](/Users/huiliu/Projects/speakonimage/docs/gemini-live-beta.md)

### Full Review / Practice

- [src/app/topic/practice/page.tsx](/Users/huiliu/Projects/speakonimage/src/app/topic/practice/page.tsx)
- [src/components/input/VoiceRecorder.tsx](/Users/huiliu/Projects/speakonimage/src/components/input/VoiceRecorder.tsx)
- [src/components/evaluation/CoachReviewPanel.tsx](/Users/huiliu/Projects/speakonimage/src/components/evaluation/CoachReviewPanel.tsx)
- [src/lib/http/parse-json-response.ts](/Users/huiliu/Projects/speakonimage/src/lib/http/parse-json-response.ts)

## Test Commands That Have Been Used

```bash
cd /Users/huiliu/Projects/speakonimage
npm test -- __tests__/unit/components/gemini-live-voice-panel.test.ts
npm test -- __tests__/unit/lib/live-client.test.ts
npm test -- __tests__/unit/lib/parse-json-response.test.ts
npm run lint
node /tmp/full_review_probe.js
node scripts/smoke-live-page.js
```

## Latest Verified Results

### Full Review Probe

Production API probe succeeded:

- `POST /api/coach/round -> 200`
- valid `reviewText`
- valid `speechScript`
- `audioReview.provider = gemini`
- `audioReview.status = pending`
- `htmlArtifact.status = generated`

### Live Smoke

The latest browser smoke on production succeeded with the new single-button flow.

Observed:

- page entered Live mode
- connected successfully
- audio chunks were sent
- input transcript appeared
- teacher text appeared
- output transcript appeared
- audio response chunks arrived

## Known Issues

### 1. Desktop Chrome Live Is Still Not Fully Stable with Real Microphone Input

The scripted smoke path works, but real-user desktop microphone sessions still show occasional network-style fallback.

Typical user-facing symptom:

- `网络连接失败，已建议切回标准语音提交`

This does not currently look like a permanent production outage, because scripted desktop smoke succeeds against production. It is more likely a real-browser / real-microphone stability gap.

### 2. Live First Packet Latency Is Still High

Observed first-packet latency is still often around:

- `3s`
- `4s`
- `5s+`

This is acceptable for beta testing but still slow for a smooth conversational feel.

### 3. iPhone Live Is Not Supported Yet

This is intentional for now. Mobile users should stay on the standard voice submission path until the audio compatibility issue is solved.

## Recommended Next Step

If continuing development, the highest-value next task is:

- Continue stabilizing Gemini Live for real desktop Chrome microphone input.

That should focus on:

1. reproducing the occasional real-user Live fallback on desktop Chrome
2. comparing real microphone behavior against the fake-mic smoke script
3. capturing:
   - browser console
   - WebSocket close behavior
   - copied Live diagnostics
4. improving Live reliability before broadening beta usage

## Suggested Handoff Prompt

If handing off to another agent, use this:

```text
Continue stabilizing desktop Chrome Gemini Live in /Users/huiliu/Projects/speakonimage.

Current status:
- full review path is working in production
- desktop Gemini Live smoke passes on production
- iPhone Live is intentionally disabled
- dopling.ai points to:
  https://speakonimage-d1vh96tpt-openlabsimons-projects.vercel.app

Focus only on real desktop Chrome microphone instability.
Do not work on iPhone Live.
Start from:
- src/components/input/GeminiLiveVoicePanel.tsx
- src/lib/live/client.ts
- scripts/smoke-live-page.js
```
