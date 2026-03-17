# Cloud Coach Runtime Plan

## Goal

Build `speakonimage` into a cloud-hosted English coaching runtime inspired by OpenClaw's operating model:

- `session`: every practice round is a durable coaching session
- `memory`: the system stores structured learning memory, not just chat logs
- `subagent`: specialized evaluators and planners handle focused subtasks
- `html artifact`: every round can output an interactive lesson page
- `soul`: each teacher has a stable persona, teaching philosophy, and voice

This is not a general-purpose agent platform. It is a domain-specific coaching system for improving English expression.

## Product Boundary

The system serves one job only: help users improve English expression through repeated practice and feedback.

User inputs:

- text
- voice

Core practice modes:

- `translation_text`
- `translation_voice`
- `expression_text`
- `expression_voice`

Core rule:

- translation tasks do not evaluate speaking ability
- voice input does not automatically mean speaking assessment
- only `expression_voice` should affect spoken-expression coaching

## Coaching Model

### Skill domains

The runtime should separate task type from skill domain.

```ts
type PracticeMode =
  | "translation_text"
  | "translation_voice"
  | "expression_text"
  | "expression_voice";

type SkillDomain =
  | "translation"
  | "written_expression"
  | "spoken_expression";
```

Mapping:

- `translation_text` -> `translation`
- `translation_voice` -> `translation`
- `expression_text` -> `written_expression`
- `expression_voice` -> `spoken_expression`

### Teacher soul

`soul` is the stable teacher identity that shapes output style, pacing, tone, and voice.

```ts
type TeacherSoul = {
  id: string;
  name: string;
  archetype: "gentle" | "strict" | "humorous" | "scholarly" | "energetic";
  teachingPhilosophy: string;
  correctionStyle: "direct" | "scaffolded" | "praise_first";
  explanationLanguage: "zh" | "en" | "mixed";
  feedbackLength: "short" | "medium" | "long";
  emotionalTone: "warm" | "neutral" | "challenging";
  voiceProvider: "elevenlabs" | "azure" | "none";
  voiceId?: string;
  artifactTheme: "clean" | "playful" | "serious";
};
```

### Student memory

```ts
type StudentLearningMemory = {
  learnerProfile: {
    expressionLevel: string;
    speakingLevel?: string;
    confidence: number;
    preferredInput: "text" | "voice" | "mixed";
  };
  preferences: {
    preferredTeacherSoulId?: string;
    preferredVoiceId?: string;
    autoPlayReviewAudio: boolean;
    preferredReviewMode: "text" | "audio" | "html" | "all";
    explanationLanguage: "zh" | "en" | "mixed";
  };
  errorMemory: Array<{
    key: string;
    domain: SkillDomain;
    pattern: string;
    recentCount: number;
    trend: "improving" | "stable" | "increasing";
    examples: string[];
  }>;
  vocabMemory: Array<{
    word: string;
    status: "new" | "developing" | "usable" | "mastered";
    weakUsageCount: number;
  }>;
  topicMemory: Array<{
    topicKey: string;
    comfortLevel: "low" | "medium" | "high";
    lastSeenAt: string;
  }>;
};
```

## Runtime Architecture

### Main orchestration

Use a single `CoachAgent` as the stable user-facing orchestrator.

Responsibilities:

- identify practice mode
- load teacher soul and student memory
- dispatch subagents
- merge results into one coaching response
- persist session and memory
- generate optional HTML artifact and audio review

### Subagents

The first production version only needs four subagents.

#### 1. EvaluatorSubagent

Outputs structured scoring and diagnosis.

- translation evaluator
- written expression evaluator
- spoken expression evaluator

#### 2. ErrorAnalysisSubagent

Extracts the top 1-3 issues worth correcting now.

#### 3. RewriteSubagent

Produces:

- corrected version
- more natural version
- upgraded version

#### 4. LessonArtifactSubagent

Builds a portable HTML lesson page for review and replay.

Later additions:

