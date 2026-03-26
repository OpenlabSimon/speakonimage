'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

export function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
    );
  }

  const isGuest = !session || session.user?.isGuest;
  const name = session?.user?.name;
  const email = session?.user?.email;
  const image = session?.user?.image;
  const displayName = isGuest ? '本机用户' : (name || email || '用户');
  const initial = isGuest ? '本' : (name || email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-blue-500 font-medium text-white transition-colors hover:bg-blue-600"
      >
        {image ? (
          <Image
            src={image}
            alt={displayName}
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
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
                {isGuest ? '本机单用户模式' : '已登录'}
              </div>
            </div>

            <div className="py-1">
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                历史与设置
              </Link>
              {!isGuest && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    signOut({ callbackUrl: '/' });
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  退出
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
