'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/ui/UserMenu';
import { IntroductionInput } from '@/components/assessment/IntroductionInput';
import { useLevelHistory } from '@/hooks/useLevelHistory';
import type { CEFRLevel } from '@/types';

type PageStep = 'assessment' | 'post-assessment' | 'topic-input';

export default function Home() {
  const router = useRouter();
  const {
    history,
    isLoaded,
    needsAssessment,
    initializeLevel,
    upgradeLevel,
    getCurrentLevel,
  } = useLevelHistory();

  const [step, setStep] = useState<PageStep>('assessment');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualLevelSelect, setShowManualLevelSelect] = useState(false);
  const [manualLevel, setManualLevel] = useState<CEFRLevel>('B1');
  const [introductionText, setIntroductionText] = useState<string>('');

  // Determine initial step based on level history
  useEffect(() => {
    if (isLoaded) {
      if (needsAssessment()) {
        setStep('assessment');
      } else {
        setStep('topic-input');
      }
    }
  }, [isLoaded, needsAssessment]);

  // Handle assessment completion
  const handleAssessmentComplete = (
    level: CEFRLevel,
    confidence: number,
    introText: string
  ) => {
    initializeLevel(level, confidence, introText);
    setIntroductionText(introText);
    setStep('post-assessment');
  };

  // Handle skip assessment (manual level selection)
  const handleSkipAssessment = () => {
    setShowManualLevelSelect(true);
  };

  // Handle manual level selection confirm
  const handleManualLevelConfirm = () => {
    initializeLevel(manualLevel, 0.5); // 0.5 confidence for manual selection
    setShowManualLevelSelect(false);
    setStep('topic-input');
  };

  // Handle "继续练习自我介绍" — create synthetic intro topic and navigate
  const handlePracticeIntro = () => {
    const assessedLevel = getCurrentLevel();
    const introTopic = {
      type: 'expression',
      chinesePrompt: '用英语做一个完整的自我介绍，包括你的基本信息、工作或学习情况、兴趣爱好等。',
      guidingQuestions: [
        '你叫什么名字？做什么工作/学什么专业？',
        '你有什么兴趣爱好？',
        '你为什么想学英语？',
      ],
      suggestedVocab: [],
      grammarHints: [],
      difficultyMetadata: {
        targetCefr: assessedLevel,
        vocabComplexity: 0,
        grammarComplexity: 0,
      },
    };

    localStorage.setItem('currentTopic', JSON.stringify(introTopic));
    localStorage.removeItem('topicAttempts');
    router.push('/topic/practice');
  };

  // Handle generate topic
  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError('请输入话题');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const targetCefr = getCurrentLevel();

      const response = await fetch('/api/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText.trim(),
          targetCefr,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '生成话题失败');
      }

      // Store topic data in localStorage (survives refresh)
      localStorage.setItem('currentTopic', JSON.stringify(result.data));

      // Navigate to topic page
      router.push('/topic/practice');
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // Show loading state while checking level history
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">SpeakOnImage</h1>
          <div className="flex items-center gap-4">
            {history && step === 'topic-input' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">等级:</span>
                <span className="font-semibold text-blue-600">
                  {history.currentLevel}
                </span>
                {history.currentLevel !== 'C2' && (
                  <button
                    onClick={upgradeLevel}
                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                  >
                    升级
                  </button>
                )}
                <button
                  onClick={() => setStep('assessment')}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  重新评估
                </button>
              </div>
            )}
            <UserMenu />
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-gray-600">
            用英语表达中文思维
          </p>
        </div>

        {/* Step 1: Assessment */}
        {step === 'assessment' && !showManualLevelSelect && (
          <IntroductionInput
            onAssessmentComplete={handleAssessmentComplete}
            onSkip={handleSkipAssessment}
          />
        )}

        {/* Manual Level Selection Modal */}
        {showManualLevelSelect && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">
              选择你的等级
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {(['A2', 'B1', 'B2', 'C1'] as CEFRLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setManualLevel(level)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    manualLevel === level
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-lg">{level}</div>
                  <div className="text-xs text-gray-500">
                    {level === 'A2' && '初级'}
                    {level === 'B1' && '中级'}
                    {level === 'B2' && '中高级'}
                    {level === 'C1' && '高级'}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowManualLevelSelect(false)}
                className="flex-1 py-3 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                返回
              </button>
              <button
                onClick={handleManualLevelConfirm}
                className="flex-1 py-3 rounded-xl font-semibold bg-blue-500 text-white hover:bg-blue-600"
              >
                以 {manualLevel} 开始
              </button>
            </div>
          </div>
        )}

        {/* Post-Assessment Choice */}
        {step === 'post-assessment' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2 text-center">
              评估完成！
            </h2>
            <p className="text-sm text-gray-500 mb-6 text-center">
              选择接下来的练习方式
            </p>
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={handlePracticeIntro}
                className="p-5 rounded-xl border-2 border-emerald-200 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 transition-all text-left"
              >
                <div className="text-lg font-semibold text-emerald-800 mb-1">
                  继续练习自我介绍
                </div>
                <div className="text-sm text-emerald-600">
                  用刚才的自我介绍内容进行口语练习，获得详细反馈
                </div>
              </button>
              <button
                onClick={() => setStep('topic-input')}
                className="p-5 rounded-xl border-2 border-blue-200 hover:border-blue-500 bg-blue-50 hover:bg-blue-100 transition-all text-left"
              >
                <div className="text-lg font-semibold text-blue-800 mb-1">
                  开始新话题练习
                </div>
                <div className="text-sm text-blue-600">
                  输入一句中文、一个话题或学习目标，开始练习
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Topic Input (no level selection) */}
        {step === 'topic-input' && (
          <>
            {/* Input Section */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                输入练习内容
              </h2>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="输入任何内容：一句中文、一个话题、或学习目标..."
                className="w-full h-24 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {/* Current Level Display */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    练习等级:
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                    {getCurrentLevel()}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  连续低分会自动降级，升级需手动操作
                </span>
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
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">...</span>
                  生成中...
                </span>
              ) : (
                '生成练习'
              )}
            </button>

            {/* Quick Start Examples */}
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-500 mb-3 text-center">
                快速开始
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  '昨天我在咖啡店遇到了一个老朋友',
                  '如果明天下雨，我们就改天再去',
                  '周末计划',
                  '旅行中的难忘经历',
                  '我想练习雅思口语',
                  '帮我练习商务英语',
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
          </>
        )}
      </div>
    </div>
  );
}
