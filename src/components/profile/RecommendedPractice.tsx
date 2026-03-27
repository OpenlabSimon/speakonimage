'use client';

import type { RecommendationFeedbackEntry, RecommendationProfile } from '@/lib/profile/memory';

interface RecommendedPracticeProps {
  recommendations: RecommendationProfile;
  feedback?: RecommendationFeedbackEntry[];
  onFeedback?: (input: {
    recommendationId: string;
    recommendationKind: 'topic' | 'vocabulary' | 'example';
    recommendationTitle: string;
    sentiment: 'helpful' | 'too_easy' | 'too_hard' | 'good_direction_not_now' | 'off_topic';
    relatedInterestKeys: string[];
  }) => Promise<void>;
  pendingRecommendationId?: string | null;
}

function RecommendationSection({
  title,
  emptyText,
  items,
  feedbackMap,
  onFeedback,
  pendingRecommendationId,
}: {
  title: string;
  emptyText: string;
  items: RecommendationProfile['topics'];
  feedbackMap: Map<string, RecommendationFeedbackEntry['sentiment']>;
  onFeedback?: RecommendedPracticeProps['onFeedback'];
  pendingRecommendationId?: string | null;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-gray-500">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">{item.title}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{item.detail}</div>
              <div className="mt-2 text-xs text-gray-500">
                为什么推荐这个：{item.reason}
              </div>
              {onFeedback && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      void onFeedback({
                        recommendationId: item.id,
                        recommendationKind: item.kind,
                        recommendationTitle: item.title,
                        sentiment: 'helpful',
                        relatedInterestKeys: item.relatedInterestKeys,
                      });
                    }}
                    disabled={pendingRecommendationId === item.id}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      feedbackMap.get(item.id) === 'helpful'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    对，我想练
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onFeedback({
                        recommendationId: item.id,
                        recommendationKind: item.kind,
                        recommendationTitle: item.title,
                        sentiment: 'too_easy',
                        relatedInterestKeys: item.relatedInterestKeys,
                      });
                    }}
                    disabled={pendingRecommendationId === item.id}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      feedbackMap.get(item.id) === 'too_easy'
                        ? 'bg-sky-600 text-white'
                        : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                    }`}
                  >
                    太简单
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onFeedback({
                        recommendationId: item.id,
                        recommendationKind: item.kind,
                        recommendationTitle: item.title,
                        sentiment: 'too_hard',
                        relatedInterestKeys: item.relatedInterestKeys,
                      });
                    }}
                    disabled={pendingRecommendationId === item.id}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      feedbackMap.get(item.id) === 'too_hard'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    太难
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onFeedback({
                        recommendationId: item.id,
                        recommendationKind: item.kind,
                        recommendationTitle: item.title,
                        sentiment: 'good_direction_not_now',
                        relatedInterestKeys: item.relatedInterestKeys,
                      });
                    }}
                    disabled={pendingRecommendationId === item.id}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      feedbackMap.get(item.id) === 'good_direction_not_now'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    方向对但不想练
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onFeedback({
                        recommendationId: item.id,
                        recommendationKind: item.kind,
                        recommendationTitle: item.title,
                        sentiment: 'off_topic',
                        relatedInterestKeys: item.relatedInterestKeys,
                      });
                    }}
                    disabled={pendingRecommendationId === item.id}
                    className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      feedbackMap.get(item.id) === 'off_topic'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    不相关
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendedPractice({
  recommendations,
  feedback = [],
  onFeedback,
  pendingRecommendationId,
}: RecommendedPracticeProps) {
  const feedbackMap = new Map(
    feedback.map((entry) => [entry.recommendationId, entry.sentiment])
  );

  return (
    <div className="space-y-4">
      {recommendations.nextFocus.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">下一轮建议重点</div>
          <div className="flex flex-wrap gap-2">
            {recommendations.nextFocus.map((focus) => (
              <span
                key={focus}
                className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700"
              >
                {focus}
              </span>
            ))}
          </div>
        </div>
      )}

      <RecommendationSection
        title="推荐练习话题"
        emptyText="等你多练几轮后，这里会开始围绕你的兴趣推题。"
        items={recommendations.topics}
        feedbackMap={feedbackMap}
        onFeedback={onFeedback}
        pendingRecommendationId={pendingRecommendationId}
      />

      <RecommendationSection
        title="推荐主动复用的单词"
        emptyText="还没有足够词汇信号，先多做几轮练习。"
        items={recommendations.vocabulary}
        feedbackMap={feedbackMap}
        onFeedback={onFeedback}
        pendingRecommendationId={pendingRecommendationId}
      />

      <RecommendationSection
        title="推荐直接模仿的例句"
        emptyText="等你产生更多可复用表达后，这里会自动整理出来。"
        items={recommendations.examples}
        feedbackMap={feedbackMap}
        onFeedback={onFeedback}
        pendingRecommendationId={pendingRecommendationId}
      />
    </div>
  );
}
