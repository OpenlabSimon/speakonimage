import { z } from 'zod';

// ============================================
// Shared schemas
// ============================================

const VocabularyItemSchema = z.object({
  word: z.string(),
  phonetic: z.string().describe('IPA phonetic notation'),
  partOfSpeech: z.string().describe('Part of speech: noun, verb, adj, adv, etc.'),
  chinese: z.string().describe('Chinese translation'),
  exampleContext: z.string().describe('Example usage in context'),
});

const GrammarHintSchema = z.object({
  point: z.string().describe('Grammar point name'),
  explanation: z.string().describe('Brief explanation in Chinese'),
  pattern: z.string().describe('Sentence pattern'),
  example: z.string().describe('Example sentence using this pattern'),
});

const DifficultyMetadataSchema = z.object({
  targetCefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  vocabComplexity: z.number().min(0).max(1),
  grammarComplexity: z.number().min(0).max(1),
});

// ============================================
// Translation Challenge Schema (翻译挑战)
// ============================================

export const TranslationTopicSchema = z.object({
  type: z.literal('translation'),
  chinesePrompt: z.string().describe('The Chinese content to be translated'),
  difficulty: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  keyPoints: z.array(z.string()).min(2).max(5).describe('Key semantic points to convey'),
  suggestedVocab: z.array(VocabularyItemSchema).min(3).max(6),
  difficultyMetadata: DifficultyMetadataSchema,
});

// ============================================
// Topic Expression Schema (话题表达)
// ============================================

export const ExpressionTopicSchema = z.object({
  type: z.literal('expression'),
  chinesePrompt: z.string().describe('Topic/scenario description in Chinese'),
  guidingQuestions: z.array(z.string()).min(2).max(4).describe('Guiding questions in Chinese'),
  suggestedVocab: z.array(VocabularyItemSchema).min(3).max(8),
  grammarHints: z.array(GrammarHintSchema).min(1).max(3),
  difficultyMetadata: DifficultyMetadataSchema,
});

// Union type for both topic types
export const TopicGenerationSchema = z.discriminatedUnion('type', [
  TranslationTopicSchema,
  ExpressionTopicSchema,
]);

export type TopicGenerationOutput = z.infer<typeof TopicGenerationSchema>;
export type TranslationTopicOutput = z.infer<typeof TranslationTopicSchema>;
export type ExpressionTopicOutput = z.infer<typeof ExpressionTopicSchema>;

// ============================================
// System Prompts
// ============================================

export const TRANSLATION_SYSTEM_PROMPT = `你是一位专业的英语教师，正在设计中译英练习题目。

你的任务是根据用户输入的内容或话题，生成一段适合翻译练习的中文内容。

设计原则：
1. 中文内容要自然、地道，符合实际使用场景
2. 内容难度要匹配目标CEFR等级
3. 提供关键语义要点（keyPoints），帮助评估学生是否准确传达了意思
4. 推荐的词汇要实用，包含IPA音标
5. 重点是语义传达，不要求逐字翻译

注意：同一中文可以有多种正确的英语表达方式，我们鼓励多样性。

请始终返回符合schema的有效JSON。`;

export const EXPRESSION_SYSTEM_PROMPT = `你是一位鼓励创意表达的英语教师，正在设计开放性话题表达练习。

你的任务是根据用户输入的内容或话题，设计一个话题表达练习。

设计原则：
1. 用中文描述一个有趣的话题或场景
2. 提供引导问题帮助学生思考要表达的内容
3. 推荐相关词汇，包含IPA音标和中文翻译
4. 提供可用的语法结构建议
5. 鼓励开放性、创意性表达，没有唯一正确答案

请始终返回符合schema的有效JSON。`;

// ============================================
// Unified Prompt (auto-detect type from input)
// ============================================

export const UNIFIED_SYSTEM_PROMPT = `你是一位专业的英语教师，正在根据用户输入自动设计合适的练习题目。

你需要分析用户输入的内容，判断适合哪种练习模式：

1. **翻译挑战 (translation)**：当用户输入的是完整的中文句子或段落时
   - 例如："昨天我在咖啡店遇到了一个老朋友"
   - 例如："如果明天下雨，我们就改天再去"

2. **话题表达 (expression)**：当用户输入的是话题关键词、学习目标、或非完整句子时
   - 例如："周末计划"、"旅行经历"
   - 例如："我想练习雅思口语"、"帮我练习商务英语"

当无法明确判断时，默认使用话题表达 (expression) 模式。

设计原则：
- 内容难度要匹配目标CEFR等级
- 词汇要实用，包含IPA音标
- 翻译挑战重点是语义传达，不要求逐字翻译
- 话题表达鼓励开放性、创意性表达

请始终返回符合schema的有效JSON。type字段必须是 "translation" 或 "expression"。`;

/**
 * Build prompt for unified (auto-detect) mode
 */
