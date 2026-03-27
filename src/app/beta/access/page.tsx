import { Suspense } from 'react';
import { BetaAccessClient } from './BetaAccessClient';

export default function BetaAccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Suspense fallback={<div className="rounded-3xl border border-amber-200 bg-white/95 p-6 text-sm text-gray-500 shadow-xl sm:p-8">加载邀请码入口中...</div>}>
          <BetaAccessClient />
        </Suspense>
      </div>
    </div>
  );
}
