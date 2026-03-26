export function cleanEnvValue(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .replace(/(?:\\r|\\n)+$/g, '')
    .trim();

  return normalized || undefined;
}

export function readCleanEnvValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = cleanEnvValue(process.env[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function normalizeOpenAICompatibleBaseUrl(
  value: string | undefined | null,
  fallback: string = 'https://hiapi.online/v1'
): string {
  const sanitized = cleanEnvValue(value) || fallback;
  const trimmed = sanitized
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/responses\/?$/i, '')
    .replace(/\/+$/g, '');

  if (/\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}
