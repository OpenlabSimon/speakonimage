'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/ui/UserMenu';
import type { TopicType } from '@/types';

export default function Home() {
  const router = useRouter();
  const [topicType, setTopicType] = useState<TopicType>('translation');
  const [inputText, setInputText] = useState('');
  const [targetCefr, setTargetCefr] = useState('B1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError('请输入话题关键词');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText.trim(),
          type: topicType,
          targetCefr,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate topic');
      }

      // Store topic data in sessionStorage for now (will use DB later)
      sessionStorage.setItem('currentTopic', JSON.stringify(result.data));

      // Navigate to topic page
      router.push('/topic/practice');
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">SpeakOnImage</h1>
          <UserMenu />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-gray-600">看中文，说英语 — 提升你的英语表达能力</p>
        </div>

        {/* Topic Type Selection */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">选择练习模式</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setTopicType('translation')}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                topicType === 'translation'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-2">📝</div>
              <div className="font-medium text-gray-800">翻译挑战</div>
              <div className="text-sm text-gray-500 mt-1">
                看中文，用英语表达相同意思
              </div>
            </button>
            <button
              onClick={() => setTopicType('expression')}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                topicType === 'expression'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-2">💬</div>
              <div className="font-medium text-gray-800">话题表达</div>
              <div className="text-sm text-gray-500 mt-1">
                围绕话题自由发挥，创意表达
              </div>
            </button>
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {topicType === 'translation' ? '输入话题关键词' : '输入你想聊的话题'}
          </h2>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              topicType === 'translation'
                ? '例如：去咖啡店、周末计划、旅行经历...'
                : '例如：我的理想工作、科技对生活的影响...'
            }
            className="w-full h-24 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* CEFR Level Selection */}
          <div className="mt-4 flex items-center gap-4">
            <span className="text-sm text-gray-600">难度等级：</span>
            <div className="flex gap-2">
              {['A2', 'B1', 'B2', 'C1'].map((level) => (
                <button
                  key={level}
                  onClick={() => setTargetCefr(level)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    targetCefr === level
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !inputText.trim()}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
            isGenerating || !inputText.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : topicType === 'translation'
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
              : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              生成中...
            </span>
          ) : (
            '生成练习题'
          )}
        </button>

        {/* Quick Start Examples */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-500 mb-3 text-center">快速开始</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              '咖啡店',
              '周末计划',
              '旅行经历',
              '美食推荐',
              '工作面试',
              '学习英语',
            ].map((example) => (
              <button
                key={example}
                onClick={() => setInputText(example)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
