'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function BetaAccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextPath = useMemo(() => searchParams.get('next') || '/', [searchParams]);
  const invalidLink = searchParams.get('error') === 'invalid';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/invite/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteCode,
          next: nextPath,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '邀请码无效');
      }

      router.push(result.redirectTo || '/');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '邀请码无效');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-amber-200 bg-white/95 p-6 shadow-xl sm:p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Invite-Only Beta
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          SpeakOnImage 内测入口
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          现在先用邀请制开放给朋友体验。拿到邀请码后，在这里输入即可进入产品。
        </p>
      </div>

      {(invalidLink || error) && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || '邀请链接无效，请确认你拿到的是最新邀请码。'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite-code" className="mb-2 block text-sm font-medium text-gray-700">
            邀请码
          </label>
          <input
            id="invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="输入你的 beta invite code"
            className="min-h-12 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-amber-400"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !inviteCode.trim()}
          className="min-h-12 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? '验证中...' : '进入 SpeakOnImage'}
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
        直接邀请链接格式：
        <div className="mt-1 break-all font-mono text-[11px] text-slate-700">
          /invite/你的邀请码
        </div>
      </div>
    </div>
  );
}
