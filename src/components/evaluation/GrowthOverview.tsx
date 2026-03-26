'use client';

import type { DifficultySignal, SameTopicProgress } from '@/domains/runtime/round-orchestrator';
import type { TranslationEvaluationScores, ExpressionEvaluationScores } from '@/types';

type EvaluationData = TranslationEvaluationScores | ExpressionEvaluationScores;

interface GrowthOverviewProps {
  evaluation: EvaluationData;
  sameTopicProgress?: SameTopicProgress | null;
  difficultySignal?: DifficultySignal | null;
}

function buildProgressSummary(progress?: SameTopicProgress | null): string | null {
  if (!progress) return null;

  if (progress.trend === 'up') {
    return `这是同话题第 ${progress.attemptCount} 次提交，这次比上一版更稳。`;
  }

  if (progress.trend === 'flat') {
    return `这是同话题第 ${progress.attemptCount} 次提交，这次和上一版基本持平。`;
  }

  return `这是同话题第 ${progress.attemptCount} 次提交，这次有一点回摆，但还在同一个练习脉络里。`;
}

function buildDifficultySummary(signal?: DifficultySignal | null): string | null {
  if (!signal) return null;

  if (signal.relation === 'stretch') {
    return `你这次主动在挑战 ${signal.targetCefr}，高于当前稳定水平 ${signal.baselineCefr}。先适应难度，比追求好看数字更重要。`;
  }

  if (signal.relation === 'easier') {
    return `你这次先回到 ${signal.targetCefr} 打基础，低于当前稳定水平 ${signal.baselineCefr}。这是在巩固，不是退步。`;
  }

  return `这次练习难度和你当前稳定水平 ${signal.baselineCefr} 基本匹配。`;
}

function pickHighlights(evaluation: EvaluationData): string[] {
  if (evaluation.type === 'translation') {
    return [
      ...evaluation.semanticAccuracy.conveyedPoints.map((item) =>
        typeof item === 'string' ? item : item.point
      ),
      ...evaluation.vocabulary.goodChoices,
      ...evaluation.naturalness.suggestions.slice(0, 1),
    ].filter(Boolean).slice(0, 4);
  }

  return [
    ...evaluation.depth.strengths,
    ...evaluation.creativity.highlights,
  ].filter(Boolean).slice(0, 4);
}

function pickFocusPoint(evaluation: EvaluationData): string[] {
  if (evaluation.type === 'translation') {
    return [
      ...evaluation.semanticAccuracy.missedPoints.map((item) =>
        typeof item === 'string' ? item : item.point
      ),
      ...evaluation.naturalness.issues,
      ...evaluation.vocabulary.improvements,
    ].filter(Boolean).slice(0, 3);
  }

  return [
    ...evaluation.depth.suggestions,
    evaluation.languageQuality.vocabularyFeedback,
  ].filter(Boolean).slice(0, 3);
}

export function GrowthOverview({
  evaluation,
  sameTopicProgress,
  difficultySignal,
}: GrowthOverviewProps) {
  const highlights = pickHighlights(evaluation);
  const focusPoints = pickFocusPoint(evaluation);
  const progressSummary = buildProgressSummary(sameTopicProgress);
  const difficultySummary = buildDifficultySummary(difficultySignal);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          这次做对了什么
        </div>
        <div className="mt-2 text-sm text-emerald-900">
          {highlights.length > 0 ? (
            <ul className="space-y-2">
              {highlights.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>你已经把核心意思说出来了，这本身就是有效输出。</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          这次先抓一个点
        </div>
        <div className="mt-2 text-sm text-amber-900">
          <p className="mb-2">{evaluation.suggestions.immediate}</p>
          {focusPoints.length > 0 && (
            <ul className="space-y-2">
              {focusPoints.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-600">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            同题轨迹
          </div>
          <div className="mt-2 text-sm text-sky-900">
            {progressSummary || '这是这道题当前这一版的起点，后面可以直接和自己比。'}
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
            练习层级
          </div>
          <div className="mt-2 text-sm text-violet-900">
            <p>当前系统判断你这轮大致处在 {evaluation.overallCefrEstimate} 层级。</p>
            {difficultySummary && <p className="mt-2">{difficultySummary}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
          下一阶段
        </div>
        <div className="mt-2 text-sm text-slate-800">
          {evaluation.suggestions.longTerm}
        </div>
      </div>
    </div>
  );
}
