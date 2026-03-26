#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT || 3027);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || '/tmp/speakonimage-real-mic-runs');
const RECORDING_WAIT_MS = Number(process.env.RECORDING_WAIT_MS || 8000);
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const AUTH_SECRET = process.env.AUTH_SECRET || 'local-dev-auth-secret-speakonimage';
const ROUND_TIMEOUT_MS = Number(process.env.ROUND_TIMEOUT_MS || Math.max(90_000, RECORDING_WAIT_MS + 45_000));
const PROCESS_EXIT_GRACE_MS = 5_000;
const STRICT = /^(1|true|yes)$/i.test(process.env.STRICT || '');

async function main() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const devServer = spawn(
    'npm',
    ['run', 'dev', '--', '--port', String(PORT)],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        AUTH_SECRET,
        AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST || 'true',
        NEXT_PUBLIC_ENABLE_GEMINI_LIVE: process.env.NEXT_PUBLIC_ENABLE_GEMINI_LIVE || 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const devLogPath = path.join(OUTPUT_DIR, 'dev-server.log');
  const devLogStream = fs.createWriteStream(devLogPath);
  devServer.stdout.pipe(devLogStream);
  devServer.stderr.pipe(devLogStream);

  try {
    await waitForLocalHealth(`${BASE_URL}/api/live/health`, 30_000);
    await waitForLocalHealth(`${BASE_URL}/api/live/health?probe=1`, 30_000);

    const rounds = [];
    for (let index = 1; index <= RUNS; index += 1) {
      const roundId = `round-${index}`;
      const diagnosticsPath = path.join(OUTPUT_DIR, `${roundId}.json`);
      const logPath = path.join(OUTPUT_DIR, `${roundId}.log`);
      const roundResult = await runSmokeRound({
        baseUrl: BASE_URL,
        diagnosticsPath,
        logPath,
        roundId,
      });
      const diagnostics = readDiagnostics(diagnosticsPath);
      rounds.push(buildRoundReport(roundId, diagnostics, roundResult, diagnosticsPath, logPath));
    }

    const report = {
      baseUrl: BASE_URL,
      runs: RUNS,
      outputDir: OUTPUT_DIR,
      devLogPath,
      rounds,
      completedRounds: rounds.filter((round) => round.captureStatus === 'complete').length,
      maxDeltaMs: rounds.reduce((max, round) => {
        if (typeof round.deltaMs !== 'number') {
          return max;
        }
        return Math.max(max, round.deltaMs);
      }, 0),
      allOrdered: rounds.every((round) => round.deltaMs === null || round.deltaMs >= 0),
      allAligned: rounds.every((round) => round.deltaMs === null || round.deltaMs <= 1),
    };

    const reportPath = path.join(OUTPUT_DIR, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(report, null, 2));
    console.log(`report_path=${reportPath}`);

    if (STRICT) {
      const failures = evaluateStrictFailures(report);
      if (failures.length > 0) {
        console.error('strict_failures=' + JSON.stringify(failures, null, 2));
        process.exitCode = 1;
      }
    }
  } finally {
    await stopProcess(devServer);
    devLogStream.end();
  }
}

async function runSmokeRound({ baseUrl, diagnosticsPath, logPath, roundId }) {
  const child = spawn(
    'node',
    ['scripts/smoke-live-page.js'],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...stripProxyEnv(process.env),
        BASE_URL: baseUrl,
        OUTPUT_PATH: diagnosticsPath,
        USE_REAL_MIC: '1',
        HEADLESS: '0',
        PLAYWRIGHT_CHANNEL,
        RECORDING_WAIT_MS: String(RECORDING_WAIT_MS),
        ROUND_LABEL: roundId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    child.kill('SIGINT');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, PROCESS_EXIT_GRACE_MS).unref();
  }, ROUND_TIMEOUT_MS);

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeoutId);
      resolve(code);
    });
  });

  const combined = `${stdout}${stderr ? `\n=== stderr ===\n${stderr}` : ''}`;
  fs.writeFileSync(logPath, combined);

  if (timedOut) {
    return {
      stdout,
      stderr,
      exitCode,
      timedOut: true,
    };
  }

  if (exitCode !== 0) {
    throw new Error(`Smoke round ${roundId} failed with exit code ${exitCode}. See ${logPath}`);
  }

  return {
    stdout,
    stderr,
    exitCode,
    timedOut: false,
  };
}

