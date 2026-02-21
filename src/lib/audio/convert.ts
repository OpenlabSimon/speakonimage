/**
 * Audio format conversion utilities
 * Convert webm/opus to WAV for Azure compatibility
 */

/**
 * Convert audio blob to WAV format using Web Audio API
 * This runs in the browser
 * Note: decodeAudioData may not support all formats (like webm/opus)
 */
export async function convertToWav(audioBlob: Blob): Promise<Blob> {
  // Check if AudioContext is available
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('AudioContext not supported');
  }

  const audioContext = new AudioContextClass();

  try {
    // Decode the audio blob
    const arrayBuffer = await audioBlob.arrayBuffer();

    // decodeAudioData may fail with webm/opus format
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to WAV
    const wavBuffer = audioBufferToWav(audioBuffer);

    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    await audioContext.close();
  }
}

/**
 * Convert AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Interleave channels
  let interleaved: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }
  } else {
    interleaved = buffer.getChannelData(0);
  }

  // Create WAV file
  const dataLength = interleaved.length * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const wavBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(wavBuffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true); // audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitDepth / 8), true); // block align
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  const offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset + i * 2, intSample, true);
  }

  return wavBuffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
