// Minimal FSRS v4 implementation
// Reference: https://github.com/open-spaced-repetition/fsrs4anki

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type State = 'New' | 'Learning' | 'Review' | 'Relearning';

export interface Card {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview: Date | null;
}

export interface ScheduleResult {
  card: Card;
  nextReview: Date;
}

// FSRS v4 default parameters (w0–w12)
const W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function initDifficulty(rating: Rating): number {
  return clamp(W[4] - (rating - 3) * W[5], 1, 10);
}

function initStability(rating: Rating): number {
  return Math.max(W[rating - 1], 0.1);
}

function nextDifficulty(d: number, rating: Rating): number {
  const next = d - W[6] * (rating - 3);
  // Mean reversion towards initial difficulty
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? W[11] : 1;
  const easyBonus = rating === 4 ? W[12] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
}

function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Schedule a card after a review with a given rating.
 * Returns the updated card state and the next review date.
 */
export function schedule(card: Card, rating: Rating, now: Date = new Date()): ScheduleResult {
  const elapsed = card.lastReview
    ? (now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  let newCard: Card;

  if (card.state === 'New') {
    // First review
    const d = initDifficulty(rating);
    const s = initStability(rating);

    if (rating === 1) {
      // Again — stay in Learning
      newCard = {
        ...card,
        difficulty: d,
        stability: s,
        reps: card.reps + 1,
        lapses: card.lapses,
        state: 'Learning',
        elapsedDays: 0,
        scheduledDays: 0,
        lastReview: now,
      };
    } else {
      // Hard/Good/Easy — graduate to Review
      const interval = Math.max(1, Math.round(s));
      newCard = {
        ...card,
        difficulty: d,
        stability: s,
        reps: card.reps + 1,
        lapses: card.lapses,
        state: 'Review',
        elapsedDays: 0,
        scheduledDays: interval,
        lastReview: now,
      };
    }
  } else if (card.state === 'Learning' || card.state === 'Relearning') {
    if (rating === 1) {
      // Again — stay in current state
      const s = Math.max(card.stability * 0.5, 0.1);
      newCard = {
        ...card,
        stability: s,
        reps: card.reps + 1,
        state: card.state,
        elapsedDays: elapsed,
        scheduledDays: 0,
        lastReview: now,
      };
    } else {
      // Graduate to Review
      const d = nextDifficulty(card.difficulty, rating);
      const r = retrievability(elapsed, card.stability);
      const s = nextRecallStability(d, card.stability, r, rating);
      const interval = Math.max(1, Math.round(s));
      newCard = {
        ...card,
        difficulty: d,
        stability: s,
        reps: card.reps + 1,
        state: 'Review',
        elapsedDays: elapsed,
        scheduledDays: interval,
        lastReview: now,
      };
    }
  } else {
    // Review state
    const r = retrievability(elapsed, card.stability);
    const d = nextDifficulty(card.difficulty, rating);

    if (rating === 1) {
      // Lapse — move to Relearning
      const s = Math.max(card.stability * 0.2, 0.1);
      newCard = {
        ...card,
        difficulty: d,
        stability: s,
        reps: card.reps + 1,
        lapses: card.lapses + 1,
        state: 'Relearning',
        elapsedDays: elapsed,
        scheduledDays: 0,
        lastReview: now,
      };
    } else {
      const s = nextRecallStability(d, card.stability, r, rating);
      const interval = Math.max(1, Math.round(s));
      newCard = {
        ...card,
        difficulty: d,
        stability: s,
        reps: card.reps + 1,
        state: 'Review',
        elapsedDays: elapsed,
        scheduledDays: interval,
        lastReview: now,
      };
    }
  }

  // Calculate next review date
  let nextReview: Date;
  if (newCard.state === 'Learning' || newCard.state === 'Relearning') {
    // Short intervals: 1 min for Again, 10 min for others
    const minutes = rating === 1 ? 1 : 10;
    nextReview = new Date(now.getTime() + minutes * 60 * 1000);
  } else {
    // Days-based interval
    nextReview = new Date(now.getTime() + newCard.scheduledDays * 24 * 60 * 60 * 1000);
  }

  return { card: newCard, nextReview };
}

/**
 * Preview next review intervals for all 4 ratings (for UI display).
 */
export function previewSchedule(card: Card, now: Date = new Date()): Record<Rating, string> {
  const result = {} as Record<Rating, string>;
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    const { nextReview } = schedule(card, rating, now);
    const diffMs = nextReview.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffMin < 60) {
      result[rating] = `${diffMin}分钟`;
    } else if (diffHours < 24) {
      result[rating] = `${diffHours}小时`;
    } else {
      result[rating] = `${diffDays}天`;
    }
  }
  return result;
}
