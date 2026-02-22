import { vi } from 'vitest';

export const mockLLMProvider = {
  generateJSON: vi.fn(),
  generateText: vi.fn(),
  name: 'MockLLM',
};

export function mockGetLLMProvider() {
  return mockLLMProvider;
}

export function resetLLMMock() {
  mockLLMProvider.generateJSON.mockReset();
  mockLLMProvider.generateText.mockReset();
}
