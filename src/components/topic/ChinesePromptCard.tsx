'use client';

import type { TranslationTopic, ExpressionTopic, TopicContent } from '@/types';

interface ChinesePromptCardProps {
  topicContent: TopicContent;
}

export function ChinesePromptCard({ topicContent }: ChinesePromptCardProps) {
  if (topicContent.type === 'translation') {
    return <TranslationPromptCard topic={topicContent} />;
  } else {
    return <ExpressionPromptCard topic={topicContent} />;
  }
}

// Translation Challenge Card
function TranslationPromptCard({ topic }: { topic: TranslationTopic }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-4 sm:p-6">
      {/* Type badge */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded-full">
          翻译挑战
        </span>
        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
          {topic.difficulty}
        </span>
      </div>

      {/* Chinese prompt */}
      <div className="mb-6">
        <div className="text-xl font-medium leading-relaxed text-gray-800 sm:text-2xl">
          {topic.chinesePrompt}
        </div>
      </div>

      {/* Key points to convey */}
      <div className="bg-white/60 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-600 mb-2">
          翻译要点（确保传达以下语义）：
        </div>
        <ul className="space-y-1">
          {topic.keyPoints.map((point, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-700">
              <span className="text-blue-500 mt-0.5">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Instruction */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        用英语表达上述中文内容，不要求逐字翻译，重点是传达相同的意思
      </div>
    </div>
  );
}

// Topic Expression Card
function ExpressionPromptCard({ topic }: { topic: ExpressionTopic }) {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-4 sm:p-6">
      {/* Type badge */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="px-3 py-1 bg-emerald-500 text-white text-sm font-medium rounded-full">
          话题表达
        </span>
      </div>

      {/* Chinese prompt */}
      <div className="mb-6">
        <div className="text-xl font-medium leading-relaxed text-gray-800 sm:text-2xl">
          {topic.chinesePrompt}
        </div>
      </div>

      {/* Guiding questions */}
      <div className="bg-white/60 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-600 mb-2">
          引导问题（帮助你思考要说什么）：
        </div>
        <ul className="space-y-2">
          {topic.guidingQuestions.map((question, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-700">
              <span className="text-emerald-500 mt-0.5">💭</span>
              <span>{question}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Instruction */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        用英语自由表达你的想法，鼓励创意表达，没有唯一正确答案
      </div>
    </div>
  );
}
