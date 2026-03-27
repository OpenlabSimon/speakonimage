# speakonimage 极简版产品收敛方案 v0.1

## 1. 目标

把 `speakonimage` 收敛成一个接近常见 chatbot 的单主路径产品：

`进入 -> 开始对话 -> 连续说几轮 -> 结束 -> 看复盘 -> 继续下一轮`

这个版本的目标不是展示所有能力，而是验证一件核心事情：

用户是否愿意把它当成一个“能陪我练口语、并在结束后给我总结”的 AI 对话产品。

## 2. 核心判断

当前产品复杂，主要不是因为模型链路复杂，而是因为用户入口和中间状态太多：

- 首页同时承载分级评估、话题生成、迁移卡片、偏好、历史入口
- 练习页同时存在 `完整批改` 和 `实时教练` 两种交互模型
- 页面内暴露了较多“老师角色 / 输出模式 / 自动播放 / 游戏 / 画像推荐”控制项
- 结果既有单轮批改，又有多轮最终点评，概念重叠

对用户来说，这会变成三个不清楚：

- 我现在应该点哪里开始
- 我是在做聊天，还是在做作业式批改
- 结束后哪个结果才是最重要的

## 3. 极简版产品定义

### 3.1 主产品一句话

`一个面向英语口语练习的 AI 聊天教练。`

### 3.2 极简版只保留 3 个能力

1. 选一个话题开始对话
2. 用语音或文字和 AI 连续聊几轮
3. 在对话结束后生成一份最终复盘

### 3.3 极简版暂时不强调的能力

- 详细打分
- 多角色老师切换
- 多 review mode
- 练习游戏
- 复杂画像与推荐
- 长期学习档案的强曝光
- 多种“评估”和“练习”的并列入口

## 4. 极简版交互

### 4.1 信息架构

极简版只保留 3 个一级区块：

- `Chat`
- `History`
- `Settings`

其中：

- `Chat` 是默认首页
- `History` 只看过去会话和复盘
- `Settings` 只放模型、语音、账号等次级控制项

不再把 `Profile` 作为主导航暴露。

### 4.2 Chat 首页

首页直接就是一个 chatbot 页面，而不是评估页或复杂工作台。

结构建议：

1. 顶部
- 产品名
- 当前模型/语音的简短状态
- 一个轻量设置入口

2. 中间主区
- 聊天消息流
- 初始为空时显示 3 到 5 个推荐话题卡片
- 也允许用户直接输入“我想聊什么”

3. 底部输入区
- 文本输入框
- 麦克风按钮
- `开始实时对话` / `发送`
- `结束并生成复盘`

### 4.3 典型用户路径

#### 路径 A：最小可用路径

1. 用户进入首页
2. 点击一个推荐话题，或输入一个自定义话题
3. AI 发出第一句引导
4. 用户连续说 3 到 5 轮
5. 用户点击 `结束并生成复盘`
6. AI 在消息流里输出一条“最终复盘”消息

#### 路径 B：文字优先

1. 用户进入首页
2. 输入一个话题或第一句英文
3. AI 继续追问
4. 聊 3 到 5 轮
5. 结束并生成复盘

这两条路径共用同一个会话页，不再拆成“生成话题 -> 进入练习页 -> 再选模式”。

### 4.4 最终复盘的呈现方式

最终复盘不再单独做一个很重的面板，而是作为聊天流中的一条特殊 assistant message。

建议结构：

- 标题：`本次对话复盘`
- 一句话总结
- `你做得好的 2 点`
- `最值得先改的 2 点`
- `下次可以直接套用的表达`
- 一个 CTA：`继续下一轮`

这条消息应该是用户视角里的“本次会话结束标记”。

## 5. 页面收敛建议

### 5.1 首页

当前 [page.tsx](/Users/huiliu/Projects/speakonimage/src/app/page.tsx) 里承载了：

- 分级评估
- 手动定级
- 话题生成
- 自我介绍练习
- 偏好设置
- 复盘摘要

极简版建议：

- 首页直接改成聊天页入口
- `Introduction assessment` 改成次级入口，不放首页主视觉
- `manual level selection` 改到设置或首次 onboarding
- `CoachQuickSummaryCard` 不在首页主区展示
- `LocalPracticeMigrationCard` 不在首页主区展示

### 5.2 练习页

当前 [page.tsx](/Users/huiliu/Projects/speakonimage/src/app/topic/practice/page.tsx) 过于“控制台化”。

