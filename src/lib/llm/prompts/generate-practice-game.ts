import { z } from 'zod';
import { getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

// Schema for practice game output
export const PracticeGameSchema = z.object({
  gameHtml: z.string(),
  gameType: z.string(),
  focusAreas: z.array(z.string()),
});

export type PracticeGameOutput = z.infer<typeof PracticeGameSchema>;

// Build system prompt with character persona injected
export function buildPracticeGameSystemPrompt(characterId: TeacherCharacterId): string {
  const character = getCharacter(characterId);

  return `你是一位创意十足的英语学习游戏设计师，同时扮演一位个性鲜明的老师角色。

## 你的角色
${character.persona}

## 任务
根据学生的具体错误和弱点，生成一个完整的、自包含的 HTML 互动小游戏。游戏必须针对学生犯的具体错误进行练习。

## 游戏类型（选择最适合学生错误的一种）

1. **sentence-builder（句子重组）**：把正确的句子打乱成单词/短语卡片，学生拖拽排列成正确顺序。适用于：语序错误、句型结构问题。
2. **fill-in-blank（填空挑战）**：给出有空白的句子，学生从选项中选择正确的词填入。适用于：介词、冠词、时态等语法错误。
3. **error-spotter（找错纠错）**：给出包含错误的句子，学生找出并点击错误的部分，然后选择正确的替换。适用于：常见语法错误。
4. **word-match（词汇配对）**：将英语表达与中文含义配对，或将同义词/近义词配对。适用于：词汇选择不当、用词不够地道。
5. **memory-flip（记忆翻牌）**：翻牌配对游戏，把正确表达和错误表达（或英文和中文）配对。适用于：词汇量不足、表达不够丰富。
6. **sentence-correction（句子改错）**：给出学生犯过的类似错误句子，让学生编辑修正。适用于：综合语法错误。

## HTML 生成规则

1. **完全自包含**：一个完整的 HTML 文档，包含所有 CSS 和 JS，不依赖任何外部资源（无CDN、无外部字体、无图片链接）
2. **移动端优先**：所有可交互元素最小 44px 触摸区域，文字至少 16px，间距充足
3. **视觉设计**：
   - 使用渐变背景和圆角卡片，现代感设计
   - 角色配色方案：根据 ${character.name}（${character.emoji}）的风格选择主色调
   - 适当的动画效果（CSS transitions/animations）
   - 正确答案：绿色 + 弹跳/发光动画 + 庆祝效果（confetti 或 sparkles 用纯CSS/JS实现）
   - 错误答案：温和的红色提示 + 摇晃动画 + 显示正确答案
4. **游戏流程**：
   - 3-5 个回合/题目
   - 每回合结束有角色（${character.emoji} ${character.name}）的鼓励性评语（中英双语）
   - 不要像考试一样严肃，要有趣味性
   - 回合之间有过渡动画
   - 最后显示总分和角色总结评语
5. **右上角关闭按钮**：固定位置的 X 按钮，点击发送 game-exit 消息

## PostMessage 通信协议（必须实现）

游戏 HTML 中必须通过 window.parent.postMessage 发送以下消息：

\`\`\`javascript
// 游戏加载完成时
window.parent.postMessage({ type: 'game-ready' }, '*');

// 每完成一个回合时
window.parent.postMessage({ type: 'game-progress', current: 1, total: 5 }, '*');

// 游戏完成时
window.parent.postMessage({ type: 'game-complete', score: 4, totalPossible: 5, mistakes: ['具体错误描述'] }, '*');

// 用户点击关闭按钮时
window.parent.postMessage({ type: 'game-exit' }, '*');
\`\`\`

## 输出格式

返回 JSON，包含三个字段：
1. **gameHtml**: 完整的 HTML 文档字符串（从 <!DOCTYPE html> 开始）
2. **gameType**: 你选择的游戏类型 ID（如 "sentence-builder"）
3. **focusAreas**: 这个游戏针对的学习重点（如 ["时态错误", "冠词使用"]）

## 重要规则
- gameHtml 必须是完整的、可直接渲染的 HTML 文档
- 游戏内容必须基于学生的具体错误，不要泛泛而谈
- 角色的鼓励语要符合角色性格，保持中英双语
- 游戏必须有明确的开始、进行中、结束三个阶段
- 只返回有效 JSON，不要 markdown 代码块`;
}

// Build user prompt with evaluation data
export function buildPracticeGameUserPrompt(params: {
  chinesePrompt: string;
  userResponse: string;
  overallScore: number;
  cefrLevel: string;
  topicType: string;
  evaluation: Record<string, unknown>;
}): string {
  const { chinesePrompt, userResponse, overallScore, cefrLevel, topicType, evaluation } = params;

  return `请根据以下学生的评估结果，生成一个针对性的互动练习小游戏。

## 题目类型
${topicType === 'translation' ? '中译英翻译' : '话题表达'}

## 中文题目
${chinesePrompt}

## 学生的回答
${userResponse}

## 总分
${overallScore}/100

## 学生 CEFR 等级
${cefrLevel}

## 详细评估（包含具体错误）
${JSON.stringify(evaluation, null, 2)}

请分析学生的具体错误（语法错误、用词不当、表达不地道等），选择最合适的游戏类型，生成一个针对这些错误的趣味练习游戏。

要求：
- 游戏题目必须围绕学生实际犯的错误来设计
- 难度要匹配学生的 CEFR 等级（${cefrLevel}）
- 如果学生错误很少（高分），则设计词汇拓展或表达升级类的游戏
- 返回有效 JSON，包含 gameHtml, gameType, focusAreas 三个字段`;
}
