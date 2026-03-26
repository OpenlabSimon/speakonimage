# Real-Mic Gate Handoff 2026-03-26

## Scope

This document captures the current state of the Gemini Live desktop Chrome
real-microphone gate before shutdown, including what is already working,
what is still blocked, and what to do first after reboot.

## Current Branch And PR

- branch: `chore/real-mic-live-gate`
- PR: `#1`
- URL: `https://github.com/OpenlabSimon/speakonimage/pull/1`

Latest pushed commits:

- `3030ac7` `stabilize gemini live real-mic flow and add strict release gate`
- `085e0ad` `fix real mic workflow yaml summary block`
- `316aea0` `fix real mic workflow summary step`
- `db8747c` `fix real mic gate proxy health diagnostics`

## Resume Update

This section supersedes the old blocker list below.

What is now confirmed:

- repo secret `GEMINI_OFFICIAL_API_KEY` was replaced with a verified working key
- fresh workflow runs now use the fixed summary step
- the strict gate step now reads optional `GEMINI_LIVE_PROXY_URL` from runner env
  or GitHub Actions config instead of hard-coding a localhost proxy in the repo
- LaunchAgent service mode is still unreliable for the strict real-mic gate
- foreground `./run.sh` is currently the verified way to run the strict real-mic gate

Most useful runs:

- `23588866264`
  confirmed the invalid-key blocker was gone and exposed the next failure
- `23589627994`
  service-runner verification that reached `GET /api/live/health?probe=1 200` and
  `POST /api/live/token 200`, but still failed with
  `captureStatus = connect_failed_before_start`
- `23589819471`
  foreground-runner verification that completed with `success`

Current practical conclusion:

- real-mic gate: stop the service and use foreground `./run.sh`
- ordinary self-hosted jobs: service mode is still acceptable

## What Is Done

### Gemini Live Client Stability

- serialized Gemini Live realtime input sending in
  [`src/lib/live/client.ts`](/Users/huiliu/Projects/speakonimage/src/lib/live/client.ts)
- added diagnostics for:
  - `last_audio_chunk_sent`
  - `activity_end_sent`
- exposed the new diagnostics fields in
  [`src/components/input/GeminiLiveVoicePanel.tsx`](/Users/huiliu/Projects/speakonimage/src/components/input/GeminiLiveVoicePanel.tsx)
- added regression coverage in
  [`__tests__/unit/lib/live-client.test.ts`](/Users/huiliu/Projects/speakonimage/__tests__/unit/lib/live-client.test.ts)

### Local Auth Noise Cleanup

- added local non-production auth secret fallback in
  [`src/lib/auth/secret.ts`](/Users/huiliu/Projects/speakonimage/src/lib/auth/secret.ts)
- wired the shared secret source into:
  - [`src/lib/auth.config.ts`](/Users/huiliu/Projects/speakonimage/src/lib/auth.config.ts)
  - [`src/domains/teachers/review-audio-token.ts`](/Users/huiliu/Projects/speakonimage/src/domains/teachers/review-audio-token.ts)

### Real-Mic Regression Gate

- added:
  - `npm run smoke:live:real`
  - `npm run smoke:live:real:strict`
- runner script:
  [`scripts/run-real-mic-live-regression.js`](/Users/huiliu/Projects/speakonimage/scripts/run-real-mic-live-regression.js)
- workflow:
  [`real-mic-live-gate.yml`](/Users/huiliu/Projects/speakonimage/.github/workflows/real-mic-live-gate.yml)
- team process files:
  - [`README.md`](/Users/huiliu/Projects/speakonimage/README.md)
  - [`docs/self-hosted-real-mic-runner.md`](/Users/huiliu/Projects/speakonimage/docs/self-hosted-real-mic-runner.md)
  - [`.github/pull_request_template.md`](/Users/huiliu/Projects/speakonimage/.github/pull_request_template.md)
  - [`scripts/real-mic-gate-label.sh`](/Users/huiliu/Projects/speakonimage/scripts/real-mic-gate-label.sh)

## What Is Verified

Local verification completed earlier in this branch:

- `npm test -- __tests__/unit/lib/auth-secret.test.ts __tests__/unit/lib/live-client.test.ts __tests__/unit/components/gemini-live-voice-panel.test.ts`
- `node --check scripts/run-real-mic-live-regression.js`
- `sh -n scripts/real-mic-gate-label.sh`
- real-mic local smoke passed on desktop Chrome with real microphone capture

Operational verification completed:

- PR label `real-mic-gate` exists and is applied to PR `#1`
- GitHub Actions workflow is recognized by GitHub
- self-hosted runner `huiliu-mac-real-mic` is registered and can pick up jobs

## Historical Blockers

