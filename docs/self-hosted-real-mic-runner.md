# Self-Hosted Real-Mic Runner

## Purpose

This document describes the minimum setup for running
`npm run smoke:live:real:strict` from GitHub Actions on a self-hosted macOS machine.

Use this only for the desktop Chrome real-microphone gate.

## Machine Requirements

- macOS machine with a logged-in desktop session
- Google Chrome installed
- working microphone
- working speaker output
- Node.js 22
- repository dependencies install cleanly with `npm ci`

Do not treat a headless or locked macOS session as equivalent.
This gate depends on headed Chrome, real `getUserMedia`, and speaker playback.

## Runner Requirements

Register a GitHub Actions self-hosted runner on the machine and make sure it has:

- `self-hosted`
- `macOS`

Recommended operational setup:

- keep the machine awake during the run
- do not run another local `next dev` on port `3027`
- do not run overlapping real-mic workflows on the same machine
- keep a normal desktop login session active while the workflow runs

## Required Secrets

Add these repository or organization secrets before using
[`real-mic-live-gate.yml`](/Users/huiliu/Projects/speakonimage/.github/workflows/real-mic-live-gate.yml):

- `GEMINI_OFFICIAL_API_KEY`
- `AUTH_SECRET`

## First-Time Local Validation

Before trusting the runner in CI, validate locally on the same machine:

```bash
cd /Users/huiliu/Projects/speakonimage
RUNS=1 npm run smoke:live:real:strict
```

You want all of these:

- `captureStatus = complete`
- `fallbackActive = false`
- `trackSampleRate = 48000`
- `allOrdered = true`
- `allAligned = true`

## Chrome Permission Checklist

The first run may require OS-level permission work.

Verify:

- Chrome is allowed to use the microphone in macOS Privacy settings
- Chrome can open a normal headed window in the logged-in session
- the machine can play the `say` prompt through speakers

Recommended manual smoke before CI:

1. Launch Chrome manually once.
2. Visit any page that requests microphone access.
3. Confirm the mic permission prompt is granted.
4. Run the strict smoke locally once from Terminal.

## Workflow Usage

The workflow can be triggered manually from GitHub Actions.

It can also run automatically for PRs, but only when the PR has the
`real-mic-gate` label and the PR is not in draft state.

Label helper commands:

```bash
cd /Users/huiliu/Projects/speakonimage
npm run pr:label:real-mic-gate -- 123
npm run pr:unlabel:real-mic-gate -- 123
```

If the PR number is omitted, the helper script uses `gh pr view` on the current branch.

PR authors should make the same decision in
[`pull_request_template.md`](/Users/huiliu/Projects/speakonimage/.github/pull_request_template.md)
when opening or updating the PR.

Inputs:

- `runs`
- `recording_wait_ms`

Default command shape:

```bash
RUNS=3 npm run smoke:live:real:strict
```

Artifacts are uploaded from:

- `/tmp/speakonimage-real-mic-runs`

Important files inside that directory:

- `report.json`
- `dev-server.log`
- `round-*.json`
- `round-*.log`

## Pass Criteria

Treat the gate as passed only when:

- the workflow exits `0`
- `completedRounds === runs`
- every round has `captureStatus = complete`
- every round has `fallbackActive = false`
- every round has `trackSampleRate = 48000`
- `allOrdered = true`
- `allAligned = true`

`allAligned` currently allows up to `1ms` delta because diagnostics use millisecond-resolution timestamps.

## When To Add The PR Label

Add `real-mic-gate` when the PR can realistically affect desktop Chrome Gemini Live reliability, especially:

- `src/lib/live/**`
- `src/components/input/GeminiLiveVoicePanel.tsx`
- `scripts/smoke-live-page.js`
- `scripts/run-real-mic-live-regression.js`
- token, setup, WebSocket, audio packet ordering, fallback, or diagnostics behavior
- real microphone capture behavior or desktop Chrome-only guards

## When Not To Add The PR Label

Do not add `real-mic-gate` for changes that cannot affect the real-mic Live path, such as:

- copy-only or content-only edits
- unrelated teacher, review, or profile UI changes
- database or auth work with no Gemini Live path impact
- non-Live backend work
- test-only changes that do not touch the real-mic gate or Live client behavior

If a PR starts with the label but later narrows away from Live-path risk, remove it.

## Common Failures

### `listen EPERM 0.0.0.0:3027`

Usually means the runner environment cannot bind the local dev port.

Check:

- another process is not already using port `3027`
- the runner is not executing inside a restricted sandbox
- the workflow is running on the intended self-hosted macOS machine

### `connect_failed_before_start`

This is a connection-establishment failure before the recording round begins.

Treat it as a Live connection issue, not an audio-end ordering regression.

Check:

- `/tmp/speakonimage-real-mic-runs/dev-server.log`
- the round log for WebSocket open vs token fetch
- the machine's network egress to Google's Live endpoint

### `fallbackActive = true`

The Live panel downgraded to standard voice fallback.

Check the round diagnostics timeline for:

- token creation failures
- WebSocket close codes
- interrupted sessions
- invalid server message handling

### `trackSampleRate != 48000`

The run likely did not use the expected desktop real-microphone capture path.

Check:

- whether Chrome got real microphone access
- whether the workflow accidentally used a fake or blocked mic path

## Recommended Release Use

Run the strict gate:

- before merging risky Gemini Live client changes
- before preview-to-production cutover
- after any microphone capture or session-ordering fix
