# English Learning App — 系统架构设计文档

## 1. 产品概述

一款以"看图说话/写作"为核心的英语学习应用。用户输入英语内容，AI改写为适合学习的图文题目，用户通过语音或文字进行开放性创意表达，AI提供多维度评价与迭代指导。

**当前形态**：Web应用（HTML/CSS/JS）  
**目标形态**：Web → iOS / Android Native App（通过跨平台框架）

---

## 2. 核心用户流程

```
用户输入英语句子/段落
        ↓
LLM-1: 内容改写 + 生成文生图提示词 + 核心词汇(中英+音标) + 语法提示
        ↓                          ↓
   文生图 API ←── 提示词        词汇/语法模板渲染(HTML)
        ↓                          ↓
   生成图片                    词汇卡片(含发音按钮) + 语法提示
        ↓                          ↓
        └──────── 合并展示给用户 ────────┘
                       ↓
         用户浏览学习 → 构思表达
                       ↓
         用户录音(语音输入) 或 打字输入
                       ↓
         语音: Azure STT → 转文字
                       ↓
LLM-2: 内容评价（对比题目要求，参考用户历史提交，评估难度水平）
                       ↓
         反馈展示 → 用户选择重试 或 下一题
```

---

## 3. 系统架构总览

### 3.1 整体分层

```
┌─────────────────────────────────────────────────────────┐
│                    客户端 (Client Layer)                   │
│  Web (React/Next.js)  │  iOS (React Native)  │  Android  │
└──────────────────────────┬──────────────────────────────┘
                           │ REST / WebSocket
┌──────────────────────────┴──────────────────────────────┐
│                   API Gateway / BFF                       │
│            (Next.js API Routes / Express)                 │
└──────────┬──────────┬──────────┬───────────┬────────────┘
           │          │          │           │
     ┌─────┴──┐ ┌────┴───┐ ┌───┴────┐ ┌────┴─────┐
     │ LLM    │ │ 文生图  │ │ Azure  │ │ 声纹识别  │
     │Service │ │Service │ │ STT    │ │ Service  │
     └────────┘ └────────┘ └────────┘ └──────────┘
                           │
┌──────────────────────────┴──────────────────────────────┐
│                   数据层 (Data Layer)                      │
│  用户档案 │ 提交历史 │ 题目库 │ 语言能力模型 │ 声纹指纹   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 技术栈选型

| 层级 | 技术选择 | 理由 |
|------|---------|------|
| Web前端 | **React + Next.js** | SSR/SSG支持，转Native友好 |
| 跨平台Native | **React Native** 或 **Capacitor** | React Native共享组件逻辑；Capacitor可直接包装Web代码 |
| 后端API | **Next.js API Routes** (初期) → **Node.js/Express** (规模化) | 初期减少部署复杂度 |
| 数据库 | **PostgreSQL** (结构化) + **Redis** (缓存/会话) | 用户档案、提交历史需要关系查询 |
| 对象存储 | **S3 / Azure Blob** | 存储录音文件、生成的图片 |
| LLM | **Claude API** 或 **OpenAI API** | 内容改写、评价 |
| 文生图 | **DALL-E 3** 或 **Flux** | 异步生成 |
| 语音转文字 | **Azure Speech SDK** | 成熟的STT，支持中间结果 |
| 声纹识别 | **Azure Speaker Recognition** 或开源方案 | 多用户身份识别 |
| TTS发音 | **Web Speech API** (浏览器端) + **Azure TTS** (备选) | 词汇发音播放 |

---

## 4. 核心模块详细设计

### 4.1 模块一：题目生成引擎

#### LLM调用设计（单次调用，结构化JSON输出）

```
输入: 用户原始英语文本 + 用户当前难度等级(CEFR)
输出: JSON结构
```

**Prompt设计框架：**

```json
{
  "rewritten_content": {
    "text": "改写后的英语内容，适合看图写话",
    "cefr_level": "B1",
    "topic_tags": ["daily_life", "food"]
  },
  "image_prompt": {
    "prompt": "文生图提示词，详细场景描述",
    "style": "illustration, clean, educational"
  },
  "vocabulary": [
    {
      "word": "delicious",
      "phonetic": "/dɪˈlɪʃəs/",
      "part_of_speech": "adj",
      "chinese": "美味的",
      "example_context": "在图片场景中的用法提示",
      "audio_id": "用于前端TTS或预生成音频的标识"
    }
  ],
  "grammar_hints": [
    {
      "point": "Present Perfect Tense",
      "explanation": "用于描述已完成的动作",
      "pattern": "have/has + past participle",
      "example": "She has prepared a wonderful meal."
    }
  ],
  "difficulty_metadata": {
    "target_cefr": "B1",
    "vocab_complexity": 0.6,
    "grammar_complexity": 0.5
  }
}
```

#### 词汇卡片HTML模板

```html
<!-- 单个词汇卡片组件 -->
<div class="vocab-card" data-word-id="vocab_001">
  <div class="vocab-word">
    <span class="english">delicious</span>
    <span class="pos">adj.</span>
    <button class="audio-btn" onclick="playPronunciation('delicious')">
      🔊
    </button>
  </div>
  <div class="vocab-phonetic">/dɪˈlɪʃəs/</div>
  <div class="vocab-chinese">美味的</div>
  <div class="vocab-context">
    <em>提示：可以用来描述图片中食物的味道</em>
  </div>
