export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(arrayBuffer));
}

export function createPlayableAudioBlob(base64Data: string, mimeType?: string): Blob {
  const bytes = base64ToUint8Array(base64Data);

  if (mimeType?.includes('audio/pcm')) {
    const sampleRate = extractSampleRate(mimeType);
    const wavBytes = wrapPcmAsWav(bytes, sampleRate);
    return new Blob([toArrayBuffer(wavBytes)], { type: 'audio/wav' });
  }

  return new Blob([toArrayBuffer(bytes)], { type: mimeType || 'audio/wav' });
}

function extractSampleRate(mimeType?: string): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function wrapPcmAsWav(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  const bitsPerSample = 16;
  const channels = 1;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcmData.byteLength, true);
  bytes.set(pcmData, 44);

  return bytes;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
