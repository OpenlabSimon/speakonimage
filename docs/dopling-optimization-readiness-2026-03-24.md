# Dopling Optimization Readiness

Date: 2026-03-24

## Current Production Truth

- `https://www.dopling.ai` and `https://dopling.ai` are serving the SpeakOnImage beta app.
- `vercel inspect dopling.ai` resolves to:
  - `https://speakonimage-d1vh96tpt-openlabsimons-projects.vercel.app`
- Invite-only beta is active.
- With a valid invite cookie:
  - `/profile` returns `200`
  - `/api/live/health` returns `enabled=true`
  - Live model currently reports:
    - `gemini-2.5-flash-native-audio-preview-12-2025`

Operational caveat:

- `vercel domains inspect dopling.ai` still reports the domain resource under the older `esl-games` project.
- Treat current routing as cut over, but keep domain cleanup and rollback changes explicit and cautious.

## Highest-Value Optimization Target

Focus first on desktop Chrome Gemini Live with a real microphone.

Why this is first:

- production full-review flow is already usable
- fake-mic browser smoke already passes
- the main remaining user-facing reliability gap is real-mic Live fallback
- this is the biggest blocker to broadening beta usage

Current user-facing symptom:

- `网络连接失败，已建议切回标准语音提交`

Do not spend time on iPhone Live right now.

- iPhone Live is intentionally disabled
- mobile users should keep using the standard voice submission path

## Secondary Targets

### 1. Reduce Live first-packet latency

Current observed range:

- `3s`
- `4s`
- `5s+`

The next optimization pass should separate:

- token creation time
- WebSocket connect time
- setup-complete time
- first input transcript time
- first model text time
- first output audio time

### 2. Preview environment parity

Current Vercel env setup is not fully mirrored to Preview.

Production has the main Live and invite-gate variables, but Preview does not appear to have the same coverage. This makes preview deployments less trustworthy for release checks.

As of 2026-03-24, a fresh Preview deployment does build successfully again after making Prisma lazy at import time, but two operational caveats remain:

- the Preview URL is behind Vercel preview protection and returns `401` without access
- Preview no longer has only `BLOB_READ_WRITE_TOKEN`; it now also has:
  - `GEMINI_OFFICIAL_API_KEY`
  - `NEXT_PUBLIC_ENABLE_GEMINI_LIVE`
- a fresh Preview deployment (`speakonimage-pvob6519u-openlabsimons-projects.vercel.app`) now passes:
  - `GET /api/live/health?probe=1` with `stage=token_ok`
  - `POST /api/live/token` with a successful Gemini Live token response
