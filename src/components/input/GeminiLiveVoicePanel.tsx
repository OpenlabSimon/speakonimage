'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  GeminiLiveClient,
  type GeminiLiveDiagnosticEvent,
  type GeminiLiveErrorCode,
  type GeminiLiveErrorContext,
  type GeminiLiveState,
  type GeminiLiveTurnResult,
} from '@/lib/live/client';

interface GeminiLiveVoicePanelProps {
  onFallbackRequested: (reason: string) => void;
  onTurnComplete?: (turn: GeminiLiveTurnResult) => Promise<void> | void;
  onLiveStateChange?: (state: GeminiLiveState) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export interface GeminiLiveVoicePanelHandle {
  closeConnection: () => void;
}

type AudioContextConstructor = typeof AudioContext;
type DiagnosticPrimitive = string | number | boolean | null;
type LocalDiagnosticEventName =
  | GeminiLiveDiagnosticEvent['name']
  | 'connect_blocked_mobile'
  | 'connect_unsupported_browser'
  | 'microphone_ready'
  | 'recording_started'
  | 'first_audio_callback'
  | 'pending_audio_flushed'
  | 'fallback_requested';

interface LiveDiagnosticEntry {
  name: LocalDiagnosticEventName;
  at: string;
  offsetMs: number;
  detail?: Record<string, DiagnosticPrimitive>;
}

interface LiveDiagnosticSnapshot {
  schemaVersion: 1;
  sessionId: string;
  startedAt: string;
  startedAtMs: number;
  currentState: GeminiLiveState;
  fallbackActive: boolean;
  route: {
    tokenEndpoint: string;
    model?: string;
    wsUrl?: string;
  };
  environment: {
    userAgent: string;
    mobileWebKit: boolean;
    audioContextSampleRate?: number | null;
    trackSampleRate?: number | null;
    trackChannelCount?: number | null;
    echoCancellation?: boolean | null;
    noiseSuppression?: boolean | null;
    autoGainControl?: boolean | null;
    processorBufferSize?: number | null;
    pcmTargetSampleRate: number;
    packetSamples: number;
  };
  audioStats: {
    audioProcessCallbacks: number;
    sourceSamples: number;
    targetSamples: number;
    packetsAttempted: number;
    flushedPackets: number;
    maxPendingSamples: number;
    firstPacketBytes?: number;
    lastPacketBytes?: number;
  };
  timings: {
    tokenFetchMs?: number;
    websocketOpenMs?: number;
    setupCompleteMs?: number;
    firstServerPacketMs?: number;
    audioCaptureReadyMs?: number;
    firstAudioChunkSentMs?: number;
    lastAudioChunkSentMs?: number;
    activityEndSentMs?: number;
    firstInputTranscriptMs?: number;
    firstOutputTranscriptMs?: number;
    firstModelTextMs?: number;
    firstOutputAudioMs?: number;
    turnCompleteMs?: number;
  };
  error?: {
    code?: GeminiLiveErrorCode;
    userMessage?: string;
    rawMessage?: string;
    stage?: GeminiLiveErrorContext['stage'];
    closeCode?: number;
    httpStatus?: number;
  };
  timeline: LiveDiagnosticEntry[];
}

type LiveDiagnosticsWindow = typeof window & {
  __geminiLiveDiagnostics?: LiveDiagnosticSnapshot;
};

const PCM_TARGET_SAMPLE_RATE = 16000;
const LIVE_PACKET_SAMPLES = 1600;
const LIVE_TOKEN_ENDPOINT = '/api/live/token';

function isMobileWebKit(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const isWebKit = /AppleWebKit/i.test(userAgent);
  const isCriOS = /CriOS/i.test(userAgent);
  const isFxiOS = /FxiOS/i.test(userAgent);

  return isAppleMobile && isWebKit && !isCriOS && !isFxiOS;
}

function getLiveAudioConstraints(): MediaTrackConstraints {
  if (isMobileWebKit()) {
    return {
      channelCount: 1,
      sampleRate: PCM_TARGET_SAMPLE_RATE,
      sampleSize: 16,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
  }

  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const windowWithWebkit = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };

  return window.AudioContext || windowWithWebkit.webkitAudioContext;
}

function createPcmBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: `audio/pcm;rate=${sampleRate}` });
}

