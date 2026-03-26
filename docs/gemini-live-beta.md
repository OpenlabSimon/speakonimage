# Gemini Live Beta

## Purpose

This is the minimum viable Gemini Live (`bidiGenerateContent`) path for real-time voice interaction in `speakonimage`.

It is intentionally scoped:

- Live voice is behind a feature flag.
- The existing voice submission path remains available as fallback.
- If Live connection, auth, or model setup fails, the UI tells the user to continue with the standard voice flow.

## Required environment variables

Add these to your environment:

```bash
NEXT_PUBLIC_ENABLE_GEMINI_LIVE=true
GEMINI_OFFICIAL_API_KEY=your_google_ai_studio_key
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

Notes:

- `GEMINI_OFFICIAL_API_KEY` is used by the server-side ephemeral token endpoint.
- `GEMINI_LIVE_MODEL` should be a Gemini native-audio model that supports Live bidi sessions.
- Gemini ephemeral tokens only work with the Live API `v1alpha` constrained WebSocket endpoint. Use `...GenerativeService.BidiGenerateContentConstrained`, not `v1beta` and not the unconstrained `BidiGenerateContent` route.

## Local run steps

```bash
cd /Users/huiliu/Projects/speakonimage
npm run dev
```

Open:

```text
http://localhost:3000/topic/practice
```

When the flag is on, the voice tab shows:

- `Gemini Live Beta`
- `连接 Live`
- `开始实时语音`
- standard fallback voice submission below it

## Expected flow

1. Frontend calls `POST /api/live/token`
2. Server creates a Gemini ephemeral token
3. Frontend opens Gemini Live WebSocket
4. Frontend sends setup payload
5. Frontend streams microphone chunks
6. Frontend receives text/audio packets
7. If any Live failure occurs, the panel enters fallback mode and the standard voice recorder remains usable

## Current validation

Verified by tests:

- token route returns Live token payload
- token route rejects invalid payload
- token route returns `503` when Live flag is off
- Live client sends setup message after connection
- Live client reports auth-style fallback when token creation fails
- UI shows fallback banner when Live auth fails

## Direct smoke test

To test the official Gemini Live connection outside the app:

```bash
cd /Users/huiliu/Projects/speakonimage
GEMINI_API_KEY='your_google_key' node scripts/gemini-live-smoke.js
```

Expected output shape:

- `token=auth_tokens/...`
- `socket=open`
- one `message=...setupComplete...`
- one later `message=...serverContent...modelTurn...`

If it fails, capture:

- close code
- raw message
- timeout / auth / websocket error

## Health endpoint

The app now exposes a lightweight health route:

```text
GET /api/live/health
GET /api/live/health?probe=1
```

Expected behavior:

- `/api/live/health`
  - returns whether the feature flag is enabled
  - returns the configured Live model
- `/api/live/health?probe=1`
  - attempts to create an ephemeral token
  - returns one of:
    - `configured`
    - `token_ok`
    - `token_failed`
    - `disabled`

This is the fastest way to check whether a deployed environment can actually reach Google's Live token endpoint.

## Known limitations

1. This is a minimum client skeleton, not a production-tuned realtime stack.
2. WebSocket auth/query shape is based on the current official Live API contract, including `v1alpha` for ephemeral-token sessions, but Google may still change preview behavior.
3. Audio packet parsing currently handles text and inline audio conservatively; real production traffic may require additional server message variants.
4. Browser autoplay policies can still block immediate playback of returned Live audio.
5. The standard voice submission path is still the reliability baseline and should be treated as the primary fallback.

## Fallback behavior

Live currently downgrades on these error classes:

- `network`
- `auth`
- `model_unsupported`
- `session_interrupted`
- `invalid_message`

When fallback happens, the user sees a visible notice and can continue using the standard recorder immediately.
