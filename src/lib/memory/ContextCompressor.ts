// ContextCompressor - compress long conversations into summaries

import { getLLMProvider } from '@/lib/llm';
import { z } from 'zod';
import type { ChatMessage } from './types';

// Compression result schema
const CompressionResultSchema = z.object({
  summary: z.string().describe('A concise summary of the conversation'),
  keyPoints: z.array(z.string()).describe('Key learning points from the conversation'),
  mainTopics: z.array(z.string()).describe('Main topics discussed'),
  notableErrors: z.array(z.string()).describe('Notable errors made by the user'),
  vocabulary: z.array(z.string()).describe('Key vocabulary used or introduced'),
});

export type CompressionResult = z.infer<typeof CompressionResultSchema>;

// Token estimation (approximate: ~4 chars per token for English)
const CHARS_PER_TOKEN = 4;

/**
 * Estimate tokens in a text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens in messages
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => {
    // Add overhead for role and formatting (~10 tokens)
    return total + estimateTokens(msg.content) + 10;
  }, 0);
}

/**
 * Compress a list of messages into a summary
 */
export async function compressContext(messages: ChatMessage[]): Promise<CompressionResult> {
  if (messages.length === 0) {
    return {
      summary: '',
      keyPoints: [],
      mainTopics: [],
      notableErrors: [],
      vocabulary: [],
    };
  }

  const llm = getLLMProvider();

  // Format messages for the prompt
  const formattedMessages = messages
    .map((m) => {
      const roleLabel = m.role === 'user' ? 'Student' : m.role === 'assistant' ? 'Teacher' : 'System';
      return `[${roleLabel}]: ${m.content}`;
    })
    .join('\n\n');

  const prompt = `请分析以下英语学习对话，并提取关键信息。

对话内容:
${formattedMessages}

请提取:
1. 对话摘要 (summary): 用1-2句话概括对话主要内容
2. 学习要点 (keyPoints): 学生从对话中应该学到的重点
3. 话题 (mainTopics): 讨论的主要话题
4. 错误 (notableErrors): 学生犯的典型错误
5. 词汇 (vocabulary): 对话中出现的重要词汇

请用中文总结，但保留英语词汇和表达。`;

  const systemPrompt = `你是一个英语学习对话分析助手。你的任务是压缩和总结学习对话，
提取关键信息供后续对话参考。保持摘要简洁但信息完整。`;

  try {
    const result = await llm.generateJSON(prompt, CompressionResultSchema, systemPrompt);
    return result;
  } catch (error) {
    console.error('Context compression failed:', error);
    // Return a basic fallback
    return {
      summary: `对话包含${messages.length}条消息`,
      keyPoints: [],
      mainTopics: [],
      notableErrors: [],
      vocabulary: [],
    };
  }
}

/**
 * Check if messages need compression
 */
export function needsCompression(
  messages: ChatMessage[],
  threshold: number = 20
): boolean {
  return messages.length > threshold;
}

/**
 * Split messages into compressible and recent portions
 */
export function splitForCompression(
  messages: ChatMessage[],
  keepRecent: number = 10
): { toCompress: ChatMessage[]; toKeep: ChatMessage[] } {
  if (messages.length <= keepRecent) {
    return { toCompress: [], toKeep: messages };
  }

  return {
    toCompress: messages.slice(0, -keepRecent),
    toKeep: messages.slice(-keepRecent),
  };
}

/**
 * Format compressed summary for prompt injection
 */
export function formatSummaryForPrompt(compression: CompressionResult): string {
  const parts: string[] = [];

  if (compression.summary) {
    parts.push(`## 对话背景\n${compression.summary}`);
  }

  if (compression.keyPoints.length > 0) {
    parts.push(`## 已学要点\n${compression.keyPoints.map(p => `- ${p}`).join('\n')}`);
  }

  if (compression.notableErrors.length > 0) {
    parts.push(`## 需关注的错误\n${compression.notableErrors.map(e => `- ${e}`).join('\n')}`);
  }

  if (compression.vocabulary.length > 0) {
    parts.push(`## 涉及词汇\n${compression.vocabulary.join(', ')}`);
  }

  return parts.join('\n\n');
}
