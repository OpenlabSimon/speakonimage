'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { teacherSelectionFromCharacter } from '@/domains/teachers/character-bridge';
import { getApiErrorMessage, parseJsonResponse } from '@/lib/http/parse-json-response';

interface SessionTopicSummary {
  id: string;
  type: string;
  originalInput: string;
}

interface SessionExtractionSummary {
  sessionSummary: string;
  topicsDiscussed: string[];
  suggestedFocusNext: string[];
}

interface SessionDetailData {
  id: string;
  topicId?: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  messageCount: number;
  topicSummary?: SessionTopicSummary;
  extractedData?: SessionExtractionSummary | null;
}

interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: 'text' | 'evaluation';
  createdAt: string;
  metadata?: {
    source?: 'full_review' | 'live_coach' | 'system';
  };
}

interface SessionReviewData {
  headline: string;
  summary: string;
  strengths: string[];
  focusAreas: string[];
  goodPhrases: string[];
  nextActions: string[];
  reviewText: string;
  generatedAt: string;
  sourceMessageCount: number;
}

function formatDateTime(value?: string) {
  if (!value) {
    return '未结束';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

function getSessionTitle(session?: SessionDetailData | null) {
  if (!session) {
    return 'Conversation';
  }

  if (session.topicSummary?.originalInput?.trim()) {
    return session.topicSummary.originalInput.trim();
  }

  if (session.extractedData?.topicsDiscussed?.[0]?.trim()) {
    return session.extractedData.topicsDiscussed[0].trim();
  }

  return 'Conversation';
}

export default function SessionHistoryDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const { status } = useSession();
  const { characterId, voiceId } = useCoachPreferences();
  const [sessionData, setSessionData] = useState<SessionDetailData | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [review, setReview] = useState<SessionReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const sessionId = useMemo(() => {
    if (Array.isArray(params?.id)) {
      return params.id[0];
    }
    return params?.id ?? '';
  }, [params]);

  useEffect(() => {
    if (status !== 'authenticated' || !sessionId) {
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [sessionResponse, messagesResponse] = await Promise.all([
          fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' }),
          fetch(`/api/sessions/${sessionId}/messages?limit=100`, { cache: 'no-store' }),
        ]);

        const [sessionResult, messagesResult] = await Promise.all([
          parseJsonResponse<{
            success?: boolean;
            data?: SessionDetailData;
            error?: string;
          }>(sessionResponse),
          parseJsonResponse<{
            success?: boolean;
            data?: { messages: SessionMessage[]; total: number };
            error?: string;
          }>(messagesResponse),
        ]);

        if (!sessionResult.ok || !sessionResult.data?.success || !sessionResult.data.data) {
          throw new Error(getApiErrorMessage(sessionResult, '加载会话详情失败'));
        }

        if (!messagesResult.ok || !messagesResult.data?.success || !messagesResult.data.data) {
          throw new Error(getApiErrorMessage(messagesResult, '加载消息记录失败'));
        }

        if (!cancelled) {
          setSessionData(sessionResult.data.data);
          setMessages(messagesResult.data.data.messages.filter((message) => message.role !== 'system'));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载会话详情失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, status]);

  useEffect(() => {
    if (status !== 'authenticated' || !sessionId || !sessionData) {
      return;
    }

    if (sessionData.status !== 'ended' || messages.length === 0) {
      setReview(null);
      setReviewError(null);
      setIsLoadingReview(false);
      return;
    }

    let cancelled = false;

    const loadReview = async () => {
      setIsLoadingReview(true);
      setReviewError(null);

      try {
        const teacher = teacherSelectionFromCharacter(characterId, voiceId || undefined);
        const response = await fetch(`/api/sessions/${sessionId}/review-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher: {
              soulId: teacher.soulId,
              voiceId: teacher.voiceId,
            },
          }),
        });
        const result = await parseJsonResponse<{
          success?: boolean;
          data?: SessionReviewData;
          error?: string;
        }>(response);

        if (!result.ok || !result.data?.success || !result.data.data) {
          throw new Error(getApiErrorMessage(result, '生成最终点评失败'));
        }

        if (!cancelled) {
          setReview(result.data.data);
        }
      } catch (nextError) {
        if (!cancelled) {
          setReviewError(nextError instanceof Error ? nextError.message : '生成最终点评失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingReview(false);
        }
      }
    };

    void loadReview();

    return () => {
      cancelled = true;
    };
  }, [characterId, messages.length, sessionData, sessionId, status, voiceId]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          正在加载会话详情...
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="text-lg font-semibold text-slate-900">需要先登录</div>
          <div className="mt-2 text-sm leading-6 text-slate-600">
            历史会话回看只对已登录用户开放。登录后，这里会展示完整消息流和最终点评。
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/auth/login"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              去登录
            </Link>
            <Link
              href="/"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-rose-200 bg-white p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="text-lg font-semibold text-slate-900">无法打开这条会话</div>
          <div className="mt-2 text-sm leading-6 text-rose-700">
            {error || '会话不存在或你没有访问权限。'}
          </div>
          <div className="mt-5">
            <Link
              href="/profile"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              返回历史与设置
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)]">
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/profile" className="text-lg font-semibold text-slate-900">
            SpeakOnImage
          </Link>
          <button
            type="button"
            onClick={() => router.push('/profile')}
            className="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            返回历史与设置
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {formatTopicTypeLabel(sessionData.topicSummary?.type)}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    sessionData.status === 'ended'
                      ? 'bg-slate-200/80 text-slate-600'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {sessionData.status === 'ended' ? '已结束' : '进行中'}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                {getSessionTitle(sessionData)}
              </h1>
              <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                {sessionData.extractedData?.sessionSummary || '这条会话保存了完整消息流，适合回看表达轨迹和老师最后的复盘。'}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:w-[320px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Messages</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{sessionData.messageCount}</div>
                <div className="mt-1 text-xs text-slate-500">完整消息条数</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Started</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(sessionData.startedAt)}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {sessionData.endedAt ? `结束于 ${formatDateTime(sessionData.endedAt)}` : '尚未结束'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              返回会话列表
            </Link>
            {sessionData.topicId && (
              <Link
                href={`/topic/practice?topicId=${sessionData.topicId}`}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {sessionData.status === 'active' ? '继续这轮对话' : '回到这个话题'}
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Conversation transcript</h2>
                <div className="mt-1 text-xs text-slate-500">
                  按时间顺序回看整段对话。
                </div>
              </div>
              <div className="text-xs text-slate-400">
                {messages.length} 条可见消息
              </div>
            </div>

            {messages.length > 0 ? (
              <div className="mt-5 space-y-3">
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          isUser
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className={`text-[11px] font-medium ${isUser ? 'text-slate-300' : 'text-slate-500'}`}>
                          {isUser ? 'You' : 'Coach'}
                          {message.metadata?.source === 'live_coach' ? ' · Live' : ''}
                        </div>
                        <div className="mt-1 whitespace-pre-line">
                          {message.content}
                        </div>
                        <div className={`mt-2 text-[11px] ${isUser ? 'text-slate-300' : 'text-slate-400'}`}>
                          {formatDateTime(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                这条会话还没有可回看的消息内容。
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <div className="text-base font-semibold text-slate-900">Final review</div>
              <div className="mt-1 text-xs text-slate-500">
                {sessionData.status === 'ended'
                  ? '这部分会基于当前会话消息重新生成多轮复盘。'
                  : '当前会话还没结束。结束后，这里才会出现最终点评。'}
              </div>

              {sessionData.status !== 'ended' ? (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  这条会话仍在进行中。先回到练习页结束本次对话，生成最终点评后再回来查看，会更符合 chat-first 的主流程。
                </div>
              ) : isLoadingReview ? (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  正在生成最终点评...
                </div>
              ) : reviewError ? (
                <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                  {reviewError}
                </div>
              ) : review ? (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-5">
                  <div className="text-lg font-semibold text-slate-900">
                    {review.headline || '多轮对话最终点评'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    基于 {review.sourceMessageCount} 条对话消息生成 · {formatDateTime(review.generatedAt)}
                  </div>

                  {review.summary && (
                    <div className="mt-3 text-sm leading-6 text-slate-700">
                      {review.summary}
                    </div>
                  )}

                  <div className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-800">
                    {review.reviewText}
                  </div>

                  {review.strengths.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        这次做对了
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {review.strengths.map((item) => (
                          <li key={`strength-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {review.focusAreas.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                        接下来要盯住
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {review.focusAreas.map((item) => (
                          <li key={`focus-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {review.nextActions.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                        下一轮怎么练
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {review.nextActions.map((item) => (
                          <li key={`next-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  这条会话还没有可展示的最终点评。
                </div>
              )}
            </div>

            {sessionData.extractedData && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
                <div className="text-base font-semibold text-slate-900">Stored summary</div>
                <div className="mt-3 text-sm leading-6 text-slate-700">
                  {sessionData.extractedData.sessionSummary}
                </div>
                {sessionData.extractedData.suggestedFocusNext.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Suggested focus
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {sessionData.extractedData.suggestedFocusNext.map((item) => (
                        <li key={`stored-focus-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
