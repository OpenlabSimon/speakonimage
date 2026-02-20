'use client';

import { useState, useRef } from 'react';
import { useRecorder } from '@/hooks/useRecorder';

interface VoiceRecorderProps {
  onTranscription: (text: string, audioBlob: Blob) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  allowEdit?: boolean;
}

export function VoiceRecorder({
  onTranscription,
  onError,
  disabled,
  allowEdit = true,
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

  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
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
        await handleTranscribe(blob);
      }
    } else {
      setTranscription(null);
      setIsEditing(false);
      setEditedText('');
      await startRecording();
    }
  };

  // Handle transcription
  const handleTranscribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob);

      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.data.text) {
        setTranscription(result.data.text);
        setEditedText(result.data.text);
      } else if (result.data?.status === 'no_match') {
        setTranscription('');
        onError?.('No speech detected. Please try again.');
      } else {
        setTranscription(null);
        onError?.(result.error || 'Transcription failed');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      onError?.('Failed to transcribe audio');
    } finally {
      setTranscribing(false);
    }
  };

  // Handle edit mode
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedText(transcription || '');
  };

  const handleSaveEdit = () => {
    setTranscription(editedText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(transcription || '');
    setIsEditing(false);
  };

  // Handle submit
  const handleSubmit = () => {
    const finalText = transcription || '';
    if (finalText && audioBlob) {
      onTranscription(finalText, audioBlob);
    }
  };

  // Handle re-record
  const handleReRecord = () => {
    resetRecording();
    setTranscription(null);
    setIsEditing(false);
    setEditedText('');
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
          disabled={disabled || transcribing}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-200 text-white font-medium shadow-lg
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-blue-500 hover:bg-blue-600'
            }
            ${(disabled || transcribing) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isRecording ? (
            <span className="text-3xl">⏹</span>
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
        {isRecording && 'Recording... Click to stop'}
        {state === 'processing' && 'Processing audio...'}
        {transcribing && 'Transcribing with Azure...'}
        {state === 'idle' && !audioBlob && !transcribing && 'Click the microphone to start'}
      </div>

      {/* Audio Playback */}
      {audioUrl && !isRecording && (
        <div className="flex items-center justify-center">
          <audio ref={audioRef} src={audioUrl} controls className="h-10 w-full max-w-md" />
        </div>
      )}

      {/* Transcription Result */}
      {transcription !== null && !isRecording && (
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Transcription:</span>
            {allowEdit && !isEditing && transcription && (
              <button
                onClick={handleStartEdit}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-24 px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Edit your transcription..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-800">
              {transcription || (
                <span className="text-gray-400 italic">No speech detected</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {audioBlob && !isRecording && !transcribing && transcription !== null && (
        <div className="flex justify-center gap-3">
          <button
            onClick={handleReRecord}
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Re-record
          </button>
          {transcription && (
            <button
              onClick={handleSubmit}
              disabled={isEditing}
              className={`px-6 py-2 text-sm rounded-lg transition-colors ${
                isEditing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              Use This
            </button>
          )}
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
