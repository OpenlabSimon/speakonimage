'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { IntroductionInput, type IntroductionAssessmentResult } from '@/components/assessment/IntroductionInput';
import { LocalPracticeMigrationCard } from '@/components/migration/LocalPracticeMigrationCard';
import { useRecorder } from '@/hooks/useRecorder';
import { useLevelHistory } from '@/hooks/useLevelHistory';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { CoachReviewPanel } from '@/components/evaluation/CoachReviewPanel';
import { CoachQuickSummaryCard } from '@/components/evaluation/CoachQuickSummaryCard';
import { convertToWav } from '@/lib/audio/convert';
import {
  ATTEMPTS_STORAGE_KEY,
  CURRENT_TOPIC_STORAGE_KEY,
  DRAFT_HISTORY_STORAGE_KEY,
  loadCurrentTopicSummary,
  shouldClearAnonymousPracticeStorage,
} from '@/lib/practice/storage';
import { teacherSelectionFromCharacter } from '@/domains/teachers/character-bridge';
import type { CEFRLevel } from '@/types';
import type { DraftHistoryEntry } from '@/lib/drafts';

type PageStep = 'assessment' | 'post-assessment' | 'topic-input';

const QUICK_CHAT_TOPICS = [
  '介绍一下你最近在做的一件事，以及为什么它对你重要。',
  '如果你要向朋友推荐一个你常用的产品，你会怎么介绍？',
  '聊聊你最近一次感到紧张或有压力的经历，以及你是怎么处理的。',
  '假设你要做一个两分钟的英文自我介绍，你最想突出哪三点？',
];