- Preview is still missing many Production-only variables, including:
  - `APP_CANONICAL_URL`
  - `AUTH_SECRET`
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION`
  - `BACKGROUND_LLM_MODEL`
  - `COACH_REVIEW_TTS_PROVIDER`
  - `DATABASE_URL`
  - `ELEVENLABS_API_KEY`
  - `EVALUATION_MODEL`
  - `GEMINI_API_KEY`
  - `GEMINI_BASE_URL`
  - `GEMINI_FLASH_LITE_MODEL`
  - `GEMINI_FLASH_MODEL`
  - `GEMINI_LIVE_MODEL`
  - `GEMINI_MODEL`
  - `GEMINI_OFFICIAL_API_KEY`
  - `GEMINI_OFFICIAL_MODEL`
  - `GEMINI_OFFICIAL_TIMEOUT_MS`
  - `GEMINI_TTS_API_KEY`
  - `GEMINI_TTS_MODEL`
  - `INVITE_GATE_ACCESS_PATH`
  - `INVITE_GATE_COOKIE_NAME`
  - `INVITE_GATE_ENABLED`
  - `INVITE_GATE_TOKENS`
  - `TOPIC_GENERATION_MODEL`

### 3. Vercel domain metadata cleanup

Traffic routing already points at `speakonimage`, but the domain resource still appears under `esl-games` in `vercel domains inspect`.

Do this only after Live reliability is in a safer state.

## Code Entry Points

Start from these files:

- `src/components/input/GeminiLiveVoicePanel.tsx`
- `src/lib/live/client.ts`
- `src/lib/live/gemini-live.ts`
- `src/app/api/live/token/route.ts`
- `src/app/api/live/health/route.ts`
- `scripts/smoke-live-page.js`

Important behavior already in place:

- invite gate is enforced by `src/proxy.ts`
- app canonical URL comes from `APP_CANONICAL_URL`
- Live health and token routes already exist
- fake-mic smoke script already captures browser console and WebSocket frames

## Recommended Next Changes

### 1. Add a structured Live diagnostic timeline

Instrument the real-mic path so one failing session can answer:

- when token fetch started and ended
- when WebSocket opened
- when `setupComplete` arrived
- when first audio chunk was sent
- when first input transcription arrived
- when first model text arrived
- when first output audio chunk arrived
- when `turnComplete` arrived
- what close code or error path ended the session

Also capture:

- `navigator.userAgent`
- audio track settings from `getSettings()`
- `AudioContext.sampleRate`
- chosen Live model
- fallback reason code

Prefer one compact JSON diagnostic object over scattered console strings.

New operator controls now available for Live debugging:

- `GEMINI_LIVE_API_BASE_URL`
- `GEMINI_LIVE_WS_URL`

These allow Live token and WebSocket traffic to be pointed at a relay or special egress path without changing app code.

New server-side egress control now available:

- `GEMINI_LIVE_PROXY_URL`

This is specifically for the server-side ephemeral token request path and is useful when the app runtime cannot rely on ambient proxy settings.

### 2. Preserve raw failure details while keeping friendly UI messages

Current UI already maps raw failures to user-facing Chinese messages.

Keep that behavior, but preserve raw internals for debugging:

- token endpoint status
- close code
- original error message
- whether failure happened before or after `setupComplete`

### 3. Compare fake-mic and real-mic sessions explicitly

Use the same diagnostic shape for both:

- fake microphone smoke via Playwright
- real Chrome desktop microphone sessions

The goal is to identify what only appears in the real-mic path.

### 4. Measure before changing buffering behavior

Do not guess whether latency is caused by:

- token creation
- WebSocket setup
- model response generation
- output audio buffering

Add measurement first, then optimize the slowest stage.

### 5. Clean up Preview env after Live diagnostics are usable

Mirror at least these to Preview:

- `APP_CANONICAL_URL`
- `INVITE_GATE_ENABLED`
- `INVITE_GATE_TOKENS`
- `INVITE_GATE_COOKIE_NAME`
- `INVITE_GATE_ACCESS_PATH`
- `GEMINI_OFFICIAL_API_KEY`
- `GEMINI_LIVE_MODEL`
- `NEXT_PUBLIC_ENABLE_GEMINI_LIVE`
- `DATABASE_URL`
- `AUTH_SECRET`

Do not blindly mirror `DATABASE_URL` from Production into Preview unless you are intentionally willing to let Preview hit the production database.
For Live-only verification, prefer mirroring the Gemini and feature-flag variables first.

## Latest Diagnostic Capture

Latest local fake-mic capture status on 2026-03-24:

- Live panel renders with structured diagnostics enabled
- failure happens before `start_turn`
- diagnostic timeline ends at:
  - `connect_start`
  - `token_fetch_start`
  - `token_fetch_failed`
  - `error`
  - `fallback_requested`
- token fetch takes about `5.0s` and then `/api/live/token` returns `500`
- local `node fetch()` to `https://generativelanguage.googleapis.com/v1alpha/auth_tokens` fails with:
  - `ECONNRESET`
  - `Client network socket disconnected before secure TLS connection was established`

