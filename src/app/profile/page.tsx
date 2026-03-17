'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { CoachPreferencesPanel } from '@/components/evaluation/CoachPreferencesPanel';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { GrammarErrorList } from '@/components/profile/GrammarErrorList';
import { VocabSummary } from '@/components/profile/VocabSummary';
import { RecentActivity } from '@/components/profile/RecentActivity';
import { RecentTopicHistory } from '@/components/profile/RecentTopicHistory';
import { RecentCoachFeedback } from '@/components/profile/RecentCoachFeedback';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { data: profileData, loading, error } = useProfile(status === 'authenticated');
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

  if (loading && !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">正在初始化本机学习档案...</div>
        </div>
      </div>
    );
  }

  const email = session?.user?.email || '本机用户';
  const initial = session?.user?.isGuest ? '本' : email.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            SpeakOnImage
          </Link>
          <Link href="/" className="text-gray-600 hover:text-gray-800 text-sm">
            ← 返回练习
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-blue-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-3">
            {initial}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{email}</h1>
          {profileData && (
            <div className="inline-flex items-center gap-2 mt-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold">
                {profileData.profile.estimatedCefr}
              </span>
              {profileData.profile.confidence > 0 && (
                <span className="text-xs text-gray-400">
                  置信度 {Math.round(profileData.profile.confidence * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">教练偏好</h2>
          <CoachPreferencesPanel
            characterId={characterId}
            onCharacterChange={setCharacterId}
            reviewMode={reviewMode}
            onReviewModeChange={setReviewMode}
            autoPlayAudio={autoPlayAudio}
            onAutoPlayAudioChange={setAutoPlayAudio}
            voiceId={voiceId}
            onVoiceIdChange={setVoiceId}
            isRemoteBacked={isRemoteBacked}
          />
        </div>

        {profileData && (
          <>
            {/* Stats Grid */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">学习统计</h2>
              <StatsOverview stats={profileData.stats} />
            </div>

            {/* Grammar Errors */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">语法错误分析</h2>
              <GrammarErrorList errors={profileData.profile.grammarProfile.topErrors} />
            </div>

            {/* Vocabulary */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">词汇概况</h2>
              <VocabSummary vocab={profileData.profile.vocabularyProfile} />
            </div>

            {/* Recent Inputs */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">历史输入与草稿</h2>
              <RecentTopicHistory topics={profileData.recentTopics} />
            </div>

            {/* Coach Feedback */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">历史点评</h2>
              <RecentCoachFeedback feedback={profileData.recentCoachFeedback} />
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">最近提交记录</h2>
              <RecentActivity submissions={profileData.recentSubmissions} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