极简版建议只保留：

- 当前话题
- 消息流
- 语音/文本输入
- 结束并生成复盘

建议隐藏或折叠：

- `CoachPreferencesPanel`
- `PracticeGameOverlay`
- 单轮 `EvaluationResult`
- 词汇面板和语法面板的强展示
- 过多 live 状态诊断文案

只有在用户主动点开 `More` 时，才显示：

- 词汇提示
- 语法提示
- 老师角色
- 语音设置

## 6. 功能保留 / 隐藏清单

### 6.1 保留

- Gemini Live 多轮对话
- 文本输入兜底
- session 落库
- 最终点评生成
- 会话历史

### 6.2 保留但下沉

- level / CEFR
- 老师角色选择
- voiceId
- 自动播放
- 词汇提示 / 语法提示

这些都保留能力，但不在主路径里抢注意力。

### 6.3 暂时隐藏

- `Practice game`
- 复杂 `reviewMode` 选择
- 首页上的完整评估结果卡片
- profile 里的推荐、记忆、兴趣收集
- 各种“学习档案”强曝光区块

### 6.4 暂时冻结

- 新的画像能力扩展
- 更多 teacher persona
- 更复杂的多模式切换

## 7. 极简版的状态机

只保留 5 个主要状态：

1. `idle`
- 还没开始聊，显示推荐话题

2. `chatting`
- 正在实时对话或文本往返

3. `ending`
- 用户点击结束，等待生成复盘

4. `review_ready`
- 最终复盘已生成，显示在消息流中

5. `error`
- live 出错时回退到文字输入，不中断当前会话

不要让用户显式感知太多中间状态，比如：

- token 获取中
- provider fallback 中
- background persistence 中

这些都应该尽量隐到系统层。

## 8. API 收敛建议

极简版只围绕 4 条主链路组织：

1. `start conversation`
- 创建 topic 或会话

2. `send/receive turn`
- 文本或 live turn

3. `end conversation`
- 关闭 session

4. `generate review`
- 输出最终复盘

与主链路无关的 API 可以先从主页面断开：

- profile 推荐
- 复杂本地迁移
- 练习游戏
- 多余评估派生接口

## 9. 建议的 UI 文案

### 9.1 首页主标题

`Practice English by chatting with an AI coach.`

副标题：

`Start a topic, speak for a few turns, and get a short review at the end.`

### 9.2 主按钮

- `Start chatting`
- `Use voice`
- `End and get review`
- `Try another topic`

### 9.3 复盘标题

- `Conversation Review`
- `What went well`
- `What to fix next`
- `Useful phrases`

## 10. 实施顺序

### Phase 1：交互收敛

目标：先把用户看到的产品收成 chatbot。

- 首页改成聊天入口
- 默认只展示 `实时对话`
- 单轮完整批改降为次级入口
- 最终点评改成消息流里的结束卡片

### Phase 2：控制项下沉

- 把 `CoachPreferencesPanel` 收进 `Settings`
- 隐藏游戏和复杂结果面板
- 减少练习页可见控件数量

### Phase 3：历史页简化

- 历史页只展示：会话标题、时间、最后复盘摘要
- 点击后进入完整消息与复盘回看

## 11. 对现有代码的直接建议

如果按最小代价落地，建议这样改：

1. 保留 [GeminiLiveVoicePanel.tsx](/Users/huiliu/Projects/speakonimage/src/components/input/GeminiLiveVoicePanel.tsx) 作为核心输入组件
2. 保留 [session-review.ts](/Users/huiliu/Projects/speakonimage/src/domains/teachers/session-review.ts) 作为结束后复盘生成器
3. 保留 [useConversation.ts](/Users/huiliu/Projects/speakonimage/src/hooks/useConversation.ts) 作为会话主状态
4. 把 [page.tsx](/Users/huiliu/Projects/speakonimage/src/app/topic/practice/page.tsx) 改造成更接近聊天页的单流布局
5. 把 [page.tsx](/Users/huiliu/Projects/speakonimage/src/app/page.tsx) 从“多入口首页”改成“聊天首页”

## 12. 一句话结论

`speakonimage` 不需要先做成一个复杂的英语学习平台，更应该先做成一个顺手的 AI 口语聊天产品。

先把：

`开始聊 -> 聊几轮 -> 得到复盘`

这条路做得非常顺，再决定哪些学习档案、推荐、评估能力值得重新浮出来。
