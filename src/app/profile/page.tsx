'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { GrammarErrorList } from '@/components/profile/GrammarErrorList';
import { VocabSummary } from '@/components/profile/VocabSummary';
import { RecentActivity } from '@/components/profile/RecentActivity';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: profileData, loading, error } = useProfile();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const email = session.user?.email || '';
  const initial = email.charAt(0).toUpperCase();

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

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-3">最近练习</h2>
              <RecentActivity submissions={profileData.recentSubmissions} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
