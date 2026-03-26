import { cleanEnvValue, normalizeOpenAICompatibleBaseUrl, readCleanEnvValue } from '@/lib/env-utils';

describe('env-utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('removes trailing literal newline escapes from env values', () => {
    expect(cleanEnvValue('abc123\\n')).toBe('abc123');
    expect(cleanEnvValue('abc123\\r\\n')).toBe('abc123');
  });

  it('returns the first cleaned env value across candidate keys', () => {
    process.env.FIRST_KEY = '  ';
    process.env.SECOND_KEY = 'value-from-second\\n';

    expect(readCleanEnvValue('FIRST_KEY', 'SECOND_KEY')).toBe('value-from-second');
  });

  it('normalizes openai-compatible base urls and preserves a single /v1 suffix', () => {
    expect(normalizeOpenAICompatibleBaseUrl('https://hiapi.online/v1\\n')).toBe('https://hiapi.online/v1');
    expect(normalizeOpenAICompatibleBaseUrl('https://hiapi.online/v1/')).toBe('https://hiapi.online/v1');
    expect(normalizeOpenAICompatibleBaseUrl('https://hiapi.online')).toBe('https://hiapi.online/v1');
    expect(normalizeOpenAICompatibleBaseUrl('https://hiapi.online/v1/chat/completions')).toBe('https://hiapi.online/v1');
  });
});
