import { NextResponse } from 'next/server';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';
import type {
  InterestSignal,
  GoalSignal,
  EntitySignal,
  VocabularyMemory,
  MemorySnippet,
  CoachMemoryProfile,
  RecommendationProfile,
  RecommendationFeedbackEntry,
} from '@/lib/profile/memory';
import type { ApiResponse } from '@/types';

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

interface StoredProfile {
  estimatedCefr: string;
  confidence: number;
  lastUpdated: string;
  vocabularyProfile: {
    uniqueWordCount: number;
    cefrDistribution: Record<string, number>;
    weakWords: { word: string; incorrect: number; correct: number }[];
  };
  grammarProfile: {
    topErrors: Array<{
      pattern: string;
      count: number;
      originalText?: string;
      correctedText?: string;
      trend: 'improving' | 'stable' | 'increasing';
    }>;
  };
  usageProfile?: {
    snapshots: Array<{
      key: 'latest_attempt' | 'rolling_30m' | 'daily';
      label: string;
      sampleCount: number;
      strengths: string[];
      weaknesses: string[];
      preferredVocabulary: string[];
      avoidVocabulary: string[];
      preferredExpressions: string[];
      avoidGrammarPatterns: string[];
      updatedAt: string;
    }>;
  };
  interests?: InterestSignal[];
  goals?: GoalSignal[];
  entities?: EntitySignal[];
  recentVocabulary?: VocabularyMemory[];
  memorySnippets?: MemorySnippet[];
  coachMemory?: CoachMemoryProfile;
  recommendations?: RecommendationProfile;
  recommendationFeedback?: RecommendationFeedbackEntry[];
  hiddenInterestKeys?: string[];
}

function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.estimatedCefr === 'string' &&
    typeof record.confidence === 'number' &&
    typeof record.lastUpdated === 'string' &&
    typeof record.vocabularyProfile === 'object' &&
    typeof record.grammarProfile === 'object'
  );
}

function extractDraftHistory(topicContent: unknown) {
  if (!topicContent || typeof topicContent !== 'object' || Array.isArray(topicContent)) {
    return [];
  }

  const raw = (topicContent as { draftHistory?: unknown }).draftHistory;
  return Array.isArray(raw) ? raw : [];
}

function isCoachReviewMetadata(value: unknown): value is { kind: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return typeof (value as { kind?: unknown }).kind === 'string';
}

function extractMessageSpeechScript(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const speechScript = (value as { speechScript?: unknown }).speechScript;
  if (typeof speechScript === 'string' && speechScript.trim().length > 0) {
    return speechScript;
  }

  const ttsText = (value as { ttsText?: unknown }).ttsText;
  return typeof ttsText === 'string' && ttsText.trim().length > 0 ? ttsText : null;
}

function extractMessageAudioUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const audioUrl = (value as { audioUrl?: unknown }).audioUrl;
  return typeof audioUrl === 'string' && audioUrl.trim().length > 0 ? audioUrl : null;
}