function buildRoundReport(roundId, diagnostics, roundResult, diagnosticsPath, logPath) {
  const lastAudioChunkSentMs = diagnostics?.timings?.lastAudioChunkSentMs ?? null;
  const activityEndSentMs = diagnostics?.timings?.activityEndSentMs ?? null;
  const captureStatus = extractCaptureStatus(roundResult.stdout)
    || (roundResult.timedOut ? 'timed_out' : null);

  return {
    roundId,
    diagnosticsPath,
    logPath,
    sessionId: diagnostics?.sessionId || null,
    captureStatus,
    fallbackActive: diagnostics?.fallbackActive ?? false,
    currentState: diagnostics?.currentState ?? null,
    lastAudioChunkSentMs,
    activityEndSentMs,
    deltaMs:
      typeof lastAudioChunkSentMs === 'number' && typeof activityEndSentMs === 'number'
        ? activityEndSentMs - lastAudioChunkSentMs
        : null,
    firstInputTranscriptMs: diagnostics?.timings?.firstInputTranscriptMs ?? null,
    turnCompleteMs: diagnostics?.timings?.turnCompleteMs ?? null,
    audioPacketCount: diagnostics?.audioStats?.packetsAttempted ?? null,
    trackSampleRate: diagnostics?.environment?.trackSampleRate ?? null,
    timedOut: roundResult.timedOut,
    exitCode: roundResult.exitCode ?? null,
  };
}

function extractCaptureStatus(stdout) {
  const match = stdout.match(/"captureStatus"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function evaluateStrictFailures(report) {
  const failures = [];

  if (report.completedRounds !== report.runs) {
    failures.push(`completedRounds=${report.completedRounds} runs=${report.runs}`);
  }

  if (!report.allOrdered) {
    failures.push('activityEndSentMs preceded lastAudioChunkSentMs in at least one round');
  }

  if (!report.allAligned) {
    failures.push(`maxDeltaMs=${report.maxDeltaMs}`);
  }

  for (const round of report.rounds) {
    if (round.captureStatus !== 'complete') {
      failures.push(`${round.roundId}: captureStatus=${round.captureStatus}`);
    }
    if (round.fallbackActive) {
      failures.push(`${round.roundId}: fallbackActive=true`);
    }
    if (round.trackSampleRate !== 48000) {
      failures.push(`${round.roundId}: trackSampleRate=${round.trackSampleRate}`);
    }
    if (round.timedOut) {
      failures.push(`${round.roundId}: timedOut=true`);
    }
  }

  return failures;
}

async function waitForLocalHealth(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        return;
      }

      const body = await response.text().catch(() => '');
      lastError = `status=${response.status}${body ? ` body=${body}` : ''}`;
    } catch {
      lastError = 'request_failed';
    }

    await delay(1000);
  }

  throw new Error(
    `Timed out waiting for ${url}${lastError ? ` (last_error: ${lastError})` : ''}`
  );
}

function readDiagnostics(diagnosticsPath) {
  try {
    return JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
  } catch {
    return null;
  }
}

function stripProxyEnv(env) {
  const nextEnv = { ...env };
  delete nextEnv.http_proxy;
  delete nextEnv.https_proxy;
  delete nextEnv.HTTP_PROXY;
  delete nextEnv.HTTPS_PROXY;
  delete nextEnv.all_proxy;
  delete nextEnv.ALL_PROXY;
  return nextEnv;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.on('exit', resolve);
    setTimeout(resolve, PROCESS_EXIT_GRACE_MS);
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGINT');
  await waitForExit(child);

  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(child);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