- PlannerSubagent
- MemoryCompactionSubagent
- ReviewSchedulerSubagent

### Session lifecycle

Every round should follow this flow:

1. receive user input
2. classify mode
3. run evaluator
4. run error analysis and rewrite
5. synthesize teacher review in selected soul
6. optionally generate audio review
7. optionally generate HTML artifact
8. persist session, attempt, and memory updates
9. produce next-step recommendation

## Data Model Plan

The current schema already has useful foundations:

- `Account`
- `Speaker`
- `Topic`
- `Submission`
- `GrammarError`
- `VocabularyUsage`
- `ChatSession`
- `ChatMessage`
- `ReviewItem`

The next step is to extend the schema for cloud runtime concerns.

### New tables

#### `ProviderCredential`

Stores provider configuration like OpenClaw's API-key setup.

```prisma
model ProviderCredential {
  id          String   @id @default(uuid())
  ownerType    String   // 'system' | 'account'
  ownerId      String?
  provider     String   // 'google' | 'openai' | 'anthropic' | 'azure-speech' | 'elevenlabs'
  label        String
  baseUrl      String?
  apiKeyRef    String   // encrypted secret reference
  config       Json     @default("{}")
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([ownerType, ownerId, provider])
}
```

#### `Teacher`

```prisma
model Teacher {
  id          String   @id @default(uuid())
  key         String   @unique
  name        String
  soul        Json
  isDefault   Boolean  @default(false)
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### `Artifact`

```prisma
model Artifact {
  id           String   @id @default(uuid())
  sessionId     String
  submissionId  String?
  artifactType  String   // 'lesson_html' | 'review_audio' | 'summary_card'
  storageUrl    String
  metadata      Json     @default("{}")
  createdAt     DateTime @default(now())

  @@index([sessionId, artifactType])
}
```

#### `LearningMemory`

```prisma
model LearningMemory {
  id          String   @id @default(uuid())
  accountId    String
  speakerId    String?
  memoryType   String   // 'profile' | 'error' | 'vocab' | 'topic' | 'preference'
  memoryKey    String
  content      Json
  lastUsedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([accountId, speakerId, memoryType, memoryKey])
}
```

## API Plan

The current routes are still feature-first. For the cloud coaching runtime, move toward domain-specific endpoints.

### Public runtime API

- `POST /api/coach/round`
  - single entrypoint for a coaching round
  - input: mode, topic, response text or audio reference, teacher preference
  - output: evaluation, review, artifact refs, next step

- `POST /api/coach/artifacts`
  - regenerate HTML lesson page or audio review from an existing session/submission

- `GET /api/coach/sessions`
  - session list

- `GET /api/coach/sessions/:id`
  - full session detail

- `GET /api/coach/memory`
  - current learner memory summary

### Admin/config API

- `GET /api/admin/providers`
- `POST /api/admin/providers`
- `PATCH /api/admin/providers/:id`
- `GET /api/admin/teachers`
- `POST /api/admin/teachers`
- `PATCH /api/admin/teachers/:id`

## Code Organization Plan

Move from the current mixed structure to a domain-first runtime structure.

```text
src/
  domains/
    runtime/
      coach-runtime.ts
      round-orchestrator.ts
      types.ts
    practice/
      evaluators/
        evaluate-translation-attempt.ts
        evaluate-written-expression-attempt.ts
        evaluate-spoken-expression-attempt.ts
      services/
        persist-practice-attempt.ts
        build-practice-context.ts
      api/
        run-coaching-round.ts
      types.ts
    teachers/
      teacher-registry.ts
      teacher-souls.ts
      teacher-voice.ts
      types.ts
    memory/
      memory-service.ts
      memory-aggregator.ts
      memory-compactor.ts
      types.ts
    artifacts/
      lesson-html-generator.ts
      review-audio-generator.ts
      artifact-repository.ts
      types.ts
    providers/
      provider-config-service.ts
      secret-store.ts
      llm-provider-factory.ts
      tts-provider-factory.ts
      speech-provider-factory.ts
  app/
    api/
      coach/
      admin/
