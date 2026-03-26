export const DEFAULT_AZURE_VOICE = 'en-US-AvaMultilingualNeural';

const AZURE_VOICE_NAME_PATTERN = /^[a-z]{2,3}-[A-Z]{2,}-[A-Za-z0-9]+Neural$/;
const CJK_OR_FULLWIDTH_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;
const LATIN_OR_DIGIT_PATTERN = /[A-Za-z0-9]/;

export function resolveAzureVoiceName(voice?: string): string {
  const trimmedVoice = voice?.trim();

  if (!trimmedVoice || !AZURE_VOICE_NAME_PATTERN.test(trimmedVoice)) {
    return DEFAULT_AZURE_VOICE;
  }

  return trimmedVoice;
}

function isMultilingualVoice(voiceName: string): boolean {
  return voiceName.endsWith('MultilingualNeural');
}

function resolveLocaleForChar(char: string, currentLocale: string): string {
  if (CJK_OR_FULLWIDTH_PATTERN.test(char)) {
    return 'zh-CN';
  }

  if (LATIN_OR_DIGIT_PATTERN.test(char)) {
    return 'en-US';
  }

  return currentLocale;
}

function buildMultilingualProsody(text: string): string {
  const trimmedText = text.trim();
  if (!trimmedText) return '';

  const segments: Array<{ locale: string; text: string }> = [];
  let currentLocale = CJK_OR_FULLWIDTH_PATTERN.test(trimmedText) ? 'zh-CN' : 'en-US';
  let buffer = '';

  for (const char of trimmedText) {
    const nextLocale = resolveLocaleForChar(char, currentLocale);

    if (nextLocale !== currentLocale && buffer) {
      segments.push({ locale: currentLocale, text: buffer });
      buffer = char;
      currentLocale = nextLocale;
      continue;
    }

    currentLocale = nextLocale;
    buffer += char;
  }

  if (buffer) {
    segments.push({ locale: currentLocale, text: buffer });
  }

  return segments
    .map((segment) => `<lang xml:lang='${segment.locale}'>${escapeXml(segment.text)}</lang>`)
    .join('');
}

export async function synthesizeWithAzureTTS(text: string, voice?: string): Promise<ArrayBuffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'westus3';

  if (!key) {
    throw new Error('AZURE_SPEECH_KEY not configured');
  }

  const voiceName = resolveAzureVoiceName(voice);
  const speechBody = isMultilingualVoice(voiceName)
    ? buildMultilingualProsody(text)
    : escapeXml(text);
  const ssml = `
    <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
      <voice name='${voiceName}'>
        <prosody rate='0.9'>${speechBody}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS failed: ${response.status} - ${errorText}`);
  }

  return response.arrayBuffer();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
