import { describe, expect, it } from 'vitest';
import translationEval from '../../../mocks/fixtures/evaluation-translation.json';
import expressionEval from '../../../mocks/fixtures/evaluation-expression.json';
import { buildReviewTextOutput } from '@/domains/teachers/review-text';

describe('buildReviewTextOutput', () => {
  it('separates readable review text from speech-first script', () => {
    const result = buildReviewTextOutput({
      teacher: { soulId: 'energetic' },
      evaluation: translationEval,
      overallScore: 88,
      skillDomain: 'translation',
      inputMethod: 'voice',
      userResponse: 'I ran into an old friend yesterday.',
      languageProfile: {
        estimatedCefr: 'B1',
        confidence: 0.8,
        lastUpdated: new Date().toISOString(),
        vocabularyProfile: {
          activeVocabSizeEstimate: 120,
          favoriteWords: [],
          vocabLevelDistribution: {
            A1: 0,
            A2: 0,
            B1: 10,
            B2: 0,
            C1: 0,
            C2: 0,
          },
          recentlyLearned: [],
        },
        grammarProfile: {
          mastered: [],
          developing: [],
          persistentErrors: [],
        },
        expressionProfile: {
          avgSentenceLength: 12,
          sentenceComplexityTrend: 'stable',
          preferredStructures: [],
          creativityScoreAvg: 0.5,
        },
        coachMemory: {
          longTermReminders: [
            {
              id: 'long-1',
              scope: 'long_term',
              text: '持续注意冠词 a/an 的使用。',
              source: 'goal',
              createdAt: new Date().toISOString(),
              relatedPatterns: ['articles'],
            },
          ],
          currentRoundReminders: [
            {
              id: 'round-1',
              scope: 'current_round',
              text: '这轮最关键的是把过去时说稳。',
              source: 'coach_review',
              createdAt: new Date().toISOString(),
              relatedPatterns: ['past-tense'],
            },
          ],
        },
        recommendations: {
          topics: [
            {
              id: 'topic-1',
              kind: 'topic',
              title: 'Describe a time you discovered a new AI tool by accident',
              detail: '继续围绕 AI tools 这个兴趣点练过去时和细节展开。',
              reason: '兴趣相关且能练过去时',
              relatedInterestKeys: ['ai-tools'],
            },
          ],
          vocabulary: [],
          examples: [],
          nextFocus: ['past tense'],
          generatedAt: new Date().toISOString(),
        },
      },
      sameTopicProgress: {
        attemptCount: 2,
        deltaFromLast: 6,
        isBestSoFar: true,
        trend: 'up',
      },
      difficultySignal: {
        targetCefr: 'B2',
        baselineCefr: 'B1',
        relation: 'stretch',
      },
    });

    expect(result.reviewText).not.toContain('得分');
    expect(result.reviewText).toContain('先复盘长期提醒');
    expect(result.reviewText).toContain('回到这一轮');
    expect(result.speechScript).not.toContain('这次得分是');
    expect(result.speechScript).toContain('同一个话题里，这次比上一版更稳');
    expect(result.speechScript).toContain('持续注意冠词 a/an 的使用');
    expect(result.speechScript).toContain('先说最提气的一点');
    expect(result.speechScript).toContain('继续推，这一题你真的快拿下了');
    expect(result.reviewText).toContain('下一题建议直接练：Describe a time you discovered a new AI tool by accident');
    expect(result.speechScript).toContain('你下一题就直接练这个，Describe a time you discovered a new AI tool by accident');
    expect(result.speechScript).toBe(result.ttsText);
  });

  it('changes speech-script phrasing based on teacher soul', () => {
    const baseInput = {
      evaluation: translationEval,
      overallScore: 72,
      skillDomain: 'translation' as const,
      inputMethod: 'text' as const,
      userResponse: 'I meet an old friend yesterday.',
    };

    const gentle = buildReviewTextOutput({
      teacher: { soulId: 'gentle' },
      ...baseInput,
    });
    const strict = buildReviewTextOutput({
      teacher: { soulId: 'strict' },
      ...baseInput,
    });

    expect(gentle.speechScript).toContain('我先抱抱你这次做对的部分');
    expect(gentle.speechScript).toContain('不用急，你已经在往前走了');
    expect(strict.speechScript).toContain('先确认有效部分');
    expect(strict.speechScript).toContain('下一轮按这个要求直接重做');
    expect(gentle.speechScript).not.toBe(strict.speechScript);
  });

  it('adjusts speech-script framing for voice vs text input', () => {
    const voice = buildReviewTextOutput({
      teacher: { soulId: 'default' },
      evaluation: translationEval,
      overallScore: 76,
      skillDomain: 'translation',
      inputMethod: 'voice',
      userResponse: 'I met an old friend yesterday.',
    });
    const text = buildReviewTextOutput({
      teacher: { soulId: 'default' },
      evaluation: translationEval,
      overallScore: 76,
      skillDomain: 'translation',
      inputMethod: 'text',
      userResponse: 'I met an old friend yesterday.',
    });

    expect(voice.speechScript).toContain('真实开口说出来的状态');
    expect(voice.speechScript).toContain('开口更顺、更完整');
    expect(text.speechScript).toContain('写出来的版本');
    expect(text.speechScript).toContain('句子更完整、更自然');
    expect(voice.speechScript).not.toBe(text.speechScript);
  });

  it('uses correction-first framing for translation topics', () => {
    const result = buildReviewTextOutput({
      teacher: { soulId: 'default' },
      evaluation: translationEval,
      overallScore: 76,
      skillDomain: 'translation',
      inputMethod: 'voice',
      userResponse: 'I met an old friend yesterday.',
    });

    expect(result.speechScript).toContain('这是一道翻译题');
    expect(result.speechScript).toContain('准确度、纠错点和更自然的替换说法');
    expect(result.speechScript).toContain('关键词、时态和固定表达改准');
  });

  it('uses expansion framing for expression topics', () => {
    const result = buildReviewTextOutput({
      teacher: { soulId: 'default' },
      evaluation: expressionEval,
      overallScore: 76,
      skillDomain: 'spoken_expression',
      inputMethod: 'voice',
      userResponse: 'I usually work with AI tools and test new ideas with friends.',
    });

    expect(result.speechScript).toContain('这是一道表达题');
    expect(result.speechScript).toContain('把想法说展开');
    expect(result.speechScript).toContain('至少多给一个细节');
  });

  it('injects profile strengths and guardrails into speech-script', () => {
    const result = buildReviewTextOutput({
      teacher: { soulId: 'gentle' },
      evaluation: expressionEval,
      overallScore: 82,
      skillDomain: 'spoken_expression',
      inputMethod: 'voice',
      userResponse: 'I often explore new AI tools and share them with my friends.',
      languageProfile: {
        estimatedCefr: 'B1',
        confidence: 0.8,
        lastUpdated: new Date().toISOString(),
        vocabularyProfile: {
          activeVocabSizeEstimate: 120,
          favoriteWords: [],
          vocabLevelDistribution: {
            A1: 0,
            A2: 0,
            B1: 10,
            B2: 0,
            C1: 0,
            C2: 0,
          },
          recentlyLearned: [],
        },
        grammarProfile: {
          mastered: [],
          developing: [],
          persistentErrors: [],
        },
        expressionProfile: {
          avgSentenceLength: 12,
          sentenceComplexityTrend: 'stable',
          preferredStructures: [],
          creativityScoreAvg: 0.5,
        },
        usageProfile: {
          snapshots: [
            {
              key: 'latest_attempt',
              label: '本次',
              sampleCount: 1,
              strengths: ['愿意主动使用 explore, share'],
              weaknesses: ['需要继续压下 articles、tense'],
              preferredVocabulary: ['explore', 'share'],
              avoidVocabulary: [],
              preferredExpressions: ['talk about', 'work on'],
              avoidGrammarPatterns: ['articles', 'tense'],
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      },
    });

    expect(result.speechScript).toContain('愿意主动使用 explore, share');
    expect(result.speechScript).toContain('这是你可以继续放大的优势');
    expect(result.speechScript).toContain('需要继续压下 articles、tense');
  });
});