The sections below describe the earlier blocker state before the resume update
above. Keep them as audit context.

### 1. Workflow Run Still Fails

Relevant run:

- `https://github.com/OpenlabSimon/speakonimage/actions/runs/23586112527`

The rerun completed with `failure`.

The primary blocking step is:

- `Run real-mic strict gate`

The failure is not caused by runner registration, label matching, or missing
workflow secrets anymore.

### 2. `GEMINI_OFFICIAL_API_KEY` Is Invalid For The Token Probe

This is the current confirmed root cause.

The workflow waits for:

- `GET /api/live/health`
- `GET /api/live/health?probe=1`

The plain health endpoint is healthy.
The `probe=1` endpoint repeatedly returns `502`.

This was reproduced locally against the same app path, and the direct response body
was:

```json
{
  "success": false,
  "error": "Gemini Live token failed: 400 - {\"code\":400,\"message\":\"API key not valid. Please pass a valid API key.\",\"status\":\"INVALID_ARGUMENT\"...}",
  "data": {
    "enabled": true,
    "stage": "token_failed"
  }
}
```

Practical conclusion:

- the repo secret named `GEMINI_OFFICIAL_API_KEY` exists
- but the current secret value is not valid for Gemini Live token creation
- rerunning the workflow again without replacing that secret will fail the same way

### 3. Old Rerun Still Used The Old Summary Definition

The rerun that failed still showed the old heredoc-based `Publish gate summary`
body. That is expected behavior when rerunning an older workflow execution.

Practical conclusion:

- the summary-step fix is already committed in the branch
- to validate the new summary step, trigger a new workflow run after the updated
  branch and new secret are in place
- do not rely on rerunning the older failed run for workflow-definition validation

### 4. Runner Is Not Serviceized Yet

Current runner status:

- registered and usable
- foreground `./run.sh` works
- `./svc.sh status` reports `Stopped`

Current service issue:

- `./svc.sh install` succeeded
- `./svc.sh start` failed earlier with:
  `Load failed: 5: Input/output error`

Practical conclusion:

- the runner is working only while a foreground session keeps `./run.sh` alive
- a reboot will stop it
- after reboot, the runner must be started manually before using the gate again

## Repo Secrets Status

Configured in the repository:

- `GEMINI_OFFICIAL_API_KEY`
- `AUTH_SECRET`

Current interpretation:

- `AUTH_SECRET` is present and no longer the blocker
- `GEMINI_OFFICIAL_API_KEY` must be replaced with a known-good Google AI Studio key

## First Steps After Reboot

Run these in order.

### 1. Start The Runner Again

```bash
cd ~/actions-runner
./svc.sh stop
GEMINI_LIVE_PROXY_URL=http://127.0.0.1:7897 ./run.sh
```

Keep the Terminal session open while the gate runs.

If this machine later gets direct egress to Google's Gemini endpoint, drop the
`GEMINI_LIVE_PROXY_URL=...` prefix.

### 2. Verify Secrets Are Still Present

```bash
gh secret list --repo OpenlabSimon/speakonimage
```

### 3. Trigger A New Workflow Run

Do not rely on rerunning the old failed run.
Trigger a fresh run so GitHub uses the latest workflow file.

Options:

- use `workflow_dispatch` in GitHub Actions
- push a new commit to the PR branch
- update the PR and keep the `real-mic-gate` label applied

### 4. Recheck The Gate Result

Useful commands:

```bash
gh run list --repo OpenlabSimon/speakonimage --workflow "Real Mic Live Gate"
gh run view <run-id> --repo OpenlabSimon/speakonimage --json attempt,status,conclusion,jobs,url
gh run view <run-id> --repo OpenlabSimon/speakonimage --log-failed
```

### 5. Return To Service Debugging Only After The Gate

The current safe rule is:

- foreground `./run.sh` for the real-mic gate
- service mode only for ordinary jobs

If continuing service debugging later, start with:

```bash
cd ~/actions-runner
./svc.sh status
launchctl list | rg actions.runner.OpenlabSimon-speakonimage
```

## Decision Summary

The release gate infrastructure is mostly in place.

What already works:

- code changes are implemented and committed
- PR automation and label gating work
- the self-hosted macOS runner can receive jobs

What still prevents a stable always-on setup:

- LaunchAgent service mode is not yet trustworthy for the strict real-mic gate
- the machine still needs a foreground Terminal session for this workflow

## Short Version

If resuming cold after shutdown, do this:

1. `cd ~/actions-runner && ./svc.sh stop && ./run.sh`
2. trigger a fresh `Real Mic Live Gate` run
3. inspect the new run
4. only after the gate finishes, go back to `svc.sh` / `launchctl`