export function buildUnifiedPrompt(
  userInput: string,
  targetCefr: string = 'B1'
): string {
  return `根据以下用户输入，自动判断合适的练习类型并生成题目：

用户输入: "${userInput}"
目标CEFR等级: ${targetCefr}

请先判断输入类型：
- 如果是完整的中文句子/段落 → type: "translation"
- 如果是话题关键词/学习目标/非完整句子 → type: "expression"
- 不确定时默认 → type: "expression"

根据判断结果，生成对应格式的JSON：

**如果 type 为 "translation"：**
1. type: "translation"
2. chinesePrompt: 要翻译的中文内容（如果用户已输入完整句子，可直接使用或适当扩展）
3. difficulty: CEFR等级
4. keyPoints: 关键语义要点数组（2-5个）
5. suggestedVocab: 推荐词汇数组（3-6个，含word/phonetic/partOfSpeech/chinese/exampleContext）
6. difficultyMetadata: { targetCefr, vocabComplexity, grammarComplexity }

**如果 type 为 "expression"：**
1. type: "expression"
2. chinesePrompt: 话题/场景描述（中文）
3. guidingQuestions: 引导问题数组（2-4个中文问题）
4. suggestedVocab: 推荐词汇数组（3-8个，含word/phonetic/partOfSpeech/chinese/exampleContext）
5. grammarHints: 语法提示数组（1-3个，含point/explanation/pattern/example）
6. difficultyMetadata: { targetCefr, vocabComplexity, grammarComplexity }

只返回有效JSON，不要markdown格式。`;
}

// ============================================
// Prompt Builders
// ============================================

/**
 * Build prompt for translation challenge
 */
export function buildTranslationPrompt(
  userInput: string,
  targetCefr: string = 'B1'
): string {
  return `根据以下输入，生成一道中译英翻译挑战题：

用户输入: "${userInput}"
目标CEFR等级: ${targetCefr}

生成JSON格式的题目，包含：
1. type: "translation"
2. chinesePrompt: 要翻译的中文内容（2-4句话，内容要围绕用户输入的话题）
3. difficulty: CEFR等级
4. keyPoints: 关键语义要点数组（2-5个），用于评估学生是否传达了核心意思
   - 例如："表达时间紧迫感"、"提到具体地点"、"表达个人感受"
5. suggestedVocab: 推荐词汇数组（3-6个），每个包含：
   - word: 英文单词
   - phonetic: IPA音标（如 "/ɪkˈsaɪtɪŋ/"）
   - partOfSpeech: 词性
   - chinese: 中文翻译
   - exampleContext: 用法示例
6. difficultyMetadata:
   - targetCefr: 目标等级
   - vocabComplexity: 0-1分数
   - grammarComplexity: 0-1分数

只返回有效JSON，不要markdown格式。`;
}

/**
 * Build prompt for topic expression
 */
export function buildExpressionPrompt(
  userInput: string,
  targetCefr: string = 'B1'
): string {
  return `根据以下输入，生成一道话题表达练习题：

用户输入: "${userInput}"
目标CEFR等级: ${targetCefr}

生成JSON格式的题目，包含：
1. type: "expression"
2. chinesePrompt: 话题/场景描述（中文，2-3句话，描述一个有趣的情境或话题）
3. guidingQuestions: 引导问题数组（2-4个中文问题，帮助学生思考要说什么）
   - 例如："你觉得这件事有什么好处？"、"你会如何向朋友描述这个经历？"
4. suggestedVocab: 推荐词汇数组（3-8个），每个包含：
   - word: 英文单词
   - phonetic: IPA音标
   - partOfSpeech: 词性
   - chinese: 中文翻译
   - exampleContext: 用法示例
5. grammarHints: 语法提示数组（1-3个），每个包含：
   - point: 语法点名称
   - explanation: 中文解释
   - pattern: 句型模式
   - example: 例句
6. difficultyMetadata:
   - targetCefr: 目标等级
   - vocabComplexity: 0-1分数
   - grammarComplexity: 0-1分数

只返回有效JSON，不要markdown格式。`;
}

/**
 * Get the appropriate schema for validation based on topic type
 */
export function getSchemaForType(type: 'translation' | 'expression') {
  return type === 'translation' ? TranslationTopicSchema : ExpressionTopicSchema;
}

/**
 * Get the appropriate system prompt based on topic type
 */
export function getSystemPromptForType(type: 'translation' | 'expression') {
  return type === 'translation' ? TRANSLATION_SYSTEM_PROMPT : EXPRESSION_SYSTEM_PROMPT;
}

/**
 * Build the appropriate prompt based on topic type
 */
export function buildTopicPrompt(
  type: 'translation' | 'expression',
  userInput: string,
  targetCefr: string = 'B1'
): string {
  return type === 'translation'
    ? buildTranslationPrompt(userInput, targetCefr)
    : buildExpressionPrompt(userInput, targetCefr);
}
