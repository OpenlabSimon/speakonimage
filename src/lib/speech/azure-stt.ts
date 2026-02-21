/**
 * Azure Speech-to-Text integration
 * Using Azure Speech SDK for better audio format support
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
  status: 'success' | 'no_match' | 'error';
  error?: string;
}

export interface AzureSTTConfig {
  speechKey: string;
  speechRegion: string;
  language?: string;
}

/**
 * Transcribe audio using Azure Speech SDK
 * Handles various audio formats including webm/opus
 */
export async function transcribeAudio(
  audioBlob: Blob,
  config: AzureSTTConfig
): Promise<TranscriptionResult> {
  const { speechKey, speechRegion, language = 'en-US' } = config;

  if (!speechKey || !speechRegion) {
    return {
      text: '',
      status: 'error',
      error: 'Azure Speech credentials not configured',
    };
  }

  try {
    const audioData = await audioBlob.arrayBuffer();
    console.log('Audio blob size:', audioBlob.size, 'type:', audioBlob.type);

    // Create speech config
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = language;

    // Create audio config from the buffer
    // Use pushStream to handle various formats
    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioData);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    // Create recognizer
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve) => {
      let hasResult = false;

      recognizer.recognized = (_, event) => {
        if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
          hasResult = true;
          resolve({
            text: event.result.text,
            confidence: event.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
              ? JSON.parse(event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult))?.NBest?.[0]?.Confidence
              : undefined,
            duration: event.result.duration / 10000000, // Convert from 100ns units to seconds
            status: 'success',
          });
          recognizer.close();
        } else if (event.result.reason === sdk.ResultReason.NoMatch) {
          if (!hasResult) {
            resolve({
              text: '',
              status: 'no_match',
              error: 'No speech detected',
            });
            recognizer.close();
          }
        }
      };

      recognizer.canceled = (_, event) => {
        console.error('Speech recognition canceled:', event.reason, event.errorDetails);
        if (!hasResult) {
          resolve({
            text: '',
            status: 'error',
            error: event.errorDetails || 'Recognition canceled',
          });
        }
        recognizer.close();
      };

      recognizer.sessionStopped = () => {
        if (!hasResult) {
          resolve({
            text: '',
            status: 'no_match',
            error: 'No speech detected',
          });
        }
        recognizer.close();
      };

      // Start recognition
      recognizer.recognizeOnceAsync(
        (result) => {
          if (!hasResult) {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve({
                text: result.text,
                duration: result.duration / 10000000,
                status: 'success',
              });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              resolve({
                text: '',
                status: 'no_match',
                error: 'No speech detected',
              });
            } else {
              resolve({
                text: '',
                status: 'error',
                error: 'Recognition failed: ' + sdk.ResultReason[result.reason],
              });
            }
          }
          recognizer.close();
        },
        (error) => {
          console.error('Recognition error:', error);
          resolve({
            text: '',
            status: 'error',
            error: error.toString(),
          });
          recognizer.close();
        }
      );

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!hasResult) {
          resolve({
            text: '',
            status: 'error',
            error: 'Recognition timeout',
          });
          recognizer.close();
        }
      }, 30000);
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      text: '',
      status: 'error',
      error: error instanceof Error ? error.message : 'Transcription failed',
    };
  }
}

/**
 * Get Azure STT config from environment variables
 */
export function getAzureSTTConfig(): AzureSTTConfig {
  return {
    speechKey: process.env.AZURE_SPEECH_KEY || '',
    speechRegion: process.env.AZURE_SPEECH_REGION || '',
    language: 'en-US',
  };
}
