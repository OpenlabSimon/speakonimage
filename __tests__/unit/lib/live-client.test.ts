import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiLiveClient } from '@/lib/live/client';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000) {
    this.onclose?.({ code });
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('GeminiLiveClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects and sends setup message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const stateChanges: string[] = [];
    const diagnosticEvents: string[] = [];
    const client = new GeminiLiveClient({
      onStateChange: (state) => stateChanges.push(state),
      onDiagnosticEvent: (event) => diagnosticEvents.push(event.name),
    });

    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });

    await connectPromise;

    expect(socket.url).toContain('access_token=auth_tokens%2Ftest-token');
    expect(socket.sent[0]).toContain('"setup"');
    expect(socket.sent[0]).toContain('gemini-2.5-flash-native-audio-preview-12-2025');
    expect(socket.sent[0]).toContain('"speechConfig"');
    expect(socket.sent[0]).toContain('"realtimeInputConfig"');
    expect(socket.sent[0]).toContain('"inputAudioTranscription"');
    expect(stateChanges).toContain('connected');
    expect(diagnosticEvents).toEqual(expect.arrayContaining([
      'connect_start',
      'token_fetch_start',
      'token_fetch_ok',
      'websocket_open',
      'first_server_packet',
      'setup_complete',
    ]));
  });

  it('parses setupComplete delivered as Blob', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const stateChanges: string[] = [];
    const client = new GeminiLiveClient({
      onStateChange: (state) => stateChanges.push(state),
    });

    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: new Blob([JSON.stringify({ setupComplete: {} })]) as unknown as string });

    await connectPromise;

    expect(stateChanges).toContain('connected');
  });

  it('emits auth-style error when token endpoint fails', async () => {
    const onError = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({
        success: false,
        error: 'token denied',
      }),
      json: async () => ({
        success: false,
        error: 'token denied',
      }),
    }));

    const client = new GeminiLiveClient({ onError });

    await expect(client.connect()).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      'auth',
      expect.stringContaining('token denied'),
      expect.objectContaining({
        stage: 'token_fetch',
        httpStatus: 403,
        rawMessage: expect.stringContaining('token denied'),
      })
    );
  });

  it('handles non-json token endpoint failures', async () => {
    const onError = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Request Entity Too Large',
    }));

    const client = new GeminiLiveClient({ onError });

    await expect(client.connect()).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      'auth',
      expect.stringContaining('Request Entity Too Large'),
      expect.objectContaining({
        stage: 'token_fetch',
        httpStatus: 502,
        rawMessage: 'Request Entity Too Large',
      })
    );
  });

  it('sends activityStart before first audio chunk and activityEnd on finish', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const diagnosticEvents: string[] = [];
    const client = new GeminiLiveClient({
      onDiagnosticEvent: (event) => diagnosticEvents.push(event.name),
    });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    await client.sendAudioChunk(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/pcm;rate=16000' }));
    await client.finishAudioStream();

    expect(socket.sent[1]).toContain('"activityStart"');
    expect(socket.sent[2]).toContain('"audio"');
    expect(socket.sent[3]).toContain('"activityEnd"');
    expect(diagnosticEvents).toEqual(expect.arrayContaining([
      'first_audio_chunk_sent',
      'last_audio_chunk_sent',
      'activity_end_sent',
    ]));
    expect(diagnosticEvents.indexOf('last_audio_chunk_sent')).toBeLessThan(
      diagnosticEvents.indexOf('activity_end_sent')
    );
  });

  it('serializes audio sends before ending the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const firstChunk = createDeferred<ArrayBuffer>();
    const secondChunk = createDeferred<ArrayBuffer>();
    const firstBlob = new Blob([], { type: 'audio/pcm;rate=16000' });
    const secondBlob = new Blob([], { type: 'audio/pcm;rate=16000' });

    Object.defineProperty(firstBlob, 'arrayBuffer', {
      value: vi.fn(() => firstChunk.promise),
    });
    Object.defineProperty(secondBlob, 'arrayBuffer', {
      value: vi.fn(() => secondChunk.promise),
    });

    const client = new GeminiLiveClient();
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    const sendFirst = client.sendAudioChunk(firstBlob);
    const sendSecond = client.sendAudioChunk(secondBlob);
    const finishStream = client.finishAudioStream();

    secondChunk.resolve(new Uint8Array([4, 5, 6]).buffer);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toContain('"activityStart"');

    firstChunk.resolve(new Uint8Array([1, 2, 3]).buffer);
    await Promise.all([sendFirst, sendSecond, finishStream]);

    expect(socket.sent[2]).toContain('"audio"');
    expect(socket.sent[2]).toContain('"AQID"');
    expect(socket.sent[3]).toContain('"audio"');
    expect(socket.sent[3]).toContain('"BAUG"');
    expect(socket.sent[4]).toContain('"activityEnd"');
  });

  it('returns to connected state after turnComplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const stateChanges: string[] = [];
    const client = new GeminiLiveClient({
      onStateChange: (state) => stateChanges.push(state),
    });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    await client.sendAudioChunk(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/pcm;rate=16000' }));
    await client.finishAudioStream();
    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          turnComplete: true,
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stateChanges).toContain('responding');
    expect(stateChanges.at(-1)).toBe('connected');
  });

  it('emits finalized turn transcripts on turnComplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const onTurnComplete = vi.fn();
    const client = new GeminiLiveClient({ onTurnComplete });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: { text: 'I usually cook at home.' },
          outputTranscription: { text: 'Good. Tell me what you cook most often.' },
          modelTurn: {
            parts: [{ text: 'Good. Tell me what you cook most often.' }],
          },
          turnComplete: true,
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onTurnComplete).toHaveBeenCalledWith({
      inputTranscript: 'I usually cook at home.',
      outputTranscript: 'Good. Tell me what you cook most often.',
      outputText: 'Good. Tell me what you cook most often.',
    });
  });

  it('accumulates transcript fragments before turnComplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const onInputTranscript = vi.fn();
    const onOutputTranscript = vi.fn();
    const onTurnComplete = vi.fn();
    const client = new GeminiLiveClient({
      onInputTranscript,
      onOutputTranscript,
      onTurnComplete,
    });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: { text: 'Hi' },
          outputTranscription: { text: 'Great' },
        },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: { text: ',' },
          outputTranscription: { text: ' job.' },
        },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: { text: 'I am building an app.' },
          outputTranscription: { text: ' Tell me more.' },
          turnComplete: true,
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onInputTranscript).toHaveBeenLastCalledWith('Hi, I am building an app.');
    expect(onOutputTranscript).toHaveBeenLastCalledWith('Great job. Tell me more.');
    expect(onTurnComplete).toHaveBeenCalledWith({
      inputTranscript: 'Hi, I am building an app.',
      outputTranscript: 'Great job. Tell me more.',
      outputText: '',
    });
  });

  it('buffers output audio chunks until turnComplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const onAudioChunk = vi.fn();
    const client = new GeminiLiveClient({ onAudioChunk });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [
              { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQID' } },
              { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'BAUG' } },
            ],
          },
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAudioChunk).not.toHaveBeenCalled();

    socket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          turnComplete: true,
        },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAudioChunk).toHaveBeenCalledTimes(1);
  });

  it('reports close-code context for interrupted sessions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
      json: async () => ({
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/test-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://example.test/live',
        },
      }),
    }));

    const onError = vi.fn();
    const client = new GeminiLiveClient({ onError });
    const connectPromise = client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await connectPromise;

    socket.onclose?.({ code: 1008 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledWith(
      'auth',
      expect.stringContaining('1008'),
      expect.objectContaining({
        stage: 'close',
        closeCode: 1008,
        rawMessage: expect.stringContaining('1008'),
      })
    );
  });
});
