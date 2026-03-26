'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useLevelHistory } from '@/hooks/useLevelHistory';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { CoachPreferencesPanel } from '@/components/evaluation/CoachPreferencesPanel';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { GrammarErrorList } from '@/components/profile/GrammarErrorList';
import { VocabSummary } from '@/components/profile/VocabSummary';
import { RecentActivity } from '@/components/profile/RecentActivity';
import { RecentTopicHistory } from '@/components/profile/RecentTopicHistory';
import { RecentCoachFeedback } from '@/components/profile/RecentCoachFeedback';
import { LearnerMemory } from '@/components/profile/LearnerMemory';
import { RecommendedPractice } from '@/components/profile/RecommendedPractice';
import { ProfileWindows } from '@/components/profile/ProfileWindows';
import { LocalPracticeMigrationCard } from '@/components/migration/LocalPracticeMigrationCard';
import { loadCoachRoundHistory, type StoredCoachRound } from '@/lib/coach-round-storage';
import { CURRENT_TOPIC_STORAGE_KEY, loadCurrentTopicSummary } from '@/lib/practice/storage';
import type { CEFRLevel } from '@/types';

type ProfileSection = 'history' | 'settings';

interface SessionTopicSummary {
  id: string;
  type: string;
  originalInput: string;
}

interface SessionExtractionSummary {
  sessionSummary?: string;
  topicsDiscussed?: string[];
}

interface ConversationHistorySession {
  id: string;
  topicId?: string;
  topicSummary?: SessionTopicSummary;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  messageCount: number;
  extractedData?: SessionExtractionSummary | null;
}

function countUniqueDays(values: string[]) {
  return new Set(values.map((value) => new Date(value).toISOString().slice(0, 10))).size;
}

