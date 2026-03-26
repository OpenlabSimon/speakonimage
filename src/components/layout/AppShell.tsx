'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/ui/UserMenu';

export type AppNavKey = 'chat' | 'practice' | 'review' | 'coach';

interface AppShellProps {
  activeNav: AppNavKey;
  title?: string;
  description?: string;
  children: ReactNode;
  headerActions?: ReactNode;
}

const NAV_ITEMS: Array<{
  key: AppNavKey;
  label: string;
  description: string;
  href: string;
}> = [
  {
    key: 'chat',
    label: 'Chat',
    description: '自由对话与实时口语',
    href: '/',
  },
  {
    key: 'practice',
    label: 'Practice',
    description: '经典模式与结构化练习',
    href: '/?view=classic',
  },
  {
    key: 'review',
    label: 'Review',
    description: '会话历史、最终点评、复习',
    href: '/profile',
  },
  {
    key: 'coach',
    label: 'Coach',
    description: '老师人设、声音、点评风格',
    href: '/coach',
  },
];

export function AppShell({
  activeNav,
  title,
  description,
  children,
  headerActions,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_34%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[280px] shrink-0 border-r border-slate-200/80 bg-white/92 px-5 py-5 backdrop-blur lg:flex lg:flex-col">
          <Link href="/" className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:bg-white">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              SpeakOnImage Beta
            </div>
            <div className="mt-3 text-xl font-semibold text-slate-950">
              SpeakOnImage
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              像 chatbot 一样专注对话，把练习、回顾和老师设置拆开。
            </div>
          </Link>

          <nav className="mt-6 space-y-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeNav;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`block rounded-3xl border px-4 py-4 transition ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.65)]'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {item.label}
                  </div>
                  <div className={`mt-1 text-xs leading-5 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                    {item.description}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Product rule
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-600">
              当前主流程是：开始对话，聊几轮，结束，再去 Review 看复盘。
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Account</div>
              <div className="mt-1 text-xs text-slate-500">历史与偏好会跟着账号走</div>
            </div>
            <UserMenu />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="border-b border-slate-200/80 bg-white/88 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="text-lg font-semibold text-slate-950">
                SpeakOnImage
              </Link>
              <UserMenu />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.key === activeNav;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            {(title || description || headerActions) && (
              <div className="mb-6 rounded-[28px] border border-slate-200 bg-white/92 px-5 py-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    {title && (
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                        {title}
                      </h1>
                    )}
                    {description && (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                        {description}
                      </p>
                    )}
                  </div>
                  {headerActions && (
                    <div className="shrink-0">
                      {headerActions}
                    </div>
                  )}
                </div>
              </div>
            )}

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
