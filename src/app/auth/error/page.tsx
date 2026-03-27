import Link from 'next/link';

function getReadableError(error: string | null) {
  if (!error || error === 'undefined') {
    return '认证流程中断了。当前本地测试不需要登录，你可以直接回首页继续练习。';
  }

  return `认证流程出现问题：${error}`;
}

interface AuthErrorPageProps {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedSearchParams = await searchParams;
  const errorValue = resolvedSearchParams?.error;
  const error = Array.isArray(errorValue) ? errorValue[0] : errorValue;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-2xl font-semibold text-gray-900 mb-3">认证出了点问题</div>
        <p className="text-sm text-gray-600 leading-6">
          {getReadableError(error ?? null)}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="w-full rounded-xl bg-blue-500 px-4 py-3 text-white font-medium hover:bg-blue-600 transition-colors"
          >
            返回首页继续练习
          </Link>
          <Link
            href="/profile"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            打开本地档案页
          </Link>
        </div>
      </div>
    </div>
  );
}
