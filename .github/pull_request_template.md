## Summary

- What changed?
- Why?

## Testing

- [ ] Relevant local tests were run
- [ ] Any new behavior was manually checked when needed

## Real-Mic Gate

- [ ] This PR does not affect the desktop Chrome Gemini Live real-mic path
- [ ] This PR may affect the desktop Chrome Gemini Live real-mic path

If the second box applies, add the `real-mic-gate` label so the self-hosted macOS gate can run.

Helpers:

```bash
npm run pr:label:real-mic-gate -- <pr-number>
npm run pr:unlabel:real-mic-gate -- <pr-number>
```

Add the label when the PR touches areas such as:

- `src/lib/live/**`
- `src/components/input/GeminiLiveVoicePanel.tsx`
- `scripts/smoke-live-page.js`
- `scripts/run-real-mic-live-regression.js`
- Live token/setup/WebSocket/fallback/diagnostics/packet ordering behavior

Do not add the label for changes that cannot affect the real-mic Live path, such as:

- copy-only changes
- unrelated UI work
- non-Live backend changes
- unrelated test-only changes

Reference:

- [self-hosted-real-mic-runner.md](/Users/huiliu/Projects/speakonimage/docs/self-hosted-real-mic-runner.md)
