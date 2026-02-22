'use client';

interface ReviewCardProps {
  itemType: string;
  itemKey: string;
  displayData: Record<string, unknown>;
  flipped: boolean;
  onFlip: () => void;
}

export function ReviewCard({ itemType, itemKey, displayData, flipped, onFlip }: ReviewCardProps) {
  const isVocab = itemType === 'vocabulary';

  return (
    <div
      className="bg-white rounded-2xl shadow-lg p-8 min-h-[240px] flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={!flipped ? onFlip : undefined}
    >
      {!flipped ? (
        // Front side
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-3">
            {isVocab ? '词汇' : '语法'}
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-4">
            {itemKey}
          </div>
          <div className="text-sm text-gray-400">
            点击查看答案
          </div>
        </div>
      ) : (
        // Back side
        <div className="text-center w-full">
          <div className="text-xs text-gray-400 mb-3">
            {isVocab ? '词汇' : '语法'}
          </div>
          <div className="text-xl font-bold text-gray-900 mb-4">
            {itemKey}
          </div>

          {isVocab ? (
            <div className="space-y-2">
              {displayData.cefrLevel ? (
                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                  {String(displayData.cefrLevel)}
                </span>
              ) : null}
              {displayData.context ? (
                <p className="text-sm text-gray-600 italic">
                  &ldquo;{String(displayData.context)}&rdquo;
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 text-left">
              {displayData.example ? (
                <div>
                  <div className="text-xs text-gray-400 mb-1">错误示例</div>
                  <div className="text-sm text-red-500 line-through">
                    {String(displayData.example)}
                  </div>
                </div>
              ) : null}
              {displayData.correction ? (
                <div>
                  <div className="text-xs text-gray-400 mb-1">正确表达</div>
                  <div className="text-sm text-green-600 font-medium">
                    {String(displayData.correction)}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
