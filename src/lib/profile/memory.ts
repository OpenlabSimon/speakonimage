import type { CEFRLevel } from '@/types';
import type { ChatMessage, SessionExtractionResult } from '@/lib/memory/types';

export type InterestSource =
  | 'topic_input'
  | 'session_topic'
  | 'submission'
  | 'coach_review'
  | 'manual';

export interface InterestSignal {
  key: string;
  label: string;
  source: InterestSource;
  strength: number;
  evidenceCount: number;
  lastSeenAt: string;
}

export interface GoalSignal {
  key: string;
  label: string;
  strength: number;
  lastSeenAt: string;
}

export interface EntitySignal {
  key: string;
  label: string;
  type: 'product' | 'tool' | 'company' | 'person' | 'topic';
  strength: number;
  lastSeenAt: string;
}

export interface VocabularyMemory {
  word: string;
  context: string;
  mastery: 'new' | 'developing' | 'mastered';
  cefrLevel?: CEFRLevel;
  lastSeenAt: string;
}

export interface MemorySnippet {
  id: string;
  kind: 'user_output' | 'coach_feedback';
  summary: string;
  createdAt: string;
  tags: string[];
}

export interface CoachReminder {
  id: string;
  scope: 'long_term' | 'current_round';
  text: string;
  source: 'coach_review' | 'goal' | 'grammar_pattern';
  createdAt: string;
  relatedPatterns: string[];
}

export interface PracticeRecommendation {
  id: string;
  kind: 'topic' | 'vocabulary' | 'example';
  title: string;
  detail: string;
  reason: string;
  relatedInterestKeys: string[];
}

export interface RecommendationProfile {
  topics: PracticeRecommendation[];
  vocabulary: PracticeRecommendation[];
  examples: PracticeRecommendation[];
  nextFocus: string[];
  generatedAt: string;
}

export interface RecommendationFeedbackEntry {
  id: string;
  recommendationId: string;
  recommendationKind: PracticeRecommendation['kind'];
  recommendationTitle: string;
  sentiment: 'helpful' | 'too_easy' | 'too_hard' | 'good_direction_not_now' | 'off_topic';
  relatedInterestKeys: string[];
  createdAt: string;
}

export interface CoachMemoryProfile {
  longTermReminders: CoachReminder[];
  currentRoundReminders: CoachReminder[];
}

export interface PersistedProfileSignals {
  interests: InterestSignal[];
  goals: GoalSignal[];
  entities: EntitySignal[];
  recentVocabulary: VocabularyMemory[];
  memorySnippets: MemorySnippet[];
  currentRoundReminders: CoachReminder[];
  recommendations: RecommendationProfile;
  recommendationFeedback: RecommendationFeedbackEntry[];
  hiddenInterestKeys: string[];
}

interface MergeSessionSignalsInput {
  existingProfile: unknown;
  extraction: SessionExtractionResult;
  messages: ChatMessage[];
  topicInput?: string | null;
}

interface RecommendationInput {
  interests: InterestSignal[];
  goals: GoalSignal[];
  recentVocabulary: VocabularyMemory[];
  weakWords: Array<{ word: string; incorrect: number; correct: number }>;
  topErrors: Array<{ pattern: string; correctedText?: string }>;
}

