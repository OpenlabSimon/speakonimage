'use client';

import { useState, useRef } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { convertToWav } from '@/lib/audio/convert';

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
}

export function VoiceRecorder({
  onTranscriptionAndEvaluation,
  topicData,
  topicId,
  sessionId,
  onError,
  disabled,
}: VoiceRecorderProps) {
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
  } = useRecorder();

  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Submit voice for transcription + evaluation in one step
  const handleSubmitVoice = async (blob: Blob) => {
    setProcessing(true);
    setApiError(null);
    setProcessingStep('转换音频...');

    try {
      // Try to convert webm/opus to WAV for Azure compatibility
      // If conversion fails, use original format
      let audioToSend: Blob = blob;
      try {
        const wavBlob = await convertToWav(blob);
        audioToSend = wavBlob;
        console.log('Converted to WAV:', wavBlob.size, 'bytes');
      } catch (conversionError) {
        console.warn('WAV conversion failed, using original webm:', conversionError);
        // Continue with original blob
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

      setProcessingStep('转写并评估中...');

      const response = await fetch('/api/submissions/voice', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      console.log('Voice API response:', result);

      if (result.success) {
        if (result.data.status === 'no_match') {
          setApiError('未检测到语音，请重试。');
          onError?.('未检测到语音，请重试。');
          return;
        }

        // Show transcription locally
        setTranscription(result.data.transcription);

        // Return both transcription and evaluation to parent
        onTranscriptionAndEvaluation({
          transcription: result.data.transcription,
          audioUrl: result.data.audioUrl,
          evaluation: result.data.evaluation,
          overallScore: result.data.overallScore,
        });
      } else {
        const errorMsg = result.error || '语音提交失败';
        setApiError(errorMsg);
        onError?.(errorMsg);
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
          <div className="text-xl font-mono text-red-600 min-w-[60px]">
            {formatDuration(duration)}
          </div>
        )}
      </div>

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
        {state === 'idle' && !audioBlob && !processing && !transcription && '点击麦克风开始录音'}
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
