// ProfileInjector - builds profile context string for LLM prompt injection

import { prisma } from '@/lib/db';

/**
 * Build a Chinese-language profile context string for injection into evaluation prompts.
 * Returns null if no meaningful data exists yet (new user).
 */
export async function buildProfileContext(speakerId: string): Promise<string | null> {
  // Run all independent queries in parallel
  const [speaker, grammarErrors, weakVocab] = await Promise.all([
    prisma.speaker.findUnique({
      where: { id: speakerId },
      select: { languageProfile: true },
    }),
    prisma.grammarError.groupBy({
      by: ['errorPattern'],
      where: { speakerId },
      _count: { errorPattern: true },
      orderBy: { _count: { errorPattern: 'desc' } },
      take: 10,
    }),
    prisma.vocabularyUsage.findMany({
      where: {
        speakerId,
        usedCorrectly: false,
      },
      select: { word: true },
      distinct: ['word'],
      take: 15,
    }),
  ]);

  if (!speaker) return null;

  const profile = speaker.languageProfile as Record<string, unknown> | null;

  // Fetch recent examples for all error patterns in parallel
  const errorExamples = await Promise.all(
    grammarErrors.map(async (err) => {
      const example = await prisma.grammarError.findFirst({
        where: { speakerId, errorPattern: err.errorPattern },
        orderBy: { createdAt: 'desc' },
        select: { originalText: true, correctedText: true },
      });
      return {
        pattern: err.errorPattern,
        count: err._count.errorPattern,
        original: example?.originalText || undefined,
        corrected: example?.correctedText || undefined,
      };
    })
  );

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
