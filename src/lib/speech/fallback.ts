export function shouldFallbackToAzureFromElevenLabs(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return (
    message.includes('ElevenLabs TTS failed: 401') ||
    message.includes('"payment_issue"') ||
    message.includes('failed or incomplete payment')
  );
}