function buildQuickChatTopic(seed: string, targetCefr: CEFRLevel) {
  const normalized = seed.trim();

  return {
    type: 'expression' as const,
    chinesePrompt: normalized,
    guidingQuestions: [
      '先用一句话说清楚主题是什么。',
      '补充一个原因、例子或个人感受。',
      '如果老师追问，再多说一句 why 或 how。',
    ],
    suggestedVocab: [
      {
        word: 'first',
        phonetic: '',
        partOfSpeech: '',
        chinese: '首先',
        exampleContext: 'First, I want to explain the main idea.',
      },
      {
        word: 'because',
        phonetic: '',
        partOfSpeech: '',
        chinese: '因为',
        exampleContext: 'I like it because it saves time.',
      },
      {
        word: 'for example',
        phonetic: '',
        partOfSpeech: '',
        chinese: '例如',
        exampleContext: 'For example, I use it every day at work.',
      },
    ],
    grammarHints: [
      {
        point: '先用短句把意思说清楚',
        explanation: '先说清主语、动作和原因，再慢慢补细节。',
        pattern: 'I ... because ...',
        example: 'I enjoy this topic because it is useful in my daily life.',
      },
      {
        point: '每轮尽量补一个例子',
        explanation: '回答后追加一个例子，会更像真实对话。',
        pattern: 'For example, ...',
        example: 'For example, I often practice it when I commute.',
      },
    ],
    difficultyMetadata: {
      targetCefr,
      vocabComplexity: 0,
      grammarComplexity: 0,
    },
    practiceGoal: '先连续聊 3 到 5 轮，再结束并查看最终复盘。',
  };
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [isStartingIntroPractice, setIsStartingIntroPractice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualLevelSelect, setShowManualLevelSelect] = useState(false);
  const [manualLevel, setManualLevel] = useState<CEFRLevel>('B1');
  const [dueCount, setDueCount] = useState(0);
  const [isTopicTranscribing, setIsTopicTranscribing] = useState(false);
  const [topicTranscriptionAvailability, setTopicTranscriptionAvailability] = useState<{
    available: boolean;
    provider: 'azure' | null;
    reason: string | null;
  } | null>(null);
  const [assessmentSummary, setAssessmentSummary] = useState<IntroductionAssessmentResult | null>(null);
  const [resumeTopic, setResumeTopic] = useState<ReturnType<typeof loadCurrentTopicSummary>>(null);
  const hasResolvedInitialStep = useRef(false);
  const { status: authStatus } = useSession();
  const isClassicView = searchParams.get('view') === 'classic';
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
  const {
    isRecording: isTopicRecording,
    duration: topicRecordingDuration,
    error: topicRecorderError,
    startRecording: startTopicRecording,
    stopRecording: stopTopicRecording,
    resetRecording: resetTopicRecording,
    isSupported: isTopicRecordingSupported,
  } = useRecorder();

  const formatRecordingDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine initial step based on level history
  useEffect(() => {
    if (isClassicView) {
      return;
    }

    if (!isLoaded || hasResolvedInitialStep.current) {
      return;
    }

    hasResolvedInitialStep.current = true;
    if (needsAssessment()) {
      setStep('assessment');
      return;
    }

    setStep('topic-input');
  }, [isClassicView, isLoaded, needsAssessment]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    setResumeTopic(loadCurrentTopicSummary());
  }, [isLoaded]);

  useEffect(() => {
    let cancelled = false;

    const loadTopicTranscriptionAvailability = async () => {
      try {
        const response = await fetch('/api/speech/transcribe', { cache: 'no-store' });
        const result = await response.json();

        if (cancelled || !result?.success || !result?.data) {
          return;
        }

        setTopicTranscriptionAvailability({
          available: Boolean(result.data.available),
          provider: result.data.provider ?? null,
          reason: result.data.reason ?? null,
        });
      } catch {
        // Keep the control usable if the capability probe itself fails.
      }
    };

    void loadTopicTranscriptionAvailability();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch review stats for badge
  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetch('/api/review/stats')
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setDueCount(json.data.dueCount);
          }
        })
        .catch(() => {});
    }
  }, [authStatus]);

  // Handle assessment completion
  const handleAssessmentComplete = (
    level: CEFRLevel,
    confidence: number,
    introText: string,
    result: IntroductionAssessmentResult
  ) => {
    initializeLevel(level, confidence, introText);
    setAssessmentSummary(result);
    setStep('post-assessment');
  };

  // Handle skip assessment (manual level selection)
  const handleSkipAssessment = () => {
    setAssessmentSummary(null);
    setShowManualLevelSelect(true);
  };

  // Handle manual level selection confirm
  const handleManualLevelConfirm = () => {
    initializeLevel(manualLevel, 0.5); // 0.5 confidence for manual selection
    setAssessmentSummary(null);
    setShowManualLevelSelect(false);
    setStep('topic-input');
  };

  // Handle "继续练习自我介绍" — create synthetic intro topic and navigate
  const handlePracticeIntro = async () => {
    const assessedLevel = getCurrentLevel();
    const seedDraft = history?.introductionText?.trim() || '';
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
      seedDraft,
      seedDraftLabel: '评估版自我介绍',
      practiceGoal: '在已有自我介绍基础上继续补充、改写并优化表达',
    };

    setError(null);
    setIsStartingIntroPractice(true);

    try {
      let nextTopic: typeof introTopic & { id?: string } = introTopic;

      if (authStatus === 'authenticated') {
        const draftHistory: DraftHistoryEntry[] = seedDraft
          ? [{
              id: 'assessment-seed',
              text: seedDraft,
              source: 'assessment',
              createdAt: new Date().toISOString(),
              label: '评估版自我介绍',
            }]
          : [];

        const response = await fetch('/api/user/topics/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: introTopic.type,
            originalInput: 'assessment:introduction-practice',
            topicContent: introTopic,
            difficultyMetadata: introTopic.difficultyMetadata,
            draftHistory,
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || '创建自我介绍练习失败');
        }

        nextTopic = result.data;
      }

      if (shouldClearAnonymousPracticeStorage(nextTopic.id)) {
        localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
        localStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
      }
      localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(nextTopic));
      router.push('/topic/practice');
    } catch (err) {
      console.error('Start intro practice error:', err);
      setError(err instanceof Error ? err.message : '创建自我介绍练习失败');
    } finally {
      setIsStartingIntroPractice(false);
    }
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
      if (shouldClearAnonymousPracticeStorage(result.data.id)) {
        localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
        localStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
      }
      localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(result.data));

      // Navigate to topic page
      router.push('/topic/practice');
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartChat = async (seed?: string) => {
    const normalized = (seed || inputText).trim();
    if (!normalized) {
      setError('先输入一个你想聊的话题。');
      return;
    }

    setIsGenerating(true);
    setError(null);

    const targetCefr = getCurrentLevel();
    const localTopic = buildQuickChatTopic(normalized, targetCefr);
    let nextTopic: typeof localTopic & { id?: string } = localTopic;

    try {
      if (authStatus === 'authenticated') {
        const response = await fetch('/api/user/topics/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: localTopic.type,
            originalInput: normalized,
            topicContent: localTopic,
            difficultyMetadata: localTopic.difficultyMetadata,
          }),
        });

        const result = await response.json();
        if (response.ok && result.success && result.data) {
          nextTopic = result.data;
        }
      }

      if (shouldClearAnonymousPracticeStorage(nextTopic.id)) {
        localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
        localStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
      }

      localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(nextTopic));
      setResumeTopic(nextTopic);
      router.push('/topic/practice');
    } catch (startError) {
      console.error('Quick start chat error:', startError);
      localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(nextTopic));
      setResumeTopic(nextTopic);
      router.push('/topic/practice');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTopicVoiceSubmit = async (blob: Blob) => {
    setIsTopicTranscribing(true);
    setError(null);

    try {
      let audioToSend: Blob = blob;
      try {
        audioToSend = await convertToWav(blob);
      } catch {
        console.warn('WAV conversion failed, using original format');
      }

      const formData = new FormData();
      formData.append('audio', audioToSend);

      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || '语音转写暂时不可用，请直接输入文字，或进入 Live 对话。');
      }

      if (result.data.status !== 'success' || !result.data.text?.trim()) {
        throw new Error('未检测到清晰语音，请重试。');
      }

      setInputText((prev) =>
        prev.trim()
          ? `${prev.trim()}\n${result.data.text.trim()}`
          : result.data.text.trim()
      );
    } catch (err) {
      console.error('Topic transcription error:', err);
      setError(err instanceof Error ? err.message : '语音转写失败');
    } finally {
      setIsTopicTranscribing(false);
    }
  };

  const handleTopicRecordingToggle = async () => {
    if (isGenerating || isTopicTranscribing) {
      return;
    }

    if (topicTranscriptionAvailability?.available === false) {
      setError(topicTranscriptionAvailability.reason || '语音转写暂时不可用，请直接输入文字。');
      return;
    }

    if (isTopicRecording) {
      const blob = await stopTopicRecording();
      if (blob) {
        await handleTopicVoiceSubmit(blob);
      }
      return;
    }

    resetTopicRecording();
    setError(null);
    await startTopicRecording();
  };

  const isTopicVoiceUnavailable = topicTranscriptionAvailability?.available === false;
  const isTopicVoiceButtonDisabled =
    !isTopicRecordingSupported || isGenerating || isTopicTranscribing || isTopicVoiceUnavailable;

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

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">正在初始化本机学习档案...</div>
        </div>
      </div>
    );
  }

  if (!isClassicView) {
    const isTopicVoiceUnavailable = topicTranscriptionAvailability?.available === false;
    const isTopicVoiceButtonDisabled =
      !isTopicRecordingSupported || isGenerating || isTopicTranscribing || isTopicVoiceUnavailable;

    return (
      <AppShell
        activeNav="chat"
        title="Chat"
        description="默认先进入实时对话。先围绕一个话题聊几轮，结束后再去 Review 看最终复盘。"
        headerActions={(
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              当前等级 {getCurrentLevel()}
            </div>
            <button
              onClick={() => router.push('/?view=classic')}
              className="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              打开 Practice
            </button>
          </div>
        )}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Chat First
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Practice English by chatting with an AI coach.
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Start a topic, speak for a few turns, and get a short review at the end.
              </p>
            </div>

            {error && (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Start with one topic or one speaking situation
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    默认是实时语音对话。想看旧版完整批改流程，可以切到经典模式。
                  </div>
                </div>
                <button
                  onClick={() => router.push('/?view=classic')}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  打开经典模式
                </button>
              </div>

              <div className="mt-6">
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder="输入一个你想聊的话题，或者直接写下你想练的场景..."
                  className="h-32 w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">语音补充输入</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      先用中文或中英混合说出想法，系统会转写进上面的聊天入口。
                    </div>
                  </div>
                  <button
                    onClick={handleTopicRecordingToggle}
                    disabled={isTopicVoiceButtonDisabled}
                    className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      isTopicVoiceButtonDisabled
                        ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                        : isTopicRecording
                          ? 'bg-rose-500 text-white hover:bg-rose-600'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isTopicTranscribing
                      ? '转写中...'
                      : isTopicRecording
                        ? `停止录音 ${formatRecordingDuration(topicRecordingDuration)}`
                        : 'Use voice'}
                  </button>
                </div>
                {(topicRecorderError || isTopicRecording || isTopicTranscribing) && (
                  <div className="mt-3 text-xs text-slate-500">
                    {topicRecorderError && <span className="text-rose-600">{topicRecorderError}</span>}
                    {!topicRecorderError && isTopicRecording && '录音中，停止后会自动转写进输入框。'}
                    {!topicRecorderError && !isTopicRecording && isTopicTranscribing && '正在把语音转成文字...'}
                  </div>
                )}
                {!topicRecorderError && !isTopicRecording && !isTopicTranscribing && isTopicVoiceUnavailable && (
                  <div className="mt-3 text-xs text-amber-700">
                    {topicTranscriptionAvailability?.reason}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => {
                    void handleStartChat();
                  }}
                  disabled={isGenerating || isTopicTranscribing || !inputText.trim()}
                  className={`min-h-12 flex-1 rounded-full px-5 py-3 text-base font-semibold transition ${
                    isGenerating || isTopicTranscribing || !inputText.trim()
                      ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                      : 'bg-sky-600 text-white hover:bg-sky-700'
                  }`}
                >
                  {isGenerating ? '正在准备对话...' : 'Start chatting'}
                </button>

                {resumeTopic && (
                  <button
                    onClick={() => router.push('/topic/practice')}
                    className="min-h-12 rounded-full border border-slate-200 px-5 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    继续上一次话题
                  </button>
                )}
              </div>

              {resumeTopic && (
                <div className="mt-3 text-sm text-slate-500">
                  最近话题：{resumeTopic.chinesePrompt}
                </div>
              )}

              <div className="mt-8">
                <div className="text-sm font-medium text-slate-500">Quick topics</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_CHAT_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => {
                        setInputText(topic);
                        void handleStartChat(topic);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-900">1. Start a topic</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  不再先做复杂分流。直接进入一个你想说的话题。
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-900">2. Speak for a few turns</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  默认走实时语音对话，更接近真实聊天练习。
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-semibold text-slate-900">3. End and get review</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  对话结束后只看一份会话级复盘，不强迫你理解复杂面板。
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link href="/profile" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                打开 Review
              </Link>
              <Link href="/coach" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
                选择 Coach
              </Link>
              <button
                onClick={() => router.push('/?view=classic')}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                分级评估 / 旧版入口
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeNav="practice"
      title="Practice"
      description="结构化输入、分级评估和完整批改都放在这里。它是 Chat 之外的专项训练入口。"
      headerActions={(
        <div className="flex flex-wrap items-center gap-3">
          {history && step === 'topic-input' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">等级:</span>
              <span className="font-semibold text-blue-600">
                {history.currentLevel}
              </span>
              {history.currentLevel !== 'C2' && (
                <button
                  onClick={upgradeLevel}
                  className="min-h-11 rounded-lg px-2 text-xs font-medium text-green-600 hover:text-green-800"
                >
                  升级
                </button>
              )}
              <button
                onClick={() => {
                  setAssessmentSummary(null);
                  setStep('assessment');
                }}
                className="min-h-11 rounded-lg px-2 text-xs text-gray-400 underline hover:text-gray-600"
              >
                重新评估
              </button>
            </div>
          )}
          <Link
            href="/"
            className="min-h-11 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            回到 Chat
          </Link>
        </div>
      )}
    >
      <div className="max-w-2xl mx-auto">
        <LocalPracticeMigrationCard />

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
            teacher={teacherSelectionFromCharacter(characterId, voiceId)}
            review={{ mode: 'all', autoPlayAudio: true }}
          />
        )}

        {/* Manual Level Selection Modal */}
        {showManualLevelSelect && (
          <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">
              选择你的等级
            </h2>
            <div className="mb-6 grid grid-cols-2 gap-3">
              {(['A2', 'B1', 'B2', 'C1'] as CEFRLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setManualLevel(level)}
                  className={`min-h-24 rounded-xl border-2 p-4 text-left transition-all ${
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setShowManualLevelSelect(false)}
                className="flex-1 min-h-12 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
              >
                返回
              </button>
              <button
                onClick={handleManualLevelConfirm}
                className="flex-1 min-h-12 rounded-xl bg-blue-500 py-3 font-semibold text-white hover:bg-blue-600"
              >
                以 {manualLevel} 开始
              </button>
            </div>
          </div>
        )}

        {/* Post-Assessment Choice */}
        {step === 'post-assessment' && (
          <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2 text-center">
              评估完成！
            </h2>
            {assessmentSummary ? (
              <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm text-emerald-700">当前建议等级</div>
                    <div className="text-2xl font-bold text-emerald-900">
                      {assessmentSummary.estimatedLevel}
                    </div>
                  </div>
                  <div className="text-right text-xs text-emerald-700">
                    置信度 {Math.round(assessmentSummary.confidence * 100)}%
                  </div>
                </div>
                <div className="mt-3 text-sm text-emerald-800">
                  下面会直接给你一段中文老师点评，并自动生成老师语音。
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-6 text-center">
                选择接下来的练习方式
              </p>
            )}
            {assessmentSummary?.reviewText &&
              assessmentSummary.speechScript &&
              assessmentSummary.teacher &&
              assessmentSummary.review &&
              assessmentSummary.audioReview && (
                <div className="mb-6">
                  <CoachReviewPanel
                    teacher={assessmentSummary.teacher}
                    reviewMode={assessmentSummary.review.mode}
                    autoPlayAudio={assessmentSummary.review.autoPlayAudio}
                    reviewText={assessmentSummary.reviewText}
                    speechScript={assessmentSummary.speechScript}
                    audioReview={assessmentSummary.audioReview}
                    htmlArtifact={{
                      enabled: false,
                      status: 'skipped',
                      reason: 'assessment quick review',
                    }}
                    standaloneMode
                  />
                </div>
              )}
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={handlePracticeIntro}
                disabled={isStartingIntroPractice}
                className="min-h-28 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5 text-left transition-all hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-lg font-semibold text-emerald-800 mb-1">
                  {isStartingIntroPractice ? '正在建立练习记录...' : '继续优化这段自我介绍'}
                </div>
                <div className="text-sm text-emerald-600">
                  带着刚才的输入继续练习，把每一版都当作可迭代历史
                </div>
              </button>
              <button
                onClick={() => setStep('topic-input')}
                className="min-h-28 rounded-xl border-2 border-blue-200 bg-blue-50 p-5 text-left transition-all hover:border-blue-500 hover:bg-blue-100"
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
            <CoachQuickSummaryCard
              characterId={characterId}
              reviewMode={reviewMode}
              autoPlayAudio={autoPlayAudio}
              voiceId={voiceId}
              isRemoteBacked={isRemoteBacked}
              onReviewModeChange={setReviewMode}
              onAutoPlayAudioChange={setAutoPlayAudio}
              onCharacterChange={setCharacterId}
              onVoiceIdChange={setVoiceId}
            />

            {/* Input Section */}
            <div className="mb-6 bg-white rounded-2xl shadow-lg p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                输入练习内容
              </h2>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="输入任何内容：一句中文、一个话题、或学习目标..."
                className="w-full h-24 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      语音补充输入
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      先说一句中文或中英混合想法，转写后会直接填进上面的输入框
                    </div>
                  </div>
                  <button
                    onClick={handleTopicRecordingToggle}
                    disabled={isTopicVoiceButtonDisabled}
                    className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      isTopicVoiceButtonDisabled
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : isTopicRecording
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isTopicTranscribing
                      ? '转写中...'
                      : isTopicRecording
                      ? `停止录音 ${formatRecordingDuration(topicRecordingDuration)}`
                      : '语音输入'}
                  </button>
                </div>
                {(topicRecorderError || isTopicRecording || isTopicTranscribing) && (
                  <div className="mt-2 text-xs text-gray-500">
                    {topicRecorderError && <span className="text-red-600">{topicRecorderError}</span>}
                    {!topicRecorderError && isTopicRecording && '录音中，点击右侧按钮结束并转写'}
                    {!topicRecorderError && !isTopicRecording && isTopicTranscribing && '正在把语音转成文字...'}
                  </div>
                )}
                {!topicRecorderError && !isTopicRecording && !isTopicTranscribing && isTopicVoiceUnavailable && (
                  <div className="mt-2 text-xs text-amber-700">
                    {topicTranscriptionAvailability?.reason}
                  </div>
                )}
              </div>

              {/* Current Level Display */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    练习等级:
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                    {getCurrentLevel()}
                  </span>
                </div>
                <span className="text-xs leading-5 text-gray-400">
                  连续低分会自动降级，升级需手动操作
                </span>
              </div>
            </div>

            {/* Review Badge */}
            {dueCount > 0 && (
              <Link
                href="/review"
                className="block mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 font-medium text-sm">[复习提醒]</span>
                    <span className="text-sm text-gray-700">{dueCount} 个项目需要复习</span>
                  </div>
                  <span className="text-amber-600 text-sm">→</span>
                </div>
              </Link>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isTopicTranscribing || !inputText.trim()}
              className={`w-full min-h-12 rounded-xl py-4 text-lg font-semibold transition-all ${
                isGenerating || isTopicTranscribing || !inputText.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {isGenerating || isTopicTranscribing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">...</span>
                  {isTopicTranscribing ? '语音转写中...' : '生成中...'}
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
                    className="min-h-11 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">...</div>
            <div className="text-gray-600">加载中...</div>
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