</div>
```

**发音播放方案：**
- 优先使用 Web Speech API（`speechSynthesis`），零成本，浏览器原生
- 降级方案：预生成音频文件（Azure TTS），存储在CDN
- Native App可调用系统TTS引擎

---

### 4.2 模块二：语音输入与处理

#### 录音交互设计

```
Web端: 点击"开始录音" → 录音中(显示波形) → 点击"结束录音"
         ↓
Native端: 按住录音键(长按) → 松开结束
```

#### 技术实现

```javascript
// Web Audio API + MediaRecorder
// 录音状态管理
const RecordingStates = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing'
};

// 录音完成后的处理流程
async function onRecordingComplete(audioBlob) {
  // 1. 本地保存录音文件
  const audioUrl = await uploadAudio(audioBlob);
  
  // 2. 发送给Azure STT
  const transcription = await azureSTT(audioBlob);
  
  // 3. (可选) 声纹特征提取
  const voiceprint = await extractVoiceprint(audioBlob);
  
  // 4. 发送文本 + 声纹信息给评价引擎
  const evaluation = await evaluateSubmission({
    text: transcription,
    input_method: 'voice',
    voiceprint: voiceprint,
    audio_url: audioUrl
  });
  
  return evaluation;
}
```

#### Azure STT 配置

```javascript
// 重点：获取纯文本转写，不做发音评估
const speechConfig = SpeechConfig.fromSubscription(key, region);
speechConfig.speechRecognitionLanguage = "en-US";

// 连续识别模式（适合长句/短文）
const recognizer = new SpeechRecognizer(speechConfig, audioConfig);
```

> **设计决策**：语音仅作为输入方式，STT输出纯文本后交给LLM做内容评价。不在此环节做发音评估（除非未来增加"对话练习"模式）。

---

### 4.3 模块三：声纹识别与多用户管理

#### 需求场景
同一账户下可能有多人使用（如家庭共享），需要：
1. 识别是否为同一说话人
2. 为不同说话人建立独立的语言能力档案
3. 自动或半自动切换用户画像

#### 技术方案

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 录音音频     │ ──→ │ 声纹特征提取      │ ──→ │ 说话人匹配       │
│ (AudioBlob) │     │ (Embedding向量)   │     │ (余弦相似度)     │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │ 匹配成功         │ 匹配失败
                                              │ → 加载对应档案   │ → 新建Speaker
                                              └─────────────────┘
```

**方案选择：**

| 方案 | 优点 | 缺点 |
|------|------|------|
| Azure Speaker Recognition API | 成熟稳定，免维护 | 有API调用成本 |
| 开源方案 (Resemblyzer / SpeechBrain) | 免费，可自部署 | 需要GPU，维护成本 |
| 混合方案 | 初期用Azure，规模化后迁移 | 迁移成本 |

**推荐**：初期使用 Azure Speaker Recognition，按需切换。

#### 数据模型

```sql
-- 说话人表
CREATE TABLE speakers (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  voiceprint_embedding VECTOR(256),  -- 声纹向量
  label VARCHAR(50),                  -- 用户可自定义昵称: "爸爸", "小明"
  created_at TIMESTAMP,
  last_active_at TIMESTAMP
);

-- 每次提交关联说话人
CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  speaker_id UUID REFERENCES speakers(id),  -- 关联声纹识别的说话人
  ...
);
```

#### 用户体验流程

