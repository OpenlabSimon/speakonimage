'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChinesePromptCard } from '@/components/topic/ChinesePromptCard';
import { VocabPanel } from '@/components/topic/VocabPanel';
import { GrammarPanel } from '@/components/topic/GrammarCard';
import { VoiceRecorder } from '@/components/input/VoiceRecorder';
import {
  GeminiLiveVoicePanel,
  type GeminiLiveVoicePanelHandle,
} from '@/components/input/GeminiLiveVoicePanel';
import { TextInput } from '@/components/input/TextInput';
import { EvaluationResult } from '@/components/evaluation/EvaluationResult';
import { CoachPreferencesPanel } from '@/components/evaluation/CoachPreferencesPanel';
import { LevelChangeModal } from '@/components/assessment/LevelChangeModal';
import { PracticeGameOverlay } from '@/components/evaluation/PracticeGameOverlay';
import { useLevelHistory, type LevelChangeResult } from '@/hooks/useLevelHistory';
import { useConversation } from '@/hooks/useConversation';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { usePracticeGame } from '@/hooks/usePracticeGame';
import { getCharacter } from '@/lib/characters';
import { getApiErrorMessage, parseJsonResponse } from '@/lib/http/parse-json-response';
import type { GeminiLiveState, GeminiLiveTurnResult } from '@/lib/live/client';
import { teacherSelectionFromCharacter } from '@/domains/teachers/character-bridge';
import type { DifficultySignal, SameTopicProgress } from '@/domains/runtime/round-orchestrator';
import { saveLatestCoachRound } from '@/lib/coach-round-storage';
import {
  ATTEMPTS_STORAGE_KEY,
  CURRENT_TOPIC_STORAGE_KEY,
  DRAFT_HISTORY_STORAGE_KEY,
  getAttemptsStorageKey,
  getDraftHistoryStorageKey,
  resolveTopicPracticeLoadAction,
  shouldClearAnonymousPracticeStorage,
} from '@/lib/practice/storage';
import type { DraftHistoryEntry } from '@/lib/drafts';
import type { AudioReview, HtmlArtifact, ReviewMode, TeacherSelection } from '@/domains/teachers/types';
import type {
  InputMethod,
  PracticeMode,
  SkillDomain,
  TopicContent,
  VocabularyItem,
  GrammarHint,
  TranslationEvaluationScores,
  ExpressionEvaluationScores,
  CEFRLevel,
} from '@/types';

interface TopicData {
  id?: string; // Database ID (if authenticated)
  type: 'translation' | 'expression';
  chinesePrompt: string;
  resumeMessage?: string;
  keyPoints?: string[];
  guidingQuestions?: string[];
  suggestedVocab: VocabularyItem[];
  grammarHints?: GrammarHint[];
  difficulty?: string;
  difficultyMetadata: {
    targetCefr: string;
    vocabComplexity: number;
    grammarComplexity: number;
  };
  seedDraft?: string;
  seedDraftLabel?: string;
  practiceGoal?: string;
}

interface EvaluationData {
  evaluation: TranslationEvaluationScores | ExpressionEvaluationScores;
  overallScore: number;
  inputMethod: InputMethod;
  practiceMode?: PracticeMode;
  skillDomain?: SkillDomain;
  audioUrl?: string;
  teacher?: TeacherSelection;
  reviewMode?: ReviewMode;
  reviewAutoPlay?: boolean;
  reviewText?: string;
  speechScript?: string;
  ttsText?: string;
  audioReview?: AudioReview;
  htmlArtifact?: HtmlArtifact;
  sameTopicProgress?: SameTopicProgress | null;
  difficultySignal?: DifficultySignal | null;
}

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
  audioUrl?: string;
  evaluation: EvaluationData;
}

interface LiveSessionReviewData {
  headline: string;
  summary: string;
  strengths: string[];
  focusAreas: string[];
  goodPhrases: string[];
  nextActions: string[];
  reviewText: string;
  speechScript: string;
  generatedAt: string;
  sourceMessageCount: number;
}

type PracticeInteractionMode = 'full-review' | 'live-coach';

interface LiveChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

function buildChatIntro(topic: TopicData): string {
  const guidingQuestion = topic.guidingQuestions?.[0];

  if (guidingQuestion) {
    return `我们先围绕这个话题自然聊几轮。你可以先用一两句英文开头，然后继续补充细节。一个简单起手方式是：${guidingQuestion}`;
  }

  return '我们先围绕这个话题自然聊几轮。先用一两句英文开头，后面再补一个原因、例子或感受。';
}

function createLiveChatMessage(role: LiveChatMessage['role'], content: string): LiveChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function toUserFacingPracticeError(message: string): string {
  if (message.includes('Gemini Live session closed (1008)')) {
    return 'Gemini Live 鉴权失败，已建议切回标准语音提交。';
  }
  if (message.includes('Gemini Live session closed (1003)')) {
    return '当前 Gemini Live 模型不可用，已建议切回标准语音提交。';
  }
  if (message.includes('Gemini Live session closed (1006)')) {
    return 'Gemini Live 网络连接失败，已建议切回标准语音提交。';
  }
  return message;
}

