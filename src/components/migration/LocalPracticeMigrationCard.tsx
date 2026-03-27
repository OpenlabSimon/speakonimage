'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isAllowedLocalMigrationOrigin,
  LOCAL_MIGRATION_DONE_KEY,
  LOCAL_MIGRATION_MESSAGE_TYPE,
  mergeMigratedEntries,
  shouldOfferLocalMigration,
  type MigratableStorageEntries,
} from '@/lib/local-practice-migration';

type MigrationStatus = 'idle' | 'running' | 'done' | 'empty' | 'error';

const SOURCE_PORTS = ['3002', '3000'];

export function LocalPracticeMigrationCard() {
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [currentPort] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.location.port;
  });
  const [activePort, setActivePort] = useState<string | null>(null);
  const [isVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const port = window.location.port;
    const hostname = window.location.hostname;
    const hasMigrated = Boolean(window.localStorage.getItem(LOCAL_MIGRATION_DONE_KEY));
    return shouldOfferLocalMigration(port, hostname) && !hasMigrated;
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const importedRef = useRef<{ imported: number; updated: number; ports: string[] }>({
    imported: 0,
    updated: 0,
    ports: [],
  });
  const timeoutRef = useRef<number | null>(null);

  const targetOrigin = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  function clearTimer() {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  const finish = useCallback(() => {
    clearTimer();
    setActivePort(null);

    if (importedRef.current.imported > 0 || importedRef.current.updated > 0) {
      setStatus('done');
      setMessage(
        `已从 ${Array.from(new Set(importedRef.current.ports)).join(' / ')} 导入 ${importedRef.current.imported} 个新键，更新 ${importedRef.current.updated} 个键。刷新后就能看到旧练习。`
      );
      return;
    }

    setStatus('empty');
    setMessage('没有从旧端口读到可迁移的本地练习记录。');
  }, []);

  const processNextPort = useCallback(function advanceToNextPort() {
    clearTimer();

    const nextPort = queueRef.current.shift();
    if (!nextPort) {
      finish();
      return;
    }

    setActivePort(nextPort);
    if (iframeRef.current) {
      iframeRef.current.src = `${window.location.protocol}//${window.location.hostname}:${nextPort}/local-export?targetOrigin=${encodeURIComponent(targetOrigin)}`;
    }

    timeoutRef.current = window.setTimeout(() => {
      advanceToNextPort();
    }, 2200);
  }, [finish, targetOrigin]);

  useEffect(() => {
    if (!isVisible) return;

    const handleMessage = (event: MessageEvent) => {
      if (!activePort) return;
      if (event.origin !== `${window.location.protocol}//${window.location.hostname}:${activePort}`) return;
      if (!isAllowedLocalMigrationOrigin(event.origin)) return;
      if (!event.data || event.data.type !== LOCAL_MIGRATION_MESSAGE_TYPE) return;

      clearTimer();

      const payload = event.data.entries as MigratableStorageEntries;
      const localKeys = Object.keys(payload.local || {});

      if (localKeys.length > 0) {
        const result = mergeMigratedEntries(window.localStorage, payload.local);
        importedRef.current.imported += result.importedKeys.length;
        importedRef.current.updated += result.updatedKeys.length;
        importedRef.current.ports.push(activePort);
      }

      processNextPort();
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activePort, isVisible, processNextPort]);

  function handleStartImport() {
    importedRef.current = { imported: 0, updated: 0, ports: [] };
    queueRef.current = SOURCE_PORTS.filter((port) => port !== currentPort);
    setStatus('running');
    setMessage('正在读取旧端口里的本地练习...');
    processNextPort();
  }

  if (!isVisible) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-900">导入旧端口本地练习</div>
          <div className="mt-1 text-sm text-amber-800">
            你之前在 `3000/3002` 上做的本地练习，浏览器不会自动带到 `3003`。这里可以一次性把它们并回来。
          </div>
        </div>
        <button
          onClick={handleStartImport}
          disabled={status === 'running'}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            status === 'running'
              ? 'cursor-not-allowed bg-amber-200 text-amber-600'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {status === 'running' ? '导入中...' : '导入旧练习'}
        </button>
      </div>
      {message && (
        <div className={`mt-3 text-sm ${status === 'error' ? 'text-red-700' : 'text-amber-900'}`}>
          {message}
        </div>
      )}
      <iframe ref={iframeRef} title="local-practice-migration" className="hidden" />
    </div>
  );
}
