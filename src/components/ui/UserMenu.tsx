'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
    );
  }

  if (!session) {
    return (
      <div className="flex gap-2">
        <Link
          href="/auth/login"
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          登录
        </Link>
        <Link
          href="/auth/register"
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          注册
        </Link>
      </div>
    );
  }

  const isGuest = session.user?.isGuest;
  const name = session.user?.name;
  const email = session.user?.email;
  const image = session.user?.image;
  const displayName = name || email || '游客';
  const initial = isGuest ? '游' : (name || email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-medium hover:bg-blue-600 transition-colors overflow-hidden"
      >
        {image ? (
          <img src={image} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900 truncate">
                {displayName}
              </div>
              <div className="text-xs text-gray-500">
                {isGuest ? '游客模式' : '已登录'}
              </div>
            </div>

            <div className="py-1">
              {isGuest ? (
                <Link
                  href="/auth/upgrade"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
                >
                  升级账号
                </Link>
              ) : (
                <Link
                  href="/profile"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  我的档案
                </Link>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  signOut({ callbackUrl: '/' });
                }}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                退出
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