function TopicPracticePageContent() {
  const liveVoiceEnabled = process.env.NEXT_PUBLIC_ENABLE_GEMINI_LIVE === 'true';
  const router = useRouter();
  const searchParams = useSearchParams();
  const isClassicView = searchParams.get('view') === 'classic';
  const isChatFirstView = !isClassicView;
  const { data: authSession, status: authStatus } = useSession();
  const isRemoteAuthenticated = !!authSession?.user && authSession.user.isGuest !== true;
  const practiceAuthStatus =
    authStatus === 'loading'
      ? 'loading'
      : isRemoteAuthenticated
        ? 'authenticated'
        : 'unauthenticated';
  const { addScore, upgradeLevel, setLevel, getCurrentLevel } = useLevelHistory();
  const {
    reviewMode,
    setReviewMode,
    autoPlayAudio: reviewAutoPlay,
    setAutoPlayAudio: setReviewAutoPlay,
    characterId,
    setCharacterId,
    voiceId,
    setVoiceId,
    isRemoteBacked,
  } = useCoachPreferences();

  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [practiceInteractionMode, setPracticeInteractionMode] =
    useState<PracticeInteractionMode>(liveVoiceEnabled ? 'live-coach' : 'full-review');
  const [userResponse, setUserResponse] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] =
    useState<EvaluationData | null>(null);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([]);
  const [draftText, setDraftText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPreparingNextTopic, setIsPreparingNextTopic] = useState(false);
  const [liveCoachState, setLiveCoachState] = useState<GeminiLiveState>('idle');
  const [isGeneratingLiveReview, setIsGeneratingLiveReview] = useState(false);
  const [liveSessionReview, setLiveSessionReview] = useState<LiveSessionReviewData | null>(null);
  const [liveChatMessages, setLiveChatMessages] = useState<LiveChatMessage[]>([]);
  const liveTurnPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const liveVoicePanelRef = useRef<GeminiLiveVoicePanelHandle | null>(null);

  // Level downgrade modal state
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [pendingDowngrade, setPendingDowngrade] = useState<LevelChangeResult | null>(null);

  // Conversation session for memory system
  const conversation = useConversation({
    topicId: topicData?.id,
    autoStart: true,
    isAuthenticated: isRemoteAuthenticated,
  });
  const persistedLiveCoachTurnCount = conversation.messages.filter(
    (message) => message.role === 'user' && message.metadata?.source === 'live_coach'
  ).length;
  const liveCoachTurnCount = Math.max(
    persistedLiveCoachTurnCount,
    liveChatMessages.filter((message) => message.role === 'user').length
  );

  // Practice game hook
  const practiceGame = usePracticeGame(
    currentEvaluation && topicData && userResponse && characterId
      ? {
          characterId,
          topicType: topicData.type,
          chinesePrompt: topicData.chinesePrompt,
          userResponse,
          overallScore: currentEvaluation.overallScore,
          evaluation: currentEvaluation.evaluation as unknown as Record<string, unknown>,
          cefrLevel: getCurrentLevel(),
        }
      : null
  );

  const buildSeededDraftHistory = useCallback((topic: TopicData): DraftHistoryEntry[] => {
    if (!topic.seedDraft?.trim()) {
      return [];
    }

    return [
      {
        id: 'assessment-seed',
        text: topic.seedDraft.trim(),
        source: 'assessment',
        createdAt: new Date().toISOString(),
        label: topic.seedDraftLabel || '初始草稿',
      },
    ];
  }, []);

  const persistDraftHistory = useCallback(async (entries: DraftHistoryEntry[], topicId?: string) => {
    if (!isRemoteAuthenticated || !topicId) {
      return;
    }

    try {
      await fetch(`/api/user/topics/${topicId}/draft-history`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftHistory: entries }),
      });
    } catch (persistError) {
      console.error('Persist draft history error:', persistError);
    }
  }, [isRemoteAuthenticated]);

  const saveDraftHistory = useCallback((entries: DraftHistoryEntry[], topicId?: string) => {
    localStorage.setItem(getDraftHistoryStorageKey(topicId), JSON.stringify(entries));
    setDraftHistory(entries);
    void persistDraftHistory(entries, topicId);
  }, [persistDraftHistory]);

  // Save attempts to localStorage
  const saveAttempts = useCallback((newAttempts: AttemptData[], topicId?: string) => {
    localStorage.setItem(getAttemptsStorageKey(topicId), JSON.stringify(newAttempts));
    setAttempts(newAttempts);
  }, []);

  useEffect(() => {
    setLiveSessionReview(null);
    setLiveChatMessages([]);
    liveTurnPersistQueueRef.current = Promise.resolve();
  }, [conversation.session?.id, topicData?.id, topicData?.chinesePrompt]);

  useEffect(() => {
    if (!conversation.session?.id || !isRemoteAuthenticated) {
      return;
    }

    void conversation.refreshMessages();
  }, [conversation.session?.id, conversation.refreshMessages, isRemoteAuthenticated]);

  useEffect(() => {
    if (!isChatFirstView || liveChatMessages.length > 0) {
      return;
    }

    const hydratedMessages = conversation.messages
      .filter((message) => message.metadata?.source === 'live_coach')
      .filter(
        (message): message is typeof message & { role: 'user' | 'assistant' } =>
          message.role === 'user' || message.role === 'assistant'
      )
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));

    if (hydratedMessages.length > 0) {
      setLiveChatMessages(hydratedMessages);
    }
  }, [conversation.messages, isChatFirstView, liveChatMessages.length]);

  const persistLiveTurn = useCallback((turn: GeminiLiveTurnResult) => {
    const sessionId = conversation.session?.id;
    const userText = turn.inputTranscript.trim();
    const assistantText = turn.outputTranscript.trim() || turn.outputText.trim();

    if (!userText && !assistantText) {
      return Promise.resolve();
    }

    setLiveChatMessages((prev) => {
      const next = [...prev];
      if (userText) {
        next.push(createLiveChatMessage('user', userText));
      }
      if (assistantText) {
        next.push(createLiveChatMessage('assistant', assistantText));
      }
      return next;
    });

    setLiveSessionReview(null);

    if (!isRemoteAuthenticated || !sessionId) {
      return Promise.resolve();
    }

    liveTurnPersistQueueRef.current = liveTurnPersistQueueRef.current.catch(() => undefined).then(async () => {
      if (userText) {
        const persistedUserMessage = await conversation.addUserMessageToSession(sessionId, userText, {
          source: 'live_coach',
          inputMethod: 'voice',
        });
        if (!persistedUserMessage) {
          throw new Error('保存实时对话用户消息失败');
        }
      }

      if (assistantText) {
        const persistedAssistantMessage = await conversation.addAssistantMessageToSession(sessionId, assistantText, {
          source: 'live_coach',
        });
        if (!persistedAssistantMessage) {
          throw new Error('保存实时对话老师消息失败');
        }
      }
    });

    return liveTurnPersistQueueRef.current;
  }, [conversation, isRemoteAuthenticated]);

  const handleGenerateLiveReview = useCallback(async () => {
    if (!isRemoteAuthenticated) {
      setError('登录后才能保存实时对话并生成最终点评。');
      return;
    }

    const sessionId = conversation.session?.id;
    if (!sessionId) {
      setError('当前还没有可用的会话记录。');
      return;
    }

    if (liveCoachTurnCount === 0) {
      setError('至少先完成一轮实时对话，再生成最终点评。');
      return;
    }

    setIsGeneratingLiveReview(true);
    setError(null);

    try {
      await liveTurnPersistQueueRef.current;
      liveVoicePanelRef.current?.closeConnection();

      if (conversation.session?.status !== 'ended') {
        await conversation.endSession();
      }

      const teacher = teacherSelectionFromCharacter(characterId, voiceId || undefined);
      const response = await fetch(`/api/sessions/${sessionId}/review-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher }),
      });
      const parsed = await parseJsonResponse<{
        success?: boolean;
        error?: string;
        data?: LiveSessionReviewData;
      }>(response);
      const result = parsed.data;

      if (!parsed.ok || !result?.success || !result.data) {
        throw new Error(getApiErrorMessage(parsed, '生成多轮对话最终点评失败'));
      }

      setLiveSessionReview(result.data);
    } catch (reviewError) {
      console.error('Generate live session review error:', reviewError);
      setError(reviewError instanceof Error ? reviewError.message : '生成多轮对话最终点评失败');
    } finally {
      setIsGeneratingLiveReview(false);
    }
  }, [
    characterId,
    conversation,
    isRemoteAuthenticated,
    liveCoachTurnCount,
    voiceId,
  ]);

  // Load topic data from query param or localStorage
  useEffect(() => {
    const requestedTopicId = searchParams.get('topicId');
    const loadAction = resolveTopicPracticeLoadAction(practiceAuthStatus, requestedTopicId);

    if (loadAction.kind === 'wait') {
      return;
    }

    if (loadAction.kind === 'redirect' && loadAction.redirectTo) {
      router.push(loadAction.redirectTo);
      return;
    }

    void (async () => {
      try {
        let parsedTopic: (TopicData & { attempts?: AttemptData[] }) | null = null;

        if (requestedTopicId) {
          const response = await fetch(`/api/user/topics/${requestedTopicId}`, { cache: 'no-store' });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || '加载历史练习失败');
          }
          parsedTopic = result.data as TopicData;
          localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(parsedTopic));
        } else {
          const stored = localStorage.getItem(CURRENT_TOPIC_STORAGE_KEY);
          if (stored) {
            parsedTopic = JSON.parse(stored) as TopicData;
          }
        }

        if (!parsedTopic) {
          router.push('/');
          return;
        }

        setTopicData(parsedTopic);

        const attemptsKey = getAttemptsStorageKey(parsedTopic.id);
        const legacyAttempts = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
        const storedAttempts = localStorage.getItem(attemptsKey) ?? legacyAttempts;
        if (storedAttempts) {
          const parsedAttempts = JSON.parse(storedAttempts) as AttemptData[];
          setAttempts(parsedAttempts);
          if (!localStorage.getItem(attemptsKey)) {
            localStorage.setItem(attemptsKey, storedAttempts);
          }
        } else if (Array.isArray(parsedTopic.attempts) && parsedTopic.attempts.length > 0) {
          saveAttempts(parsedTopic.attempts, parsedTopic.id);
        } else {
          setAttempts([]);
        }

        const draftHistoryKey = getDraftHistoryStorageKey(parsedTopic.id);
        const legacyDraftHistory = localStorage.getItem(DRAFT_HISTORY_STORAGE_KEY);
        const storedDraftHistory = localStorage.getItem(draftHistoryKey) ?? legacyDraftHistory;

        if (storedDraftHistory) {
          const parsedDraftHistory = JSON.parse(storedDraftHistory) as DraftHistoryEntry[];
          saveDraftHistory(parsedDraftHistory, parsedTopic.id);
          if (!localStorage.getItem(draftHistoryKey)) {
            localStorage.setItem(draftHistoryKey, storedDraftHistory);
          }
          setDraftText(parsedDraftHistory[parsedDraftHistory.length - 1]?.text || parsedTopic.seedDraft || '');
        } else {
          const seededDraftHistory = buildSeededDraftHistory(parsedTopic);
          if (seededDraftHistory.length > 0) {
            saveDraftHistory(seededDraftHistory, parsedTopic.id);
            setDraftText(parsedTopic.seedDraft?.trim() || '');
          } else {
            setDraftHistory([]);
            setDraftText('');
          }
        }

        if (isRemoteAuthenticated && parsedTopic.id) {
          try {
            const response = await fetch(`/api/user/topics/${parsedTopic.id}/draft-history`, { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok || !result.success) {
              return;
            }

            const remoteDraftHistory = result.data as DraftHistoryEntry[];
            if (remoteDraftHistory.length > 0) {
              localStorage.setItem(draftHistoryKey, JSON.stringify(remoteDraftHistory));
              setDraftHistory(remoteDraftHistory);
              setDraftText(remoteDraftHistory[remoteDraftHistory.length - 1]?.text || parsedTopic.seedDraft || '');
              return;
            }

            const seededDraftHistory = buildSeededDraftHistory(parsedTopic);
            if (seededDraftHistory.length > 0) {
              saveDraftHistory(seededDraftHistory, parsedTopic.id);
            }
          } catch (loadError) {
            console.error('Load remote draft history error:', loadError);
          }
        }
      } catch {
        router.push('/');
      }
    })();
  }, [buildSeededDraftHistory, isRemoteAuthenticated, practiceAuthStatus, router, saveAttempts, saveDraftHistory, searchParams]);

  const appendDraftHistory = useCallback((text: string, source: DraftHistoryEntry['source'], label: string) => {
    const normalized = text.trim();
    if (!normalized) return;

    setDraftHistory((prev) => {
      const latest = prev[prev.length - 1];
      if (latest?.text.trim() === normalized) {
        return prev;
      }

      const next = [
        ...prev,
        {
          id: `${Date.now()}-${prev.length + 1}`,
          text: normalized,
          source,
          createdAt: new Date().toISOString(),
          label,
        },
      ];
      localStorage.setItem(getDraftHistoryStorageKey(topicData?.id), JSON.stringify(next));
      void persistDraftHistory(next, topicData?.id);
      return next;
    });
    setDraftText(normalized);
  }, [persistDraftHistory, topicData?.id]);

  // Update level history — only auto-downgrades, never auto-upgrades
  const updateLevelHistory = useCallback(
    (score: number, estimatedLevel: CEFRLevel) => {
      const result = addScore(score, estimatedLevel);

      if (result.downgraded) {
        setPendingDowngrade(result);
        setShowLevelModal(true);
      }
    },
    [addScore]
  );

  // Handle downgrade modal accept (accept the downgrade, already applied)
  const handleLevelAccept = useCallback(() => {
    setShowLevelModal(false);
    setPendingDowngrade(null);
  }, []);

  // Handle downgrade modal decline (user wants to stay at original level)
  const handleLevelDecline = useCallback(() => {
    if (pendingDowngrade) {
      setLevel(pendingDowngrade.fromLevel);
    }
    setShowLevelModal(false);
    setPendingDowngrade(null);
  }, [pendingDowngrade, setLevel]);

  // Handle manual level selection from modal
  const handleManualLevelSelect = useCallback(
    (level: CEFRLevel) => {
      setLevel(level);
      setShowLevelModal(false);
      setPendingDowngrade(null);
    },
    [setLevel]
  );

  // Convert TopicData to TopicContent for the ChinesePromptCard
  const getTopicContent = (): TopicContent | null => {
    if (!topicData) return null;

    if (topicData.type === 'translation') {
      return {
        type: 'translation',
        chinesePrompt: topicData.chinesePrompt,
        difficulty: (topicData.difficulty ||
          topicData.difficultyMetadata.targetCefr) as CEFRLevel,
        keyPoints: topicData.keyPoints || [],
        suggestedVocab: topicData.suggestedVocab,
      };
    } else {
      return {
        type: 'expression',
        chinesePrompt: topicData.chinesePrompt,
        guidingQuestions: topicData.guidingQuestions || [],
        suggestedVocab: topicData.suggestedVocab,
        grammarHints: topicData.grammarHints || [],
      };
    }
  };

  // Handle voice transcription + evaluation (combined)
  const handleVoiceResult = (result: {
    transcription: string;
    audioUrl?: string;
    evaluation?: unknown;
    overallScore?: number;
    practiceMode?: PracticeMode;
    skillDomain?: SkillDomain;
    teacher?: TeacherSelection;
    reviewMode?: ReviewMode;
    reviewAutoPlay?: boolean;
    reviewText?: string;
    speechScript?: string;
    ttsText?: string;
    audioReview?: AudioReview;
    htmlArtifact?: HtmlArtifact;
    sameTopicProgress?: SameTopicProgress | null;
    difficultySignal?: DifficultySignal | null;
  }) => {
    setUserResponse(result.transcription);
    appendDraftHistory(result.transcription, 'attempt', `第 ${attempts.length + 1} 次语音回答`);

    if (result.evaluation && result.overallScore !== undefined) {
      const evalData: EvaluationData = {
        evaluation:
          result.evaluation as
            | TranslationEvaluationScores
            | ExpressionEvaluationScores,
        overallScore: result.overallScore,
        inputMethod: 'voice',
        practiceMode: result.practiceMode,
        skillDomain: result.skillDomain,
        audioUrl: result.audioUrl,
        teacher: result.teacher,
        reviewMode: result.reviewMode,
        reviewAutoPlay: result.reviewAutoPlay,
        reviewText: result.reviewText,
        speechScript: result.speechScript ?? result.ttsText,
        ttsText: result.ttsText ?? result.speechScript,
        audioReview: result.audioReview,
        htmlArtifact: result.htmlArtifact,
        sameTopicProgress: result.sameTopicProgress,
        difficultySignal: result.difficultySignal,
      };

      // Save this attempt
      const newAttempt: AttemptData = {
        attemptNumber: attempts.length + 1,
        text: result.transcription,
        overallScore: result.overallScore,
        timestamp: new Date().toISOString(),
        audioUrl: result.audioUrl,
        evaluation: evalData,
      };

      const newAttempts = [...attempts, newAttempt];
      saveAttempts(newAttempts, topicData?.id);
      setCurrentEvaluation(evalData);
      if (
        evalData.teacher &&
        evalData.reviewMode &&
        evalData.reviewText &&
        evalData.speechScript &&
        evalData.audioReview &&
        evalData.htmlArtifact
      ) {
        saveLatestCoachRound({
          topic: topicData
            ? {
                id: topicData.id,
                type: topicData.type,
                originalInput: topicData.chinesePrompt,
              }
            : null,
          teacher: evalData.teacher,
          reviewMode: evalData.reviewMode,
          autoPlayAudio: evalData.reviewAutoPlay ?? false,
          reviewText: evalData.reviewText,
          speechScript: evalData.speechScript,
          audioReview: evalData.audioReview,
          htmlArtifact: evalData.htmlArtifact,
          sameTopicProgress: evalData.sameTopicProgress,
          difficultySignal: evalData.difficultySignal,
          overallScore: evalData.overallScore,
          userResponse: result.transcription,
          audioUrl: result.audioUrl,
          inputMethod: 'voice',
          practiceMode: evalData.practiceMode,
          skillDomain: evalData.skillDomain,
          createdAt: new Date().toISOString(),
        });
      }

      // Update level history with the score
      const estimatedLevel = evalData.evaluation.overallCefrEstimate;
      updateLevelHistory(result.overallScore, estimatedLevel);
    }
  };

  // Handle text submission
  const handleTextSubmit = async (text: string) => {
    if (!topicData) return;
    if (isEvaluating) {
      setError('上一轮老师点评与语音仍在生成，请等待完成后再提交。');
      return;
    }

    setUserResponse(text);
    appendDraftHistory(text, 'attempt', `第 ${attempts.length + 1} 次文字回答`);
    setIsEvaluating(true);
    setError(null);

    try {
      const teacher = teacherSelectionFromCharacter(characterId, voiceId || undefined);
      const response = await fetch('/api/coach/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: isRemoteAuthenticated ? topicData.id : undefined,
          sessionId: isRemoteAuthenticated ? conversation.session?.id : undefined,
          topicType: topicData.type,
          topicContent: {
            chinesePrompt: topicData.chinesePrompt,
            keyPoints: topicData.keyPoints,
            guidingQuestions: topicData.guidingQuestions,
            suggestedVocab: topicData.suggestedVocab,
            grammarHints: topicData.grammarHints,
            difficultyMetadata: topicData.difficultyMetadata,
          },
          userResponse: text,
          inputMethod: 'text',
          teacher,
          review: { mode: reviewMode, autoPlayAudio: reviewAutoPlay },
          historyAttempts: attempts.map((a) => ({
            text: a.text,
            score: a.overallScore,
          })),
        }),
      });

      const parsed = await parseJsonResponse<{
        success?: boolean;
        error?: string;
        data?: {
          evaluation: EvaluationData['evaluation'];
          overallScore: number;
          inputMethod: EvaluationData['inputMethod'];
          practiceMode: EvaluationData['practiceMode'];
          skillDomain: EvaluationData['skillDomain'];
          teacher?: TeacherSelection;
          review?: { mode?: ReviewMode; autoPlayAudio?: boolean };
          reviewText?: string;
          speechScript?: string;
          ttsText?: string;
          audioReview?: AudioReview;
          htmlArtifact?: HtmlArtifact;
          sameTopicProgress?: SameTopicProgress | null;
          difficultySignal?: DifficultySignal | null;
        };
      }>(response);
      const result = parsed.data;

      if (!parsed.ok || !result?.success || !result.data) {
        throw new Error(getApiErrorMessage(parsed, '评估失败'));
      }

      // Save this attempt
      const newAttempt: AttemptData = {
        attemptNumber: attempts.length + 1,
        text,
        overallScore: result.data.overallScore,
        timestamp: new Date().toISOString(),
        evaluation: {
          evaluation: result.data.evaluation,
          overallScore: result.data.overallScore,
          inputMethod: result.data.inputMethod,
          practiceMode: result.data.practiceMode,
          skillDomain: result.data.skillDomain,
          teacher: result.data.teacher,
          reviewMode: result.data.review?.mode,
          reviewAutoPlay: result.data.review?.autoPlayAudio,
          reviewText: result.data.reviewText,
          speechScript: result.data.speechScript ?? result.data.ttsText,
          ttsText: result.data.ttsText ?? result.data.speechScript,
          audioReview: result.data.audioReview,
          htmlArtifact: result.data.htmlArtifact,
          sameTopicProgress: result.data.sameTopicProgress,
          difficultySignal: result.data.difficultySignal,
        },
      };

      const newAttempts = [...attempts, newAttempt];
      saveAttempts(newAttempts, topicData?.id);
      const nextEvaluation: EvaluationData = {
        evaluation: result.data.evaluation,
        overallScore: result.data.overallScore,
        inputMethod: result.data.inputMethod,
        practiceMode: result.data.practiceMode,
        skillDomain: result.data.skillDomain,
        teacher: result.data.teacher,
        reviewMode: result.data.review?.mode,
        reviewAutoPlay: result.data.review?.autoPlayAudio,
        reviewText: result.data.reviewText,
        speechScript: result.data.speechScript ?? result.data.ttsText,
        ttsText: result.data.ttsText ?? result.data.speechScript,
        audioReview: result.data.audioReview,
        htmlArtifact: result.data.htmlArtifact,
        sameTopicProgress: result.data.sameTopicProgress,
        difficultySignal: result.data.difficultySignal,
      };
      setCurrentEvaluation(nextEvaluation);
      if (
        nextEvaluation.teacher &&
        nextEvaluation.reviewMode &&
        nextEvaluation.reviewText &&
        nextEvaluation.speechScript &&
        nextEvaluation.audioReview &&
        nextEvaluation.htmlArtifact
      ) {
        saveLatestCoachRound({
          topic: topicData
            ? {
                id: topicData.id,
                type: topicData.type,
                originalInput: topicData.chinesePrompt,
              }
            : null,
          teacher: nextEvaluation.teacher,
          reviewMode: nextEvaluation.reviewMode,
          autoPlayAudio: nextEvaluation.reviewAutoPlay ?? false,
          reviewText: nextEvaluation.reviewText,
          speechScript: nextEvaluation.speechScript,
          audioReview: nextEvaluation.audioReview,
          htmlArtifact: nextEvaluation.htmlArtifact,
          sameTopicProgress: nextEvaluation.sameTopicProgress,
          difficultySignal: nextEvaluation.difficultySignal,
          overallScore: nextEvaluation.overallScore,
          userResponse: text,
          audioUrl: undefined,
          inputMethod: result.data.inputMethod,
          practiceMode: nextEvaluation.practiceMode,
          skillDomain: nextEvaluation.skillDomain,
          createdAt: new Date().toISOString(),
        });
      }

      // Update level history with the score
      const estimatedLevel = result.data.evaluation.overallCefrEstimate;
      updateLevelHistory(result.data.overallScore, estimatedLevel);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : '评估失败');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle retry - go back to input mode
  const handleRetry = () => {
    setUserResponse(null);
    setCurrentEvaluation(null);
    setError(null);
  };

  async function createFollowUpTopic() {
    if (!topicData || !currentEvaluation) {
      router.push('/');
      return;
    }

    let followUpSeed = topicData.type === 'translation'
      ? `继续围绕这个意思练新的翻译题：${topicData.chinesePrompt}。重点：${currentEvaluation.evaluation.suggestions.immediate}`
      : `继续围绕这个主题练新的表达题：${topicData.chinesePrompt}。重点：${currentEvaluation.evaluation.suggestions.immediate}`;

    if (isRemoteAuthenticated) {
      try {
        const response = await fetch('/api/user/profile', { cache: 'no-store' });
        const result = await response.json();
        const recommendedTopic = result?.success ? result.data?.profile?.recommendations?.topics?.[0] : null;
        if (recommendedTopic?.title) {
          followUpSeed = `${recommendedTopic.title}。${recommendedTopic.detail || recommendedTopic.reason || ''}`;
        }
      } catch (profileError) {
        console.error('Load profile recommendation error:', profileError);
      }
    }

    const response = await fetch('/api/topics/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: followUpSeed,
        targetCefr: getCurrentLevel(),
      }),
    });

    const parsed = await parseJsonResponse<{
      success?: boolean;
      error?: string;
      data?: typeof topicData;
    }>(response);
    const result = parsed.data;
    if (!parsed.ok || !result?.success || !result.data) {
      throw new Error(getApiErrorMessage(parsed, '生成下一题失败'));
    }

    if (shouldClearAnonymousPracticeStorage(result.data.id)) {
      localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
      localStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
    }
    localStorage.setItem(CURRENT_TOPIC_STORAGE_KEY, JSON.stringify(result.data));
    setTopicData(result.data);
    setAttempts([]);
    setDraftHistory([]);
    setDraftText(result.data.seedDraft?.trim() || '');
    setCurrentEvaluation(null);
    setUserResponse(null);
    router.push(`/topic/practice?next=${Date.now()}`);
  }

  // Handle next topic - end session, clear current attempt state, and move directly into the next related topic
  const handleNext = async () => {
    setIsPreparingNextTopic(true);
    setError(null);
    try {
      await conversation.endSession();
      await createFollowUpTopic();
    } catch (nextError) {
      console.error('Create follow-up topic error:', nextError);
      setError(nextError instanceof Error ? nextError.message : '生成下一题失败');
    } finally {
      setIsPreparingNextTopic(false);
    }
  };

  // Play stored recording
  const playRecording = (audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play();
  };

  const handleUseDraft = (text: string) => {
    setDraftText(text);
    setInputMode('text');
    setCurrentEvaluation(null);
    setUserResponse(null);
    setError(null);
  };

  const renderLiveSessionReviewCard = () => {
    if (!liveSessionReview) {
      return null;
    }

    return (
      <div
        className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-5"
        data-testid="live-session-review-card"
      >
        <div
          className="text-lg font-semibold text-gray-900"
          data-testid="live-session-review-headline"
        >
          {liveSessionReview.headline || '多轮对话最终点评'}
        </div>
        <div
          className="mt-1 text-xs text-gray-500"
          data-testid="live-session-review-source-count"
        >
          基于 {liveSessionReview.sourceMessageCount} 条对话消息生成
        </div>

        {liveSessionReview.summary && (
          <div
            className="mt-3 text-sm text-gray-700"
            data-testid="live-session-review-summary"
          >
            {liveSessionReview.summary}
          </div>
        )}

        <div
          className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-800"
          data-testid="live-session-review-text"
        >
          {liveSessionReview.reviewText}
        </div>

        {liveSessionReview.strengths.length > 0 && (
          <div className="mt-4" data-testid="live-session-review-strengths">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              这次做对了
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {liveSessionReview.strengths.map((item) => (
                <li key={`strength-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {liveSessionReview.focusAreas.length > 0 && (
          <div className="mt-4" data-testid="live-session-review-focus-areas">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
              接下来要盯住
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {liveSessionReview.focusAreas.map((item) => (
                <li key={`focus-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {liveSessionReview.goodPhrases.length > 0 && (
          <div className="mt-4" data-testid="live-session-review-good-phrases">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
              值得保留的表达
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {liveSessionReview.goodPhrases.map((item) => (
                <li key={`phrase-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {liveSessionReview.nextActions.length > 0 && (
          <div className="mt-4" data-testid="live-session-review-next-actions">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
              下一步怎么练
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {liveSessionReview.nextActions.map((item) => (
                <li key={`next-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const liveStateLabel = (() => {
    if (liveCoachState === 'recording') return '正在听你说';
    if (liveCoachState === 'responding') return '老师正在回应';
    if (liveCoachState === 'connecting') return '正在连接实时对话';
    if (liveCoachState === 'connected') return '实时对话已连接';
    if (liveCoachState === 'closed') return '本轮对话已结束';
    if (liveCoachState === 'failed') return '实时对话已回退';
    return '准备开始';
  })();

  const renderClassicAdvancedPanel = () => (
    topicData ? (
    <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
        More / Settings
      </summary>
      <div className="mt-4 space-y-4">
        <CoachPreferencesPanel
          characterId={characterId}
          onCharacterChange={setCharacterId}
          reviewMode={reviewMode}
          onReviewModeChange={setReviewMode}
          autoPlayAudio={reviewAutoPlay}
          onAutoPlayAudioChange={setReviewAutoPlay}
          voiceId={voiceId}
          onVoiceIdChange={setVoiceId}
          isRemoteBacked={isRemoteBacked}
        />

        <VocabPanel vocabulary={topicData.suggestedVocab} />

        {topicData.type === 'expression' &&
          topicData.grammarHints &&
          topicData.grammarHints.length > 0 && (
            <GrammarPanel grammarHints={topicData.grammarHints} />
          )}

        {draftHistory.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">草稿历史</div>
                <div className="mt-1 text-xs text-slate-500">
                  需要时再把旧版本带回编辑区。
                </div>
              </div>
              <div className="text-xs text-slate-400">共 {draftHistory.length} 版</div>
            </div>

            <div className="space-y-3">
              {draftHistory.slice().reverse().slice(0, 4).map((draft, index) => (
                <div
                  key={draft.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-200 px-2 text-xs font-medium text-slate-700">
                        {draftHistory.length - index}
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {draft.label}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUseDraft(draft.text)}
                      className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-200"
                    >
                      带入编辑框
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-slate-600 line-clamp-4">
                    {draft.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <strong>提示：</strong>{' '}
          {topicData.type === 'translation'
            ? '自然地表达意思即可，重点是传达语义，不需要逐字翻译。'
            : '先把主句说完整，再补一个原因、例子或个人感受。'}
        </div>
      </div>
    </details>
    ) : null
  );

  const topicContent = getTopicContent();

  if (!topicData || !topicContent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载话题中...</div>
        </div>
      </div>
    );
  }

  if (isChatFirstView) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_38%,_#f8fafc_100%)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              &larr; 返回聊天首页
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                Live chat
              </div>
              <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                等级 {getCurrentLevel()}
              </div>
              <button
                onClick={() => router.push('/topic/practice?view=classic')}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                打开经典模式
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {toUserFacingPracticeError(error)}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Current topic
                </div>
                <div className="mt-2 text-xl font-semibold leading-8 text-slate-950">
                  {topicData.chinesePrompt}
                </div>
                {topicData.practiceGoal && (
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    {topicData.practiceGoal}
                  </div>
                )}
                {topicData.resumeMessage && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {topicData.resumeMessage}
                  </div>
                )}
              </div>

              <div className="space-y-4 px-5 py-5 sm:px-6">
                {liveChatMessages.length === 0 && (
                  <div className="flex justify-start">
                    <div className="max-w-2xl rounded-[24px] rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
                      {buildChatIntro(topicData)}
                    </div>
                  </div>
                )}

                {liveChatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-2xl rounded-[24px] px-4 py-3 text-sm leading-7 ${
                        message.role === 'user'
                          ? 'rounded-br-md bg-sky-600 text-white'
                          : 'rounded-bl-md bg-slate-100 text-slate-800'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {liveSessionReview && (
                  <div className="flex justify-start">
                    <div className="max-w-2xl">
                      {renderLiveSessionReviewCard()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
                <div className="text-sm font-semibold text-slate-950">
                  Speak for 3 to 5 turns
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  默认主路径是实时语音对话。先开口聊几轮，再结束并生成一份最终复盘。
                </div>

                <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                    Live status
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm text-violet-950">
                    <span>{liveStateLabel}</span>
                    <span>已完成 {liveCoachTurnCount} 轮</span>
                  </div>
                </div>

                <div className="mt-4">
                  {liveVoiceEnabled ? (
                    <GeminiLiveVoicePanel
                      ref={liveVoicePanelRef}
                      onFallbackRequested={(reason) => setError(toUserFacingPracticeError(reason))}
                      onTurnComplete={persistLiveTurn}
                      onLiveStateChange={setLiveCoachState}
                      disabled={conversation.session?.status === 'ended'}
                      disabledReason={
                        conversation.session?.status === 'ended'
                          ? '这段对话已经结束并生成最终点评。要继续练，请回到首页开启新话题。'
                          : undefined
                      }
                    />
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      当前环境还没有开启 Gemini Live。你可以切到经典模式继续使用逐条批改。
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerateLiveReview();
                    }}
                    disabled={
                      !isRemoteAuthenticated ||
                      liveCoachTurnCount === 0 ||
                      isGeneratingLiveReview ||
                      liveCoachState === 'connecting' ||
                      liveCoachState === 'recording' ||
                      liveCoachState === 'responding'
                    }
                    className="min-h-12 rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-violet-300"
                    data-testid="live-session-review-button"
                  >
                    {isGeneratingLiveReview ? '正在生成最终点评...' : '结束并生成最终点评'}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="min-h-12 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    换个话题继续
                  </button>
                </div>

                {!isRemoteAuthenticated && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    登录后才能保存 live 对话并生成多轮最终点评。
                  </div>
                )}

                <div className="mt-4 text-xs leading-6 text-slate-500">
                  想看逐条完整批改、老师语音和旧版学习页，可以打开经典模式。
                </div>
              </div>

              <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  More
                </summary>
                <div className="mt-4 space-y-4">
                  <CoachPreferencesPanel
                    characterId={characterId}
                    onCharacterChange={setCharacterId}
                    reviewMode={reviewMode}
                    onReviewModeChange={setReviewMode}
                    autoPlayAudio={reviewAutoPlay}
                    onAutoPlayAudioChange={setReviewAutoPlay}
                    voiceId={voiceId}
                    onVoiceIdChange={setVoiceId}
                    isRemoteBacked={isRemoteBacked}
                  />

                  <ChinesePromptCard topicContent={topicContent} />
                  <VocabPanel vocabulary={topicData.suggestedVocab} />
                  {topicData.type === 'expression' &&
                    topicData.grammarHints &&
                    topicData.grammarHints.length > 0 && (
                      <GrammarPanel grammarHints={topicData.grammarHints} />
                    )}
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show evaluation result
  if (currentEvaluation && userResponse) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Header with attempt count */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.push('/')}
              className="text-gray-600 hover:text-gray-800"
            >
              &larr; 首页
            </button>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                第 {attempts.length} 次尝试
              </div>
              <div className="flex items-center gap-1">
                <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                  等级: {getCurrentLevel()}
                </div>
                {getCurrentLevel() !== 'C2' && (
                  <button
                    onClick={upgradeLevel}
                    className="px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                    title="升级难度"
                  >
                    升级
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Play Recording Button */}
          {currentEvaluation.audioUrl && (
            <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-center justify-between">
              <span className="text-sm text-blue-700">
                你的录音已保存
              </span>
              <button
                onClick={() => playRecording(currentEvaluation.audioUrl!)}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
              >
                播放录音
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              {toUserFacingPracticeError(error)}
            </div>
          )}

          {/* Evaluation */}
          <EvaluationResult
            evaluation={currentEvaluation.evaluation}
            userResponse={userResponse}
            attempts={attempts.map((a) => ({
              attemptNumber: a.attemptNumber,
              text: a.text,
              overallScore: a.overallScore,
              timestamp: a.timestamp,
            }))}
            currentAttempt={attempts.length}
            onRetry={handleRetry}
            onNext={handleNext}
            isNextLoading={isPreparingNextTopic}
            onPracticeGame={practiceGame.launchGame}
            isPracticeGameLoading={practiceGame.isLoading}
            coachReview={
              currentEvaluation.teacher &&
              currentEvaluation.reviewMode &&
              currentEvaluation.reviewText &&
              currentEvaluation.speechScript &&
              currentEvaluation.audioReview &&
              currentEvaluation.htmlArtifact
                ? {
                    teacher: currentEvaluation.teacher,
                    reviewMode: currentEvaluation.reviewMode,
                    autoPlayAudio: currentEvaluation.reviewAutoPlay ?? false,
                    reviewText: currentEvaluation.reviewText,
                    speechScript: currentEvaluation.speechScript,
                    audioReview: currentEvaluation.audioReview,
                    htmlArtifact: currentEvaluation.htmlArtifact,
                    sameTopicProgress: currentEvaluation.sameTopicProgress,
                    difficultySignal: currentEvaluation.difficultySignal,
                  }
                : undefined
            }
          />

          {/* Previous Recordings */}
          {attempts.filter((a) => a.audioUrl).length > 1 && (
            <div className="mt-6 bg-white rounded-xl p-4 shadow">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                之前的录音
              </h3>
              <div className="space-y-2">
                {attempts
                  .filter((a) => a.audioUrl)
                  .map((attempt) => (
                    <div
                      key={attempt.attemptNumber}
                      className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                        {attempt.attemptNumber}
                      </div>
                      <div className="flex-1 text-sm text-gray-600 truncate">
                        {attempt.text.substring(0, 30)}...
                      </div>
                      <div className="mr-2 text-xs font-medium text-gray-500">
                        第 {attempt.attemptNumber} 次
                      </div>
                      <button
                        onClick={() => playRecording(attempt.audioUrl!)}
                        className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                      >
                        播放
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Level Change Modal */}
        {pendingDowngrade && (
          <LevelChangeModal
            isOpen={showLevelModal}
            direction="down"
            fromLevel={pendingDowngrade.fromLevel}
            toLevel={pendingDowngrade.toLevel}
            onAccept={handleLevelAccept}
            onDecline={handleLevelDecline}
            onManualSelect={handleManualLevelSelect}
          />
        )}

        {/* Practice Game Overlay */}
        <PracticeGameOverlay
          isOpen={practiceGame.isOpen}
          isLoading={practiceGame.isLoading}
          error={practiceGame.error}
          gameHtml={practiceGame.gameHtml}
          gameProgress={practiceGame.gameProgress}
          gameResult={practiceGame.gameResult}
          characterEmoji={characterId ? getCharacter(characterId).emoji : undefined}
          onClose={practiceGame.closeGame}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            &larr; 返回首页
          </button>
          <div className="flex items-center gap-4">
            {attempts.length > 0 && (
              <div className="text-sm text-gray-500">
                已尝试 {attempts.length} 次
              </div>
            )}
            <div className="flex items-center gap-1">
              <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                等级: {getCurrentLevel()}
              </div>
              {getCurrentLevel() !== 'C2' && (
                <button
                  onClick={upgradeLevel}
                  className="px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                  title="升级难度"
                >
                  升级
                </button>
              )}
            </div>
          </div>
        </div>

        {topicData.resumeMessage && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {topicData.resumeMessage}
          </div>
        )}

        {/* Chinese Prompt */}
        <div className="mb-6">
          <ChinesePromptCard topicContent={topicContent} />
        </div>

        {topicData.practiceGoal && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-emerald-800 mb-1">
              这一轮练习目标
            </div>
            <div className="text-sm text-emerald-700">
              {topicData.practiceGoal}
            </div>
          </div>
        )}

        {renderClassicAdvancedPanel()}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            你的回答
            {attempts.length > 0 && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                (第 {attempts.length + 1} 次尝试)
              </span>
            )}
          </h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPracticeInteractionMode('full-review')}
              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                practiceInteractionMode === 'full-review'
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">完整批改</div>
              <div className="mt-1 text-xs leading-5 text-gray-600">
                录完或写完后提交，拿完整老师点评、老师语音、学习页和历史记录。
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPracticeInteractionMode('live-coach')}
              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                practiceInteractionMode === 'live-coach'
                  ? 'border-violet-300 bg-violet-50'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">实时口语教练 Beta</div>
              <div className="mt-1 text-xs leading-5 text-gray-600">
                更像实时对话练习，优先给你即时转写和即时回应，不直接替代完整批改报告。
              </div>
            </button>
          </div>

          {practiceInteractionMode === 'full-review' && (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setInputMode('voice')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    inputMode === 'voice'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  语音
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    inputMode === 'text'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  文字
                </button>
              </div>

              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                每一次明确提交都会生成老师点评和老师语音。
                上一轮输出完成前，不会启动下一次 LLM 处理。
                如果提交完成后进入结果页仍然没有看到老师复盘，那不是正常等待状态，而是异常。
              </div>
            </>
          )}

          {practiceInteractionMode === 'live-coach' && (
            <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
              实时口语教练更像边说边练的对话模式。它会优先给你实时转写和即时回应，不会直接替代下面“完整批改”模式里的完整报告、老师语音和学习页。
            </div>
          )}

          {practiceInteractionMode === 'live-coach' && (
            <div className="space-y-4">
              {liveVoiceEnabled ? (
                <GeminiLiveVoicePanel
                  ref={liveVoicePanelRef}
                  onFallbackRequested={(reason) => setError(toUserFacingPracticeError(reason))}
                  onTurnComplete={persistLiveTurn}
                  onLiveStateChange={setLiveCoachState}
                  disabled={conversation.session?.status === 'ended'}
                  disabledReason={
                    conversation.session?.status === 'ended'
                      ? '这段 live 对话已经结束并进入最终点评。要继续练，请进入下一题或刷新后重新开始。'
                      : undefined
                  }
                />
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  当前环境还没有开启 Gemini Live，请先使用“完整批改”模式。
                </div>
              )}

              {liveVoiceEnabled && (
                <div className="rounded-xl border border-violet-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-violet-950">
                        多轮对话最终点评
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        已记录 {liveCoachTurnCount} 轮 live 对话。结束本次对话后，会基于 live 轮次生成一份最终复盘。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleGenerateLiveReview();
                      }}
                      disabled={
                        !isRemoteAuthenticated ||
                        liveCoachTurnCount === 0 ||
                        isGeneratingLiveReview ||
                        liveCoachState === 'connecting' ||
                        liveCoachState === 'recording' ||
                        liveCoachState === 'responding'
                      }
                      className="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-violet-300"
                      data-testid="live-session-review-button"
                    >
                      {isGeneratingLiveReview ? '正在生成最终点评...' : '结束本次对话并生成最终点评'}
                    </button>
                  </div>

                  {!isRemoteAuthenticated && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      登录后才能保存 live 对话并生成多轮最终点评。
                    </div>
                  )}

                  {liveCoachState === 'recording' || liveCoachState === 'responding' ? (
                    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                      先完成当前这一轮，再生成最终点评。
                    </div>
                  ) : null}

                  {liveSessionReview && (
                    <div className="mt-4">
                      {renderLiveSessionReviewCard()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Voice Input - auto evaluates */}
          {practiceInteractionMode === 'full-review' && inputMode === 'voice' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 text-sm font-medium text-slate-900">
                标准语音提交
              </div>
              <VoiceRecorder
                onTranscriptionAndEvaluation={handleVoiceResult}
                topicData={topicData}
                topicId={isRemoteAuthenticated ? topicData.id : undefined}
                sessionId={isRemoteAuthenticated ? conversation.session?.id : undefined}
                onError={(error) => setError(error)}
                disabled={false}
                cefrLevel={getCurrentLevel()}
                teacher={teacherSelectionFromCharacter(characterId, voiceId || undefined)}
                reviewMode={reviewMode}
                autoPlayAudio={reviewAutoPlay}
                onProcessingChange={setIsEvaluating}
                historyAttempts={attempts.map((attempt) => ({
                  text: attempt.text,
                  score: attempt.overallScore,
                }))}
              />
            </div>
          )}

          {/* Text Input */}
          {practiceInteractionMode === 'full-review' && inputMode === 'text' && (
            <div className="space-y-4">
              <TextInput
                onSubmit={handleTextSubmit}
                initialValue={draftText}
                placeholder="在这里输入你的英语回答..."
                disabled={false}
              />
              {isEvaluating && (
                <div className="text-center text-sm text-gray-600">
                  <span className="animate-spin inline-block mr-2">...</span>
                  正在生成老师点评与语音，本轮完成前不会启动下一次处理...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Previous Attempts Summary */}
        {attempts.length > 0 && (
          <div className="mt-6 bg-white rounded-xl p-4 shadow">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              之前的尝试
            </h3>
            <div className="space-y-2">
              {attempts.slice(-3).map((attempt) => (
                <div
                  key={attempt.attemptNumber}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                    {attempt.attemptNumber}
                  </div>
                  <div className="flex-1 text-sm text-gray-600 truncate">
                    {attempt.text.substring(0, 30)}...
                  </div>
                  <div className="text-xs font-medium text-gray-500">
                    第 {attempt.attemptNumber} 次
                  </div>
                  {attempt.audioUrl && (
                    <button
                      onClick={() => playRecording(attempt.audioUrl!)}
                      className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                    >
                      播放
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Level Change Modal */}
      {pendingDowngrade && (
        <LevelChangeModal
          isOpen={showLevelModal}
          direction="down"
          fromLevel={pendingDowngrade.fromLevel}
          toLevel={pendingDowngrade.toLevel}
          onAccept={handleLevelAccept}
          onDecline={handleLevelDecline}
          onManualSelect={handleManualLevelSelect}
        />
      )}
    </div>
  );
}

export default function TopicPracticePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">...</div>
            <div className="text-gray-600">加载话题中...</div>
          </div>
        </div>
      }
    >
      <TopicPracticePageContent />
    </Suspense>
  );
}
