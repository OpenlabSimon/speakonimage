'use client';

import { useState } from 'react';
import { VoiceRecorder } from '@/components/input/VoiceRecorder';

export default function TestVoicePage() {
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTranscription = (text: string, audioBlob: Blob) => {
    setTranscribedText(text);
    console.log('Received transcription:', text);
    console.log('Audio blob size:', audioBlob.size);
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
            onTranscription={handleTranscription}
            onError={handleError}
          />
        </div>

        {transcribedText && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-green-800 mb-2">Submitted Transcription:</h2>
            <p className="text-green-900">{transcribedText}</p>
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
            <li>Wait for transcription to complete</li>
            <li>Review the transcription result</li>
            <li>Click Submit to confirm, or Re-record to try again</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