function downsampleTo16k(samples: Float32Array, sourceSampleRate: number): Float32Array {
  const targetSampleRate = PCM_TARGET_SAMPLE_RATE;
  if (sourceSampleRate === targetSampleRate) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      sum += samples[cursor] || 0;
      count += 1;
    }

    output[index] = count > 0 ? sum / count : samples[start] || 0;
  }

  return output;
}

function appendFloat32Buffers(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  const combined = new Float32Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function getErrorLabel(code: GeminiLiveErrorCode): string {
  switch (code) {
    case 'network':
      return '网络连接失败，已建议切回标准语音提交。';
    case 'auth':
      return 'Gemini Live 鉴权失败，已建议切回标准语音提交。';
    case 'audio_format':
      return 'Gemini Live 音频格式暂不兼容，已建议切回标准语音提交。';
    case 'model_unsupported':
      return '当前 Live 模型不可用，已建议切回标准语音提交。';
    case 'session_interrupted':
      return 'Live 会话中断，已建议切回标准语音提交。';
    case 'invalid_message':
      return 'Live 返回格式异常，已建议切回标准语音提交。';
    default:
      return 'Gemini Live 暂时不可用，已建议切回标准语音提交。';
  }
}

function toUserFacingError(message: string): string {
  if (message.includes('websocket failed')) {
    return getErrorLabel('network');
  }
  if (message.includes('socket is not connected')) {
    return getErrorLabel('session_interrupted');
  }
  if (message.includes('(1008)') || message.includes('token denied')) {
    return getErrorLabel('auth');
  }
  if (message.includes('(1003)')) {
    return getErrorLabel('model_unsupported');
  }
  if (message.includes('(1006)')) {
    return getErrorLabel('network');
  }
  if (message.includes('(1007)')) {
    return getErrorLabel('audio_format');
  }
  if (message.includes('(1011)') || message.includes('(1012)')) {
    return getErrorLabel('session_interrupted');
  }
  return message;
}

function sanitizeDiagnosticDetail(
  detail?: Record<string, unknown>
): Record<string, DiagnosticPrimitive> | undefined {
  if (!detail) {
    return undefined;
  }

  const sanitized: Record<string, DiagnosticPrimitive> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function createDiagnosticSession(): LiveDiagnosticSnapshot {
  const startedAtMs = Date.now();
  const sessionId = `live-${startedAtMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    schemaVersion: 1,
    sessionId,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    currentState: 'idle',
    fallbackActive: false,
    route: {
      tokenEndpoint: LIVE_TOKEN_ENDPOINT,
    },
    environment: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || 'unknown' : 'unknown',
      mobileWebKit: isMobileWebKit(),
      pcmTargetSampleRate: PCM_TARGET_SAMPLE_RATE,
      packetSamples: LIVE_PACKET_SAMPLES,
    },
    audioStats: {
      audioProcessCallbacks: 0,
      sourceSamples: 0,
      targetSamples: 0,
      packetsAttempted: 0,
      flushedPackets: 0,
      maxPendingSamples: 0,
    },
    timings: {},
    timeline: [],
  };
}

function getTimelineOffset(snapshot: LiveDiagnosticSnapshot, name: LocalDiagnosticEventName): number | undefined {
  return snapshot.timeline.find((entry) => entry.name === name)?.offsetMs;
}

function applyTiming(snapshot: LiveDiagnosticSnapshot, name: LocalDiagnosticEventName, offsetMs: number) {
  switch (name) {
    case 'token_fetch_ok':
    case 'token_fetch_failed': {
      const tokenFetchStartMs = getTimelineOffset(snapshot, 'token_fetch_start');
      if (tokenFetchStartMs !== undefined) {
        snapshot.timings.tokenFetchMs = offsetMs - tokenFetchStartMs;
      }
      break;
    }
    case 'websocket_open':
      snapshot.timings.websocketOpenMs = offsetMs;
      break;
    case 'setup_complete':
      snapshot.timings.setupCompleteMs = offsetMs;
      break;
    case 'first_server_packet':
      snapshot.timings.firstServerPacketMs = offsetMs;
      break;
    case 'microphone_ready':
      snapshot.timings.audioCaptureReadyMs = offsetMs;
      break;
    case 'first_audio_chunk_sent':
      snapshot.timings.firstAudioChunkSentMs = offsetMs;
      break;
    case 'last_audio_chunk_sent':
      snapshot.timings.lastAudioChunkSentMs = offsetMs;
      break;
    case 'activity_end_sent':
      snapshot.timings.activityEndSentMs = offsetMs;
      break;
    case 'first_input_transcript':
      snapshot.timings.firstInputTranscriptMs = offsetMs;
      break;
    case 'first_output_transcript':
      snapshot.timings.firstOutputTranscriptMs = offsetMs;
      break;
    case 'first_model_text':
      snapshot.timings.firstModelTextMs = offsetMs;
      break;
    case 'first_output_audio_chunk':
      snapshot.timings.firstOutputAudioMs = offsetMs;
      break;
    case 'turn_complete':
      snapshot.timings.turnCompleteMs = offsetMs;
      break;
    default:
      break;
  }
}

export const GeminiLiveVoicePanel = forwardRef<GeminiLiveVoicePanelHandle, GeminiLiveVoicePanelProps>(function GeminiLiveVoicePanel({
  onFallbackRequested,
  onTurnComplete,
  onLiveStateChange,
  disabled = false,
  disabledReason,
}, ref) {
  const [liveState, setLiveState] = useState<GeminiLiveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [turnPersistenceError, setTurnPersistenceError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [firstPacketLatencyMs, setFirstPacketLatencyMs] = useState<number | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const connectStartedAtRef = useRef<number | null>(null);
  const pendingPcmRef = useRef<Float32Array>(new Float32Array(0));
  const diagnosticsRef = useRef<LiveDiagnosticSnapshot | null>(null);
  const firstAudioCallbackCapturedRef = useRef(false);

  const isSupported = typeof window !== 'undefined'
    && typeof WebSocket !== 'undefined'
    && !!navigator.mediaDevices
    && !!getAudioContextConstructor();
  const isTemporarilyBlockedOnMobile = isMobileWebKit();

  const statusLabel = useMemo(() => {
    switch (liveState) {
      case 'connecting':
        return '正在连线老师...';
      case 'connected':
        return '已连上，点一下就能开始这一轮';
      case 'recording':
        return '老师正在听你说...';
      case 'responding':
        return '老师正在回应这一轮...';
      case 'failed':
        return 'Gemini Live 不可用';
      case 'closed':
        return 'Live 会话已关闭';
      default:
        return '未开始';
    }
  }, [liveState]);

  const primaryActionLabel = useMemo(() => {
    if (liveState === 'responding') {
      return '老师回应中...';
    }
    if (isRecording) {
      return '结束这一轮';
    }
    if (connected) {
      return '开始这一轮';
    }
    return '连接 Live';
  }, [connected, isRecording, liveState]);

  const syncDiagnosticText = () => {
    const snapshot = diagnosticsRef.current;
    setDebugInfo(snapshot ? JSON.stringify(snapshot, null, 2) : '');
    if (typeof window !== 'undefined') {
      (window as LiveDiagnosticsWindow).__geminiLiveDiagnostics = snapshot || undefined;
    }
  };

  const ensureDiagnosticSession = () => {
    if (!diagnosticsRef.current) {
      diagnosticsRef.current = createDiagnosticSession();
    }

    return diagnosticsRef.current;
  };

  const startDiagnosticSession = () => {
    diagnosticsRef.current = createDiagnosticSession();
    firstAudioCallbackCapturedRef.current = false;
    syncDiagnosticText();
    return diagnosticsRef.current;
  };

  const updateDiagnostics = (
    updater: (snapshot: LiveDiagnosticSnapshot) => void,
    sync = true
  ) => {
    const snapshot = ensureDiagnosticSession();
    updater(snapshot);
    if (sync) {
      syncDiagnosticText();
    }
  };

  const recordDiagnosticEvent = (
    name: LocalDiagnosticEventName,
    detail?: Record<string, unknown>,
    sync = true
  ) => {
    updateDiagnostics((snapshot) => {
      const sanitized = sanitizeDiagnosticDetail(detail);
      const now = Date.now();
      const offsetMs = now - snapshot.startedAtMs;
      snapshot.timeline.push({
        name,
        at: new Date(now).toISOString(),
        offsetMs,
        ...(sanitized ? { detail: sanitized } : {}),
      });
      applyTiming(snapshot, name, offsetMs);

      if (sanitized?.model && typeof sanitized.model === 'string') {
        snapshot.route.model = sanitized.model;
      }
      if (sanitized?.wsUrl && typeof sanitized.wsUrl === 'string') {
        snapshot.route.wsUrl = sanitized.wsUrl;
      }
    }, sync);
  };

  const setDiagnosticState = (state: GeminiLiveState, sync = true) => {
    if (!diagnosticsRef.current) {
      return;
    }

    updateDiagnostics((snapshot) => {
      snapshot.currentState = state;
    }, sync);
  };

  const setDiagnosticError = (
    detail: {
      code?: GeminiLiveErrorCode;
      userMessage?: string;
      rawMessage?: string;
      stage?: GeminiLiveErrorContext['stage'];
      closeCode?: number;
      httpStatus?: number;
    },
    sync = true
  ) => {
    updateDiagnostics((snapshot) => {
      snapshot.error = {
        ...snapshot.error,
        ...detail,
      };
    }, sync);
  };

  const triggerFallback = (
    userMessage: string,
    detail?: {
      code?: GeminiLiveErrorCode;
      rawMessage?: string;
      stage?: GeminiLiveErrorContext['stage'];
      closeCode?: number;
      httpStatus?: number;
    },
    notify = true
  ) => {
    setDiagnosticError({
      ...detail,
      userMessage,
    }, false);
    updateDiagnostics((snapshot) => {
      snapshot.fallbackActive = true;
    }, false);
    recordDiagnosticEvent('fallback_requested', {
      userMessage,
      code: detail?.code || null,
      stage: detail?.stage || null,
      closeCode: detail?.closeCode ?? null,
      httpStatus: detail?.httpStatus ?? null,
    });
    setError(userMessage);
    setFallbackActive(true);
    setConnected(false);
    setIsRecording(false);
    if (notify) {
      onFallbackRequested(userMessage);
    }
  };

  useEffect(() => {
    setConnected(
      liveState === 'connected' ||
      liveState === 'recording' ||
      liveState === 'responding'
    );

    if (liveState === 'closed' || liveState === 'failed') {
      setIsRecording(false);
    }
  }, [liveState]);

  useEffect(() => {
    const queuedAudioUrls = audioQueueRef.current;
    return () => {
      clientRef.current?.close();
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      gainNodeRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      queuedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
      pendingPcmRef.current = new Float32Array(0);
    };
  }, []);

  const playAudioChunk = async (audioUrl: string) => {
    audioQueueRef.current.push(audioUrl);
    if (playingRef.current) {
      return;
    }

    playingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const nextUrl = audioQueueRef.current.shift();
      if (!nextUrl) {
        continue;
      }

      await new Promise<void>((resolve) => {
        const audio = new Audio(nextUrl);
        audio.onended = () => {
          URL.revokeObjectURL(nextUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(nextUrl);
          resolve();
        };
        void audio.play().catch(() => {
          URL.revokeObjectURL(nextUrl);
          resolve();
        });
      });
    }

    playingRef.current = false;
  };

  const handleTurnComplete = async (turn: GeminiLiveTurnResult) => {
    const hasContent = turn.inputTranscript.trim() || turn.outputTranscript.trim() || turn.outputText.trim();
    if (!hasContent || !onTurnComplete) {
      return;
    }

    try {
      setTurnPersistenceError(null);
      await onTurnComplete(turn);
    } catch (persistError) {
      console.error('Persist Gemini Live turn error:', persistError);
      setTurnPersistenceError('这一轮已经完成，但保存到学习记录失败，最终点评可能不完整。');
    }
  };

  const connectLive = async () => {
    clientRef.current?.close();
    clientRef.current = null;
    pendingPcmRef.current = new Float32Array(0);
    connectStartedAtRef.current = Date.now();
    startDiagnosticSession();

    if (isTemporarilyBlockedOnMobile) {
      const message = 'Gemini Live 暂未对 iPhone 浏览器开放，建议直接使用下面的标准语音提交。';
      recordDiagnosticEvent('connect_blocked_mobile', {
        mobileWebKit: true,
      });
      triggerFallback(message, undefined, true);
      return;
    }

    if (!isSupported) {
      const message = '当前浏览器不支持 Gemini Live，建议使用标准语音提交。';
      recordDiagnosticEvent('connect_unsupported_browser', {
        hasWebSocket: typeof WebSocket !== 'undefined',
        hasMediaDevices: !!navigator.mediaDevices,
        hasAudioContext: !!getAudioContextConstructor(),
      });
      triggerFallback(message, undefined, true);
      return;
    }

    setError(null);
    setInputTranscript('');
    setOutputTranscript('');
    setTurnPersistenceError(null);
    setFirstPacketLatencyMs(null);
    setFallbackActive(false);
    updateDiagnostics((snapshot) => {
      snapshot.fallbackActive = false;
      snapshot.error = undefined;
      snapshot.currentState = 'idle';
    });

    const client = new GeminiLiveClient({
      tokenEndpoint: LIVE_TOKEN_ENDPOINT,
      onStateChange: (state) => {
        setLiveState(state);
        setDiagnosticState(state);
        onLiveStateChange?.(state);
      },
      onInputTranscript: setInputTranscript,
      onOutputTranscript: setOutputTranscript,
      onText: setOutputTranscript,
      onAudioChunk: (audioUrl) => {
        void playAudioChunk(audioUrl);
      },
      onTurnComplete: (turn) => {
        void handleTurnComplete(turn);
      },
      onFirstPacket: () => {
        if (connectStartedAtRef.current) {
          const latencyMs = Date.now() - connectStartedAtRef.current;
          setFirstPacketLatencyMs(latencyMs);
        }
      },
      onDiagnosticEvent: (event) => {
        recordDiagnosticEvent(event.name, event.detail);
      },
      onError: (code, rawMessage, context) => {
        const fallbackMessage = toUserFacingError(rawMessage) || getErrorLabel(code);
        triggerFallback(fallbackMessage, {
          code,
          rawMessage,
          stage: context?.stage,
          closeCode: context?.closeCode,
          httpStatus: context?.httpStatus,
        });
      },
    });

    clientRef.current = client;

    try {
      await client.connect();
      setConnected(true);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Gemini Live 连接失败';
      setError((current) => current || toUserFacingError(message));
      setFallbackActive(true);
      setConnected(false);
    }
  };

  const startStreaming = async () => {
    if (
      !clientRef.current ||
      !connected ||
      liveState === 'closed' ||
      liveState === 'failed'
    ) {
      await connectLive();
      if (!clientRef.current || liveState === 'failed') {
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getLiveAudioConstraints(),
      });
      setError(null);
      setFallbackActive(false);
      updateDiagnostics((snapshot) => {
        snapshot.fallbackActive = false;
      });
      streamRef.current = stream;
      const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
      const [audioTrack] = audioTracks;
      const trackSettings = audioTrack?.getSettings?.();

      const AudioContextCtor = getAudioContextConstructor();
      if (!AudioContextCtor) {
        throw new Error('当前浏览器不支持 AudioContext');
      }

      const audioContext = new AudioContextCtor({ sampleRate: PCM_TARGET_SAMPLE_RATE });
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const processorBufferSize = isMobileWebKit() ? 4096 : 2048;
      updateDiagnostics((snapshot) => {
        snapshot.environment.audioContextSampleRate = audioContext.sampleRate;
        snapshot.environment.trackSampleRate = trackSettings?.sampleRate ?? null;
        snapshot.environment.trackChannelCount = trackSettings?.channelCount ?? null;
        snapshot.environment.echoCancellation = trackSettings?.echoCancellation ?? null;
        snapshot.environment.noiseSuppression = trackSettings?.noiseSuppression ?? null;
        snapshot.environment.autoGainControl = trackSettings?.autoGainControl ?? null;
        snapshot.environment.processorBufferSize = processorBufferSize;
      }, false);
      recordDiagnosticEvent('microphone_ready', {
        audioContextSampleRate: audioContext.sampleRate,
        trackSampleRate: trackSettings?.sampleRate ?? null,
        trackChannelCount: trackSettings?.channelCount ?? null,
        echoCancellation: trackSettings?.echoCancellation ?? null,
        noiseSuppression: trackSettings?.noiseSuppression ?? null,
        autoGainControl: trackSettings?.autoGainControl ?? null,
        processorBufferSize,
      });

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(processorBufferSize, 1, 1);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;

      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      gainNodeRef.current = gainNode;
      firstAudioCallbackCapturedRef.current = false;

      processorNode.onaudioprocess = (event) => {
        if (!clientRef.current) {
          return;
        }

        const channel = event.inputBuffer.getChannelData(0);
        const pcmSamples = downsampleTo16k(channel, audioContext.sampleRate);
        pendingPcmRef.current = appendFloat32Buffers(pendingPcmRef.current, pcmSamples);

        updateDiagnostics((snapshot) => {
          snapshot.audioStats.audioProcessCallbacks += 1;
          snapshot.audioStats.sourceSamples += channel.length;
          snapshot.audioStats.targetSamples += pcmSamples.length;
          snapshot.audioStats.maxPendingSamples = Math.max(
            snapshot.audioStats.maxPendingSamples,
            pendingPcmRef.current.length
          );
        }, false);

        if (!firstAudioCallbackCapturedRef.current) {
          firstAudioCallbackCapturedRef.current = true;
          recordDiagnosticEvent('first_audio_callback', {
            sourceSamples: channel.length,
            targetSamples: pcmSamples.length,
          });
        }

        while (pendingPcmRef.current.length >= LIVE_PACKET_SAMPLES) {
          const packetSamples = pendingPcmRef.current.slice(0, LIVE_PACKET_SAMPLES);
          pendingPcmRef.current = pendingPcmRef.current.slice(LIVE_PACKET_SAMPLES);
          const pcmBlob = createPcmBlob(packetSamples, PCM_TARGET_SAMPLE_RATE);

          updateDiagnostics((snapshot) => {
            snapshot.audioStats.packetsAttempted += 1;
            snapshot.audioStats.firstPacketBytes ??= pcmBlob.size;
            snapshot.audioStats.lastPacketBytes = pcmBlob.size;
            snapshot.audioStats.maxPendingSamples = Math.max(
              snapshot.audioStats.maxPendingSamples,
              pendingPcmRef.current.length
            );
          }, false);

          void clientRef.current.sendAudioChunk(pcmBlob).catch((sendError) => {
            const rawMessage = sendError instanceof Error ? sendError.message : 'Gemini Live 音频分片发送失败';
            const fallbackMessage = toUserFacingError(rawMessage);
            clientRef.current?.close();
            triggerFallback(fallbackMessage, {
              code: 'session_interrupted',
              rawMessage,
              stage: 'runtime',
            });
          });
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
      setLiveState('recording');
      setDiagnosticState('recording', false);
      recordDiagnosticEvent('recording_started');
    } catch (recordError) {
      const rawMessage = recordError instanceof Error ? recordError.message : '无法开始实时录音';
      const fallbackMessage = toUserFacingError(rawMessage);
      triggerFallback(fallbackMessage, {
        code: 'unknown',
        rawMessage,
        stage: 'runtime',
      });
    }
  };

  const stopStreaming = () => {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    gainNodeRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setIsRecording(false);

    if (clientRef.current && pendingPcmRef.current.length > 0) {
      const remainingSamples = pendingPcmRef.current.length;
      const pcmBlob = createPcmBlob(pendingPcmRef.current, PCM_TARGET_SAMPLE_RATE);
      updateDiagnostics((snapshot) => {
        snapshot.audioStats.flushedPackets += 1;
        snapshot.audioStats.packetsAttempted += 1;
        snapshot.audioStats.lastPacketBytes = pcmBlob.size;
      }, false);
      recordDiagnosticEvent('pending_audio_flushed', {
        remainingSamples,
        packetBytes: pcmBlob.size,
        packetMime: pcmBlob.type,
      });
      void clientRef.current.sendAudioChunk(pcmBlob).catch(() => {});
      pendingPcmRef.current = new Float32Array(0);
    }

    setError(null);
    clientRef.current?.finishAudioStream();
  };

  const closeConnection = () => {
    if (isRecording) {
      stopStreaming();
    }
    pendingPcmRef.current = new Float32Array(0);
    clientRef.current?.close();
    clientRef.current = null;
    setConnected(false);
    setIsRecording(false);
  };

  useImperativeHandle(ref, () => ({
    closeConnection,
  }), [isRecording]);

  const handlePrimaryAction = async () => {
    if (liveState === 'responding') {
      return;
    }

    if (isRecording) {
      stopStreaming();
      return;
    }

    if (connected) {
      await startStreaming();
      return;
    }

    await connectLive();
  };

  const copyDebugInfo = async () => {
    if (!debugInfo || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(debugInfo);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-violet-900">Gemini Live Beta</div>
          <div className="mt-1 text-xs text-violet-700">{statusLabel}</div>
          {firstPacketLatencyMs !== null && (
            <div className="mt-1 text-xs text-violet-600">
              首包延迟约 {Math.round(firstPacketLatencyMs / 100) / 10}s
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              void handlePrimaryAction();
            }}
            disabled={
              disabled ||
              isTemporarilyBlockedOnMobile ||
              liveState === 'connecting' ||
              liveState === 'responding'
            }
            className="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-violet-300"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-violet-700">
        一轮只做一件事：先说完，再等老师回应。老师回应期间不能开始下一轮。
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {toUserFacingError(error)}
        </div>
      )}

      {isTemporarilyBlockedOnMobile && !error && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Gemini Live 目前只对桌面浏览器开放。iPhone 浏览器请直接使用下面的标准语音提交。
        </div>
      )}

      {disabled && disabledReason && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {disabledReason}
        </div>
      )}

      {fallbackActive && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          已自动切回下面的标准语音提交流程。你仍然可以继续录音并拿到完整转写、评估和老师点评。
        </div>
      )}

      {turnPersistenceError && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {turnPersistenceError}
        </div>
      )}

      {debugInfo && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-medium text-slate-900">Live 诊断</div>
            <button
              type="button"
              onClick={copyDebugInfo}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
            >
              复制诊断
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5">
            {debugInfo}
          </pre>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-white px-3 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
            实时转写
          </div>
          <div className="mt-2 text-sm text-gray-700">
            {inputTranscript || '连接后开始说话，这里会出现实时输入转写。'}
          </div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white px-3 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
            老师即时回应
          </div>
          <div className="mt-2 text-sm text-gray-700">
            {outputTranscript || 'Live 返回文本或音频后，这里会先显示老师回应。'}
          </div>
        </div>
      </div>
    </div>
  );
});

GeminiLiveVoicePanel.displayName = 'GeminiLiveVoicePanel';
