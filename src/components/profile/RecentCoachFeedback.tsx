'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTTS } from '@/hooks/useTTS';
import {
  CURRENT_TOPIC_STORAGE_KEY,
  loadCurrentTopicSummary,
} from '@/lib/practice/storage';
import type { CEFRLevel } from '@/types';

interface RecentCoachFeedbackItem {
  id: string;
  content: string;
  speechScript: string;
  audioUrl: string | null;
  createdAt: string;
  source: 'coach_review' | 'evaluation_summary';
  topic: { id?: string; type: string; originalInput: string } | null;
}

interface RecentCoachFeedbackProps {
  feedback: RecentCoachFeedbackItem[];
}

function extractResumeMessage(item: RecentCoachFeedbackItem): string | null {
  const sourceText = [item.content, item.speechScript].filter(Boolean).join('\n');
  const patterns = [
    /下一题建议直接练[:：]\s*([^\n]+)/,
    /下一题建议继续围绕[^\n]+/,
    /你下一题就直接练这个[，,]\s*([^\n]+)/,
    /你下一轮就围绕这个继续练[，,]\s*([^\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = sourceText.match(pattern);
    if (match?.[0]) {
      return match[0].trim();
    }
  }

  return null;
}

function formatTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RecentCoachFeedback({ feedback }: RecentCoachFeedbackProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { speak, stop, isSpeaking, isLoading, error } = useTTS({ provider: 'azure' });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [directAudioPlayingId, setDirectAudioPlayingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTopic = loadCurrentTopicSummary();
  const usingLocalMode = status !== 'authenticated' || session?.user?.isGuest === true;
  const visibleFeedback = showAll ? feedback : feedback.slice(0, 1);

  const handleContinuePractice = (item: RecentCoachFeedbackItem) => {
    if (!usingLocalMode && item.topic?.id) {
      router.push(`/topic/practice?topicId=${item.topic.id}`);
      return;
    }

    if (item.topic?.originalInput) {
      const resumeMessage = extractResumeMessage(item);
      let targetCefr: CEFRLevel = 'B1';
      try {
        const rawHistory = window.localStorage.getItem('speakonimage_level_history');
        if (rawHistory) {
          const parsed = JSON.parse(rawHistory) as { currentLevel?: CEFRLevel };
          if (parsed.currentLevel) {
            targetCefr = parsed.currentLevel;
          }
        }
      } catch {
        // Ignore malformed local history and keep default level.
      }

      window.localStorage.setItem(
        CURRENT_TOPIC_STORAGE_KEY,
        JSON.stringify({
          type: item.topic.type,
          chinesePrompt: item.topic.originalInput,
          suggestedVocab: [],
          grammarHints: [],
          guidingQuestions: [],
          keyPoints: [],
          resumeMessage,
          difficultyMetadata: {
            targetCefr,
            vocabComplexity: 0,
            grammarComplexity: 0,
          },
        })
      );
      router.push(`/topic/practice?resume=${Date.now()}`);
      return;
    }

    router.push(currentTopic?.id && !usingLocalMode
      ? `/topic/practice?topicId=${currentTopic.id}`
      : '/topic/practice');
  };

  const handleToggleAudio = async (item: RecentCoachFeedbackItem) => {
    const isDirectAudioPlaying = directAudioPlayingId === item.id;

    if (isDirectAudioPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      audioRef.current = null;
      setDirectAudioPlayingId(null);
      setPlayingId(null);
      return;
    }

    if (playingId === item.id && isSpeaking) {
      stop();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setDirectAudioPlayingId(null);
    }
    stop();
    setPlayingId(item.id);

    if (item.audioUrl) {
      try {
        const audio = new Audio(item.audioUrl);
        audioRef.current = audio;
        setDirectAudioPlayingId(item.id);
        audio.onended = () => {
          audioRef.current = null;
          setDirectAudioPlayingId(null);
          setPlayingId(null);
        };
        audio.onerror = () => {
          audioRef.current = null;
          setDirectAudioPlayingId(null);
          setPlayingId(null);
        };
        await audio.play();
        return;
      } catch {
        audioRef.current = null;
        setDirectAudioPlayingId(null);
      }
    }

    await speak(item.speechScript || item.content);
  };

  if (feedback.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无老师点评记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleFeedback.map((item) => (
        <article key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                {item.source === 'coach_review' ? '老师点评' : '练习总结'}
              </span>
              <span className="text-xs text-gray-500">{formatTime(item.createdAt)}</span>
            </div>
          </div>

          {item.topic?.originalInput && (
            <div className="mt-2 text-xs text-gray-600">
              关联话题：{item.topic.originalInput}
            </div>
          )}

          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-900">
            {item.content}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              onClick={() => void handleToggleAudio(item)}
              disabled={isLoading && playingId !== item.id}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                playingId === item.id && (isSpeaking || directAudioPlayingId === item.id)
                  ? 'bg-amber-800 text-white hover:bg-amber-900'
                  : 'bg-white text-amber-800 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              {playingId === item.id && (isSpeaking || directAudioPlayingId === item.id)
                ? '停止老师点评'
                : isLoading && playingId === item.id
                  ? '老师点评生成中...'
                  : '播放老师点评'}
            </button>

            {(item.topic || currentTopic) && (
              <button
                onClick={() => handleContinuePractice(item)}
                className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                沿着这条点评继续练
              </button>
            )}
          </div>
          {error && playingId === item.id && (
            <div className="mt-3 text-sm text-red-600">
              语音播放失败：{error}
            </div>
          )}
        </article>
      ))}
      {feedback.length > 1 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="min-h-11 w-full rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
        >
          {showAll ? '收起较早点评' : `展开另外 ${feedback.length - 1} 条点评`}
        </button>
      )}
    </div>
  );
}
