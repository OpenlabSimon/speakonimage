'use client';

import { useState, useRef, useCallback } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { convertToWav } from '@/lib/audio/convert';
import type { CEFRLevel } from '@/types';

const MAX_DURATION_SECONDS = 180; // 3 minutes absolute max

function getSuggestedDuration(level?: CEFRLevel): number {
  if (!level) return 120;
  if (level === 'A1' || level === 'A2') return 60;
  if (level === 'B1' || level === 'B2') return 120;
  return 180; // C1, C2
}

function formatDurationLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins <= 0) return `${seconds}秒`;
  return `${mins}分钟`;
}

interface VoiceRecorderProps {
  onTranscriptionAndEvaluation: (result: {
    transcription: string;
    audioUrl?: string;
    evaluation?: unknown;
    overallScore?: number;
  }) => void;
  topicData: unknown;
  topicId?: string; // Database topic ID for persistence
  sessionId?: string; // Chat session ID for memory system
  onError?: (error: string) => void;
  disabled?: boolean;
  cefrLevel?: CEFRLevel;
}

export function VoiceRecorder({
  onTranscriptionAndEvaluation,
  topicData,
  topicId,
  sessionId,
  onError,
  disabled,
  cefrLevel,
}: VoiceRecorderProps) {
  const suggestedDuration = getSuggestedDuration(cefrLevel);

  const handleAutoStop = useCallback((blob: Blob) => {
    handleSubmitVoiceRef.current?.(blob);
  }, []);

  const {
    state,
    isRecording,
    duration,
    audioBlob,
    audioUrl,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
    isSupported,
  } = useRecorder({ maxDurationSeconds: MAX_DURATION_SECONDS, onAutoStop: handleAutoStop });

  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const handleSubmitVoiceRef = useRef<((blob: Blob) => Promise<void>) | null>(null);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Countdown: show remaining time from suggested duration, then count up past it
  const remaining = Math.max(0, MAX_DURATION_SECONDS - duration);
  const pastSuggested = duration > suggestedDuration;
  const progressPercent = Math.min((duration / MAX_DURATION_SECONDS) * 100, 100);

  // Handle recording toggle
  const handleToggleRecording = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        await handleSubmitVoice(blob);
      }
    } else {
      // Reset state for new recording
      resetRecording();
      setApiError(null);
      setTranscription(null);
      await startRecording();
    }
  };

  // Submit voice for transcription + streaming evaluation via SSE
  const handleSubmitVoice = async (blob: Blob) => {
    setProcessing(true);
    setApiError(null);
    setProcessingStep('转换音频...');

    try {
      // Try to convert webm/opus to WAV for Azure compatibility
      let audioToSend: Blob = blob;
      try {
        const wavBlob = await convertToWav(blob);
        audioToSend = wavBlob;
        console.log('Converted to WAV:', wavBlob.size, 'bytes');
      } catch (conversionError) {
        console.warn('WAV conversion failed, using original webm:', conversionError);
      }

      setProcessingStep('上传音频...');

      const formData = new FormData();
      formData.append('audio', audioToSend);
      formData.append('topicData', JSON.stringify(topicData));
      if (topicId) {
        formData.append('topicId', topicId);
      }
      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      setProcessingStep('转写中...');

      const response = await fetch('/api/submissions/voice', {
        method: 'POST',
        body: formData,
      });

      // Handle non-streaming error responses
      if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const result = await response.json();
        if (result.success && result.data?.status === 'no_match') {
          setApiError('未检测到语音，请重试。');
          onError?.('未检测到语音，请重试。');
          return;
        }
        throw new Error(result.error || '语音提交失败');
      }

      // Check if response is JSON (non-streaming: no_match, skipEvaluation)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = await response.json();
        if (result.success) {
          if (result.data.status === 'no_match') {
            setApiError('未检测到语音，请重试。');
            onError?.('未检测到语音，请重试。');
            return;
          }
          setTranscription(result.data.transcription);
          onTranscriptionAndEvaluation({
            transcription: result.data.transcription,
            audioUrl: result.data.audioUrl,
            evaluation: result.data.evaluation,
            overallScore: result.data.overallScore,
          });
        } else {
          throw new Error(result.error || '语音提交失败');
        }
        return;
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (!payload) continue;

          try {
            const event = JSON.parse(payload);

            if (event.type === 'transcription') {
              // Show transcription immediately
              setTranscription(event.transcription);
              setProcessingStep('评估中...');
            } else if (event.type === 'delta') {
              // LLM is generating — could show streaming scores here
            } else if (event.type === 'done') {
              // Final validated result
              onTranscriptionAndEvaluation({
                transcription: event.data.transcription,
                audioUrl: event.data.audioUrl,
                evaluation: event.data.evaluation,
                overallScore: event.data.overallScore,
              });
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) {
            if (payload.includes('"type":"error"')) throw parseErr;
          }
        }
      }
    } catch (err) {
      console.error('Voice submission error:', err);
      const errorMsg = err instanceof Error ? err.message : '处理语音录音失败';
      setApiError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setProcessing(false);
      setProcessingStep('');
    }
  };

  // Keep ref in sync for auto-stop callback
  handleSubmitVoiceRef.current = handleSubmitVoice;

  // Handle re-record
  const handleReRecord = () => {
    resetRecording();
    setApiError(null);
    setTranscription(null);
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
        当前浏览器不支持语音录制，请使用 Chrome、Firefox 或 Safari。
      </div>
    );
  }

  const error = apiError || recorderError;

  return (
    <div className="flex flex-col gap-4">
      {/* Recording Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleToggleRecording}
          disabled={disabled || processing}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-200 text-white font-medium shadow-lg
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-blue-500 hover:bg-blue-600'
            }
            ${(disabled || processing) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isRecording ? (
            <span className="text-3xl">⏹</span>
          ) : processing ? (
            <span className="text-2xl animate-spin">⏳</span>
          ) : (
            <span className="text-3xl">🎤</span>
          )}
        </button>

        {isRecording && (
          <div className="text-xl font-mono min-w-[60px]">
            <span className={pastSuggested ? 'text-orange-600' : 'text-red-600'}>
              {formatDuration(remaining)}
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {isRecording && (
        <div className="w-full max-w-xs mx-auto">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                pastSuggested ? 'bg-orange-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {pastSuggested && (
            <div className="text-xs text-orange-500 text-center mt-1">
              已超过建议时长，可以停止了
            </div>
          )}
        </div>
      )}

      {/* Status Text */}
      <div className="text-center text-sm text-gray-600">
        {isRecording && '录音中...点击停止并评估'}
        {state === 'processing' && !processing && '处理音频中...'}
        {processing && (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            {processingStep || '处理中...'}
          </span>
        )}
        {state === 'idle' && !audioBlob && !processing && !transcription && (
          <span>
            建议录音 {formatDurationLabel(suggestedDuration)}，最长 {formatDurationLabel(MAX_DURATION_SECONDS)}
          </span>
        )}
      </div>

      {/* Audio Playback */}
      {audioUrl && !isRecording && (
        <div className="flex flex-col items-center gap-3">
          <audio ref={audioRef} src={audioUrl} controls className="h-10 w-full max-w-md" />
        </div>
      )}

      {/* Transcription Result */}
      {transcription && !processing && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm font-medium text-green-700 mb-1">转写结果:</div>
          <div className="text-gray-800">{transcription}</div>
          <div className="text-xs text-green-600 mt-2">评估加载中...</div>
        </div>
      )}

      {/* Action Buttons */}
      {audioBlob && !isRecording && !processing && (
        <div className="flex justify-center">
          <button
            onClick={handleReRecord}
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            重新录音
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="text-center text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
        </div>
      )}
    </div>
  );
}
