'use client';

import { useState } from 'react';
import { VoiceRecorder } from '@/components/input/VoiceRecorder';

// Mock topic data for testing
const mockTopicData = {
  type: 'translation' as const,
  chinesePrompt: '这是一个测试',
  keyPoints: ['test point'],
  suggestedVocab: [],
  difficultyMetadata: {
    targetCefr: 'B1',
    vocabComplexity: 0.5,
    grammarComplexity: 0.5,
  },
};

export default function TestVoicePage() {
  const [result, setResult] = useState<{
    transcription: string;
    audioUrl?: string;
    overallScore?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResult = (data: {
    transcription: string;
    audioUrl?: string;
    evaluation?: unknown;
    overallScore?: number;
  }) => {
    setResult({
      transcription: data.transcription,
      audioUrl: data.audioUrl,
      overallScore: data.overallScore,
    });
    console.log('Received result:', data);
  };

  const handleError = (err: string) => {
    setError(err);
    console.error('Voice recorder error:', err);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-6 text-center">Voice Recording Test</h1>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <VoiceRecorder
            onTranscriptionAndEvaluation={handleResult}
            topicData={mockTopicData}
            onError={handleError}
          />
        </div>

        {result && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-green-800 mb-2">Result:</h2>
            <p className="text-green-900 mb-2"><strong>Transcription:</strong> {result.transcription}</p>
            {result.overallScore !== undefined && (
              <p className="text-green-900 mb-2"><strong>Score:</strong> {result.overallScore}</p>
            )}
            {result.audioUrl && (
              <div className="mt-2">
                <strong className="text-green-800">Recording:</strong>
                <audio src={result.audioUrl} controls className="mt-1 w-full" />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-red-800 mb-2">Error:</h2>
            <p className="text-red-900">{error}</p>
          </div>
        )}

        <div className="mt-8 text-sm text-gray-600">
          <h3 className="font-medium mb-2">Test Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click the microphone button to start recording</li>
            <li>Speak clearly in English</li>
            <li>Click the stop button to end recording</li>
            <li>Recording will be transcribed and evaluated automatically</li>
            <li>Audio is stored and can be played back</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