```
首次录音 → 提取声纹 → 存储为 Speaker-A (默认)
第二次录音 → 提取声纹 → 与已有声纹比对
  ├─ 相似度 > 阈值 → 自动归为 Speaker-A
  └─ 相似度 < 阈值 → 提示"检测到新的使用者，是否创建新档案？"
                      ├─ 是 → 创建 Speaker-B，用户可命名
                      └─ 否 → 归为当前Speaker
```

---

### 4.4 模块四：AI评价引擎

#### 评价维度

```json
{
  "evaluation": {
    "content_relevance": {
      "score": 85,
      "comment": "准确描述了图片中的主要场景"
    },
    "vocabulary_usage": {
      "score": 70,
      "words_used_from_hints": ["delicious", "prepare"],
      "words_missed_opportunity": ["aroma"],
      "new_words_used": ["fantastic"],
      "comment": "很好地使用了推荐词汇，还用了额外的词汇"
    },
    "grammar_accuracy": {
      "score": 75,
      "errors": [
        {
          "original": "She have prepared",
          "corrected": "She has prepared",
          "rule": "第三人称单数 + have → has",
          "severity": "medium"
        }
      ]
    },
    "expression_creativity": {
      "score": 80,
      "comment": "加入了个人感受的描述，表达有创意"
    },
    "overall_cefr_estimate": "B1",
    "difficulty_assessment": {
      "vocab_level": "B1",
      "grammar_level": "A2+",
      "sentence_complexity": "B1",
      "comment": "词汇使用达到B1水平，语法方面第三人称一致性需要加强"
    }
  },
  "comparison_with_history": {
    "attempt_number": 3,
    "improvement_notes": "相比第2次提交，语法错误减少了，句子更流畅",
    "persistent_issues": ["第三人称单数动词一致性仍需注意"],
    "progress_trend": "improving"
  },
  "suggestions": {
    "immediate": "尝试用 has + 过去分词 重新说一遍这个句子",
    "long_term": "建议多练习包含第三人称主语的句子"
  }
}
```

#### LLM评价Prompt设计要点

```
System Prompt 核心要素:
1. 角色：你是一个鼓励创意表达的英语教师
2. 评价标准：不存在唯一正确答案，评价表达质量而非匹配度
3. 上下文：题目内容 + 推荐词汇语法 + 图片描述
4. 用户档案：当前估计的CEFR等级 + 常见错误模式 + 偏好用词
5. 历史提交：本题的所有历史提交及评价（按时间排序）
6. 输入方式：voice/text（影响评价侧重点）
7. 输出格式：严格JSON结构
```

---

### 4.5 模块五：用户语言能力档案

#### 档案数据结构

```json
{
  "speaker_id": "uuid",
  "profile": {
    "estimated_cefr": "B1",
    "confidence": 0.75,
    "last_updated": "2026-02-19",
    
    "vocabulary_profile": {
      "active_vocab_size_estimate": 2500,
      "favorite_words": [
        { "word": "wonderful", "frequency": 15 },
        { "word": "beautiful", "frequency": 12 },
        { "word": "interesting", "frequency": 10 }
      ],
      "vocab_level_distribution": {
        "A1": 0.15, "A2": 0.30, "B1": 0.35, "B2": 0.15, "C1": 0.05
      },
      "recently_learned": ["aroma", "cuisine", "elaborate"]
    },
    
    "grammar_profile": {
      "mastered": [
        "simple_present", "simple_past", "basic_adjective_order"
      ],
      "developing": [
        "present_perfect", "passive_voice"
      ],
      "persistent_errors": [
        {
          "pattern": "third_person_singular",
          "example": "She have → She has",
          "occurrence_count": 8,
          "last_occurred": "2026-02-18",
          "trend": "decreasing"  // improving / stable / increasing
        },
        {
          "pattern": "article_usage",
          "example": "I went to store → I went to the store",
          "occurrence_count": 12,
          "last_occurred": "2026-02-19",
          "trend": "stable"
        }
      ]
    },
    
    "expression_profile": {
      "avg_sentence_length": 12.5,
      "sentence_complexity_trend": "increasing",
      "preferred_structures": ["SVO", "There is/are"],
      "creativity_score_avg": 72
    },
    
    "learning_pace": {
      "sessions_per_week": 4.2,
      "avg_attempts_per_topic": 2.3,
      "completion_rate": 0.78
    }
  }
}
```

#### 档案更新机制

