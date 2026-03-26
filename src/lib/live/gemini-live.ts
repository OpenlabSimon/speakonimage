const DEFAULT_GEMINI_LIVE_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_GEMINI_LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

export function isGeminiLiveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_GEMINI_LIVE === 'true';
}

export function getGeminiLiveModel(): string {
  return (
    process.env.GEMINI_LIVE_MODEL ||
    'gemini-2.5-flash-native-audio-preview-12-2025'
  );
}

export function getGeminiLiveVoiceName(): string {
  return process.env.GEMINI_LIVE_VOICE_NAME || 'Puck';
}

export function getGeminiLiveApiBaseUrl(): string {
  return normalizeBaseUrl(process.env.GEMINI_LIVE_API_BASE_URL, DEFAULT_GEMINI_LIVE_API_BASE_URL);
}

export function getGeminiLiveWsUrl(): string {
  const override = process.env.GEMINI_LIVE_WS_URL?.trim();
  return override || DEFAULT_GEMINI_LIVE_WS_URL;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/\/+$/, '');
}
