import {
  buildPracticeGameSystemPrompt,
  buildPracticeGameUserPrompt,
} from '@/lib/llm/prompts/generate-practice-game';

describe('buildPracticeGameSystemPrompt', () => {
  it('does not instruct the model to show final scores', () => {
    const prompt = buildPracticeGameSystemPrompt('mei');
    expect(prompt).not.toContain('最后显示总分');
    expect(prompt).toContain('不要做分数结算');
    expect(prompt).toContain("type: 'game-complete', completed: 4");
  });
});

describe('buildPracticeGameUserPrompt', () => {
  it('does not include overall score or numeric score fields', () => {
    const prompt = buildPracticeGameUserPrompt({
      chinesePrompt: '描述一次旅行经历',
      userResponse: 'I went to Hangzhou and it was beautiful.',
      cefrLevel: 'B1',
      topicType: 'expression',
      evaluation: {
        type: 'expression',
        relevance: { score: 88, comment: 'Good' },
        languageQuality: { score: 70, comment: 'Needs work' },
      },
    });

    expect(prompt).not.toContain('## 总分');
    expect(prompt).not.toContain('/100');
    expect(prompt).not.toContain('"score"');
    expect(prompt).toContain('## 详细评估');
  });
});