```
每次提交后:
  1. 更新词汇使用频率统计
  2. 记录新的语法错误或确认已修正的错误
  3. 重新计算 CEFR 估计值（加权移动平均）
  4. 更新表达风格指标

每N次提交后(如10次):
  LLM综合分析所有近期提交，生成阶段性报告:
  - "你在过去两周的表达越来越丰富了"
  - "第三人称动词错误从平均每次2个降到了0.5个"
  - "建议开始尝试使用更复杂的从句结构"
```

---

## 5. 数据库设计

### 5.1 核心表结构

```sql
-- 账户(一个注册用户)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  settings JSONB DEFAULT '{}'  -- 用户偏好设置
);

-- 说话人(一个账户下可能多人)
CREATE TABLE speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  voiceprint_embedding VECTOR(256),
  label VARCHAR(50) DEFAULT 'Default',
  language_profile JSONB DEFAULT '{}',  -- 语言能力档案
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW()
);

-- 题目
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  original_input TEXT NOT NULL,               -- 用户原始输入
  rewritten_content JSONB NOT NULL,           -- LLM改写结果
  image_prompt TEXT,                           -- 文生图提示词
  image_url VARCHAR(500),                      -- 生成的图片URL
  vocabulary JSONB NOT NULL,                   -- 词汇列表
  grammar_hints JSONB NOT NULL,                -- 语法提示
  difficulty_metadata JSONB,                   -- 难度元数据
  created_at TIMESTAMP DEFAULT NOW()
);

-- 提交记录(每次用户的回答)
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  speaker_id UUID REFERENCES speakers(id),     -- 声纹关联
  attempt_number INTEGER NOT NULL,             -- 第几次尝试
  input_method VARCHAR(10) NOT NULL,           -- 'voice' | 'text'
  raw_audio_url VARCHAR(500),                  -- 录音文件地址(语音输入时)
  transcribed_text TEXT NOT NULL,              -- 转写/输入的文本
  evaluation JSONB NOT NULL,                   -- AI评价结果
  difficulty_assessment JSONB,                 -- 本次提交的难度评估
  created_at TIMESTAMP DEFAULT NOW()
);

-- 语法错误追踪(独立表，便于聚合分析)
CREATE TABLE grammar_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id),
  speaker_id UUID REFERENCES speakers(id),
  error_pattern VARCHAR(100) NOT NULL,         -- 错误类型标识
  original_text TEXT,
  corrected_text TEXT,
  severity VARCHAR(20),                        -- low / medium / high
  created_at TIMESTAMP DEFAULT NOW()
);

-- 词汇使用记录
CREATE TABLE vocabulary_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id),
  speaker_id UUID REFERENCES speakers(id),
  word VARCHAR(100) NOT NULL,
  was_from_hint BOOLEAN DEFAULT FALSE,         -- 是否来自推荐词汇
  used_correctly BOOLEAN DEFAULT TRUE,
  cefr_level VARCHAR(5),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_submissions_topic ON submissions(topic_id, attempt_number);
CREATE INDEX idx_submissions_speaker ON submissions(speaker_id, created_at DESC);
CREATE INDEX idx_grammar_errors_speaker ON grammar_errors(speaker_id, error_pattern);
CREATE INDEX idx_vocab_usage_speaker ON vocabulary_usage(speaker_id, word);
```

---

## 6. API设计

### 6.1 核心接口

```yaml
# 题目生成
POST /api/topics/generate
  Body: { text: string, speaker_id?: string }
  Response: { topic_id, rewritten_content, image_url, vocabulary, grammar_hints }

# 提交回答(文字)
POST /api/topics/:topicId/submit/text
  Body: { text: string, speaker_id?: string }
  Response: { evaluation, difficulty_assessment, comparison_with_history }

# 提交回答(语音)
POST /api/topics/:topicId/submit/voice
  Body: FormData { audio: Blob, speaker_id?: string }
  Response: { transcription, speaker_match, evaluation, difficulty_assessment }
  
# 获取题目历史提交
GET /api/topics/:topicId/submissions
  Response: { submissions: [...], progress_summary }

# 声纹管理
POST /api/speakers/identify
  Body: FormData { audio: Blob }
  Response: { speaker_id, confidence, is_new_speaker }

POST /api/speakers
  Body: { label: string, audio: Blob }
  Response: { speaker_id }

# 用户语言档案
GET /api/speakers/:speakerId/profile
  Response: { language_profile, recent_progress, recommendations }

# 词汇发音
GET /api/tts/:word
  Response: audio/mpeg (预生成或实时TTS)
```

---

## 7. 前端组件架构

### 7.1 页面/组件树

