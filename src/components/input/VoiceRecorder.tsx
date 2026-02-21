'use client';

import { useState, useRef } from 'react';
import { useRecorder } from '@/hooks/useRecorder';

interface VoiceRecorderProps {
  onTranscriptionAndEvaluation: (result: {
    transcription: string;
    audioUrl?: string;
    evaluation?: unknown;
    overallScore?: number;
  }) => void;
  topicData: unknown;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({
  onTranscriptionAndEvaluation,
  topicData,
  onError,
  disabled,
}: VoiceRecorderProps) {
  const {
    state,
    isRecording,
    duration,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    resetRecording,
    isSupported,
  } = useRecorder();

  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
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
      resetRecording();
      await startRecording();
    }
  };

  // Submit voice for transcription + evaluation in one step
  const handleSubmitVoice = async (blob: Blob) => {
    setProcessing(true);
    setProcessingStep('Uploading audio...');

    try {
      const formData = new FormData();
      formData.append('audio', blob);
      formData.append('topicData', JSON.stringify(topicData));

      setProcessingStep('Transcribing with Azure...');

      const response = await fetch('/api/submissions/voice', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        if (result.data.status === 'no_match') {
          onError?.('No speech detected. Please try again.');
          return;
        }

        // Return both transcription and evaluation
        onTranscriptionAndEvaluation({
          transcription: result.data.transcription,
          audioUrl: result.data.audioUrl,
          evaluation: result.data.evaluation,
          overallScore: result.data.overallScore,
        });
      } else {
        onError?.(result.error || 'Voice submission failed');
      }
    } catch (err) {
      console.error('Voice submission error:', err);
      onError?.('Failed to process voice recording');
    } finally {
      setProcessing(false);
      setProcessingStep('');
    }
  };

  // Handle re-record
  const handleReRecord = () => {
    resetRecording();
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
        Voice recording is not supported in this browser. Please use Chrome, Firefox, or Safari.
      </div>
    );
  }

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
        {isRecording && 'Recording... Click to stop and evaluate'}
        {state === 'processing' && !processing && 'Processing audio...'}
        {processing && (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            {processingStep || 'Processing...'}
          </span>
        )}
        {state === 'idle' && !audioBlob && !processing && 'Click the microphone to start recording'}
      </div>

      {/* Audio Playback (only show after successful recording, before processing) */}
      {audioUrl && !isRecording && !processing && (
        <div className="flex flex-col items-center gap-3">
          <audio ref={audioRef} src={audioUrl} controls className="h-10 w-full max-w-md" />
          <button
            onClick={handleReRecord}
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Record Again
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