function formatSessionDate(value?: string) {
  if (!value) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getSessionTitle(session: ConversationHistorySession) {
  if (session.topicSummary?.originalInput?.trim()) {
    return session.topicSummary.originalInput.trim();
  }

  const topicFromExtraction = session.extractedData?.topicsDiscussed?.[0]?.trim();
  if (topicFromExtraction) {
    return topicFromExtraction;
  }

  return 'Untitled conversation';
}

function getSessionSummary(session: ConversationHistorySession) {
  const summary = session.extractedData?.sessionSummary?.trim();
  if (summary) {
    return summary;
  }

  return `共 ${session.messageCount} 条消息`;
}

function formatTopicTypeLabel(type?: string) {
  if (type === 'translation') {
    return 'Translation';
  }
  if (type === 'expression') {
    return 'Expression';
  }
  return 'Conversation';
}

function truncateText(value: string, maxLength = 140) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isGuestSession = session?.user?.isGuest === true;
  const remoteProfileEnabled = status === 'authenticated' && !isGuestSession;
  const profileCacheScope = remoteProfileEnabled ? session?.user?.id || 'remote-user' : 'local';
  const { data: profileData, error, refetch } = useProfile(remoteProfileEnabled, profileCacheScope);
  const { history: levelHistory, isLoaded: isLevelLoaded } = useLevelHistory();
  const {
    characterId,
    setCharacterId,
    reviewMode,
    setReviewMode,
    autoPlayAudio,
    setAutoPlayAudio,
    voiceId,
    setVoiceId,
    isRemoteBacked,
  } = useCoachPreferences();
  const [saveMemoryError, setSaveMemoryError] = useState<string | null>(null);
  const [isSavingInterests, setIsSavingInterests] = useState(false);
  const [pendingRecommendationId, setPendingRecommendationId] = useState<string | null>(null);
  const [localRounds, setLocalRounds] = useState<StoredCoachRound[]>([]);
  const [currentTopic, setCurrentTopic] = useState<ReturnType<typeof loadCurrentTopicSummary>>(null);
  const [activeSection, setActiveSection] = useState<ProfileSection>('history');
  const [conversationHistory, setConversationHistory] = useState<ConversationHistorySession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    setLocalRounds(loadCoachRoundHistory());
    setCurrentTopic(loadCurrentTopicSummary());
  }, []);

  useEffect(() => {
    if (!remoteProfileEnabled) {
      setConversationHistory([]);
      setHistoryError(null);
      setIsLoadingHistory(false);
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setHistoryError(null);
      try {
        const response = await fetch('/api/sessions?limit=30', { cache: 'no-store' });
        const result = await response.json();

        if (!response.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error(result.error || '加载会话历史失败');
        }

        if (!cancelled) {
          setConversationHistory(
            (result.data as ConversationHistorySession[]).filter((session) => session.messageCount > 0)
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setHistoryError(loadError instanceof Error ? loadError.message : '加载会话历史失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [remoteProfileEnabled]);

  async function handleSaveInterests(labels: string[]) {
    setSaveMemoryError(null);
    setIsSavingInterests(true);
    try {
      const response = await fetch('/api/user/profile/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: labels }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '保存兴趣标签失败');
      }
      await refetch();
    } catch (saveError) {
      setSaveMemoryError(saveError instanceof Error ? saveError.message : '保存兴趣标签失败');
    } finally {
      setIsSavingInterests(false);
    }
  }

  async function handleRecommendationFeedback(input: {
    recommendationId: string;
    recommendationKind: 'topic' | 'vocabulary' | 'example';
    recommendationTitle: string;
    sentiment: 'helpful' | 'too_easy' | 'too_hard' | 'good_direction_not_now' | 'off_topic';
    relatedInterestKeys: string[];
  }) {
    setSaveMemoryError(null);
    setPendingRecommendationId(input.recommendationId);
    try {
      const response = await fetch('/api/user/profile/recommendations/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '保存推荐反馈失败');
      }
      await refetch();
    } catch (feedbackError) {
      setSaveMemoryError(feedbackError instanceof Error ? feedbackError.message : '保存推荐反馈失败');
    } finally {
      setPendingRecommendationId(null);
    }
  }

  if ((status === 'loading' || (status === 'unauthenticated' && !isLevelLoaded)) && !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  const usingLocalProfile = !remoteProfileEnabled || !profileData;
  const email = isGuestSession ? '本机用户' : (session?.user?.email || '本机用户');
  const initial = isGuestSession ? '本' : email.charAt(0).toUpperCase();
  const localStats = {
    topicCount: localRounds.length,
    submissionCount: localRounds.length,
    streak: countUniqueDays(localRounds.map((item) => item.createdAt)),
    vocabSize: 0,
    activeDays: countUniqueDays(localRounds.map((item) => item.createdAt)),
  };
  const localRecentFeedback = localRounds.map((round) => ({
    id: round.id,
    content: round.reviewText,
    speechScript: round.speechScript,
    audioUrl: round.audioReview.audioUrl ?? null,
    createdAt: round.createdAt,
    source: 'coach_review' as const,
    topic: round.topic ?? null,
  }));
  const localRecentActivity = localRounds.map((round) => ({
    id: round.id,
    transcribedText: round.userResponse,
    rawAudioUrl: round.audioUrl ?? null,
    evaluation: {},
    difficultyAssessment: null,
    createdAt: round.createdAt,
    topic: round.topic
      ? {
          type: round.topic.type,
          originalInput: round.topic.originalInput,
        }
      : round.practiceMode
        ? {
            type: round.practiceMode.includes('translation') ? 'translation' : 'expression',
            originalInput: round.reviewText.slice(0, 60),
          }
        : null,
  }));
  const localConversationHistory = localRounds.map((round) => ({
    id: round.id,
    title: round.topic?.originalInput || 'Local practice round',
    summary: truncateText(round.reviewText.replace(/\s+/g, ' ').trim() || '这轮练习已经生成老师点评。', 120),
    createdAt: round.createdAt,
    messageCount: 2,
    score: round.overallScore,
    topicType: round.topic?.type,
  }));

  const handleReturnToPractice = () => {
    if (remoteProfileEnabled && currentTopic?.id) {
      router.push(`/topic/practice?topicId=${currentTopic.id}`);
      return;
    }

    const fallbackTopic = currentTopic
      ?? localRounds.find((round) => round.topic)?.topic
      ?? profileData?.recentTopics?.[0]
      ?? null;

    if (!fallbackTopic) {
      router.push('/');
      return;
    }

    if (remoteProfileEnabled && 'id' in fallbackTopic && fallbackTopic.id) {
      router.push(`/topic/practice?topicId=${fallbackTopic.id}`);
      return;
    }

    let targetCefr: CEFRLevel = levelHistory?.currentLevel || 'B1';
    try {
      const rawHistory = window.localStorage.getItem('speakonimage_level_history');
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory) as { currentLevel?: CEFRLevel };
        if (parsed.currentLevel) {
          targetCefr = parsed.currentLevel;
        }
      }
    } catch {
      // Keep current fallback level.
    }

    window.localStorage.setItem(
      CURRENT_TOPIC_STORAGE_KEY,
      JSON.stringify({
        type: fallbackTopic.type,
        chinesePrompt: 'originalInput' in fallbackTopic ? fallbackTopic.originalInput : fallbackTopic.chinesePrompt,
        suggestedVocab: [],
        grammarHints: [],
        guidingQuestions: [],
        keyPoints: [],
        difficultyMetadata: {
          targetCefr,
          vocabComplexity: 0,
          grammarComplexity: 0,
        },
      })
    );
    router.push(`/topic/practice?resume=${Date.now()}`);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)]">
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            SpeakOnImage
          </Link>
          <button
            onClick={handleReturnToPractice}
            className="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            type="button"
          >
            返回练习
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-600 text-2xl font-bold text-white">
                {initial}
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  History & Settings
                </div>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">{email}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    当前等级 {profileData?.profile.estimatedCefr || levelHistory?.currentLevel || 'B1'}
                  </span>
                  {profileData?.profile.confidence ? (
                    <span className="text-xs text-slate-500">
                      置信度 {Math.round(profileData.profile.confidence * 100)}%
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    {usingLocalProfile ? '本机模式' : '已登录'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveSection('history')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeSection === 'history'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                History
              </button>
              <button
                onClick={() => setActiveSection('settings')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeSection === 'settings'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Settings
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {saveMemoryError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {saveMemoryError}
          </div>
        )}

        {usingLocalProfile && (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
            当前是本地测试模式。这里优先展示最近会话和当前设置，不强制依赖登录。
          </div>
        )}

        {activeSection === 'history' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Conversation history
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">
                    {usingLocalProfile ? '最近本机练习记录' : '最近对话会话'}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {usingLocalProfile
                      ? '本机模式下先展示最近保存的练习轮次。登录后这里会变成真正的会话历史，可回看完整消息流和最终点评。'
                      : '这里按聊天产品的方式列出最近会话。点开任意一条，就能回看完整消息流和这轮最终点评。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">
                    {usingLocalProfile ? localConversationHistory.length : conversationHistory.length}
                  </div>
                  <div className="mt-1">
                    {usingLocalProfile ? '本地轮次' : '最近会话'}
                  </div>
                </div>
              </div>

              {usingLocalProfile ? (
                localConversationHistory.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {localConversationHistory.map((round) => (
                      <div
                        key={round.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                Local
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                {formatTopicTypeLabel(round.topicType)}
                              </span>
                            </div>
                            <div className="mt-3 text-base font-semibold text-slate-900">
                              {truncateText(round.title, 80)}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">
                              {round.summary}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm text-slate-500 sm:text-right">
                            <div>{formatSessionDate(round.createdAt)}</div>
                            <div className="mt-1">Score {Math.round(round.score)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                    还没有本地练习记录。先去开始一轮对话，结束后这里会出现最近的练习历史。
                  </div>
                )
              ) : isLoadingHistory ? (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  正在加载最近会话...
                </div>
              ) : historyError ? (
                <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
                  {historyError}
                </div>
              ) : conversationHistory.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {conversationHistory.map((session) => (
                    <Link
                      key={session.id}
                      href={`/profile/sessions/${session.id}`}
                      className="group block rounded-3xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                session.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-200/80 text-slate-600'
                              }`}
                            >
                              {session.status === 'active' ? '进行中' : '已结束'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              {formatTopicTypeLabel(session.topicSummary?.type)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              {session.messageCount} 条消息
                            </span>
                          </div>
                          <div className="mt-3 text-base font-semibold text-slate-900 group-hover:text-sky-700">
                            {truncateText(getSessionTitle(session), 90)}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-600">
                            {truncateText(getSessionSummary(session), 160)}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm text-slate-500 sm:text-right">
                          <div>{formatSessionDate(session.endedAt || session.startedAt)}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {session.status === 'active' ? '打开继续查看' : '查看完整回放'}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  还没有保存下来的会话。先开启一轮对话并生成最终点评，历史页就会开始积累内容。
                </div>
              )}
            </div>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                More insights
              </summary>
              <div className="mt-4 space-y-4">
                <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">最近老师点评</h2>
                      <div className="mt-1 text-xs text-amber-700">
                        先看最近一条反馈，再决定继续练哪一轮。
                      </div>
                    </div>
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-amber-700">
                      优先查看
                    </span>
                  </div>
                  <RecentCoachFeedback feedback={usingLocalProfile ? localRecentFeedback : profileData?.recentCoachFeedback || []} />
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="text-base font-semibold text-slate-900">会话概况</h2>
                  <div className="mt-3">
                    <StatsOverview stats={usingLocalProfile ? localStats : profileData?.stats || localStats} />
                  </div>
                  {usingLocalProfile && (
                    <div className="mt-3 text-sm text-slate-500">
                      当前本机等级：{levelHistory?.currentLevel || 'B1'}
                    </div>
                  )}
                </div>

                {!usingLocalProfile && profileData && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h2 className="text-base font-semibold text-slate-900">最近话题与草稿</h2>
                    <div className="mt-4">
                      <RecentTopicHistory topics={profileData.recentTopics} />
                    </div>
                  </div>
                )}

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="text-base font-semibold text-slate-900">
                    {usingLocalProfile ? '最近本地练习' : '最近提交记录'}
                  </h2>
                  <div className="mt-4">
                    <RecentActivity submissions={usingLocalProfile ? localRecentActivity : profileData?.recentSubmissions || []} />
                  </div>
                </div>

                {!usingLocalProfile && profileData && (
                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">语法错误分析</h3>
                      <GrammarErrorList errors={profileData.profile.grammarProfile.topErrors} />
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">词汇概况</h3>
                      <VocabSummary vocab={profileData.profile.vocabularyProfile} />
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">多时间尺度画像</h3>
                      <ProfileWindows snapshots={profileData.profile.usageProfile?.snapshots || []} />
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">用户记忆</h3>
                      <LearnerMemory
                        key={profileData.profile.interests.map((item) => item.key).join('|') || 'empty-interests'}
                        interests={profileData.profile.interests}
                        goals={profileData.profile.goals}
                        entities={profileData.profile.entities}
                        memorySnippets={profileData.profile.memorySnippets}
                        coachMemory={profileData.profile.coachMemory}
                        onSaveInterests={handleSaveInterests}
                        isSavingInterests={isSavingInterests}
                      />
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">下一步推荐</h3>
                      <RecommendedPractice
                        recommendations={profileData.profile.recommendations}
                        feedback={profileData.profile.recommendationFeedback}
                        onFeedback={handleRecommendationFeedback}
                        pendingRecommendationId={pendingRecommendationId}
                      />
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <h2 className="text-base font-semibold text-slate-900">Coach settings</h2>
              <div className="mt-4">
                <CoachPreferencesPanel
                  characterId={characterId}
                  onCharacterChange={setCharacterId}
                  reviewMode={reviewMode}
                  onReviewModeChange={setReviewMode}
                  autoPlayAudio={autoPlayAudio}
                  onAutoPlayAudioChange={setAutoPlayAudio}
                  voiceId={voiceId}
                  onVoiceIdChange={setVoiceId}
                  isRemoteBacked={isRemoteBacked}
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <h2 className="text-base font-semibold text-slate-900">Practice defaults</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-900">当前等级</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {profileData?.profile.estimatedCefr || levelHistory?.currentLevel || 'B1'}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    这是当前聊天和话题生成默认参考等级。
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-900">当前模式</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    Chat-first
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    首页默认走实时对话，经典模式保留为次级入口。
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleReturnToPractice}
                  className="min-h-11 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  返回当前练习
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/?view=classic')}
                  className="min-h-11 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  打开经典模式
                </button>
              </div>
            </div>

            {usingLocalProfile && <LocalPracticeMigrationCard />}
          </div>
        )}
      </div>
    </div>
  );
}