```
App
├── AuthPages (登录/注册)
├── MainLayout
│   ├── TopicGenerator        // 输入框 + 生成按钮
│   ├── TopicDisplay          // 题目展示区
│   │   ├── ImageViewer       // 生成的图片
│   │   ├── VocabularyPanel   // 词汇卡片列表
│   │   │   └── VocabCard     // 单个词汇(含发音按钮)
│   │   └── GrammarPanel      // 语法提示列表
│   │       └── GrammarCard   // 单个语法点
│   ├── InputArea             // 用户输入区
│   │   ├── TextInput         // 打字输入
│   │   ├── VoiceRecorder     // 录音组件
│   │   │   ├── RecordButton  // 开始/结束按钮
│   │   │   └── Waveform      // 录音波形可视化
│   │   └── SubmitButton
│   ├── EvaluationPanel       // AI评价展示
│   │   ├── ScoreOverview     // 分数总览
│   │   ├── DetailedFeedback  // 详细反馈
│   │   ├── ErrorHighlight    // 错误高亮对比
│   │   └── HistoryComparison // 与历史提交对比
│   ├── SpeakerSelector       // 说话人切换(多用户)
│   └── ProgressDashboard     // 学习进度/档案
│       ├── CEFRChart         // 能力等级变化图
│       ├── ErrorTrends       // 错误趋势
│       ├── VocabCloud        // 常用词云
│       └── WeeklyReport      // 周报
```

### 7.2 跨平台适配策略

```
                  共享层 (Shared)
    ┌──────────────────────────────────────┐
    │  业务逻辑 hooks (useTopicGenerate,   │
    │  useRecorder, useEvaluation, etc.)   │
    │  状态管理 (Zustand / Redux)           │
    │  API 调用层                           │
    │  类型定义 (TypeScript interfaces)     │
    └──────────────┬───────────────────────┘
                   │
       ┌───────────┼───────────────┐
       │           │               │
  ┌────┴────┐ ┌───┴─────┐ ┌──────┴──────┐
  │  Web    │ │  iOS    │ │  Android    │
  │ React   │ │ React  │ │ React      │
  │ DOM组件 │ │ Native │ │ Native     │
  │         │ │ 组件    │ │ 组件        │
  └─────────┘ └─────────┘ └────────────┘

方案A: React Native (推荐)
  - Web: React DOM
  - Mobile: React Native
  - 共享: 70%+ 业务逻辑代码

方案B: Capacitor (更快上线)
  - Web代码直接打包成iOS/Android
  - 通过Capacitor插件访问原生API(录音、TTS)
  - 共享: 95%+ 代码，但性能和体验略差
```

#### 关键跨平台差异处理

| 功能 | Web | Native |
|------|-----|--------|
| 录音 | MediaRecorder API | react-native-audio-recorder |
| TTS发音 | Web Speech API | expo-speech / 系统TTS |
| 录音交互 | 点击开始/结束 | 长按录音 |
| 音频上传 | fetch + FormData | react-native-fs + upload |
| 离线支持 | Service Worker (有限) | SQLite本地缓存 |
| 推送通知 | 不支持 | Firebase / APNs |

**抽象层设计示例：**

```typescript
// 平台无关的录音接口
interface IAudioRecorder {
  start(): Promise<void>;
  stop(): Promise<AudioBlob>;
  getWaveformData(): Float32Array;
  getDuration(): number;
}

// Web实现
class WebAudioRecorder implements IAudioRecorder { ... }

// Native实现
class NativeAudioRecorder implements IAudioRecorder { ... }

// 通过依赖注入或平台检测选择实现
const recorder = Platform.isWeb 
  ? new WebAudioRecorder() 
  : new NativeAudioRecorder();
```

---

## 8. 关键技术决策

### 8.1 录音文件存储策略

```
录音 → 本地临时存储 → 上传至对象存储(S3/Azure Blob)
                    → 返回URL存入数据库
                    
存储策略:
- 保留最近30天的原始录音
- 30天后只保留转写文本和评价结果
- 用户可选择"收藏"某次录音永久保留
```

### 8.2 声纹识别阈值与策略

```
相似度阈值设计:
  > 0.85  → 高置信度匹配，自动归类
  0.65-0.85 → 中置信度，自动归类但后台标记待确认
  < 0.65  → 低置信度，提示用户确认身份

冷启动:
  新账户前3次提交 → 全部归为默认Speaker
  第4次开始 → 开启声纹比对
  
注意: 向用户透明说明声纹功能，获取知情同意
```

