import { describe, it, expect, beforeAll } from 'vitest';
import {
  schedule,
  previewSchedule,
  type Card,
  type Rating,
  type ScheduleResult,
} from '@/lib/spaced-repetition/fsrs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh "New" card with sensible defaults. */
function newCard(overrides: Partial<Card> = {}): Card {
  return {
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'New',
    lastReview: null,
    ...overrides,
  };
}

/** Fixed reference date to keep tests deterministic. */
const NOW = new Date('2026-02-23T12:00:00Z');

/** Millisecond constants for readability. */
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// schedule() — New card
// ---------------------------------------------------------------------------

describe('schedule() — New card', () => {
  const card = newCard();

  describe('Again (rating = 1)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(card, 1, NOW);
    });

    it('transitions to Learning state', () => {
      expect(result.card.state).toBe('Learning');
    });

    it('sets scheduledDays to 0', () => {
      expect(result.card.scheduledDays).toBe(0);
    });

    it('increments reps by 1', () => {
      expect(result.card.reps).toBe(1);
    });

    it('does not increment lapses', () => {
      expect(result.card.lapses).toBe(0);
    });

    it('sets lastReview to now', () => {
      expect(result.card.lastReview).toEqual(NOW);
    });

    it('initialises difficulty based on FSRS parameters', () => {
      // initDifficulty(1) = clamp(W[4] - (1-3)*W[5], 1, 10) = clamp(4.93 + 2*0.94, 1, 10) = 6.81
      expect(result.card.difficulty).toBeCloseTo(6.81, 2);
    });

    it('initialises stability from W[0]', () => {
      // initStability(1) = max(W[0], 0.1) = 0.4
      expect(result.card.stability).toBeCloseTo(0.4, 2);
    });

    it('schedules next review in 1 minute', () => {
      const expectedTime = NOW.getTime() + 1 * ONE_MINUTE_MS;
      expect(result.nextReview.getTime()).toBe(expectedTime);
    });
  });

  describe('Hard (rating = 2)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(card, 2, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('initialises stability from W[1]', () => {
      // initStability(2) = max(W[1], 0.1) = 0.6
      expect(result.card.stability).toBeCloseTo(0.6, 2);
    });

    it('sets scheduledDays = max(1, round(stability))', () => {
      // round(0.6) = 1, max(1, 1) = 1
      expect(result.card.scheduledDays).toBe(1);
    });

    it('schedules next review in scheduledDays days', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('increments reps by 1', () => {
      expect(result.card.reps).toBe(1);
    });
  });

  describe('Good (rating = 3)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(card, 3, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('initialises stability from W[2]', () => {
      // initStability(3) = max(W[2], 0.1) = 2.4
      expect(result.card.stability).toBeCloseTo(2.4, 2);
    });

    it('sets scheduledDays = max(1, round(stability))', () => {
      // round(2.4) = 2
      expect(result.card.scheduledDays).toBe(2);
    });

    it('schedules next review in 2 days', () => {
      const expected = NOW.getTime() + 2 * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('initialises difficulty for rating=3', () => {
      // initDifficulty(3) = clamp(W[4] - 0, 1, 10) = 4.93
      expect(result.card.difficulty).toBeCloseTo(4.93, 2);
    });
  });

  describe('Easy (rating = 4)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(card, 4, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('initialises stability from W[3]', () => {
      // initStability(4) = max(W[3], 0.1) = 5.8
      expect(result.card.stability).toBeCloseTo(5.8, 2);
    });

    it('sets scheduledDays = max(1, round(stability))', () => {
      // round(5.8) = 6
      expect(result.card.scheduledDays).toBe(6);
    });

    it('schedules next review in 6 days', () => {
      const expected = NOW.getTime() + 6 * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('initialises difficulty for rating=4', () => {
      // initDifficulty(4) = clamp(4.93 - 1*0.94, 1, 10) = 3.99
      expect(result.card.difficulty).toBeCloseTo(3.99, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// schedule() — Review card
// ---------------------------------------------------------------------------

describe('schedule() — Review card', () => {
  const reviewCard: Card = {
    stability: 10,
    difficulty: 5,
    elapsedDays: 5,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    state: 'Review',
    lastReview: new Date(NOW.getTime() - 5 * ONE_DAY_MS),
  };

  describe('Again (rating = 1) — lapse', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(reviewCard, 1, NOW);
    });

    it('transitions to Relearning state', () => {
      expect(result.card.state).toBe('Relearning');
    });

    it('increments lapses by 1', () => {
      expect(result.card.lapses).toBe(reviewCard.lapses + 1);
    });

    it('reduces stability to max(stability * 0.2, 0.1)', () => {
      const expected = Math.max(reviewCard.stability * 0.2, 0.1);
      expect(result.card.stability).toBeCloseTo(expected, 5);
    });

    it('sets scheduledDays to 0', () => {
      expect(result.card.scheduledDays).toBe(0);
    });

    it('schedules next review in 1 minute (Relearning + Again)', () => {
      const expected = NOW.getTime() + 1 * ONE_MINUTE_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('increments reps by 1', () => {
      expect(result.card.reps).toBe(reviewCard.reps + 1);
    });

    it('updates difficulty via nextDifficulty', () => {
      expect(result.card.difficulty).not.toBe(reviewCard.difficulty);
    });
  });

  describe('Hard (rating = 2)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(reviewCard, 2, NOW);
    });

    it('stays in Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('does not increment lapses', () => {
      expect(result.card.lapses).toBe(reviewCard.lapses);
    });

    it('sets scheduledDays >= 1', () => {
      expect(result.card.scheduledDays).toBeGreaterThanOrEqual(1);
    });

    it('applies hard penalty factor (W[11]) to stability calculation', () => {
      const goodResult = schedule(reviewCard, 3, NOW);
      // With default W[11]=2.18 (>1), Hard gets higher stability than Good
      // because the hard factor multiplies the growth term
      expect(result.card.stability).toBeGreaterThan(goodResult.card.stability);
    });

    it('schedules next review based on scheduledDays', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });
  });

  describe('Good (rating = 3)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(reviewCard, 3, NOW);
    });

    it('stays in Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('uses FSRS formula to compute new stability (grows)', () => {
      expect(result.card.stability).toBeGreaterThan(reviewCard.stability);
    });

    it('sets scheduledDays = max(1, round(new stability))', () => {
      expect(result.card.scheduledDays).toBe(
        Math.max(1, Math.round(result.card.stability))
      );
    });

    it('schedules next review based on scheduledDays', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('keeps difficulty within [1, 10]', () => {
      expect(result.card.difficulty).toBeGreaterThanOrEqual(1);
      expect(result.card.difficulty).toBeLessThanOrEqual(10);
    });
  });

  describe('Easy (rating = 4)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(reviewCard, 4, NOW);
    });

    it('stays in Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('applies easy bonus factor (W[12]) to stability calculation', () => {
      const goodResult = schedule(reviewCard, 3, NOW);
      // With default W[12]=0.05 (<1), Easy gets lower stability than Good
      expect(result.card.stability).toBeLessThan(goodResult.card.stability);
    });

    it('sets scheduledDays >= 1', () => {
      expect(result.card.scheduledDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('stability ordering across ratings', () => {
    it('Again produces the lowest stability (lapse penalty)', () => {
      const results = ([1, 2, 3, 4] as Rating[]).map((r) =>
        schedule(reviewCard, r, NOW)
      );
      const stabilities = results.map((r) => r.card.stability);
      // Again (lapse) always produces the lowest stability
      expect(stabilities[0]).toBeLessThan(stabilities[1]);
      expect(stabilities[0]).toBeLessThan(stabilities[2]);
      expect(stabilities[0]).toBeLessThan(stabilities[3]);
    });

    it('Hard/Good/Easy all produce higher stability than Again', () => {
      const againResult = schedule(reviewCard, 1, NOW);
      for (const rating of [2, 3, 4] as Rating[]) {
        const result = schedule(reviewCard, rating, NOW);
        expect(result.card.stability).toBeGreaterThan(againResult.card.stability);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// schedule() — Learning card
// ---------------------------------------------------------------------------

describe('schedule() — Learning card', () => {
  const learningCard: Card = {
    stability: 0.4,
    difficulty: 6.81,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state: 'Learning',
    lastReview: new Date(NOW.getTime() - 10 * ONE_MINUTE_MS),
  };

  describe('Again (rating = 1)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(learningCard, 1, NOW);
    });

    it('stays in Learning state', () => {
      expect(result.card.state).toBe('Learning');
    });

    it('reduces stability by half (min 0.1)', () => {
      const expected = Math.max(learningCard.stability * 0.5, 0.1);
      expect(result.card.stability).toBeCloseTo(expected, 5);
    });

    it('sets scheduledDays to 0', () => {
      expect(result.card.scheduledDays).toBe(0);
    });

    it('schedules next review in 1 minute', () => {
      const expected = NOW.getTime() + 1 * ONE_MINUTE_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('does not change lapses', () => {
      expect(result.card.lapses).toBe(learningCard.lapses);
    });

    it('increments reps by 1', () => {
      expect(result.card.reps).toBe(learningCard.reps + 1);
    });
  });

  describe('Hard (rating = 2)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(learningCard, 2, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('computes new stability via FSRS recall formula', () => {
      expect(result.card.stability).toBeGreaterThan(0);
    });

    it('sets scheduledDays >= 1', () => {
      expect(result.card.scheduledDays).toBeGreaterThanOrEqual(1);
    });

    it('schedules next review in scheduledDays days', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });
  });

  describe('Good (rating = 3)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(learningCard, 3, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('sets scheduledDays = max(1, round(stability))', () => {
      expect(result.card.scheduledDays).toBe(
        Math.max(1, Math.round(result.card.stability))
      );
    });

    it('schedules next review based on scheduledDays', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });
  });

  describe('Easy (rating = 4)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(learningCard, 4, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('applies easy bonus factor (W[12]) to stability calculation', () => {
      expect(result.card.stability).toBeGreaterThan(0);
      expect(result.card.scheduledDays).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// schedule() — Relearning card
// ---------------------------------------------------------------------------

describe('schedule() — Relearning card', () => {
  const relearningCard: Card = {
    stability: 2,
    difficulty: 5.8,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 5,
    lapses: 1,
    state: 'Relearning',
    lastReview: new Date(NOW.getTime() - 5 * ONE_MINUTE_MS),
  };

  describe('Again (rating = 1)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(relearningCard, 1, NOW);
    });

    it('stays in Relearning state', () => {
      expect(result.card.state).toBe('Relearning');
    });

    it('reduces stability by half (min 0.1)', () => {
      const expected = Math.max(relearningCard.stability * 0.5, 0.1);
      expect(result.card.stability).toBeCloseTo(expected, 5);
    });

    it('sets scheduledDays to 0', () => {
      expect(result.card.scheduledDays).toBe(0);
    });

    it('schedules next review in 1 minute', () => {
      const expected = NOW.getTime() + 1 * ONE_MINUTE_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });

    it('does not increment lapses (only Review to Relearning does)', () => {
      expect(result.card.lapses).toBe(relearningCard.lapses);
    });
  });

  describe('Good (rating = 3)', () => {
    let result: ScheduleResult;

    beforeAll(() => {
      result = schedule(relearningCard, 3, NOW);
    });

    it('graduates to Review state', () => {
      expect(result.card.state).toBe('Review');
    });

    it('sets scheduledDays >= 1', () => {
      expect(result.card.scheduledDays).toBeGreaterThanOrEqual(1);
    });

    it('schedules next review in scheduledDays days', () => {
      const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
      expect(result.nextReview.getTime()).toBe(expected);
    });
  });

  describe('Hard/Good/Easy all graduate to Review', () => {
    it.each([2, 3, 4] as Rating[])('rating %d graduates to Review', (rating) => {
      const result = schedule(relearningCard, rating, NOW);
      expect(result.card.state).toBe('Review');
    });
  });
});

