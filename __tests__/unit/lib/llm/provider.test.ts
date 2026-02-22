import { withRetry, LLMError } from '@/lib/llm/provider';

describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and returns the result when a later attempt succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 1);

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting all retries', async () => {
    const error1 = new Error('fail 1');
    const error2 = new Error('fail 2');
    const fn = vi.fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2);

    await expect(withRetry(fn, 1)).rejects.toThrow(error2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when maxRetries is 0', async () => {
    const error = new Error('only attempt');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, 0)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('LLMError', () => {
  it('has the correct name, message, provider, and cause properties', () => {
    const cause = new Error('underlying issue');
    const error = new LLMError('something went wrong', 'openai', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LLMError);
    expect(error.name).toBe('LLMError');
    expect(error.message).toBe('something went wrong');
    expect(error.provider).toBe('openai');
    expect(error.cause).toBe(cause);
  });

  it('allows cause to be undefined', () => {
    const error = new LLMError('no cause', 'anthropic');

    expect(error.name).toBe('LLMError');
    expect(error.message).toBe('no cause');
    expect(error.provider).toBe('anthropic');
    expect(error.cause).toBeUndefined();
  });
});