### 8.3 难度评估算法

```
每次提交的实时难度评估:

input_cefr = weighted_average(
  vocab_cefr_level × 0.35,      // 使用词汇的平均CEFR等级
  grammar_complexity × 0.30,     // 语法结构复杂度
  sentence_length_norm × 0.15,   // 句子长度(归一化)
  error_rate_inverse × 0.20      // 正确率(错误越少分越高)
)

用户整体CEFR估计:
overall_cefr = exponential_moving_average(
  last_N_submissions.input_cefr,
  alpha = 0.3  // 近期表现权重更高
)
```

---

## 9. 部署架构

### 9.1 初期（MVP）

```
┌─────────────────────────────────┐
│         Vercel / Railway         │
│  ┌───────────┐  ┌────────────┐  │
│  │ Next.js   │  │ API Routes │  │
│  │ Frontend  │  │ Backend    │  │
│  └───────────┘  └────────────┘  │
└─────────────┬───────────────────┘
              │
   ┌──────────┼──────────┐
   │          │          │
┌──┴───┐ ┌───┴────┐ ┌───┴────┐
│Supabase│ │Azure  │ │LLM API│
│(PG+Auth│ │Speech │ │       │
│+Storage)│ │       │ │       │
└────────┘ └────────┘ └───────┘
```

### 9.2 规模化

```
┌───────────────┐     ┌──────────────────┐
│ CDN (Vercel/  │     │ API Gateway      │
│ CloudFront)   │     │ (Rate limiting,  │
│               │     │  Auth)           │
└───────┬───────┘     └────────┬─────────┘
        │                      │
        │              ┌───────┴────────┐
        │              │ Microservices  │
        │              ├─ Topic Service │
        │              ├─ Eval Service  │
        │              ├─ Voice Service │
        │              ├─ Profile Svc   │
        │              └────────────────┘
        │                      │
        │              ┌───────┴────────┐
        │              │ Message Queue  │
        │              │ (文生图异步)    │
        │              └────────────────┘
        │                      │
   ┌────┴─────┐       ┌───────┴────────┐
   │ Static   │       │  PostgreSQL    │
   │ Assets   │       │  Redis Cache   │
   │ (S3+CDN) │       │  Object Store  │
   └──────────┘       └────────────────┘
```

---

## 10. 开发优先级路线图

### Phase 1 — MVP核心循环 (4-6周)
- [ ] 题目生成（LLM调用 + 文生图）
- [ ] 词汇卡片模板（HTML渲染 + TTS发音）
- [ ] 文字输入 + AI评价
- [ ] 基础录音 + Azure STT + AI评价
- [ ] 单用户提交历史与迭代反馈
- [ ] 基础用户认证

### Phase 2 — 智能档案 (3-4周)
- [ ] 用户语言能力档案建立
- [ ] 每次提交的难度评估
- [ ] 错误模式追踪
- [ ] 词汇使用统计
- [ ] 基于用户水平的出题难度调整
- [ ] 进度仪表板

### Phase 3 — 多用户与声纹 (2-3周)
- [ ] 声纹特征提取与存储
- [ ] 说话人识别与自动匹配
- [ ] 多Speaker档案管理UI
- [ ] 声纹知情同意流程

### Phase 4 — Native App (4-6周)
- [ ] React Native / Capacitor 项目搭建
- [ ] 平台抽象层实现
- [ ] 原生录音组件
- [ ] 推送通知（学习提醒）
- [ ] 离线缓存（已做过的题目）
- [ ] App Store / Play Store 上架

### Phase 5 — 高级功能
- [ ] 对话练习模式（此时引入口语发音评估）
- [ ] AI自适应学习路径
- [ ] 社交功能（学习小组）
- [ ] 阶段性评估测试
- [ ] 学习数据导出

---

## 11. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM输出不稳定 | 词汇/语法JSON格式偶尔异常 | 严格schema验证 + 重试机制 + 降级模板 |
| Azure STT识别率 | 学习者口音可能影响准确率 | 允许用户编辑转写文本后再提交评价 |
| 声纹隐私合规 | 生物特征数据敏感 | GDPR/个保法合规，加密存储，用户可随时删除 |
| 文生图内容安全 | 可能生成不当图片 | 提示词安全过滤 + 图片审核 |
| API成本控制 | 多次LLM+TTS+图片调用 | 缓存相似题目、限制免费额度、预算告警 |
