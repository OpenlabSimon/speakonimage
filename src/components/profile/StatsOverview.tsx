'use client';

interface StatsOverviewProps {
  stats: {
    topicCount: number;
    submissionCount: number;
    avgScore: number;
    streak: number;
    vocabSize: number;
    activeDays: number;
  };
}

const statCards = [
  { key: 'topicCount', label: '话题数', color: 'blue' },
  { key: 'submissionCount', label: '提交次数', color: 'green' },
  { key: 'avgScore', label: '平均分', color: 'purple' },
  { key: 'streak', label: '连续天数', color: 'orange' },
  { key: 'vocabSize', label: '词汇量', color: 'teal' },
  { key: 'activeDays', label: '活跃天数', color: 'pink' },
] as const;

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-600' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-600' },
};

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {statCards.map(({ key, label, color }) => {
        const c = colorMap[color];
        const value = stats[key];
        return (
          <div key={key} className={`${c.bg} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${c.text}`}>
              {value || 0}
            </div>
            <div className="text-xs text-gray-600 mt-1">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
