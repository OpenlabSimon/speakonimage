# SpeakOnImage — 中译英口语练习应用

## 项目简介

一款以"看中文、说英语"为核心的口语练习Web应用。用户看中文提示 → 用语音或文字用英语表达 → AI评价语义传达和语言质量 → 迭代改进。两种题型：翻译挑战（中译英）和话题表达（开放性）。重点是语义传达准确性，而非逐字翻译对比。

## 核心流程

```
用户看中文提示 → 思考如何用英语表达 → 语音/文字输入 → AI评价语义传达 → 查看反馈 → 重试改进
```

## 两种题型

### 1. 翻译挑战 (Translation Challenge)
- 显示一段中文内容
- 用户尝试用英语表达相同意思
- AI评价：语义传达准确度、表达自然度、语法正确性
- **不做逐字翻译对比**，接受多种正确表达方式

### 2. 话题表达 (Topic Expression)
- 给定一个话题/场景（中文描述）
- 用户用英语自由表达观点/描述
- AI评价：内容相关性、表达丰富度、语言质量
- 鼓励开放性创意表达

## 技术栈

- **框架**: Next.js 14+ (App Router) + TypeScript
- **样式**: Tailwind CSS
- **数据库**: PostgreSQL (Neon云端)
- **ORM**: Prisma 7 (with @prisma/adapter-pg)
- **部署**: Vercel
- **跨平台**: Capacitor (未来包装为iOS/Android)
- **语音转文字**: Azure Speech SDK (REST API)
- **TTS发音**: Web Speech API (浏览器原生, 零成本)
- **LLM**: Gemini via hiapi.online proxy (OpenAI兼容接口)
- **对象存储**: Vercel Blob (初期) / S3 (规模化)

## 项目结构

```
src/
├── app/                    # Next.js App Router 页面
│   ├── page.tsx            # 首页/题目选择
│   ├── topic/[id]/         # 题目详情 + 答题页
│   ├── profile/            # 学习档案/进度
│   └── api/                # API Routes
│       ├── topics/         # 题目生成/查询
│       ├── submissions/    # 提交/评价
│       ├── speech/         # 语音转写
│       └── speakers/       # 声纹管理
├── components/             # React 组件
│   ├── topic/              # 题目相关 (PromptCard, VocabCard, GrammarCard)
│   ├── input/              # 输入相关 (TextInput, VoiceRecorder)
│   ├── evaluation/         # 评价展示 (ScoreOverview, SemanticFeedback)
│   └── ui/                 # 通用UI组件
├── lib/                    # 核心业务逻辑
│   ├── llm/                # LLM 调用封装
│   │   ├── provider.ts     # 统一接口
│   │   ├── gemini.ts       # Gemini 实现
│   │   └── prompts/        # Prompt 模板
│   ├── speech/             # Azure STT 封装
│   ├── evaluation/         # 评价引擎逻辑 (语义传达为核心)
│   └── profile/            # 用户档案管理
├── hooks/                  # 自定义 React Hooks
│   ├── useRecorder.ts      # 录音 hook
│   ├── useTTS.ts           # 发音 hook
│   └── useEvaluation.ts    # 评价 hook
├── types/                  # TypeScript 类型定义
│   └── index.ts            # 所有接口/类型集中定义
├── prisma/
│   └── schema.prisma       # 数据库 schema
└── platform/               # 平台抽象层 (为 Capacitor 做准备)
    ├── audio.ts            # 录音接口抽象
    ├── tts.ts              # TTS接口抽象
    └── storage.ts          # 文件存储抽象
```

## 关键设计决策

1. **语义传达优先**: 评价引擎重点看用户是否准确传达了中文的含义，而非逐字翻译对比
2. **多种正确答案**: 同一中文可以有多种英语表达，全部认可（如 "我很高兴" → "I'm happy" / "I feel glad" / "I'm delighted" 都正确）
3. **语音仅作为输入方式**: STT转文字后交给LLM做内容评价，不做发音评估
4. **开放性表达**: 话题表达模式下鼓励创意，不存在唯一正确答案
5. **声纹识别**: 同一账户下可能多人使用，通过声纹区分不同使用者
6. **每次提交都评估难度**: 用户每次回答都重新评估其词汇/语法水平
7. **LLM Provider可切换**: 通过统一接口抽象，当前使用 Gemini
8. **录音交互**: Web端用"点击开始/点击结束"模式

## 评价维度 (语义传达为核心)

### 翻译挑战模式
- **语义准确度 (Semantic Accuracy)**: 英语表达是否准确传达了中文原意 (0-100)
- **表达自然度 (Naturalness)**: 表达是否地道、符合英语习惯 (0-100)
- **语法正确性 (Grammar)**: 语法错误检测 (0-100)
- **词汇丰富度 (Vocabulary)**: 用词是否恰当、多样 (0-100)

### 话题表达模式
- **内容相关性 (Relevance)**: 表达是否围绕给定话题 (0-100)
- **内容丰富度 (Depth)**: 观点是否充实、有深度 (0-100)
- **表达创意度 (Creativity)**: 表达是否有创意 (0-100)
- **语言质量 (Language Quality)**: 综合语法+用词 (0-100)

## 环境变量

```env
DATABASE_URL=postgresql://...          # Neon PostgreSQL
GEMINI_API_KEY=...
GEMINI_BASE_URL=https://hiapi.online/v1
GEMINI_MODEL=gemini-3-pro-preview
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=westus3
BLOB_READ_WRITE_TOKEN=...              # Vercel Blob (可选)
```

## 开发规范

- 组件用函数式 + hooks，不用 class component
- API返回统一格式: `{ success: boolean, data?: T, error?: string }`
- LLM输出必须做 JSON schema 验证，失败则重试一次
- 所有LLM prompt 放在 `lib/llm/prompts/` 目录，便于迭代
- 数据库迁移用 Prisma Migrate
- 中文注释写在关键业务逻辑处，其余用英文

## Phase 2+ 可选功能

以下功能留待后续版本：
- **图片模式**: 看图说话（需要文生图API）
- **视频模式**: 看视频描述（需要视频处理）
- **对话练习**: 与AI进行多轮对话
- **发音评估**: 评估用户发音准确度
