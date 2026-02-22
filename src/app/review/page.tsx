'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReviewProgress } from '@/components/review/ReviewProgress';
import { ReviewCard } from '@/components/review/ReviewCard';
import { RatingButtons } from '@/components/review/RatingButtons';

interface ReviewItem {
  id: string;
  itemType: string;
  itemKey: string;
  displayData: Record<string, unknown>;
  state: string;
  schedulePreview: Record<1 | 2 | 3 | 4, string>;
}

export default function ReviewPage() {
  const { status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review');
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data);
        setTotalItems(json.data.length);
        setCurrentIndex(0);
        setCompleted(0);
        setFlipped(false);
      }
    } catch (err) {
      console.error('Failed to load review items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchItems();
    }
  }, [status, fetchItems]);

  const handleRate = async (value: 1 | 2 | 3 | 4) => {
    const item = items[currentIndex];
    if (!item || rating) return;

    setRating(true);
    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, rating: value }),
      });

      setCompleted((c) => c + 1);

      // Move to next item
      if (currentIndex < items.length - 1) {
        setCurrentIndex((i) => i + 1);
        setFlipped(false);
      } else {
        // All done
        setCurrentIndex(items.length);
      }
    } catch (err) {
      console.error('Failed to record review:', err);
    } finally {
      setRating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const isDone = currentIndex >= items.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            SpeakOnImage
          </Link>
          <Link href="/" className="text-gray-600 hover:text-gray-800 text-sm">
            ← 返回
          </Link>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">复习</h1>

        {items.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">没有待复习的项目</h2>
            <p className="text-gray-500 text-sm mb-4">
              继续练习，新的复习项目会自动生成
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              去练习
            </Link>
          </div>
        ) : isDone ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="text-4xl mb-4">&#127881;</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              今天复习了 {completed} 个项目
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              做得好！明天再来复习吧
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              返回首页
            </Link>
          </div>
        ) : (
          <>
            <ReviewProgress completed={completed} total={totalItems} />

            <ReviewCard
              itemType={currentItem.itemType}
              itemKey={currentItem.itemKey}
              displayData={currentItem.displayData}
              flipped={flipped}
              onFlip={() => setFlipped(true)}
            />

            {flipped && currentItem.schedulePreview && (
              <RatingButtons
                schedulePreview={currentItem.schedulePreview}
                onRate={handleRate}
                disabled={rating}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
