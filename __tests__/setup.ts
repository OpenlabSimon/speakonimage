import { vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.AZURE_SPEECH_KEY = 'test-azure-key';
process.env.AZURE_SPEECH_REGION = 'westus3';
process.env.AUTH_SECRET = 'test-auth-secret';

// Register global Prisma mock — individual test files import the mock directly
// and call vi.mock('@/lib/db') with the factory.