```

## Refactor Sequence

### Step 1: separate evaluation logic by skill domain

Current problem:

- evaluation logic is mixed with persistence and session side effects

Create:

- `evaluate-translation-attempt.ts`
- `evaluate-written-expression-attempt.ts`
- `evaluate-spoken-expression-attempt.ts`

Rules:

- translation attempts never update spoken coaching metrics
- text expression attempts update only expression metrics
- voice expression attempts can update spoken metrics

### Step 2: extract a runtime orchestrator

Create `round-orchestrator.ts` to replace page-level orchestration.

Input:

- mode
- topic
- user response
- teacher preference
- speaker/account context

Output:

- evaluation result
- teacher review
- HTML artifact metadata
- audio artifact metadata
- memory delta
- next-step suggestion

### Step 3: extract persistence and side effects

Split today's `evaluateSubmission.ts` into:

- evaluation service
- submission repository
- session write service
- memory update service
- artifact generation service

### Step 4: replace localStorage topic transport

For authenticated users:

- always store topic and navigate by topic id

For anonymous users:

- use a signed draft token or transient topic record

### Step 5: add provider configuration UI

Implement OpenClaw-like provider configuration:

- per-provider API key setup
- base URL
- default model
- timeout and retry options

Provider targets:

- Google Gemini
- OpenAI
- Anthropic
- Azure Speech
- ElevenLabs

## Milestones

### M1: single-round cloud coach

Target:

- one cloud endpoint for a coaching round
- support text and voice inputs
- return structured evaluation and teacher review
- save session and submission

Done when:

- a user can submit one answer and get a durable coaching result

### M2: soul + audio + HTML artifact

Target:

- teacher soul switching
- ElevenLabs-backed review audio
- HTML lesson artifact generation
- review mode selection: text, audio, html, all

Done when:

- the same answer can be replayed in multiple teacher styles and formats

### M3: memory-driven coaching

Target:

- structured learner memory
- recurring weaknesses
- personalized next-task selection
- memory summaries injected into coaching rounds

Done when:

- the coach clearly adapts to the user's history

### M4: scheduled review and coach ops

Target:

- cron-based review planning
- teacher and provider admin pages
- artifact regeneration
- cloud ops visibility

Done when:

- the product can run as a maintained cloud service, not just a demo flow

## First Sprint Task List

### Product and domain

- define `PracticeMode` and `SkillDomain` in shared types
- document the rule that translation does not equal speaking assessment
- define `TeacherSoul` and `StudentLearningMemory` schemas

### Refactor

- split `evaluateSubmission.ts` into domain-specific evaluators
- create `round-orchestrator.ts`
- create `persist-practice-attempt.ts`
- remove evaluation-side session writes from evaluator code

### Cloud runtime

- add provider config tables and migration
- add teacher tables and seed data
- create `POST /api/coach/round`

### Output

- build `lesson-html-generator.ts`
- add `review-audio-generator.ts` using ElevenLabs
- support user preference: text only vs audio vs html vs all

### UI

- add teacher selector
- add review mode selector
- add artifact viewer page

## What To Reuse From Current SpeakOnImage

Keep and evolve:

- current Prisma schema foundations
- current topic generation logic
- current review scheduling foundations
- current auth system
- current speech ingestion logic
- current evaluation prompts as the starting point

Replace or heavily reshape:

- page-level orchestration in `src/app/topic/practice/page.tsx`
- `localStorage` topic transport
- mixed evaluation + persistence logic in `src/lib/evaluation/evaluateSubmission.ts`
- direct feature-first API layering for coaching rounds

## Immediate Recommendation

Start with architecture and domain refactor before adding new UX features.

The correct order is:

1. separate skill-domain evaluation
2. build coach runtime orchestrator
3. add provider configuration and teacher soul
4. add HTML artifact and voice review
5. add memory-driven planning

If this order is reversed, the project will accumulate more product ideas on top of unstable boundaries.
