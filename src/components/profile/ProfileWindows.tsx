'use client';

interface UsageSnapshot {
  key: 'latest_attempt' | 'rolling_30m' | 'daily';
  label: string;
  sampleCount: number;
  strengths: string[];
  weaknesses: string[];
  preferredVocabulary: string[];
  avoidVocabulary: string[];
  preferredExpressions: string[];
  avoidGrammarPatterns: string[];
  updatedAt: string;
}

interface ProfileWindowsProps {
  snapshots: UsageSnapshot[];
}

function ChipList({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: 'green' | 'red' | 'blue' | 'amber';
}) {
  if (items.length === 0) return null;

  const colorMap = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-gray-500">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={`${title}-${item}`} className={`rounded-full px-3 py-1 text-xs font-medium ${colorMap[color]}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProfileWindows({ snapshots }: ProfileWindowsProps) {
  if (snapshots.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-gray-500">
        暂时还没有足够样本来形成本次、近30分钟和今日画像。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {snapshots.map((snapshot) => (
        <section key={snapshot.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">{snapshot.label}</div>
              <div className="text-xs text-gray-500">{snapshot.sampleCount} 次样本</div>
            </div>
          </div>

          <div className="space-y-4">
            <ChipList title="强项" items={snapshot.strengths} color="green" />
            <ChipList title="弱项" items={snapshot.weaknesses} color="red" />
            <ChipList title="愿意主动用的词" items={snapshot.preferredVocabulary} color="blue" />
            <ChipList title="建议暂时避坑的词" items={snapshot.avoidVocabulary} color="red" />
            <ChipList title="高频固定表达" items={snapshot.preferredExpressions} color="amber" />
            <ChipList title="高频语法风险" items={snapshot.avoidGrammarPatterns} color="red" />
          </div>
        </section>
      ))}
    </div>
  );
}
