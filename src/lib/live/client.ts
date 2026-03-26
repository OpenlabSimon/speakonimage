import { base64ToUint8Array, blobToBase64, createPlayableAudioBlob, uint8ArrayToBase64 } from './audio';
import { getGeminiLiveModel, getGeminiLiveVoiceName } from './gemini-live';

type DiagnosticPrimitive = string | number | boolean | null;

export type GeminiLiveErrorCode =
  | 'network'
  | 'auth'
  | 'audio_format'
  | 'model_unsupported'
  | 'session_interrupted'
  | 'invalid_message'
  | 'unknown';

export type GeminiLiveState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'recording'
  | 'responding'
  | 'failed'
  | 'closed';

export interface GeminiLiveDiagnosticEvent {
  name:
    | 'connect_start'
    | 'token_fetch_start'
    | 'token_fetch_ok'
    | 'token_fetch_failed'
    | 'websocket_open'
    | 'first_server_packet'
    | 'setup_complete'
    | 'first_audio_chunk_sent'
    | 'last_audio_chunk_sent'
    | 'audio_stream_end'
    | 'activity_end_sent'
    | 'first_input_transcript'
    | 'first_output_transcript'
    | 'first_model_text'
    | 'first_output_audio_chunk'
    | 'generation_complete'
    | 'turn_complete'
    | 'websocket_close'
    | 'error';
  at: number;
  detail?: Record<string, DiagnosticPrimitive>;
}

export interface GeminiLiveTurnResult {
  inputTranscript: string;
  outputTranscript: string;
  outputText: string;
}

export interface GeminiLiveErrorContext {
  stage: 'token_fetch' | 'websocket' | 'message' | 'close' | 'runtime';
  rawMessage?: string;
  closeCode?: number;
  httpStatus?: number;
}

interface GeminiLiveTokenPayload {
  provider: 'gemini-live';
  tokenName: string;
  expireTime?: string;
  model: string;
  wsUrl: string;
}

interface GeminiLiveClientOptions {
  tokenEndpoint?: string;
  onStateChange?: (state: GeminiLiveState) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onText?: (text: string) => void;
  onAudioChunk?: (audioUrl: string) => void;
  onTurnComplete?: (turn: GeminiLiveTurnResult) => void;
  onError?: (code: GeminiLiveErrorCode, message: string, context?: GeminiLiveErrorContext) => void;
  onFirstPacket?: () => void;
  onDiagnosticEvent?: (event: GeminiLiveDiagnosticEvent) => void;
}

export class GeminiLiveClient {
  private tokenEndpoint: string;
  private socket: WebSocket | null = null;
  private state: GeminiLiveState = 'idle';
  private firstPacketReceived = false;
  private firstAudioChunkSent = false;
  private firstInputTranscriptReceived = false;
  private firstOutputTranscriptReceived = false;
  private firstModelTextReceived = false;
  private firstOutputAudioReceived = false;
  private model = getGeminiLiveModel();
  private voiceName = getGeminiLiveVoiceName();
  private wsUrl = '';
  private audioActivityStarted = false;
  private sentAudioChunkCount = 0;
  private pendingOutputAudio: Array<{ bytes: Uint8Array; mimeType?: string }> = [];
  private latestInputTranscript = '';
  private latestOutputTranscript = '';
  private latestModelTexts: string[] = [];
  private pendingRealtimeInput = Promise.resolve();
  private callbacks: GeminiLiveClientOptions;

  constructor(options: GeminiLiveClientOptions = {}) {
    this.tokenEndpoint = options.tokenEndpoint || '/api/live/token';
    this.callbacks = options;
  }