// ---------------------------------------------------------------------------
// schedule() — Learning/Relearning nextReview timing
// ---------------------------------------------------------------------------

describe('schedule() — Learning/Relearning nextReview timing', () => {
  const learningCard: Card = {
    stability: 0.4,
    difficulty: 6,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state: 'Learning',
    lastReview: NOW,
  };

  it('Again produces nextReview at now + 1 minute', () => {
    const result = schedule(learningCard, 1, NOW);
    expect(result.nextReview.getTime() - NOW.getTime()).toBe(1 * ONE_MINUTE_MS);
  });

  it('Hard graduates to Review so nextReview is day-based', () => {
    const result = schedule(learningCard, 2, NOW);
    expect(result.card.state).toBe('Review');
    const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
    expect(result.nextReview.getTime()).toBe(expected);
  });

  it('Relearning + Again produces nextReview at now + 1 minute', () => {
    const relearningCard: Card = {
      ...learningCard,
      state: 'Relearning',
      lapses: 1,
    };
    const result = schedule(relearningCard, 1, NOW);
    expect(result.card.state).toBe('Relearning');
    expect(result.nextReview.getTime() - NOW.getTime()).toBe(1 * ONE_MINUTE_MS);
  });
});

// ---------------------------------------------------------------------------
// schedule() — Review nextReview timing
// ---------------------------------------------------------------------------

