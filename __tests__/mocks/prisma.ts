import { vi } from 'vitest';

function createModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn(),
  };
}

export const prismaMock = {
  account: createModelMock(),
  speaker: createModelMock(),
  topic: createModelMock(),
  submission: createModelMock(),
  grammarError: createModelMock(),
  vocabularyUsage: createModelMock(),
  chatSession: createModelMock(),
  chatMessage: createModelMock(),
  reviewItem: createModelMock(),
  oAuthAccount: createModelMock(),
  verificationToken: createModelMock(),
  $queryRawUnsafe: vi.fn(),
};

export function resetPrismaMock() {
  for (const model of Object.values(prismaMock)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
    if (typeof model === 'function' && 'mockReset' in model) {
      (model as ReturnType<typeof vi.fn>).mockReset();
    }
  }
}
