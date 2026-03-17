import { z } from 'zod';

export const DraftHistoryEntrySchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(['assessment', 'attempt']),
  createdAt: z.string().min(1),
  label: z.string().min(1),
});

export const DraftHistorySchema = z.array(DraftHistoryEntrySchema).max(100);

export type DraftHistoryEntry = z.infer<typeof DraftHistoryEntrySchema>;
