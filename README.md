SpeakOnImage is a Next.js app for AI-assisted English speaking practice, with invite-only beta support for early external testing.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open `http://localhost:3000` with your browser to see the result.

For beta deployment details, see [docs/deploy-beta.md](/Users/huiliu/Projects/speakonimage/docs/deploy-beta.md).

## Real-Mic Release Gate

Use this before shipping Gemini Live changes that affect desktop Chrome microphone behavior:

```bash
cd /Users/huiliu/Projects/speakonimage
RUNS=3 npm run smoke:live:real:strict
```

This gate is intended for a real desktop macOS session with:

- headed Chrome
- real `getUserMedia` microphone access
- system speaker playback for the prompt

Passing output should include:

- `completedRounds = runs`
- `allOrdered = true`
- `allAligned = true`
- each round with `captureStatus = complete`
- each round with `fallbackActive = false`

Artifacts are written to:

- `/tmp/speakonimage-real-mic-runs/report.json`
- `/tmp/speakonimage-real-mic-runs/dev-server.log`

For the full Gemini Live local workflow, see [docs/gemini-live-beta.md](/Users/huiliu/Projects/speakonimage/docs/gemini-live-beta.md).

## CI Entry

If you want to wire this into GitHub Actions, use a self-hosted macOS runner only.
Hosted CI runners are not a reliable target for this real-microphone gate.

A ready-to-run workflow is provided at
[real-mic-live-gate.yml](/Users/huiliu/Projects/speakonimage/.github/workflows/real-mic-live-gate.yml).

Each workflow run also writes a short GitHub Actions summary with the gate verdict,
per-round status, and the first files to inspect on failure.

Automatic CI runs are intentionally restricted:

- manual `workflow_dispatch`
- PRs labeled `real-mic-gate`

Required GitHub Actions secrets:

- `GEMINI_OFFICIAL_API_KEY`
- `AUTH_SECRET`

Runner setup checklist:

- [docs/self-hosted-real-mic-runner.md](/Users/huiliu/Projects/speakonimage/docs/self-hosted-real-mic-runner.md)

PR label helpers:

- `npm run pr:label:real-mic-gate -- <pr-number>`
- `npm run pr:unlabel:real-mic-gate -- <pr-number>`

PR template:

- [pull_request_template.md](/Users/huiliu/Projects/speakonimage/.github/pull_request_template.md)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Beta Launch

- Invite access page: `/beta/access`
- Direct invite links: `/invite/<token>`
- Recommended production host: `https://www.dopling.ai`
