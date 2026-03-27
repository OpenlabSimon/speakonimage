#!/usr/bin/env node

const key =
  process.env.GEMINI_OFFICIAL_API_KEY ||
  process.env.GOOGLE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;
const apiBaseUrl = (process.env.GEMINI_LIVE_API_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

if (!key) {
  console.error('Missing GEMINI_OFFICIAL_API_KEY, GOOGLE_GEMINI_API_KEY, or GEMINI_API_KEY');
  process.exit(1);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
}

async function main() {
  const modelsUrl = `${apiBaseUrl}/v1beta/models?key=${encodeURIComponent(key)}`;
  const tokenUrl = `${apiBaseUrl}/v1alpha/auth_tokens?key=${encodeURIComponent(key)}`;

  console.log(`api_base_url=${apiBaseUrl}`);
  console.log('== models ==');
  try {
    const modelsResult = await fetchJson(modelsUrl);
    console.log(`status=${modelsResult.status}`);

    if (modelsResult.ok && Array.isArray(modelsResult.json?.models)) {
      const modelNames = modelsResult.json.models
        .map((model) => model.name)
        .filter(Boolean);
      const liveModels = modelNames.filter((name) => /live/i.test(name));
      const ttsModels = modelNames.filter((name) => /tts|audio/i.test(name));

      console.log(`total_models=${modelNames.length}`);
      console.log('live_models=');
      console.log(liveModels.length ? liveModels.join('\n') : '(none found)');
      console.log('audio_or_tts_models=');
      console.log(ttsModels.length ? ttsModels.join('\n') : '(none found)');
    } else {
      console.log(JSON.stringify(modelsResult.json, null, 2));
    }
  } catch (error) {
    console.error('models_error=', formatError(error));
  }

  console.log('\n== ephemeral_tokens ==');
  try {
    const tokenResult = await fetchJson(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uses: 1 }),
    });

    console.log(`status=${tokenResult.status}`);
    console.log(JSON.stringify(tokenResult.json, null, 2));
  } catch (error) {
    console.error('ephemeral_error=', formatError(error));
  }
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [error.message];
  const cause = error.cause;

  if (cause && typeof cause === 'object') {
    if (typeof cause.code === 'string') {
      details.push(`code=${cause.code}`);
    }
    if (typeof cause.message === 'string') {
      details.push(cause.message);
    }
    if (typeof cause.host === 'string') {
      details.push(`host=${cause.host}`);
    }
    if (typeof cause.port === 'number' || typeof cause.port === 'string') {
      details.push(`port=${cause.port}`);
    }
  }

  return details.join(' | ');
}

main();
