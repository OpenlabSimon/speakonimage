'use client';

import type { TranslationEvaluationScores, ExpressionEvaluationScores } from '@/types';

type EvaluationData = TranslationEvaluationScores | ExpressionEvaluationScores;

interface SemanticFeedbackProps {
  evaluation: EvaluationData;
}

export function SemanticFeedback({ evaluation }: SemanticFeedbackProps) {
  if (evaluation.type === 'translation') {
    return <TranslationFeedback evaluation={evaluation} />;
  }
  return <ExpressionFeedback evaluation={evaluation} />;
}

// Translation feedback - focus on semantic accuracy
function TranslationFeedback({ evaluation }: { evaluation: TranslationEvaluationScores }) {
  const { semanticAccuracy, naturalness, vocabulary } = evaluation;

  // Normalize points to string format
  const normalizePoint = (point: string | { point: string; comment?: string }) => {
    if (typeof point === 'string') return point;
    return point.point;
  };

  return (
    <div className="space-y-4">
      {/* Semantic Accuracy */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
          <h3 className="font-semibold text-blue-800">Semantic Delivery</h3>
          <p className="text-xs text-blue-600">Did your English convey the Chinese meaning?</p>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-3">{semanticAccuracy.comment}</p>

          {/* Conveyed Points */}
          {semanticAccuracy.conveyedPoints.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-green-700 mb-1">
                Successfully Conveyed:
              </div>
              <ul className="space-y-1">
                {semanticAccuracy.conveyedPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span className="text-gray-700">{normalizePoint(point)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missed Points */}
          {semanticAccuracy.missedPoints.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-700 mb-1">
                Missed or Incorrect:
              </div>
              <ul className="space-y-1">
                {semanticAccuracy.missedPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-red-500 mt-0.5">✗</span>
                    <span className="text-gray-700">{normalizePoint(point)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Naturalness */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-purple-50 px-4 py-2 border-b border-purple-100">
          <h3 className="font-semibold text-purple-800">Naturalness</h3>
          <p className="text-xs text-purple-600">Does it sound like native English?</p>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-3">{naturalness.comment}</p>

          {naturalness.issues.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-yellow-700 mb-1">
                Could be more natural:
              </div>
              <ul className="space-y-1">
                {naturalness.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-yellow-500 mt-0.5">!</span>
                    <span className="text-gray-700">{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {naturalness.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-700 mb-1">
                More natural alternatives:
              </div>
              <ul className="space-y-1">
                {naturalness.suggestions.map((suggestion, i) => (
                  <li key={i} className="text-sm text-green-700 bg-green-50 px-2 py-1 rounded">
                    "{suggestion}"
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Vocabulary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-teal-50 px-4 py-2 border-b border-teal-100">
          <h3 className="font-semibold text-teal-800">Vocabulary</h3>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-3">{vocabulary.comment}</p>

          {vocabulary.goodChoices.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {vocabulary.goodChoices.map((word, i) => (
                <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                  {word}
                </span>
              ))}
            </div>
          )}

          {vocabulary.improvements.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Try these words:</div>
              <div className="flex flex-wrap gap-1">
                {vocabulary.improvements.map((word, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Expression feedback - focus on content and creativity
function ExpressionFeedback({ evaluation }: { evaluation: ExpressionEvaluationScores }) {
  const { relevance, depth, creativity, languageQuality } = evaluation;

  return (
    <div className="space-y-4">
      {/* Relevance & Depth */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100">
          <h3 className="font-semibold text-emerald-800">Content Quality</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-gray-700 text-sm">{relevance.comment}</p>
          <p className="text-gray-700 text-sm">{depth.comment}</p>

          {depth.strengths.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-700 mb-1">Strengths:</div>
              <ul className="space-y-1">
                {depth.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {depth.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-blue-700 mb-1">Could add:</div>
              <ul className="space-y-1">
                {depth.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500">+</span>
                    <span className="text-gray-700">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Creativity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-purple-50 px-4 py-2 border-b border-purple-100">
          <h3 className="font-semibold text-purple-800">Creativity</h3>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-3">{creativity.comment}</p>

          {creativity.highlights.length > 0 && (
            <div>
              <div className="text-xs font-medium text-purple-700 mb-1">Creative highlights:</div>
              <ul className="space-y-1">
                {creativity.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-purple-500">★</span>
                    <span className="text-gray-700">{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Language Quality */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
          <h3 className="font-semibold text-blue-800">Language Quality</h3>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-2">{languageQuality.comment}</p>
          <p className="text-gray-600 text-sm">{languageQuality.vocabularyFeedback}</p>
        </div>
      </div>
    </div>
  );
}