  async connect() {
    this.firstPacketReceived = false;
    this.firstAudioChunkSent = false;
    this.firstInputTranscriptReceived = false;
    this.firstOutputTranscriptReceived = false;
    this.firstModelTextReceived = false;
    this.firstOutputAudioReceived = false;
    this.audioActivityStarted = false;
    this.sentAudioChunkCount = 0;
    this.pendingOutputAudio = [];
    this.resetTurnBuffers();
    console.info('[GeminiLive] connect:start');
    this.emitDiagnostic('connect_start', { tokenEndpoint: this.tokenEndpoint });
    this.updateState('connecting');

    let tokenPayload: GeminiLiveTokenPayload;
    try {
      tokenPayload = await this.fetchToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch Gemini Live token';
      console.error('[GeminiLive] connect:token_failed', message);
      this.fail('auth', message, getClientErrorContext(error) || {
        stage: 'token_fetch',
        rawMessage: message,
      });
      throw error;
    }

    console.info('[GeminiLive] connect:token_ok', {
      model: tokenPayload.model,
      wsUrl: tokenPayload.wsUrl,
    });

    this.model = tokenPayload.model || this.model;
    this.wsUrl = tokenPayload.wsUrl;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(
        `${this.wsUrl}?access_token=${encodeURIComponent(tokenPayload.tokenName)}`
      );
      this.socket = socket;

      socket.onopen = () => {
        console.info('[GeminiLive] websocket:open');
        this.emitDiagnostic('websocket_open', { wsUrl: this.wsUrl });
        socket.send(JSON.stringify({
          setup: {
            model: this.model.startsWith('models/') ? this.model : `models/${this.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: this.voiceName,
                  },
                },
              },
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: true,
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };

      socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(await normalizeMessageData(event.data));
          console.info('[GeminiLive] message:keys', Object.keys(payload));
          if (payload.setupComplete) {
            console.info('[GeminiLive] websocket:setup_complete');
          }
          this.handleMessage(payload);
          if (!this.firstPacketReceived) {
            this.firstPacketReceived = true;
            this.emitDiagnostic('first_server_packet', {
              payloadKeys: Object.keys(payload).join(','),
            });
            this.callbacks.onFirstPacket?.();
          }

          if (payload.setupComplete) {
            this.emitDiagnostic('setup_complete', { model: this.model });
            this.updateState('connected');
            resolve();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid Gemini Live message';
          this.fail('invalid_message', message, {
            stage: 'message',
            rawMessage: message,
          });
          reject(new Error(message));
        }
      };

      socket.onerror = () => {
        const error = new Error('Gemini Live websocket failed');
        console.error('[GeminiLive] websocket:error', error.message);
        this.fail('network', error.message, {
          stage: 'websocket',
          rawMessage: error.message,
        });
        reject(error);
      };

      socket.onclose = (event) => {
        console.warn('[GeminiLive] websocket:close', { code: event.code });
        this.emitDiagnostic('websocket_close', { code: event.code });
        if (event.code !== 1000 && this.state !== 'failed') {
          this.fail(classifyCloseCode(event.code), `Gemini Live session closed (${event.code})`, {
            stage: 'close',
            closeCode: event.code,
            rawMessage: `Gemini Live session closed (${event.code})`,
          });
          reject(new Error(`Gemini Live session closed (${event.code})`));
          return;
        }

        if (this.state !== 'failed') {
          this.updateState('closed');
        }
      };
    });
  }

  async sendAudioChunk(blob: Blob) {
    return this.enqueueRealtimeInput(async (socket) => {
      if (!this.audioActivityStarted) {
        this.pendingOutputAudio = [];
        socket.send(JSON.stringify({
          realtimeInput: {
            activityStart: {},
          },
        }));
        this.audioActivityStarted = true;
        console.info('[GeminiLive] audio:activity_start');
      }

      console.info('[GeminiLive] audio:chunk', { size: blob.size, type: blob.type });
      const data = await blobToBase64(blob);
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: blob.type || 'audio/webm',
            data,
          },
        },
      }));

      if (!this.firstAudioChunkSent) {
        this.firstAudioChunkSent = true;
        this.emitDiagnostic('first_audio_chunk_sent', {
          size: blob.size,
          mimeType: blob.type || 'audio/webm',
        });
      }

      this.sentAudioChunkCount += 1;
    });
  }

  finishAudioStream() {
    return this.enqueueRealtimeInput((socket) => {
      console.info('[GeminiLive] audio:stream_end');
      this.emitDiagnostic('audio_stream_end', {
        usedActivityMarkers: this.audioActivityStarted,
      });
      this.updateState('responding');
      const usedActivityMarkers = this.audioActivityStarted;
      if (usedActivityMarkers && this.sentAudioChunkCount > 0) {
        this.emitDiagnostic('last_audio_chunk_sent', {
          chunkCount: this.sentAudioChunkCount,
        });
      }
      socket.send(JSON.stringify({
        realtimeInput: {
          ...(usedActivityMarkers
            ? { activityEnd: {} }
            : { audioStreamEnd: true }),
        },
      }));
      if (usedActivityMarkers) {
        this.emitDiagnostic('activity_end_sent', {
          chunkCount: this.sentAudioChunkCount,
        });
      }
      this.audioActivityStarted = false;
    }, { ignoreDisconnected: true });
  }

  close() {
    if (this.socket) {
      this.socket.close(1000, 'client_closed');
      this.socket = null;
    }
    this.audioActivityStarted = false;
    this.updateState('closed');
  }

  private async fetchToken(): Promise<GeminiLiveTokenPayload> {
    this.emitDiagnostic('token_fetch_start', {
      tokenEndpoint: this.tokenEndpoint,
    });

    let response: Response;
    try {
      response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uses: 1, expireTimeSeconds: 60 }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gemini Live token endpoint';
      this.emitDiagnostic('token_fetch_failed', {
        message: truncateDiagnosticText(message),
      });
      throw createClientError(message, {
        stage: 'token_fetch',
        rawMessage: message,
      });
    }

    const rawText = await response.text();
    let result: unknown = null;

    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = { success: false, error: rawText || 'Non-JSON response from Gemini Live token endpoint' };
    }

    const tokenResult = result as { success?: boolean; error?: string; data?: GeminiLiveTokenPayload } | null;

    if (!response.ok || !tokenResult?.success || !tokenResult.data) {
      const message = tokenResult?.error || `Failed to create Gemini Live token (${response.status})`;
      this.emitDiagnostic('token_fetch_failed', {
        httpStatus: response.status,
        message: truncateDiagnosticText(message),
      });
      throw createClientError(message, {
        stage: 'token_fetch',
        httpStatus: response.status,
        rawMessage: rawText || message,
      });
    }

    this.emitDiagnostic('token_fetch_ok', {
      model: tokenResult.data.model,
      wsUrl: tokenResult.data.wsUrl,
      voiceName: this.voiceName,
    });
    return tokenResult.data;
  }

  private handleMessage(payload: Record<string, unknown>) {
    const serverContent = payload.serverContent as Record<string, unknown> | undefined;
    if (!serverContent) {
      return;
    }

    console.info('[GeminiLive] server_content:keys', Object.keys(serverContent));

    const inputTranscription = serverContent.inputTranscription as { text?: string } | undefined;
    if (inputTranscription?.text) {
      console.info('[GeminiLive] transcript:input', inputTranscription.text);
      this.latestInputTranscript = appendTranscriptSegment(this.latestInputTranscript, inputTranscription.text);
      if (!this.firstInputTranscriptReceived) {
        this.firstInputTranscriptReceived = true;
        this.emitDiagnostic('first_input_transcript', {
          length: inputTranscription.text.length,
        });
      }
      this.callbacks.onInputTranscript?.(this.latestInputTranscript);
    }

    const outputTranscription = serverContent.outputTranscription as { text?: string } | undefined;
    if (outputTranscription?.text) {
      console.info('[GeminiLive] transcript:output', outputTranscription.text);
      this.latestOutputTranscript = appendTranscriptSegment(this.latestOutputTranscript, outputTranscription.text);
      if (!this.firstOutputTranscriptReceived) {
        this.firstOutputTranscriptReceived = true;
        this.emitDiagnostic('first_output_transcript', {
          length: outputTranscription.text.length,
        });
      }
      this.callbacks.onOutputTranscript?.(this.latestOutputTranscript);
    }

    const modelTurn = serverContent.modelTurn as
      | { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> }
      | undefined;
    for (const part of modelTurn?.parts || []) {
      if (part.text) {
        console.info('[GeminiLive] response:text', part.text);
        if (this.latestModelTexts.at(-1) !== part.text) {
          this.latestModelTexts.push(part.text);
        }
        if (!this.firstModelTextReceived) {
          this.firstModelTextReceived = true;
          this.emitDiagnostic('first_model_text', {
            length: part.text.length,
          });
        }
        this.callbacks.onText?.(part.text);
      }

      if (part.inlineData?.data) {
        console.info('[GeminiLive] response:audio', part.inlineData.mimeType || 'unknown');
        if (!this.firstOutputAudioReceived) {
          this.firstOutputAudioReceived = true;
          this.emitDiagnostic('first_output_audio_chunk', {
            mimeType: part.inlineData.mimeType || 'unknown',
          });
        }
        this.pendingOutputAudio.push({
          bytes: base64ToUint8Array(part.inlineData.data),
          mimeType: part.inlineData.mimeType,
        });
      }
    }

    if (serverContent.generationComplete || serverContent.turnComplete) {
      this.flushPendingOutputAudio();
      console.info('[GeminiLive] response:turn_complete');
      this.audioActivityStarted = false;
      if (serverContent.generationComplete) {
        this.emitDiagnostic('generation_complete');
      }
      if (serverContent.turnComplete) {
        this.emitDiagnostic('turn_complete');
      }
      this.callbacks.onTurnComplete?.({
        inputTranscript: this.latestInputTranscript.trim(),
        outputTranscript: this.latestOutputTranscript.trim(),
        outputText: this.latestModelTexts.join('\n').trim(),
      });
      this.resetTurnBuffers();
      this.updateState('connected');
    }
  }

  private flushPendingOutputAudio() {
    if (this.pendingOutputAudio.length === 0) {
      return;
    }

    const mimeType = this.pendingOutputAudio[0]?.mimeType;
    const totalBytes = this.pendingOutputAudio.reduce((sum, chunk) => sum + chunk.bytes.length, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of this.pendingOutputAudio) {
      merged.set(chunk.bytes, offset);
      offset += chunk.bytes.length;
    }

    const audioBlob = createPlayableAudioBlob(uint8ArrayToBase64(merged), mimeType);
    const audioUrl = URL.createObjectURL(audioBlob);
    this.pendingOutputAudio = [];
    this.callbacks.onAudioChunk?.(audioUrl);
  }

  private updateState(state: GeminiLiveState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private resetTurnBuffers() {
    this.latestInputTranscript = '';
    this.latestOutputTranscript = '';
    this.latestModelTexts = [];
  }

  private enqueueRealtimeInput(
    task: (socket: WebSocket) => Promise<void> | void,
    options?: { ignoreDisconnected?: boolean }
  ) {
    const job = this.pendingRealtimeInput
      .catch(() => undefined)
      .then(async () => {
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          if (options?.ignoreDisconnected) {
            return;
          }
          throw new Error('Gemini Live socket is not connected');
        }

        await task(socket);
      });

    this.pendingRealtimeInput = job;
    return job;
  }

  private fail(code: GeminiLiveErrorCode, message: string, context?: GeminiLiveErrorContext) {
    this.emitDiagnostic('error', {
      code,
      stage: context?.stage || 'runtime',
      closeCode: context?.closeCode ?? null,
      httpStatus: context?.httpStatus ?? null,
      message: truncateDiagnosticText(message),
    });
    this.updateState('failed');
    this.callbacks.onError?.(code, message, context);
  }

  private emitDiagnostic(
    name: GeminiLiveDiagnosticEvent['name'],
    detail?: Record<string, DiagnosticPrimitive>
  ) {
    this.callbacks.onDiagnosticEvent?.({
      name,
      at: Date.now(),
      detail,
    });
  }
}

async function normalizeMessageData(data: unknown): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  return String(data);
}

function classifyCloseCode(code: number): GeminiLiveErrorCode {
  if (code === 1008 || code === 4001) return 'auth';
  if (code === 1007) return 'audio_format';
  if (code === 1003 || code === 4003) return 'model_unsupported';
  if (code === 1011 || code === 1012) return 'session_interrupted';
  if (code === 1006) return 'network';
  return 'unknown';
}

interface GeminiLiveClientError extends Error {
  context?: GeminiLiveErrorContext;
}

function createClientError(message: string, context: GeminiLiveErrorContext): GeminiLiveClientError {
  const error = new Error(message) as GeminiLiveClientError;
  error.context = context;
  return error;
}

function getClientErrorContext(error: unknown): GeminiLiveErrorContext | undefined {
  if (!error || typeof error !== 'object' || !('context' in error)) {
    return undefined;
  }

  return (error as GeminiLiveClientError).context;
}

function truncateDiagnosticText(input: string, maxLength = 180): string {
  return input.length > maxLength ? `${input.slice(0, maxLength)}...` : input;
}

function appendTranscriptSegment(current: string, incoming: string): string {
  const raw = incoming;
  const next = raw.trim();
  const existing = current.trim();

  if (!next) {
    return existing;
  }

  if (!existing) {
    return next;
  }

  if (next === existing || existing.endsWith(next)) {
    return existing;
  }

  if (next.startsWith(existing)) {
    return next;
  }

  if (/^[,.;:!?)}\]]/.test(next)) {
    return `${existing}${next}`;
  }

  if (/^\s/.test(raw) || /[,:;!?)}\]]$/.test(existing)) {
    return `${existing} ${next}`;
  }

  return `${existing}${next}`;
}
