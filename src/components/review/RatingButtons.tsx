'use client';

interface RatingButtonsProps {
  schedulePreview: Record<1 | 2 | 3 | 4, string>;
  onRate: (rating: 1 | 2 | 3 | 4) => void;
  disabled: boolean;
}

const ratings: { value: 1 | 2 | 3 | 4; label: string; color: string; hoverColor: string }[] = [
  { value: 1, label: '又忘了', color: 'bg-red-500', hoverColor: 'hover:bg-red-600' },
  { value: 2, label: '有点难', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-600' },
  { value: 3, label: '记得', color: 'bg-green-500', hoverColor: 'hover:bg-green-600' },
  { value: 4, label: '太简单', color: 'bg-blue-500', hoverColor: 'hover:bg-blue-600' },
];

export function RatingButtons({ schedulePreview, onRate, disabled }: RatingButtonsProps) {
  return (
    <div className="grid grid-cols-4 gap-2 mt-4">
      {ratings.map(({ value, label, color, hoverColor }) => (
        <button
          key={value}
          onClick={() => onRate(value)}
          disabled={disabled}
          className={`${color} ${hoverColor} text-white rounded-xl py-3 px-2 text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs opacity-80 mt-0.5">
            {schedulePreview[value]}
          </div>
        </button>
      ))}
    </div>
  );
}
