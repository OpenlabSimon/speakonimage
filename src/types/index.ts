// Core TypeScript interfaces for SpeakOnImage
// 中译英口语练习应用

// CEFR Language Levels
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// Input methods
export type InputMethod = 'voice' | 'text';

// Topic types - 两种题型
export type TopicType = 'translation' | 'expression';

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Vocabulary item
export interface VocabularyItem {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  chinese: string;
  exampleContext: string;
  cefrLevel?: CEFRLevel;
}

// Grammar hint
export interface GrammarHint {
  point: string;
  explanation: string;
  pattern: string;
  example: string;
}

// ============================================
// Topic Generation Output - 两种题型
// ============================================

// 翻译挑战题目
export interface TranslationTopic {
  type: 'translation';
  chinesePrompt: string;        // 要翻译的中文内容
  difficulty: CEFRLevel;
  keyPoints: string[];          // 翻译要点提示
  suggestedVocab: VocabularyItem[];
}

// 话题表达题目
export interface ExpressionTopic {
  type: 'expression';
  chinesePrompt: string;        // 话题/场景中文描述
  guidingQuestions: string[];   // 引导问题（中文）
  suggestedVocab: VocabularyItem[];
  grammarHints: GrammarHint[];
}

// 统一题目类型
export type TopicContent = TranslationTopic | ExpressionTopic;

// Topic generation LLM output
export interface TopicGenerationOutput {
  topicContent: TopicContent;
  difficultyMetadata: DifficultyMetadata;
}

// Difficulty metadata
export interface DifficultyMetadata {
  targetCefr: CEFRLevel;
  vocabComplexity: number;
  grammarComplexity: number;
}

// Topic (full data for display)
export interface Topic {
  id: string;
  type: TopicType;
  originalInput: string;
  topicContent: TopicContent;
  difficultyMetadata?: DifficultyMetadata;
  createdAt: Date;
}

// ============================================
// Evaluation - 语义传达为核心
// ============================================

// Grammar error
export interface GrammarErrorItem {
  original: string;
  corrected: string;
  rule: string;
  severity: 'low' | 'medium' | 'high';
}

// 语义传达要点
export interface SemanticPoint {
  point: string;
  conveyed: boolean;
  comment?: string;
}

// 翻译挑战评价维度
export interface TranslationEvaluationScores {
  type: 'translation';
  semanticAccuracy: {
    score: number;
    conveyedPoints: SemanticPoint[];    // 正确传达的要点
    missedPoints: SemanticPoint[];      // 遗漏/错误的要点
    comment: string;
  };
  naturalness: {
    score: number;
    issues: string[];                    // 不地道的表达
    suggestions: string[];               // 更地道的建议
    comment: string;
  };
  grammar: {
    score: number;
    errors: GrammarErrorItem[];
  };
  vocabulary: {
    score: number;
    goodChoices: string[];               // 用词恰当之处
    improvements: string[];              // 可改进的用词
    comment: string;
  };
  overallCefrEstimate: CEFRLevel;
  betterExpressions: string[];           // 更好的表达方式
  suggestions: {
    immediate: string;
    longTerm: string;
  };
}

// 话题表达评价维度
export interface ExpressionEvaluationScores {
  type: 'expression';
  relevance: {
    score: number;
    comment: string;
  };
  depth: {
    score: number;
    strengths: string[];
    suggestions: string[];
    comment: string;
  };
  creativity: {
    score: number;
    highlights: string[];
    comment: string;
  };
  languageQuality: {
    score: number;
    grammarErrors: GrammarErrorItem[];
    vocabularyFeedback: string;
    comment: string;
  };
  overallCefrEstimate: CEFRLevel;
  betterExpressions: string[];           // 表达建议
  suggestions: {
    immediate: string;
    longTerm: string;
  };
}

// 统一评价类型
export type EvaluationScores = TranslationEvaluationScores | ExpressionEvaluationScores;

// History comparison
export interface HistoryComparison {
  attemptNumber: number;
  improvementNotes: string;
  persistentIssues: string[];
  progressTrend: 'improving' | 'stable' | 'declining';
}

// Suggestions from evaluation
export interface EvaluationSuggestions {
  betterExpressions: string[];   // 更好的表达方式示例
  immediate: string;             // 即时建议
  longTerm: string;              // 长期建议
}

// Full evaluation result
export interface EvaluationResult {
  evaluation: EvaluationScores;
  comparisonWithHistory?: HistoryComparison;
  suggestions: EvaluationSuggestions;
}

// Submission (user response)
export interface Submission {
  id: string;
  topicId: string;
  attemptNumber: number;
  inputMethod: InputMethod;
  transcribedText: string;
  rawAudioUrl?: string;
  evaluation: EvaluationResult;
  createdAt: Date;
}

// ============================================
// User Profile
// ============================================

// Speaker profile
export interface SpeakerProfile {
  id: string;
  label: string;
  estimatedCefr: CEFRLevel;
  lastActiveAt: Date;
}

// Language profile (stored in Speaker.languageProfile)
export interface LanguageProfile {
  estimatedCefr: CEFRLevel;
  confidence: number;
  lastUpdated: string;
  vocabularyProfile: {
    activeVocabSizeEstimate: number;
    favoriteWords: { word: string; frequency: number }[];
    vocabLevelDistribution: Record<CEFRLevel, number>;
    recentlyLearned: string[];
  };
  grammarProfile: {
    mastered: string[];
    developing: string[];
    persistentErrors: {
      pattern: string;
      example: string;
      occurrenceCount: number;
      lastOccurred: string;
      trend: 'improving' | 'stable' | 'increasing';
    }[];
  };
  expressionProfile: {
    avgSentenceLength: number;
    sentenceComplexityTrend: 'increasing' | 'stable' | 'decreasing';
    preferredStructures: string[];
    creativityScoreAvg: number;
  };
}

// ============================================
// Platform Abstractions
// ============================================

// LLM Provider interface
export interface LLMProvider {
  generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
}

// Audio recorder interface
export interface AudioRecorder {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  isSupported(): boolean;
  getWaveformData?(): Float32Array;
  getDuration?(): number;
}

// TTS interface
export interface TTSEngine {
  speak(text: string, lang?: string): void;
  stop(): void;
  isSupported(): boolean;
}

// ============================================
// Memory System Types (re-exported)
// ============================================

// Session types
export type SessionType = 'practice' | 'review';
export type SessionStatus = 'active' | 'ended';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'evaluation';

// Re-export memory types for convenience
export type {
  ChatSession,
  ChatMessage,
  SessionExtractionResult,
  ConversationContext,
  ExtractedVocabulary,
  ExtractedError,
} from '@/lib/memory/types';
