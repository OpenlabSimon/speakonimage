# Dopling.ai Cutover Runbook

## Goal

Replace the current `www.dopling.ai` app with `speakonimage` using the lowest-risk sequence:

1. Stand up `speakonimage` as a separate Vercel project
2. Provision a new production PostgreSQL database
3. Verify the full product on a preview/custom staging domain
4. Reassign `www.dopling.ai` to the new project
5. Keep the old project intact for rollback

This runbook assumes:

- the old `dopling.ai` project stays untouched until cutover completes
- `speakonimage` gets a fresh production database
- the initial launch is invite-only

## Why not reuse the old app or old database

- The old `dopling.ai` stack and `speakonimage` do not share the same Prisma schema.
- A direct in-place replacement removes your rollback path.
- A fresh production database avoids schema collision and partial data corruption.

## Phase 1: Provision production dependencies

### 1. Create a new production Postgres database

Recommended: Neon PostgreSQL.

Create a fresh database for `speakonimage` and copy the connection string.

Required output:

- `DATABASE_URL`

### 2. Prepare production secrets

Minimum required env:

- `DATABASE_URL`
- `AUTH_SECRET`
- `GEMINI_API_KEY`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `APP_CANONICAL_URL=https://www.dopling.ai`
- `INVITE_GATE_ENABLED=true`
- `INVITE_GATE_TOKENS=<comma-separated invite codes>`

Recommended:

- `GEMINI_TTS_API_KEY`
- `COACH_REVIEW_TTS_PROVIDER=gemini` or `azure`
- `BLOB_READ_WRITE_TOKEN`

Reference:

- [`.env.example`](/Users/huiliu/Projects/speakonimage/.env.example)
- [`deploy-beta.md`](/Users/huiliu/Projects/speakonimage/docs/deploy-beta.md)

## Phase 2: Create the new Vercel project

### 3. Create a separate Vercel project for `speakonimage`

Do not repoint the old project yet.

Recommended setup:

- New Vercel project name: `speakonimage` or `dopling-speakonimage`
- Root directory: the `speakonimage` project
- Framework preset: Next.js

### 4. Add production env vars in Vercel

Add the env list from Phase 1 to:

- Production
- Preview

### 5. Run production database migration

After env is configured, run the Prisma migration against the new production database.

Use the project's normal Prisma production flow. If there is no formal migration chain yet, use the safest existing deploy flow for this repo and confirm schema creation before traffic cutover.

## Phase 3: Verify before domain cutover

### 6. Deploy to Vercel preview or temporary staging domain

Do not touch `www.dopling.ai` yet.

Use either:

- the default Vercel preview domain
- or a temporary custom domain such as `beta.dopling.ai`

### 7. Smoke-test the critical flow

Verify all of the following on the preview deployment:

1. Landing page loads
2. Invite link works
3. Invite access page works
4. Topic generation works
5. Text submission works
6. Voice submission works
7. Teacher text review appears quickly
8. Teacher audio review can be generated and played
9. `/profile` loads
10. `沿着这条点评继续练` works
11. `返回练习` works
12. Invite gate blocks anonymous access to normal pages and APIs

Suggested URLs:

- `/`
- `/beta/access`
- `/invite/<token>`
- `/topic/practice`
- `/profile`

### 7.5 Run the desktop Chrome real-mic gate locally

Before production cutover, run the local real-microphone Gemini Live gate:

```bash
cd /Users/huiliu/Projects/speakonimage
RUNS=3 npm run smoke:live:real:strict
```

Treat this as a release blocker if any of the following fail:

- the command exits non-zero
- `completedRounds !== runs`
- any round reports `captureStatus != complete`
- any round reports `fallbackActive = true`
- any round reports `trackSampleRate != 48000`
- `allOrdered != true`
- `allAligned != true`

Reference:

- [`gemini-live-beta.md`](/Users/huiliu/Projects/speakonimage/docs/gemini-live-beta.md)
- [`/tmp/speakonimage-real-mic-runs/report.json`](/tmp/speakonimage-real-mic-runs/report.json)

### 8. Confirm rollback readiness

Before domain cutover, verify:

- the old `dopling.ai` project is still healthy
- its Vercel config remains unchanged
- its production domain mapping can be restored quickly

## Phase 4: Cut over `www.dopling.ai`

### 9. Reassign the domain in Vercel

Move:

- `www.dopling.ai`

from the old Vercel project to the new `speakonimage` project.

If desired, also map:

- `dopling.ai`

and redirect it to `www.dopling.ai`.

### 10. Re-test on the real production domain

Immediately verify:

1. `https://www.dopling.ai`
2. `https://www.dopling.ai/beta/access`
3. `https://www.dopling.ai/invite/<token>`
4. one full text practice flow
5. one full voice practice flow
6. one profile playback flow

## Rollback plan

If any production-blocking issue appears after cutover:

1. Remove `www.dopling.ai` from the new project
2. Reassign `www.dopling.ai` back to the old Vercel project
3. Leave the new database intact for debugging
4. Fix issues on the new project without touching the old app

Because the old project and old database are not modified during the cutover, rollback is fast and low-risk.

## Recommended launch mode

For the first public beta:

- keep `INVITE_GATE_ENABLED=true`
- invite only a small group first
- keep the old project available for at least several days
- do not migrate old user data in the first cut

## First production checklist

- New Neon database created
- Vercel project created
- Env configured
- Prisma schema deployed
- Invite links tested
- Audio generation tested
- Voice transcription tested
- Profile flow tested
- Domain cutover completed
- Rollback path confirmed
