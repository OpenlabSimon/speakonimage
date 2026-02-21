'use client';

import { useState, useRef } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { convertToWav } from '@/lib/audio/convert';
import type { CEFRLevel } from '@/types';

interface IntroductionAssessmentResult {
  estimatedLevel: CEFRLevel;
  confidence: number;
  analysis: {
    vocabularyLevel: CEFRLevel;
    grammarLevel: CEFRLevel;
    englishRatio: number;
    observations: string[];
  };
}

interface IntroductionInputProps {
  onAssessmentComplete: (
    level: CEFRLevel,
    confidence: number,
    introductionText: string
  ) => void;
  onSkip?: () => void;
}

const EXAMPLE_PROMPTS = [
  "Hi, I'm 小明, I work as a software engineer in 北京",
  "Hello! My name is 李华, I'm a student who loves traveling",
  "大家好, I'm interested in learning English for my career",
];

export function IntroductionInput({
  onAssessmentComplete,
  onSkip,
}: IntroductionInputProps) {
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');
  const [textInput, setTextInput] = useState('');
  const [isAssessing, setIsAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] =
    useState<IntroductionAssessmentResult | null>(null);

  const {
    state,
    isRecording,
    duration,
    audioUrl,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
    isSupported,
  } = useRecorder();

  const audioRef = useRef<HTMLAudioElement>(null);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Submit text for assessment
  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      setError('Please enter your introduction');
      return;
    }

    await assessIntroduction(textInput.trim());
  };

  // Handle voice recording toggle
  const handleToggleRecording = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        await handleVoiceSubmit(blob);
      }
    } else {
      resetRecording();
      setError(null);
      setAssessmentResult(null);
      await startRecording();
    }
  };

  // Submit voice for transcription then assessment
  const handleVoiceSubmit = async (blob: Blob) => {
    setIsAssessing(true);
    setError(null);

    try {
      // Convert to WAV for better compatibility
      let audioToSend = blob;
      try {
        audioToSend = await convertToWav(blob);
      } catch {
        console.warn('WAV conversion failed, using original format');
      }

      // First, transcribe the audio
      const formData = new FormData();
      formData.append('audio', audioToSend);

      const transcribeResponse = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      });

      const transcribeResult = await transcribeResponse.json();

      if (!transcribeResult.success) {
        throw new Error(transcribeResult.error || 'Transcription failed');
      }

      const transcription = transcribeResult.data.text;
      if (!transcription || transcription.trim() === '') {
        throw new Error('No speech detected. Please try again.');
      }

      // Then assess the transcription
      await assessIntroduction(transcription);
    } catch (err) {
      console.error('Voice assessment error:', err);
      setError(err instanceof Error ? err.message : 'Voice assessment failed');
    } finally {
      setIsAssessing(false);
    }
  };

  // Call assessment API
  const assessIntroduction = async (text: string) => {
    setIsAssessing(true);
    setError(null);

    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ introductionText: text }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Assessment failed');
      }

      setAssessmentResult(result.data);

      // Call parent callback with results
      onAssessmentComplete(
        result.data.estimatedLevel,
        result.data.confidence,
        text
      );
    } catch (err) {
      console.error('Assessment error:', err);
      setError(err instanceof Error ? err.message : 'Assessment failed');
    } finally {
      setIsAssessing(false);
    }
  };

  // Use example
  const handleUseExample = (example: string) => {
    setTextInput(example);
    setError(null);
    setAssessmentResult(null);
  };

  const displayError = error || recorderError;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Introduce Yourself
        </h2>
        <p className="text-gray-600 text-sm">
          Mix English and Chinese naturally. We&apos;ll determine the best
          practice level for you.
        </p>
      </div>

      {/* Input Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setInputMode('text')}
          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
            inputMode === 'text'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setInputMode('voice')}
          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
            inputMode === 'voice'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Voice
        </button>
      </div>

      {/* Text Input Mode */}
      {inputMode === 'text' && (
        <div className="space-y-4">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Hi, I'm 小明, I work in 北京 as a teacher. I like reading books and watching movies..."
            className="w-full h-32 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isAssessing}
          />

          {/* Example Prompts */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => handleUseExample(example)}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
                >
                  {example.substring(0, 30)}...
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleTextSubmit}
            disabled={isAssessing || !textInput.trim()}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              isAssessing || !textInput.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {isAssessing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">...</span>
                Assessing...
              </span>
            ) : (
              'Assess My Level'
            )}
          </button>
        </div>
      )}

      {/* Voice Input Mode */}
      {inputMode === 'voice' && (
        <div className="flex flex-col gap-4">
          {!isSupported ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              Voice recording is not supported in this browser. Please use
              Chrome, Firefox, or Safari.
            </div>
          ) : (
            <>
              {/* Recording Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleToggleRecording}
                  disabled={isAssessing}
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center
                    transition-all duration-200 text-white font-medium shadow-lg
                    ${
                      isRecording
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }
                    ${isAssessing ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {isRecording ? (
                    <span className="text-3xl">Stop</span>
                  ) : isAssessing ? (
                    <span className="text-2xl animate-spin">...</span>
                  ) : (
                    <span className="text-3xl">Start</span>
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
                {state === 'processing' && !isAssessing && 'Processing audio...'}
                {isAssessing && (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">...</span>
                    Assessing your level...
                  </span>
                )}
                {state === 'idle' && !audioUrl && !isAssessing && (
                  <p className="text-gray-500">
                    Click &quot;Start&quot; and introduce yourself in English and
                    Chinese
                  </p>
                )}
              </div>

              {/* Audio Playback */}
              {audioUrl && !isRecording && (
                <div className="flex flex-col items-center gap-3">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    className="h-10 w-full max-w-md"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Error Display */}
      {displayError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {displayError}
        </div>
      )}

      {/* Assessment Result Preview */}
      {assessmentResult && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-700 font-medium">Your Level:</span>
            <span className="text-2xl font-bold text-green-800">
              {assessmentResult.estimatedLevel}
            </span>
          </div>
          <div className="text-xs text-green-600">
            Confidence: {Math.round(assessmentResult.confidence * 100)}%
          </div>
          {assessmentResult.analysis.observations.length > 0 && (
            <div className="mt-2 text-xs text-green-700">
              <ul className="list-disc list-inside space-y-1">
                {assessmentResult.analysis.observations.slice(0, 2).map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Skip Option */}
      {onSkip && (
        <div className="mt-6 text-center">
          <button
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Skip and choose level manually
          </button>
        </div>
      )}
    </div>
  );
}