function buildEvaluationSummary(evaluation: unknown): string | null {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
    return null;
  }

  const record = evaluation as Record<string, unknown>;
  const type = record.type;
  const cefr = typeof record.overallCefrEstimate === 'string' ? record.overallCefrEstimate : null;

  if (type === 'translation') {
    const semanticComment = (record.semanticAccuracy as { comment?: unknown } | undefined)?.comment;
    const naturalnessComment = (record.naturalness as { comment?: unknown } | undefined)?.comment;
    const parts = [semanticComment, naturalnessComment, cefr ? `当前估计水平 ${cefr}。` : '']
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  if (type === 'expression') {
    const relevanceComment = (record.relevance as { comment?: unknown } | undefined)?.comment;
    const depthComment = (record.depth as { comment?: unknown } | undefined)?.comment;
    const languageComment = (record.languageQuality as { comment?: unknown } | undefined)?.comment;
    const parts = [relevanceComment, depthComment, languageComment, cefr ? `当前估计水平 ${cefr}。` : '']
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  return null;
}

/**
 * GET /api/user/profile — compute profile, return profile + recent submissions + top grammar errors
 */
export async function GET() {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const accountId = authResult.user.id;

    // Get default speaker for this account
    const speaker = await prisma.speaker.findFirst({
      where: { accountId },
      select: { id: true, languageProfile: true },
    });

    if (!speaker) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No speaker found' },
        { status: 404 }
      );
    }

    // Compute profile (writes to DB) and fetch supporting data in parallel
    const storedProfile = isStoredProfile(speaker.languageProfile) ? speaker.languageProfile : null;
    const isProfileFresh =
      storedProfile?.lastUpdated &&
      Date.now() - new Date(storedProfile.lastUpdated).getTime() < PROFILE_CACHE_TTL_MS;

    const [profile, recentSubmissions, topicCount, submissionCount, activeDays, recentTopics, recentCoachMessages] = await Promise.all([
      isProfileFresh ? Promise.resolve(storedProfile) : computeAndUpdateProfile(speaker.id),
      prisma.submission.findMany({
        where: { speakerId: speaker.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          transcribedText: true,
          rawAudioUrl: true,
          evaluation: true,
          difficultyAssessment: true,
          createdAt: true,
          topic: {
            select: { id: true, type: true, originalInput: true },
          },
        },
      }),
      prisma.topic.count({ where: { accountId } }),
      prisma.submission.count({ where: { speakerId: speaker.id } }),
      prisma.submission.groupBy({
        by: ['createdAt'],
        where: { speakerId: speaker.id },
        _count: true,
      }),
      prisma.topic.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          originalInput: true,
          topicContent: true,
          createdAt: true,
          _count: {
            select: { submissions: true },
          },
        },
      }),
      prisma.chatMessage.findMany({
        where: {
          role: 'assistant',
          contentType: 'evaluation',
          session: {
            accountId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          content: true,
          createdAt: true,
          metadata: true,
          session: {
            select: {
              topic: {
                select: {
                  id: true,
                  type: true,
                  originalInput: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Count unique active days
    const uniqueDays = new Set(
      activeDays.map((d) =>
        d.createdAt.toISOString().slice(0, 10)
      )
    ).size;

    // Calculate streak (consecutive days ending today/yesterday)
    const daySet = new Set(
      activeDays.map((d) => d.createdAt.toISOString().slice(0, 10))
    );
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (daySet.has(key)) {
        streak++;
      } else if (i === 0) {
        // today might not have activity yet, check yesterday
        continue;
      } else {
        break;
      }
    }

    const coachReviewMessages = recentCoachMessages.filter((message) =>
      isCoachReviewMetadata(message.metadata) && message.metadata.kind === 'coach_review'
    );

    const recentCoachFeedback = [
      ...coachReviewMessages.map((message) => ({
        id: message.id,
        content: message.content,
        speechScript: extractMessageSpeechScript(message.metadata) ?? message.content,
        audioUrl: extractMessageAudioUrl(message.metadata),
        createdAt: message.createdAt,
        topic: message.session.topic,
        source: 'coach_review' as const,
      })),
      ...recentSubmissions
        .map((submission) => ({
          id: `submission-${submission.id}`,
          content: buildEvaluationSummary(submission.evaluation),
          speechScript: null,
          audioUrl: null,
          createdAt: submission.createdAt,
          topic: submission.topic,
          source: 'evaluation_summary' as const,
        }))
        .filter((item) => item.content !== null)
        .map((item) => ({
          ...item,
          content: item.content ?? '',
          speechScript: item.speechScript ?? item.content ?? '',
          audioUrl: item.audioUrl ?? null,
        })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return NextResponse.json<ApiResponse<{
      profile: typeof profile;
      stats: {
        topicCount: number;
        submissionCount: number;
        streak: number;
        vocabSize: number;
        activeDays: number;
      };
      recentSubmissions: typeof recentSubmissions;
      recentTopics: Array<{
        id: string;
        type: string;
        originalInput: string;
        createdAt: Date;
        submissionCount: number;
        latestDraft: string | null;
        draftCount: number;
      }>;
      recentCoachFeedback: Array<{
        id: string;
        content: string;
        speechScript: string;
        audioUrl: string | null;
        createdAt: Date;
        source: 'coach_review' | 'evaluation_summary';
        topic: {
          id?: string;
          type: string;
          originalInput: string;
        } | null;
      }>;
    }>>({
      success: true,
      data: {
        profile,
        stats: {
          topicCount,
          submissionCount,
          streak,
          vocabSize: profile.vocabularyProfile.uniqueWordCount,
          activeDays: uniqueDays,
        },
        recentSubmissions,
        recentTopics: recentTopics.map((topic) => {
          const draftHistory = extractDraftHistory(topic.topicContent) as Array<{ text?: string }>;
          const latestDraft = draftHistory[draftHistory.length - 1];
          return {
            id: topic.id,
            type: topic.type,
            originalInput: topic.originalInput,
            createdAt: topic.createdAt,
            submissionCount: topic._count.submissions,
            latestDraft:
              typeof latestDraft?.text === 'string' && latestDraft.text.trim().length > 0
                ? latestDraft.text
                : topic.originalInput,
            draftCount: draftHistory.length,
          };
        }),
        recentCoachFeedback,
      },
    });
  } catch (error) {
    console.error('Profile API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to load profile: ${message}` },
      { status: 500 }
    );
  }
}
