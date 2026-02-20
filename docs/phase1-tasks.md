# Phase 1 — MVP核心循环 任务清单

> 目标：完成一个完整的"看中文→说英语→评价"循环，单用户可用
> 核心：两种题型（翻译挑战 + 话题表达），评价重点是语义传达
> 参考：CLAUDE.md 完整架构设计

---

## Task 1: 项目初始化 ✅

**目标**: 搭建项目骨架，确保开发环境可运行

- [x] `npx create-next-app@latest` 初始化 (App Router, TypeScript, Tailwind)
- [x] 安装核心依赖: `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `openai`, `zod`
- [x] 创建 `prisma/schema.prisma`，定义核心表
- [x] Neon PostgreSQL 云端数据库配置
- [x] 创建项目目录结构
- [x] 创建 `types/index.ts` 定义核心 TypeScript 接口

**验收**: ✅ `npm run dev` 能启动，Prisma能连接Neon数据库

---

## Task 2: LLM调用封装层 ✅

**目标**: 建立provider-agnostic的LLM调用层

- [x] 创建 `lib/llm/provider.ts` 统一接口
- [x] 创建 `lib/llm/gemini.ts` 实现 Gemini provider (via hiapi.online)
- [x] 创建 `lib/llm/index.ts` 根据环境变量选择 provider
- [x] 创建 Zod schema 验证 LLM 输出结构

**验收**: ✅ 能调用 Gemini API 返回结构化JSON数据

---

## Task 3: 题目生成 API (更新为中文提示)

**目标**: POST /api/topics/generate 生成中文提示题目

- [ ] 更新 `lib/llm/prompts/topic-generate.ts` — 题目生成 prompt
  - 输入: 用户输入的英语文本/话题关键词, 目标CEFR等级, 题型选择
  - 输出类型1 (翻译挑战):
    ```typescript
    {
      type: 'translation',
      chinesePrompt: string,       // 要翻译的中文内容
      difficulty: CEFRLevel,
      keyPoints: string[],         // 翻译要点提示
      suggestedVocab: VocabItem[], // 可能用到的词汇
    }
    ```
  - 输出类型2 (话题表达):
    ```typescript
    {
      type: 'expression',
      chinesePrompt: string,       // 话题/场景中文描述
      guidingQuestions: string[],  // 引导问题（中文）
      suggestedVocab: VocabItem[], // 相关词汇
      grammarHints: GrammarHint[], // 可用的语法结构
    }
    ```
- [ ] 更新 `app/api/topics/generate/route.ts` 适配新结构
- [ ] 更新数据库 Topic 表结构（添加 type 字段）

**验收**: curl 调用 API，返回 JSON 包含中文提示、词汇建议、语法提示

---

## Task 4: 题目展示前端 (更新为中文提示UI)

**目标**: 用户能看到中文提示题目

- [ ] 更新 `app/page.tsx` — 首页
  - 两种模式选择: 翻译挑战 / 话题表达
  - 输入框: 输入话题关键词或让AI随机生成
  - 生成按钮 → 调用 /api/topics/generate
- [ ] 创建 `app/topic/[id]/page.tsx` — 题目详情页
- [ ] 创建 `components/topic/ChinesePromptCard.tsx` — 中文提示展示
  - 大字显示中文内容
  - 翻译模式: 显示翻译要点
  - 表达模式: 显示引导问题
- [ ] 创建 `components/topic/VocabCard.tsx` — 词汇卡片
  - 英文单词 + 词性 + 音标
  - 中文翻译
  - 发音按钮 (Web Speech API)
  - 用法示例
- [ ] 创建 `components/topic/VocabPanel.tsx` — 词汇列表
- [ ] 创建 `components/topic/GrammarCard.tsx` — 语法提示 (表达模式)
- [ ] 创建 `hooks/useTTS.ts` — 发音 hook

**验收**: 看到中文提示、词汇卡片（可发音）、语法提示

---

## Task 5: 文字输入 + 语义传达评价

**目标**: 用户打字输入英语回答，AI评价语义传达

- [ ] 创建 `components/input/TextInput.tsx` — 文字输入区
  - textarea, 占位文字 "Type your English expression here..."
  - 字数统计
  - 提交按钮
- [ ] 创建 `lib/llm/prompts/evaluate-translation.ts` — 翻译挑战评价
  ```
  角色: 专注语义传达的英语教师
  输入: 中文原文 + 用户英语表达 + 历史提交(如有)
  评价维度:
    - semantic_accuracy: 是否准确传达中文原意 (0-100)
      - 关键是意思对不对，不要求逐字翻译
      - 列出正确传达的要点 / 遗漏或错误的要点
    - naturalness: 表达是否地道 (0-100)
      - 是否符合英语习惯
      - 有无中式英语痕迹
    - grammar: 语法正确性 (0-100)
      - 具体错误列表 + 修正建议
    - vocabulary: 用词质量 (0-100)
      - 用词是否准确、恰当
  输出: 严格JSON格式
  ```
- [ ] 创建 `lib/llm/prompts/evaluate-expression.ts` — 话题表达评价
  ```
  角色: 鼓励创意表达的英语教师
  输入: 话题描述 + 用户英语表达 + 历史提交(如有)
  评价维度:
    - relevance: 内容相关性 (0-100)
    - depth: 内容丰富度 (0-100)
    - creativity: 表达创意度 (0-100)
    - language_quality: 语言质量 (0-100)
  输出: 严格JSON格式
  ```
- [ ] 创建 `app/api/topics/[topicId]/submit/text/route.ts`

**验收**: 打字输入英语 → 收到AI评价（语义传达为核心）

---

## Task 6: 录音输入 + Azure STT ✅

**目标**: 用户能录音，语音转文字后提交评价

- [x] 创建 `hooks/useRecorder.ts` — 录音 hook
- [x] 创建 `components/input/VoiceRecorder.tsx` — 录音UI
- [x] 创建 `lib/speech/azure-stt.ts` — Azure STT REST API 封装
- [x] 创建 `app/api/speech/transcribe/route.ts` — 语音转写API
- [ ] 创建 `app/api/topics/[topicId]/submit/voice/route.ts` — 语音提交评价
  - 接收 FormData { audio: Blob }
  - 调用 Azure STT 获取转写文本
  - 调用评价引擎
  - 返回: { transcription, evaluation }
- [ ] 转写结果展示: 用户可以在提交评价前看到并编辑转写文本

**验收**: 录音 → 看到转写文字 → 收到AI评价

---

## Task 7: 评价展示 + 迭代反馈

**目标**: 清晰展示AI评价，突出语义传达反馈

- [ ] 创建 `components/evaluation/SemanticFeedback.tsx`
  - 翻译模式: 显示"正确传达的要点"和"遗漏/错误的要点"
  - 高亮对比: 用户表达 vs 语义要求
- [ ] 创建 `components/evaluation/ScoreOverview.tsx`
  - 根据题型显示对应维度的分数
  - 总体CEFR等级估计
- [ ] 创建 `components/evaluation/GrammarErrors.tsx`
  - 语法错误列表
  - 点击查看: 原文 → 修正 → 语法规则
- [ ] 创建 `components/evaluation/Suggestions.tsx`
  - 更好的表达方式示例
  - 即时建议 + 长期建议
- [ ] 创建 `components/evaluation/HistoryComparison.tsx`
  - 展示本题的历史提交
  - 分数变化趋势
- [ ] "重新尝试" 按钮 → 回到输入区
- [ ] "下一题" 按钮 → 回到首页

**验收**: 完整的"看中文→说英语→看评价→重试→看到进步"循环可用

---

## Task 8: 基础用户认证

**目标**: 用户能注册/登录，数据与账户关联

- [ ] 集成 NextAuth.js (或 Supabase Auth)
- [ ] 创建默认 Speaker
- [ ] API Routes 添加认证中间件
- [ ] 题目和提交关联到当前用户的 accountId

**验收**: 注册 → 登录 → 生成题目 → 提交 → 登出再登入数据还在

---

## 总体验收标准 (Phase 1 完成)

一个用户可以:
1. ✅ 选择题型（翻译挑战 / 话题表达）
2. ✅ 看到中文提示 + 词汇建议 + 语法提示
3. ✅ 用打字或录音方式用英语表达
4. ✅ 收到AI评价（**语义传达准确度**为核心）
5. ✅ 看到具体的语法错误和更好的表达建议
6. ✅ 重新尝试并看到与历史提交的对比
7. ✅ 数据持久化，登录后能看到历史

---

## Phase 2+ 可选功能

以下功能留待后续版本：
- **图片模式**: 看图说话（需要文生图API）
- **视频模式**: 看视频描述（需要视频处理）
- **对话练习**: 与AI进行多轮对话
- **发音评估**: 评估用户发音准确度
