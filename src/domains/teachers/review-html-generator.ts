import type { EvaluationOutput } from '@/lib/evaluation/evaluators/types';
import type { SkillDomain } from '@/types';
import type { HtmlArtifact, ReviewPreference, TeacherSelection, TeacherSoulId } from './types';

interface BuildHtmlArtifactInput {
  teacher: TeacherSelection;
  review: ReviewPreference;
  evaluation: EvaluationOutput;
  overallScore: number;
  reviewText: string;
  userResponse: string;
  skillDomain: SkillDomain;
}

const THEMES: Record<TeacherSoulId, { accent: string; surface: string; ink: string; glow: string }> = {
  default: { accent: '#2563eb', surface: '#eff6ff', ink: '#0f172a', glow: '#bfdbfe' },
  gentle: { accent: '#db2777', surface: '#fff1f2', ink: '#4c0519', glow: '#fecdd3' },
  strict: { accent: '#334155', surface: '#f8fafc', ink: '#111827', glow: '#cbd5e1' },
  humorous: { accent: '#ea580c', surface: '#fff7ed', ink: '#431407', glow: '#fdba74' },
  scholarly: { accent: '#4338ca', surface: '#eef2ff', ink: '#1e1b4b', glow: '#c7d2fe' },
  energetic: { accent: '#16a34a', surface: '#f0fdf4', ink: '#052e16', glow: '#bbf7d0' },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitReview(reviewText: string): string[] {
  return reviewText
    .split('\n\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildHighlights(evaluation: EvaluationOutput, skillDomain: SkillDomain): string[] {
  if (evaluation.type === 'translation') {
    return [
      `语义准确度 ${evaluation.semanticAccuracy.score}`,
      `表达自然度 ${evaluation.naturalness.score}`,
      `语法控制 ${evaluation.grammar.score}`,
      `词汇表现 ${evaluation.vocabulary.score}`,
    ];
  }

  const lines = [
    `相关性 ${evaluation.relevance.score}`,
    `展开深度 ${evaluation.depth.score}`,
    `表达创意 ${evaluation.creativity.score}`,
    `语言质量 ${evaluation.languageQuality.score}`,
  ];

  if (skillDomain === 'spoken_expression') {
    lines.unshift('本轮模式：口语表达训练');
  }

  return lines;
}

function buildCorrections(evaluation: EvaluationOutput): string[] {
  if (evaluation.type === 'translation') {
    const grammar = evaluation.grammar.errors[0];
    const natural = evaluation.naturalness.suggestions[0];

    return [
      grammar
        ? `优先修正：${grammar.rule}。把 “${grammar.original}” 改成 “${grammar.corrected}”。`
        : null,
      natural
        ? `更自然的说法：${natural}`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  const grammar = evaluation.languageQuality.grammarErrors[0];
  const expression = evaluation.betterExpressions[0];

  return [
    grammar
      ? `这轮最值得立刻修正的是 ${grammar.rule}。把 “${grammar.original}” 改成 “${grammar.corrected}”。`
      : null,
    expression
      ? `升级表达：${expression}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildHtmlArtifact(input: BuildHtmlArtifactInput): HtmlArtifact {
  if (input.review.mode !== 'html' && input.review.mode !== 'all') {
    return {
      enabled: false,
      status: 'skipped',
      reason: 'review mode does not require html',
    };
  }

  const theme = THEMES[input.teacher.soulId];
  const reviewParts = splitReview(input.reviewText);
  const highlights = buildHighlights(input.evaluation, input.skillDomain);
  const corrections = buildCorrections(input.evaluation);
  const title = `Coach Review - ${input.teacher.soulId}`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --accent: ${theme.accent};
      --surface: ${theme.surface};
      --ink: ${theme.ink};
      --glow: ${theme.glow};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, var(--glow), transparent 30%),
        linear-gradient(180deg, #ffffff 0%, var(--surface) 100%);
      min-height: 100vh;
    }
    .wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .hero, .card {
      background: rgba(255,255,255,0.86);
      border: 1px solid rgba(15,23,42,0.08);
      border-radius: 24px;
      box-shadow: 0 18px 50px rgba(15,23,42,0.08);
      backdrop-filter: blur(8px);
    }
    .hero {
      padding: 28px;
      margin-bottom: 20px;
    }
    .score {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 999px;
      background: var(--surface);
      color: var(--accent);
      font-weight: 700;
      margin-top: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
    }
    .card {
      padding: 22px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 32px; line-height: 1.1; }
    h2 { font-size: 20px; color: var(--accent); }
    p, li { line-height: 1.65; }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    .response {
      padding: 16px;
      border-radius: 18px;
      background: var(--surface);
      border-left: 6px solid var(--accent);
      white-space: pre-wrap;
    }
    .review-block {
      padding: 14px 16px;
      border-radius: 18px;
      background: #fff;
      border: 1px solid rgba(15,23,42,0.08);
      margin-bottom: 12px;
    }
    .mini {
      font-size: 14px;
      opacity: 0.76;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="mini">English Coach Lesson Artifact</div>
      <h1>本轮老师复盘</h1>
      <p class="mini">老师风格：${escapeHtml(input.teacher.soulId)} ｜ 能力域：${escapeHtml(input.skillDomain)}</p>
      <div class="score">总分 ${input.overallScore}/100</div>
    </section>

    <div class="grid">
      <section class="card">
        <h2>你的回答</h2>
        <div class="response">${escapeHtml(input.userResponse)}</div>
      </section>

      <section class="card">
        <h2>老师点评</h2>
        ${reviewParts.map((part) => `<div class="review-block">${escapeHtml(part)}</div>`).join('')}
      </section>

      <section class="card">
        <h2>关键指标</h2>
        <ul>
          ${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>

      <section class="card">
        <h2>下一轮重点</h2>
        <ul>
          ${corrections.length > 0
            ? corrections.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
            : '<li>这一轮没有明显硬伤，下一步重点是继续扩大表达展开和自然度。</li>'}
        </ul>
      </section>
    </div>
  </div>
</body>
</html>`;

  return {
    enabled: true,
    status: 'generated',
    title,
    html,
  };
}
