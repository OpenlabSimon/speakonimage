'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { getCredentialsAuthErrorMessage } from '@/lib/auth/credentials-errors';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const getCallbackUrl = () => {
    if (typeof window === 'undefined') {
      return '/';
    }

    return new URLSearchParams(window.location.search).get('callbackUrl') || '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        action: 'login',
        redirect: false,
      });

      if (result?.error) {
        setError(getCredentialsAuthErrorMessage(result.error, result.code) || '登录失败，请重试');
      } else {
        router.push(getCallbackUrl());
        router.refresh();
      }
    } catch {
      setError('登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl: getCallbackUrl() });
  };

  const handleGuestSignIn = async () => {
    setIsGuestLoading(true);
    setError(null);
    try {
      const result = await signIn('anonymous', { redirect: false });
      if (result?.error) {
        setError(result.error);
      } else {
        router.push(getCallbackUrl());
        router.refresh();
      }
    } catch {
      setError('游客登录失败，请重试');
    } finally {
      setIsGuestLoading(false);
    }
  };

  const hasGoogle = process.env.NEXT_PUBLIC_HAS_GOOGLE === 'true';
  const hasWeChat = process.env.NEXT_PUBLIC_HAS_WECHAT === 'true';
  const hasOAuth = hasGoogle || hasWeChat;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">欢迎回来</h1>
          <p className="text-gray-600 mt-2">登录以继续你的学习</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* OAuth Buttons */}
          {hasOAuth && (
            <>
              <div className="space-y-3">
                {hasGoogle && (
                  <button
                    onClick={() => handleOAuthSignIn('google')}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">Google 登录</span>
                  </button>
                )}

                {hasWeChat && (
                  <button
                    onClick={() => handleOAuthSignIn('wechat')}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#07C160">
                      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05a6.127 6.127 0 0 1-.247-1.722c0-3.615 3.276-6.549 7.314-6.549.259 0 .51.022.764.043C16.573 4.79 12.965 2.188 8.691 2.188zm-2.6 4.408c.58 0 1.049.47 1.049 1.049 0 .58-.47 1.049-1.049 1.049a1.05 1.05 0 0 1-1.049-1.049c0-.58.47-1.049 1.049-1.049zm5.392 0c.58 0 1.049.47 1.049 1.049 0 .58-.47 1.049-1.049 1.049a1.05 1.05 0 0 1-1.049-1.049c0-.58.47-1.049 1.049-1.049zM16.07 9.036c-3.574 0-6.476 2.58-6.476 5.762 0 3.183 2.902 5.762 6.476 5.762.722 0 1.416-.108 2.07-.31a.721.721 0 0 1 .597.082l1.388.814a.272.272 0 0 0 .14.045c.133 0 .242-.108.242-.242 0-.06-.024-.118-.04-.176l-.286-1.08a.492.492 0 0 1 .178-.555C21.72 18.107 22.546 16.541 22.546 14.798c0-3.182-2.902-5.762-6.476-5.762zm-2.282 3.584c.482 0 .873.39.873.873s-.39.873-.873.873-.873-.39-.873-.873.39-.873.873-.873zm4.565 0c.482 0 .873.39.873.873s-.39.873-.873.873-.873-.39-.873-.873.39-.873.873-.873z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">微信登录</span>
                  </button>
                )}
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">或用邮箱登录</span>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                邮箱
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                role="alert"
                data-testid="auth-form-error"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isLoading ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              没有账号？{' '}
              <Link href="/auth/register" className="text-blue-500 hover:text-blue-600 font-medium">
                注册
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={handleGuestSignIn}
            disabled={isGuestLoading}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {isGuestLoading ? '进入中...' : '先看看 → 游客体验'}
          </button>
          <div>
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
