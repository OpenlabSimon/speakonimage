'use client';

import { useEffect } from 'react';
import {
  collectMigratableEntries,
  isAllowedLocalMigrationOrigin,
  isLocalMigrationHost,
  LOCAL_MIGRATION_MESSAGE_TYPE,
} from '@/lib/local-practice-migration';

export default function LocalExportPage() {
  useEffect(() => {
    if (!isLocalMigrationHost(window.location.hostname)) {
      return;
    }

    const targetOrigin = new URLSearchParams(window.location.search).get('targetOrigin');
    if (!targetOrigin || !isAllowedLocalMigrationOrigin(targetOrigin)) {
      return;
    }

    const entries = collectMigratableEntries(window.localStorage, window.sessionStorage);

    window.parent?.postMessage(
      {
        type: LOCAL_MIGRATION_MESSAGE_TYPE,
        origin: window.location.origin,
        entries,
      },
      targetOrigin
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
        正在导出这个端口的本地练习数据...
      </div>
    </div>
  );
}
