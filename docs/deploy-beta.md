# SpeakOnImage Beta Deploy

## Recommended entry structure

- Production app URL: `https://www.dopling.ai`
- Invite access page: `https://www.dopling.ai/beta/access`
- Direct invite link format: `https://www.dopling.ai/invite/<token>`

This document assumes you are replacing the current `dopling.ai` app with `speakonimage` at the root domain. No `basePath` is required.

## Required production env

- `DATABASE_URL`
- `AUTH_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_OFFICIAL_API_KEY`
- `GEMINI_FLASH_MODEL`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

If using coach review audio in production:

- `GEMINI_TTS_API_KEY` or `COACH_REVIEW_TTS_PROVIDER=azure`
- `BLOB_READ_WRITE_TOKEN`

Optional only when your cloud host cannot reach Google's Gemini endpoint directly:

- `GEMINI_LIVE_PROXY_URL`

For invite-only beta launch:

- `INVITE_GATE_ENABLED=true`
- `INVITE_GATE_TOKENS=<comma-separated invite codes>`
- `INVITE_GATE_COOKIE_NAME=speakonimage_invite`
- `INVITE_GATE_ACCESS_PATH=/beta/access`
- `APP_CANONICAL_URL=https://www.dopling.ai`

Recommended latency tuning for initial beta:

- `GEMINI_OFFICIAL_MODEL=gemini-2.5-flash`
- `TOPIC_GENERATION_MODEL=gemini-2.5-flash`
- `EVALUATION_MODEL=gemini-2.5-flash`

Provider routing:

- Critical paths use Google official Gemini first, then fall back to hiapi if available
- Background paths use hiapi first, then fall back to Google official Gemini if available

Gemini Live egress:

- leave `GEMINI_LIVE_PROXY_URL` unset on normal cloud deployments with direct egress
- only configure it when the host must reach Google through a relay or proxy

## Invite flow

1. Send a friend `https://www.dopling.ai/invite/<token>`
2. The invite route validates the token and stores an access cookie
3. Subsequent page and API requests are allowed through the proxy
4. If access is missing or expired, users are redirected back to `/beta/access`

## Notes

- The invite gate is environment-controlled. Local development is unchanged when `INVITE_GATE_ENABLED=false`.
- The proxy also protects API routes. Uninvited requests to `/api/...` receive `403 Invite required`.
- For replacing the existing `dopling.ai` production site, use [`dopling-cutover-runbook.md`](/Users/huiliu/Projects/speakonimage/docs/dopling-cutover-runbook.md).
