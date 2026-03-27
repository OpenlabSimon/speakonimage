import { getLLMProvider } from '@/lib/llm';
import { resolveBackgroundLLMModel } from '@/lib/llm/model-selection';
import {
  buildProfileRecommendationPrompt,
  ProfileRecommendationSchema,
} from '@/lib/llm/prompts/profile-recommendations';
import type {
  InterestSignal,
  GoalSignal,
  VocabularyMemory,
  PracticeRecommendation,
  RecommendationProfile,
} from './memory';

interface BuildEnhancedRecommendationsInput {
  base: RecommendationProfile;
  interests: InterestSignal[];
  goals: GoalSignal[];
  recentVocabulary: VocabularyMemory[];
  weakWords: Array<{ word: string; incorrect: number; correct: number }>;
}

function mapEnhancedItems(
  items: Array<{ title: string; detail: string; reason: string }>,
  kind: PracticeRecommendation['kind'],
  fallbackInterestKeys: string[]
): PracticeRecommendation[] {
  return items.map((item, index) => ({
    id: `${kind}-enhanced-${item.title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\p{L}-]+/gu, '') || index}`,
    kind,
    title: item.title.trim(),
    detail: item.detail.trim(),
    reason: item.reason.trim(),
    relatedInterestKeys: fallbackInterestKeys,
  }));
}

export async function buildEnhancedRecommendations({
  base,
  interests,
  goals,
  recentVocabulary,
  weakWords,
}: BuildEnhancedRecommendationsInput): Promise<RecommendationProfile> {
  const hasCandidates =
    base.topics.length > 0 || base.vocabulary.length > 0 || base.examples.length > 0;

  if (!hasCandidates) {
    return base;
  }

  try {
    const llm = getLLMProvider();
    const result = await llm.generateJSON(
      buildProfileRecommendationPrompt({
        interests: interests.slice(0, 4).map((item) => item.label),
        goals: goals.slice(0, 4).map((item) => item.label),
        weakWords: weakWords.slice(0, 4).map((item) => item.word),
        recentVocabulary: recentVocabulary.slice(0, 4).map((item) => item.word),
        candidateTopics: base.topics.map((item) => `${item.title}｜${item.detail}`),
        candidateVocabulary: base.vocabulary.map((item) => `${item.title}｜${item.detail}`),
        candidateExamples: base.examples.map((item) => `${item.title}｜${item.detail}`),
      }),
      ProfileRecommendationSchema,
      undefined,
      { model: resolveBackgroundLLMModel() }
    );

    const relatedInterestKeys = interests.slice(0, 2).map((item) => item.key);

    return {
      topics: mapEnhancedItems(result.topics, 'topic', relatedInterestKeys),
      vocabulary: mapEnhancedItems(result.vocabulary, 'vocabulary', relatedInterestKeys),
      examples: mapEnhancedItems(result.examples, 'example', relatedInterestKeys),
      nextFocus: base.nextFocus,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Enhanced recommendation generation failed:', error);
    return base;
  }
}