describe('schedule() — Review nextReview timing', () => {
  const reviewCard: Card = {
    stability: 10,
    difficulty: 5,
    elapsedDays: 5,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    state: 'Review',
    lastReview: new Date(NOW.getTime() - 5 * ONE_DAY_MS),
  };

  it('Good produces nextReview = now + scheduledDays * 24h', () => {
    const result = schedule(reviewCard, 3, NOW);
    expect(result.card.state).toBe('Review');
    const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
    expect(result.nextReview.getTime()).toBe(expected);
  });

  it('Easy produces nextReview = now + scheduledDays * 24h', () => {
    const result = schedule(reviewCard, 4, NOW);
    expect(result.card.state).toBe('Review');
    const expected = NOW.getTime() + result.card.scheduledDays * ONE_DAY_MS;
    expect(result.nextReview.getTime()).toBe(expected);
  });

  it('Again falls back to Relearning timing (1 minute)', () => {
    const result = schedule(reviewCard, 1, NOW);
    expect(result.card.state).toBe('Relearning');
    expect(result.nextReview.getTime() - NOW.getTime()).toBe(1 * ONE_MINUTE_MS);
  });
});

// ---------------------------------------------------------------------------
// schedule() — elapsed days computation
// ---------------------------------------------------------------------------

describe('schedule() — elapsed days', () => {
  it('computes elapsed days from lastReview to now', () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * ONE_DAY_MS);
    const card: Card = {
      stability: 5,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 5,
      reps: 2,
      lapses: 0,
      state: 'Review',
      lastReview: threeDaysAgo,
    };
    const result = schedule(card, 3, NOW);
    expect(result.card.elapsedDays).toBeCloseTo(3, 5);
  });

  it('sets elapsed to 0 for New card (lastReview is null)', () => {
    const card = newCard();
    const result = schedule(card, 3, NOW);
    expect(result.card.elapsedDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// schedule() — stability floor (minimum 0.1)
// ---------------------------------------------------------------------------

describe('schedule() — stability floor', () => {
  it('does not let stability drop below 0.1 on repeated Again in Learning', () => {
    const card: Card = {
      stability: 0.15,
      difficulty: 7,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 2,
      lapses: 0,
      state: 'Learning',
      lastReview: NOW,
    };

    // First Again: 0.15 * 0.5 = 0.075 clamped to 0.1
    const result1 = schedule(card, 1, NOW);
    expect(result1.card.stability).toBe(0.1);

    // Second Again: 0.1 * 0.5 = 0.05 clamped to 0.1
    const result2 = schedule(result1.card, 1, NOW);
    expect(result2.card.stability).toBe(0.1);
  });

  it('does not let stability drop below 0.1 on Review lapse', () => {
    const card: Card = {
      stability: 0.3,
      difficulty: 5,
      elapsedDays: 1,
      scheduledDays: 1,
      reps: 3,
      lapses: 0,
      state: 'Review',
      lastReview: new Date(NOW.getTime() - ONE_DAY_MS),
    };
    // 0.3 * 0.2 = 0.06 clamped to 0.1
    const result = schedule(card, 1, NOW);
    expect(result.card.stability).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// schedule() — difficulty clamping
// ---------------------------------------------------------------------------

describe('schedule() — difficulty clamping [1, 10]', () => {
  it('clamps initial difficulty within [1, 10] for all ratings', () => {
    for (const rating of [1, 2, 3, 4] as Rating[]) {
      const result = schedule(newCard(), rating, NOW);
      expect(result.card.difficulty).toBeGreaterThanOrEqual(1);
      expect(result.card.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('clamps nextDifficulty to [1, 10] after many Easy reviews', () => {
    let card: Card = {
      stability: 10,
      difficulty: 2,
      elapsedDays: 5,
      scheduledDays: 10,
      reps: 5,
      lapses: 0,
      state: 'Review',
      lastReview: new Date(NOW.getTime() - 5 * ONE_DAY_MS),
    };

    let time = NOW;
    for (let i = 0; i < 20; i++) {
      const result = schedule(card, 4, time);
      expect(result.card.difficulty).toBeGreaterThanOrEqual(1);
      expect(result.card.difficulty).toBeLessThanOrEqual(10);
      card = result.card;
      time = result.nextReview;
    }
  });

  it('clamps nextDifficulty to [1, 10] after many Again reviews', () => {
    let card: Card = {
      stability: 10,
      difficulty: 8,
      elapsedDays: 5,
      scheduledDays: 10,
      reps: 5,
      lapses: 0,
      state: 'Review',
      lastReview: new Date(NOW.getTime() - 5 * ONE_DAY_MS),
    };

    let time = NOW;
    for (let i = 0; i < 10; i++) {
      const lapse = schedule(card, 1, time);
      expect(lapse.card.difficulty).toBeGreaterThanOrEqual(1);
      expect(lapse.card.difficulty).toBeLessThanOrEqual(10);

      const graduate = schedule(lapse.card, 3, lapse.nextReview);
      card = graduate.card;
      time = graduate.nextReview;
    }
  });
});

// ---------------------------------------------------------------------------
// schedule() — now defaults to current time
// ---------------------------------------------------------------------------

describe('schedule() — default now parameter', () => {
  it('uses current Date when now is not supplied', () => {
    const before = Date.now();
    const result = schedule(newCard(), 3);
    const after = Date.now();

    expect(result.card.lastReview!.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.card.lastReview!.getTime()).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// schedule() — immutability
// ---------------------------------------------------------------------------

describe('schedule() — immutability', () => {
  it('does not mutate the original New card object', () => {
    const card = newCard();
    const originalJson = JSON.stringify(card);
    schedule(card, 3, NOW);
    expect(JSON.stringify(card)).toBe(originalJson);
  });

  it('does not mutate the original Review card object', () => {
    const card: Card = {
      stability: 10,
      difficulty: 5,
      elapsedDays: 5,
      scheduledDays: 10,
      reps: 3,
      lapses: 0,
      state: 'Review',
      lastReview: new Date(NOW.getTime() - 5 * ONE_DAY_MS),
    };
    const originalJson = JSON.stringify(card);
    schedule(card, 1, NOW);
    expect(JSON.stringify(card)).toBe(originalJson);
  });
});

// ---------------------------------------------------------------------------
// schedule() — multi-step lifecycle
// ---------------------------------------------------------------------------

describe('schedule() — multi-step card lifecycle', () => {
  it('New -> Again -> Good -> Review cycle', () => {
    const step1 = schedule(newCard(), 1, NOW);
    expect(step1.card.state).toBe('Learning');
    expect(step1.card.reps).toBe(1);

    const step2 = schedule(step1.card, 3, step1.nextReview);
    expect(step2.card.state).toBe('Review');
    expect(step2.card.reps).toBe(2);
    expect(step2.card.scheduledDays).toBeGreaterThanOrEqual(1);

    const step3 = schedule(step2.card, 3, step2.nextReview);
    expect(step3.card.state).toBe('Review');
    expect(step3.card.reps).toBe(3);
  });

  it('New -> Good -> Again (lapse) -> Good (re-graduate) cycle', () => {
    const step1 = schedule(newCard(), 3, NOW);
    expect(step1.card.state).toBe('Review');

    const step2 = schedule(step1.card, 1, step1.nextReview);
    expect(step2.card.state).toBe('Relearning');
    expect(step2.card.lapses).toBe(1);

    const step3 = schedule(step2.card, 3, step2.nextReview);
    expect(step3.card.state).toBe('Review');
    expect(step3.card.lapses).toBe(1);
  });

  it('repeated lapses increment lapses counter each time from Review', () => {
    let card = newCard();
    let time = NOW;

    // New -> Good -> Review
    const s1 = schedule(card, 3, time);
    card = s1.card;
    time = s1.nextReview;

    // Lapse 1: Review -> Relearning
    const s2 = schedule(card, 1, time);
    expect(s2.card.lapses).toBe(1);

    // Re-graduate: Relearning -> Review
    const s3 = schedule(s2.card, 3, s2.nextReview);
    card = s3.card;
    time = s3.nextReview;

    // Lapse 2: Review -> Relearning
    const s4 = schedule(card, 1, time);
    expect(s4.card.lapses).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// previewSchedule()
// ---------------------------------------------------------------------------

describe('previewSchedule()', () => {
  it('returns a record with keys 1, 2, 3, 4', () => {
    const result = previewSchedule(newCard(), NOW);
    expect(result).toHaveProperty('1');
    expect(result).toHaveProperty('2');
    expect(result).toHaveProperty('3');
    expect(result).toHaveProperty('4');
  });

  describe('Chinese time format', () => {
    it('uses fen-zhong suffix for intervals < 60 minutes', () => {
      const result = previewSchedule(newCard(), NOW);
      expect(result[1]).toBe('1分钟');
    });

    it('uses tian suffix for intervals >= 24 hours', () => {
      const result = previewSchedule(newCard(), NOW);
      expect(result[3]).toBe('2天');
    });

    it('uses tian suffix for Easy on new card (6 days)', () => {
      const result = previewSchedule(newCard(), NOW);
      expect(result[4]).toBe('6天');
    });
  });

  describe('New card preview', () => {
    it('shows correct intervals for all four ratings', () => {
      const result = previewSchedule(newCard(), NOW);
      // Again: Learning -> 1 minute
      expect(result[1]).toBe('1分钟');
      // Hard: Review -> round(0.6) = 1 day
      expect(result[2]).toBe('1天');
      // Good: Review -> round(2.4) = 2 days
      expect(result[3]).toBe('2天');
      // Easy: Review -> round(5.8) = 6 days
      expect(result[4]).toBe('6天');
    });
  });

  describe('Learning card preview', () => {
    it('Again shows 1 fen-zhong (stays in Learning)', () => {
      const learningCard: Card = {
        stability: 0.4,
        difficulty: 6.81,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 1,
        lapses: 0,
        state: 'Learning',
        lastReview: NOW,
      };
      const result = previewSchedule(learningCard, NOW);
      expect(result[1]).toBe('1分钟');
    });
  });

  describe('Review card preview with large stability', () => {
    it('shows multi-day intervals for Good/Easy', () => {
      const reviewCard: Card = {
        stability: 30,
        difficulty: 5,
        elapsedDays: 15,
        scheduledDays: 30,
        reps: 8,
        lapses: 0,
        state: 'Review',
        lastReview: new Date(NOW.getTime() - 15 * ONE_DAY_MS),
      };
      const result = previewSchedule(reviewCard, NOW);

      // Again -> Relearning -> 1 minute
      expect(result[1]).toBe('1分钟');

      // Good/Easy -> Review -> days
      expect(result[3]).toMatch(/天$/);
      expect(result[4]).toMatch(/天$/);

      // With default parameters, ordering depends on W[11] and W[12]
      const goodDays = parseInt(result[3]);
      const easyDays = parseInt(result[4]);
      expect(goodDays).toBeGreaterThanOrEqual(1);
      expect(easyDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('format boundary: short Learning intervals', () => {
    it('shows fen-zhong for Again on a Learning card', () => {
      const learningCard: Card = {
        stability: 0.4,
        difficulty: 6,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 1,
        lapses: 0,
        state: 'Learning',
        lastReview: NOW,
      };
      const result = previewSchedule(learningCard, NOW);
      expect(result[1]).toBe('1分钟');
    });
  });

  it('uses current Date when now is not supplied', () => {
    const result = previewSchedule(newCard());
    expect(result[1]).toBeDefined();
    expect(result[2]).toBeDefined();
    expect(result[3]).toBeDefined();
    expect(result[4]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// FSRS parameter consistency
// ---------------------------------------------------------------------------

describe('FSRS parameter consistency', () => {
  it('initStability produces increasing values for higher ratings', () => {
    const stabilities = ([1, 2, 3, 4] as Rating[]).map((r) => {
      const result = schedule(newCard(), r, NOW);
      return result.card.stability;
    });
    expect(stabilities[0]).toBeLessThan(stabilities[1]);
    expect(stabilities[1]).toBeLessThan(stabilities[2]);
    expect(stabilities[2]).toBeLessThan(stabilities[3]);
  });

  it('initDifficulty produces decreasing values for higher ratings', () => {
    const difficulties = ([1, 2, 3, 4] as Rating[]).map((r) => {
      const result = schedule(newCard(), r, NOW);
      return result.card.difficulty;
    });
    expect(difficulties[0]).toBeGreaterThan(difficulties[1]);
    expect(difficulties[1]).toBeGreaterThan(difficulties[2]);
    expect(difficulties[2]).toBeGreaterThan(difficulties[3]);
  });
});