const MAX_INTERESTS = 8;
const MAX_GOALS = 6;
const MAX_ENTITIES = 8;
const MAX_RECENT_VOCAB = 8;
const MAX_MEMORY_SNIPPETS = 8;
const MAX_RECOMMENDATIONS = 3;
const MAX_ROUND_REMINDERS = 4;
const MAX_FEEDBACK_ENTRIES = 16;

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`"'“”‘’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function trimSummary(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseInterestSignals(value: unknown): InterestSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      label: typeof item.label === 'string' ? item.label : '',
      source: typeof item.source === 'string' ? item.source as InterestSource : 'manual',
      strength: typeof item.strength === 'number' ? item.strength : 0,
      evidenceCount: typeof item.evidenceCount === 'number' ? item.evidenceCount : 1,
      lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : new Date(0).toISOString(),
    }))
    .filter((item) => item.key && item.label);
}

function parseGoalSignals(value: unknown): GoalSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      label: typeof item.label === 'string' ? item.label : '',
      strength: typeof item.strength === 'number' ? item.strength : 0,
      lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : new Date(0).toISOString(),
    }))
    .filter((item) => item.key && item.label);
}

function parseEntitySignals(value: unknown): EntitySignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      label: typeof item.label === 'string' ? item.label : '',
      type: typeof item.type === 'string' ? item.type as EntitySignal['type'] : 'topic',
      strength: typeof item.strength === 'number' ? item.strength : 0,
      lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : new Date(0).toISOString(),
    }))
    .filter((item) => item.key && item.label);
}

function parseVocabularyMemories(value: unknown): VocabularyMemory[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const mastery: VocabularyMemory['mastery'] =
        item.mastery === 'new' || item.mastery === 'developing' || item.mastery === 'mastered'
          ? item.mastery
          : 'new';

      return {
        word: typeof item.word === 'string' ? item.word : '',
        context: typeof item.context === 'string' ? item.context : '',
        mastery,
        cefrLevel: typeof item.cefrLevel === 'string' ? item.cefrLevel as CEFRLevel : undefined,
        lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : new Date(0).toISOString(),
      };
    })
    .filter((item) => item.word);
}

function parseMemorySnippets(value: unknown): MemorySnippet[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const kind: MemorySnippet['kind'] =
        item.kind === 'coach_feedback' ? 'coach_feedback' : 'user_output';

      return {
        id: typeof item.id === 'string' ? item.id : '',
        kind,
        summary: typeof item.summary === 'string' ? item.summary : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      };
    })
    .filter((item) => item.id && item.summary);
}

function parseCoachReminders(value: unknown): CoachReminder[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const scope: CoachReminder['scope'] =
        item.scope === 'long_term' ? 'long_term' : 'current_round';
      const source: CoachReminder['source'] =
        item.source === 'goal' || item.source === 'grammar_pattern' ? item.source : 'coach_review';

      return {
        id: typeof item.id === 'string' ? item.id : '',
        scope,
        text: typeof item.text === 'string' ? item.text : '',
        source,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        relatedPatterns: Array.isArray(item.relatedPatterns)
          ? item.relatedPatterns.filter((pattern): pattern is string => typeof pattern === 'string')
          : [],
      };
    })
    .filter((item) => item.id && item.text);
}

function emptyRecommendations(): RecommendationProfile {
  return {
    topics: [],
    vocabulary: [],
    examples: [],
    nextFocus: [],
    generatedAt: new Date(0).toISOString(),
  };
}

function parseRecommendations(value: unknown): RecommendationProfile {
  if (!isRecord(value)) return emptyRecommendations();

  const parseItems = (items: unknown, kind: PracticeRecommendation['kind']) =>
    Array.isArray(items)
      ? items
          .filter(isRecord)
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : '',
            kind,
            title: typeof item.title === 'string' ? item.title : '',
            detail: typeof item.detail === 'string' ? item.detail : '',
            reason: typeof item.reason === 'string' ? item.reason : '',
            relatedInterestKeys: Array.isArray(item.relatedInterestKeys)
              ? item.relatedInterestKeys.filter((key): key is string => typeof key === 'string')
              : [],
          }))
          .filter((item) => item.id && item.title)
      : [];

  return {
    topics: parseItems(value.topics, 'topic'),
    vocabulary: parseItems(value.vocabulary, 'vocabulary'),
    examples: parseItems(value.examples, 'example'),
    nextFocus: Array.isArray(value.nextFocus)
      ? value.nextFocus.filter((item): item is string => typeof item === 'string')
      : [],
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date(0).toISOString(),
  };
}

function parseRecommendationFeedback(value: unknown): RecommendationFeedbackEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const sentiment: RecommendationFeedbackEntry['sentiment'] =
        item.sentiment === 'too_easy' ||
        item.sentiment === 'too_hard' ||
        item.sentiment === 'good_direction_not_now' ||
        item.sentiment === 'off_topic'
          ? item.sentiment
          : 'helpful';
      const recommendationKind: RecommendationFeedbackEntry['recommendationKind'] =
        item.recommendationKind === 'vocabulary' || item.recommendationKind === 'example'
          ? item.recommendationKind
          : 'topic';

      return {
        id: typeof item.id === 'string' ? item.id : '',
        recommendationId: typeof item.recommendationId === 'string' ? item.recommendationId : '',
        recommendationKind,
        recommendationTitle: typeof item.recommendationTitle === 'string' ? item.recommendationTitle : '',
        sentiment,
        relatedInterestKeys: Array.isArray(item.relatedInterestKeys)
          ? item.relatedInterestKeys.filter((key): key is string => typeof key === 'string')
          : [],
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      };
    })
    .filter((item) => item.id && item.recommendationId);
}

export function getPersistedProfileSignals(profile: unknown): PersistedProfileSignals {
  const record = isRecord(profile) ? profile : {};
  const hiddenInterestKeys = Array.isArray(record.hiddenInterestKeys)
    ? record.hiddenInterestKeys.filter((item): item is string => typeof item === 'string')
    : [];
  const visibleInterests = parseInterestSignals(record.interests).filter(
    (item) => !hiddenInterestKeys.includes(item.key)
  );

  return {
    interests: visibleInterests,
    goals: parseGoalSignals(record.goals),
    entities: parseEntitySignals(record.entities),
    recentVocabulary: parseVocabularyMemories(record.recentVocabulary),
    memorySnippets: parseMemorySnippets(record.memorySnippets),
    currentRoundReminders: parseCoachReminders(record.currentRoundReminders),
    recommendations: parseRecommendations(record.recommendations),
    recommendationFeedback: parseRecommendationFeedback(record.recommendationFeedback),
    hiddenInterestKeys,
  };
}

function mergeScoredItems<T extends { key: string; label: string; strength: number; lastSeenAt: string }>(
  existing: T[],
  incoming: T[],
  limit: number,
  mergeExtra?: (current: T, next: T) => T
): T[] {
  const merged = new Map(existing.map((item) => [item.key, item]));

  for (const item of incoming) {
    const current = merged.get(item.key);
    if (!current) {
      merged.set(item.key, item);
      continue;
    }

    const combined = {
      ...current,
      ...item,
      strength: Math.min(5, current.strength + item.strength),
      lastSeenAt: new Date(current.lastSeenAt) > new Date(item.lastSeenAt)
        ? current.lastSeenAt
        : item.lastSeenAt,
    };
    merged.set(item.key, mergeExtra ? mergeExtra(combined as T, item) : combined as T);
  }

  return Array.from(merged.values())
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    })
    .slice(0, limit);
}

function mergeInterestSignals(existing: InterestSignal[], incoming: InterestSignal[]): InterestSignal[] {
  return mergeScoredItems(existing, incoming, MAX_INTERESTS, (current, next) => ({
    ...current,
    source: current.source,
    evidenceCount: Math.max(current.evidenceCount, 0) + Math.max(next.evidenceCount, 1),
  }));
}

function mergeEntities(existing: EntitySignal[], incoming: EntitySignal[]): EntitySignal[] {
  return mergeScoredItems(existing, incoming, MAX_ENTITIES);
}

function mergeGoals(existing: GoalSignal[], incoming: GoalSignal[]): GoalSignal[] {
  return mergeScoredItems(existing, incoming, MAX_GOALS);
}

function mergeVocabulary(existing: VocabularyMemory[], incoming: VocabularyMemory[]): VocabularyMemory[] {
  const merged = new Map(existing.map((item) => [normalizeKey(item.word), item]));

  for (const item of incoming) {
    const key = normalizeKey(item.word);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }

    const rank = { new: 1, developing: 2, mastered: 3 };
    merged.set(key, {
      ...current,
      context: item.context || current.context,
      mastery: rank[item.mastery] >= rank[current.mastery] ? item.mastery : current.mastery,
      cefrLevel: item.cefrLevel || current.cefrLevel,
      lastSeenAt: new Date(current.lastSeenAt) > new Date(item.lastSeenAt)
        ? current.lastSeenAt
        : item.lastSeenAt,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, MAX_RECENT_VOCAB);
}

function mergeMemorySnippets(existing: MemorySnippet[], incoming: MemorySnippet[]): MemorySnippet[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_MEMORY_SNIPPETS);
}

function mergeCurrentRoundReminders(existing: CoachReminder[], incoming: CoachReminder[]): CoachReminder[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ROUND_REMINDERS);
}

function extractEntityLabels(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9.+-]{1,24}\b/g) ?? [];
  return uniqueStrings(
    matches.filter((match) => !['I', 'The', 'And', 'But', 'Score'].includes(match))
  );
}

function buildSnippetId(message: ChatMessage, fallback: string) {
  return message.id || `${message.role}-${fallback}`;
}

export function mergeSessionSignalsIntoProfile({
  existingProfile,
  extraction,
  messages,
  topicInput,
}: MergeSessionSignalsInput): Record<string, unknown> {
  const current = isRecord(existingProfile) ? existingProfile : {};
  const persisted = getPersistedProfileSignals(existingProfile);
  const now = new Date().toISOString();

  const interestSignals: InterestSignal[] = [];
  if (topicInput && topicInput.trim().length > 0) {
    interestSignals.push({
      key: normalizeKey(topicInput),
      label: topicInput.trim(),
      source: 'topic_input',
      strength: 1.1,
      evidenceCount: 1,
      lastSeenAt: now,
    });
  }

  for (const topic of extraction.topicsDiscussed) {
    const label = topic.trim();
    if (!label) continue;
    interestSignals.push({
      key: normalizeKey(label),
      label,
      source: 'session_topic',
      strength: 1.2,
      evidenceCount: 1,
      lastSeenAt: now,
    });
  }

  const goalSignals: GoalSignal[] = extraction.suggestedFocusNext
    .map((focus) => focus.trim())
    .filter(Boolean)
    .map((focus) => ({
      key: normalizeKey(focus),
      label: focus,
      strength: 1.1,
      lastSeenAt: now,
    }));

  const entitySignals: EntitySignal[] = uniqueStrings([
    ...(topicInput ? extractEntityLabels(topicInput) : []),
    ...messages.flatMap((message) => extractEntityLabels(message.content)),
  ]).map((label) => ({
    key: normalizeKey(label),
    label,
    type: /AI|GPT|Claude|Gemini|OpenClaw|YouTube|iPhone/i.test(label) ? 'tool' : 'topic',
    strength: 1,
    lastSeenAt: now,
  }));

  const recentVocabulary = extraction.newVocabulary.map((item) => ({
    word: item.word,
    context: trimSummary(item.context, 180),
    mastery: item.mastery,
    cefrLevel: item.cefrLevel,
    lastSeenAt: now,
  }));

  const tags = uniqueStrings([
    ...interestSignals.map((item) => item.label),
    ...goalSignals.map((item) => item.label),
  ]).slice(0, 3);

  const userMemorySnippets = messages
    .filter((message) => message.role === 'user' && message.content.trim().length > 0)
    .slice(-2)
    .map((message, index) => ({
      id: buildSnippetId(message, `user-${index}`),
      kind: 'user_output' as const,
      summary: trimSummary(message.content, 180),
      createdAt: message.createdAt.toISOString(),
      tags,
    }));

  const coachMemorySnippets = messages
    .filter(
      (message) =>
        message.role === 'assistant' &&
        (message.metadata?.kind === 'coach_review' || message.contentType === 'evaluation') &&
        message.content.trim().length > 0
    )
    .slice(-2)
    .map((message, index) => ({
      id: buildSnippetId(message, `coach-${index}`),
      kind: 'coach_feedback' as const,
      summary: trimSummary(message.content, 220),
      createdAt: message.createdAt.toISOString(),
      tags,
    }));

  const currentRoundReminders: CoachReminder[] = [
    ...extraction.suggestedFocusNext.slice(0, 3).map((focus) => ({
      id: `round-goal-${normalizeKey(focus)}`,
      scope: 'current_round' as const,
      text: focus,
      source: 'goal' as const,
      createdAt: now,
      relatedPatterns: [normalizeKey(focus)],
    })),
    ...coachMemorySnippets.slice(0, 1).map((snippet) => ({
      id: `round-coach-${normalizeKey(snippet.summary)}`,
      scope: 'current_round' as const,
      text: snippet.summary,
      source: 'coach_review' as const,
      createdAt: snippet.createdAt,
      relatedPatterns: snippet.tags.map(normalizeKey),
    })),
  ];

  const mergedInterests = mergeInterestSignals(persisted.interests, interestSignals).filter(
    (item) => !persisted.hiddenInterestKeys.includes(item.key)
  );

  return {
    ...current,
    interests: mergedInterests,
    goals: mergeGoals(persisted.goals, goalSignals),
    entities: mergeEntities(persisted.entities, entitySignals),
    recentVocabulary: mergeVocabulary(persisted.recentVocabulary, recentVocabulary),
    memorySnippets: mergeMemorySnippets(persisted.memorySnippets, [
      ...userMemorySnippets,
      ...coachMemorySnippets,
    ]),
    currentRoundReminders: mergeCurrentRoundReminders(
      persisted.currentRoundReminders,
      currentRoundReminders
    ),
    recommendationFeedback: persisted.recommendationFeedback,
    hiddenInterestKeys: persisted.hiddenInterestKeys,
  };
}

export function applyInterestFeedback(
  existingProfile: unknown,
  labels: string[]
): Record<string, unknown> {
  const current = isRecord(existingProfile) ? existingProfile : {};
  const persisted = getPersistedProfileSignals(existingProfile);
  const now = new Date().toISOString();
  const nextKeys = uniqueStrings(labels)
    .map((label) => ({ key: normalizeKey(label), label: label.trim() }))
    .filter((item) => item.key && item.label);

  const nextKeySet = new Set(nextKeys.map((item) => item.key));
  const visibleExisting = persisted.interests;
  const hiddenInterestKeys = uniqueStrings([
    ...persisted.hiddenInterestKeys,
    ...visibleExisting
      .filter((interest) => !nextKeySet.has(interest.key))
      .map((interest) => interest.key),
  ]).filter((key) => !nextKeySet.has(key));

  const preservedExisting = visibleExisting.filter(
    (interest) => nextKeySet.has(interest.key) && interest.source !== 'manual'
  );
  const preservedKeySet = new Set(preservedExisting.map((interest) => interest.key));
  const manualInterests: InterestSignal[] = nextKeys
    .filter((item) => !preservedKeySet.has(item.key))
    .map((item) => ({
      key: item.key,
      label: item.label,
      source: 'manual',
      strength: 3,
      evidenceCount: 1,
      lastSeenAt: now,
    }));

  return {
    ...current,
    interests: [...preservedExisting, ...manualInterests]
      .sort((a, b) => {
        if (b.strength !== a.strength) return b.strength - a.strength;
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      })
      .slice(0, MAX_INTERESTS),
    hiddenInterestKeys,
  };
}

export function applyRecommendationFeedback(
  existingProfile: unknown,
  input: {
    recommendationId: string;
    recommendationKind: PracticeRecommendation['kind'];
    recommendationTitle: string;
    sentiment: RecommendationFeedbackEntry['sentiment'];
    relatedInterestKeys: string[];
  }
): Record<string, unknown> {
  const current = isRecord(existingProfile) ? existingProfile : {};
  const persisted = getPersistedProfileSignals(existingProfile);
  const now = new Date().toISOString();

  const feedbackEntry: RecommendationFeedbackEntry = {
    id: `feedback-${input.recommendationId}`,
    recommendationId: input.recommendationId,
    recommendationKind: input.recommendationKind,
    recommendationTitle: input.recommendationTitle,
    sentiment: input.sentiment,
    relatedInterestKeys: input.relatedInterestKeys,
    createdAt: now,
  };

  const feedbackMap = new Map(
    persisted.recommendationFeedback.map((entry) => [entry.recommendationId, entry])
  );
  feedbackMap.set(input.recommendationId, feedbackEntry);

  const updatedInterests = persisted.interests.map((interest) => {
    if (!input.relatedInterestKeys.includes(interest.key)) {
      return interest;
    }

    const strengthDelta = (() => {
      switch (input.sentiment) {
        case 'helpful':
          return 0.7;
        case 'too_easy':
        case 'too_hard':
          return 0.2;
        case 'good_direction_not_now':
          return 0.4;
        case 'off_topic':
          return interest.source === 'manual' ? -0.2 : -0.8;
      }
    })();

    return {
      ...interest,
      strength: Math.min(5, Math.max(0.3, interest.strength + strengthDelta)),
      evidenceCount: input.sentiment === 'helpful' || input.sentiment === 'good_direction_not_now'
        ? interest.evidenceCount + 1
        : interest.evidenceCount,
      lastSeenAt: now,
    };
  });

  return {
    ...current,
    interests: updatedInterests
      .sort((a, b) => {
        if (b.strength !== a.strength) return b.strength - a.strength;
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      })
      .slice(0, MAX_INTERESTS),
    recommendationFeedback: Array.from(feedbackMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_FEEDBACK_ENTRIES),
    hiddenInterestKeys: persisted.hiddenInterestKeys,
    currentRoundReminders: persisted.currentRoundReminders,
  };
}

function buildTopicRecommendation(
  interest: InterestSignal,
  focus: string | undefined,
  index: number
): PracticeRecommendation {
  const focusPrefix = focus ? `重点顺便练 ${focus}` : '保持这个兴趣的表达流畅度';
  return {
    id: `topic-${interest.key}-${index}`,
    kind: 'topic',
    title: `围绕「${interest.label}」继续开口`,
    detail: focus
      ? `试着用自己的经历聊聊 ${interest.label}，同时刻意练习 ${focus}。`
      : `试着描述你最近为什么关注 ${interest.label}，并补充一个具体经历。`,
    reason: `你最近多次提到这个话题，${focusPrefix} 会更容易坚持。`,
    relatedInterestKeys: [interest.key],
  };
}

function buildVocabularyRecommendation(
  word: string,
  reason: string,
  interestKey?: string
): PracticeRecommendation {
  return {
    id: `vocab-${normalizeKey(word)}`,
    kind: 'vocabulary',
    title: word,
    detail: `下次练习时主动把 "${word}" 用进一句完整表达里。`,
    reason,
    relatedInterestKeys: interestKey ? [interestKey] : [],
  };
}

function buildExampleRecommendation(
  id: string,
  title: string,
  detail: string,
  reason: string,
  relatedInterestKeys: string[] = []
): PracticeRecommendation {
  return {
    id,
    kind: 'example',
    title,
    detail,
    reason,
    relatedInterestKeys,
  };
}

export function buildRecommendations({
  interests,
  goals,
  recentVocabulary,
  weakWords,
  topErrors,
}: RecommendationInput): RecommendationProfile {
  const nextFocus = uniqueStrings(
    goals
      .sort((a, b) => b.strength - a.strength)
      .map((goal) => goal.label)
      .concat(topErrors.map((error) => error.pattern))
  ).slice(0, 4);

  const topics = interests
    .slice(0, MAX_RECOMMENDATIONS)
    .map((interest, index) => buildTopicRecommendation(interest, nextFocus[index], index));

  const vocabulary = [
    ...weakWords.slice(0, 2).map((item) =>
      buildVocabularyRecommendation(
        item.word,
        `你最近在这个词上错误 ${item.incorrect} 次，适合重点复练。`
      )
    ),
    ...recentVocabulary
      .filter((item) => !weakWords.some((word) => normalizeKey(word.word) === normalizeKey(item.word)))
      .slice(0, 2)
      .map((item) =>
        buildVocabularyRecommendation(
          item.word,
          item.mastery === 'mastered'
            ? '这是你最近掌握得不错的词，值得继续扩展搭配。'
            : '这是你最近刚碰到的新词，趁还新鲜赶紧复用。'
        )
      ),
  ].slice(0, MAX_RECOMMENDATIONS);

  const exampleCandidates: PracticeRecommendation[] = [];

  for (const item of recentVocabulary) {
    if (!item.context) continue;
    exampleCandidates.push(
      buildExampleRecommendation(
        `example-${normalizeKey(item.word)}`,
        item.word,
        item.context,
        item.mastery === 'mastered' ? '继续复用这个表达，形成稳定输出。' : '把这个新词放回真实语境里复述一遍。'
      )
    );
  }

  for (const error of topErrors) {
    if (!error.correctedText) continue;
    exampleCandidates.push(
      buildExampleRecommendation(
        `correction-${normalizeKey(error.pattern)}`,
        error.pattern,
        error.correctedText,
        '这是你最近最值得直接模仿的一句修正版本。'
      )
    );
  }

  return {
    topics,
    vocabulary,
    examples: exampleCandidates.slice(0, MAX_RECOMMENDATIONS),
    nextFocus,
    generatedAt: new Date().toISOString(),
  };
}

export function buildCoachMemory(params: {
  goals: GoalSignal[];
  topErrors: Array<{ pattern: string; correctedText?: string }>;
  currentRoundReminders: CoachReminder[];
}): CoachMemoryProfile {
  const now = new Date().toISOString();
  const longTermReminders: CoachReminder[] = [
    ...params.goals.slice(0, 2).map((goal) => ({
      id: `long-goal-${goal.key}`,
      scope: 'long_term' as const,
      text: goal.label,
      source: 'goal' as const,
      createdAt: goal.lastSeenAt,
      relatedPatterns: [goal.key],
    })),
    ...params.topErrors
      .filter((error) => error.correctedText || error.pattern)
      .slice(0, 2)
      .map((error) => ({
        id: `long-error-${normalizeKey(error.pattern)}`,
        scope: 'long_term' as const,
        text: error.correctedText
          ? `持续注意 ${error.pattern}。可以参考：${error.correctedText}`
          : `持续注意 ${error.pattern}`,
        source: 'grammar_pattern' as const,
        createdAt: now,
        relatedPatterns: [normalizeKey(error.pattern)],
      })),
  ];

  return {
    longTermReminders: longTermReminders.slice(0, MAX_ROUND_REMINDERS),
    currentRoundReminders: params.currentRoundReminders.slice(0, MAX_ROUND_REMINDERS),
  };
}

export function buildTopicPersonalizationContext(profile: unknown): string | null {
  const persisted = getPersistedProfileSignals(profile);
  const sections: string[] = [];

  if (persisted.interests.length > 0) {
    sections.push(`用户最近高频关注的话题：${persisted.interests.slice(0, 4).map((item) => item.label).join('、')}`);
  }

  if (persisted.goals.length > 0) {
    sections.push(`用户当前最该练的方向：${persisted.goals.slice(0, 3).map((item) => item.label).join('；')}`);
  }

  if (persisted.recentVocabulary.length > 0) {
    sections.push(`最近接触或值得复练的词：${persisted.recentVocabulary.slice(0, 4).map((item) => item.word).join(', ')}`);
  }

  return sections.length > 0 ? sections.join('\n') : null;
}