This means the current blocker is no longer the client-side Live state machine.
The blocker is the server/runtime path reaching Google's Gemini auth token endpoint from this machine or network.

After enabling a proxy-backed egress with `NODE_USE_ENV_PROXY=1` and the local Clash proxy on `127.0.0.1:7897`, the probe can now reach Google successfully enough to receive Google API responses.

Current post-egress result:

- `/v1beta/models` now returns a Google JSON error instead of `ECONNRESET`
- `/v1alpha/auth_tokens` now returns a Google JSON error instead of `ECONNRESET`
- the next blocker is no longer network reachability
- the next blocker is credential validity:
  - `API_KEY_INVALID`

With a known-valid local Google key, the full proxy-backed native-audio smoke now gets through:

- ephemeral token creation
- WebSocket open
- `setupComplete`
- `inputTranscription`
- `modelTurn`
- clean close code `1000`

This means the relay/egress path itself is now proven for both REST and WebSocket traffic.

After wiring the same proxy path into the real app server with `GEMINI_LIVE_PROXY_URL`, the browser fake-mic smoke also succeeds end-to-end.

Latest successful local app sample:

- `/tmp/dopling-local-proxy-fake-mic.json`

Latest successful timing breakdown:

- token fetch about `1.1s`
- websocket open about `2.6s`
- setup complete about `3.1s`
- first input transcript about `7.3s`
- first model text about `8.3s`
- first output audio about `9.0s`
- turn complete about `15.1s`

## Fast Verification Commands

Use these as the baseline checks:

```bash
cd /Users/huiliu/Projects/speakonimage
vercel inspect dopling.ai
vercel env ls
curl -I https://www.dopling.ai
curl -I https://dopling.ai
curl -I https://www.dopling.ai/invite/friend-1-8e6b0ba5f241a2a0
OUTPUT_PATH=/tmp/dopling-fake-mic.json node scripts/smoke-live-page.js
```

For a proxy-backed Node probe through the local Clash egress:

```bash
cd /Users/huiliu/Projects/speakonimage
set -a
source /tmp/speakonimage-live-smoke.env
set +a
scripts/run-gemini-live-probe-via-proxy.sh
```

For the full native-audio smoke through the same egress:

```bash
cd /Users/huiliu/Projects/speakonimage
GEMINI_OFFICIAL_API_KEY='your_valid_google_key' scripts/run-gemini-live-smoke-via-proxy.sh
```

For invite-gated API checks:

```bash
curl -sS -c /tmp/dopling_cookiejar -o /dev/null https://www.dopling.ai/invite/friend-1-8e6b0ba5f241a2a0
curl -sS -b /tmp/dopling_cookiejar https://www.dopling.ai/api/live/health
curl -I -b /tmp/dopling_cookiejar https://www.dopling.ai/profile
```

After capturing one fake-mic and one real-mic JSON sample:

```bash
node scripts/compare-live-diagnostics.js /tmp/dopling-fake-mic.json /tmp/dopling-real-mic.json
```

## Acceptance Criteria For The Next Optimization Pass

The next pass should count as successful only if it leaves behind:

- a repeatable diagnostic path for real desktop Chrome Live failures
- one comparable diagnostic sample from fake-mic smoke and one from real-mic usage
- a clear breakdown of where the first-packet latency is spent
- no new work on iPhone Live
- no risky Vercel domain reassignment during the Live debugging pass

## Short Handoff Prompt

```text
Continue optimizing dopling.ai in /Users/huiliu/Projects/speakonimage.

Current production truth:
- dopling.ai routes to speakonimage deployment
- invite gate is active
- /api/live/health is enabled in production
- fake-mic smoke passes
- real desktop Chrome microphone Live still falls back intermittently

Focus first on:
1. structured Live diagnostics
2. isolating real-mic failure causes
3. measuring first-packet latency by stage

Do not work on iPhone Live yet.
Do not change Vercel domain ownership until Live diagnostics are in place.
```
