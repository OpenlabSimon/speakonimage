// ProfileInjector - builds profile context string for LLM prompt injection

import { prisma } from '@/lib/db';

/**
 * Build a Chinese-language profile context string for injection into evaluation prompts.
 * Returns null if no meaningful data exists yet (new user).
 */
export async function buildProfileContext(speakerId: string): Promise<string | null> {
  const speaker = await prisma.speaker.findUnique({
    where: { id: speakerId },
    select: { languageProfile: true },
  });

  if (!speaker) return null;

  const profile = speaker.languageProfile as Record<string, unknown> | null;

  // Query top 10 most frequent grammar error patterns for this speaker
  const grammarErrors = await prisma.grammarError.groupBy({
    by: ['errorPattern'],
    where: { speakerId },
    _count: { errorPattern: true },
    orderBy: { _count: { errorPattern: 'desc' } },
    take: 10,
  });

  // For each error pattern, get a recent example
  const errorExamples: Array<{
    pattern: string;
    count: number;
    original?: string;
    corrected?: string;
  }> = [];

  for (const err of grammarErrors) {
    const example = await prisma.grammarError.findFirst({
      where: { speakerId, errorPattern: err.errorPattern },
      orderBy: { createdAt: 'desc' },
      select: { originalText: true, correctedText: true },
    });
    errorExamples.push({
      pattern: err.errorPattern,
      count: err._count.errorPattern,
      original: example?.originalText || undefined,
      corrected: example?.correctedText || undefined,
    });
  }

  // Query weak vocabulary (used incorrectly or low usage)
  const weakVocab = await prisma.vocabularyUsage.findMany({
    where: {
      speakerId,
      usedCorrectly: false,
    },
    select: { word: true },
    distinct: ['word'],
    take: 15,
  });

  // If no data at all, return null
  if (errorExamples.length === 0 && weakVocab.length === 0 && !profile) {
    return null;
  }

  // Build the context string
  const sections: string[] = [];

  // Current level from profile
  const estimatedCefr = profile?.estimatedCefr as string | undefined;
  const interests = (profile?.interests as string[]) || [];

  if (estimatedCefr || interests.length > 0) {
    const levelLine = estimatedCefr ? `- 英语水平：${estimatedCefr}` : '';
    const interestLine = interests.length > 0
      ? `- 感兴趣的话题：${interests.join('、')}`
      : '';
    sections.push(
      [levelLine, interestLine].filter(Boolean).join('\n')
    );
  }

  // Grammar errors section
  if (errorExamples.length > 0) {
    const errorLines = errorExamples.map(e => {
      if (e.original && e.corrected) {
        return `- ${e.pattern}："${e.original}" → "${e.corrected}"（${e.count}次）`;
      }
      return `- ${e.pattern}（${e.count}次）`;
    });
    sections.push(`常犯错误：\n${errorLines.join('\n')}`);
  }

  // Weak vocabulary section
  if (weakVocab.length > 0) {
    const words = weakVocab.map(v => v.word).join(', ');
    sections.push(`薄弱词汇：${words}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return `## 学生档案\n${sections.join('\n\n')}`;
}
