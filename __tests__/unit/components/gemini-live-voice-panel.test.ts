// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiLiveVoicePanel,
  type GeminiLiveVoicePanelHandle,
} from '@/components/input/GeminiLiveVoicePanel';

const connectMock = vi.fn();
const closeMock = vi.fn();

vi.mock('@/lib/live/client', () => ({
  GeminiLiveClient: class {
    constructor(private options: Record<string, (...args: unknown[]) => void>) {}

    async connect() {
      return connectMock(this.options);
    }

    close() {
      closeMock();
      this.options.onStateChange?.('closed');
    }
    finishAudioStream() {}
    sendAudioChunk() {
      return Promise.resolve();
    }
  },
}));

describe('GeminiLiveVoicePanel', () => {
  beforeEach(() => {
    connectMock.mockReset();
    closeMock.mockReset();
    vi.stubGlobal('WebSocket', class {});
    vi.stubGlobal('AudioContext', class {
      sampleRate = 16000;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createScriptProcessor() {
        return { connect() {}, disconnect() {}, onaudioprocess: null };
      }
      createGain() {
        return { connect() {}, disconnect() {}, gain: { value: 1 } };
      }
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests fallback when live auth fails', async () => {
    const onFallbackRequested = vi.fn();
    connectMock.mockImplementation(async (options) => {
      options.onError?.('auth', 'Gemini Live session closed (1008)');
      throw new Error('Gemini Live session closed (1008)');
    });

    render(React.createElement(GeminiLiveVoicePanel, { onFallbackRequested }));

    fireEvent.click(screen.getByRole('button', { name: '连接 Live' }));

    await waitFor(() => {
      expect(onFallbackRequested).toHaveBeenCalledWith(
        expect.stringContaining('鉴权失败')
      );
    });

    expect(
      screen.getByText('已自动切回下面的标准语音提交流程。你仍然可以继续录音并拿到完整转写、评估和老师点评。')
    ).toBeTruthy();
    expect(screen.getAllByText(/鉴权失败/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gemini Live session closed \(1008\)/)).toBeTruthy();
    const liveWindow = window as typeof window & {
      __geminiLiveDiagnostics?: {
        fallbackActive?: boolean;
        error?: { code?: string; rawMessage?: string };
        timeline?: Array<{ name?: string }>;
      };
    };
    expect(liveWindow.__geminiLiveDiagnostics).toMatchObject({
      fallbackActive: true,
      error: {
        code: 'auth',
        rawMessage: 'Gemini Live session closed (1008)',
      },
    });
    expect(
      liveWindow.__geminiLiveDiagnostics?.timeline?.some((entry) => entry.name === 'fallback_requested')
    ).toBe(true);
  });

  it('hides raw 1007 close code from user-facing error text', async () => {
    const onFallbackRequested = vi.fn();
    connectMock.mockImplementation(async (options) => {
      options.onError?.('audio_format', 'Gemini Live session closed (1007)');
      throw new Error('Gemini Live session closed (1007)');
    });

    render(React.createElement(GeminiLiveVoicePanel, { onFallbackRequested }));

    fireEvent.click(screen.getByRole('button', { name: '连接 Live' }));

    await waitFor(() => {
      expect(onFallbackRequested).toHaveBeenCalledWith(
        expect.stringContaining('音频格式')
      );
    });

    expect(screen.getAllByText(/音频格式/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gemini Live session closed \(1007\)/)).toBeTruthy();
  });

  it('blocks Gemini Live on iPhone webkit and suggests standard voice submit', async () => {
    const onFallbackRequested = vi.fn();
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });

    render(React.createElement(GeminiLiveVoicePanel, { onFallbackRequested }));

    expect(screen.getByText(/iPhone 浏览器请直接使用/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '连接 Live' }).hasAttribute('disabled')).toBe(true);
    expect(onFallbackRequested).not.toHaveBeenCalled();
  });

  it('shows a single primary action and blocks restart while responding', async () => {
    connectMock.mockImplementation(async (options) => {
      options.onStateChange?.('connected');
    });

    render(React.createElement(GeminiLiveVoicePanel, { onFallbackRequested: vi.fn() }));

    fireEvent.click(screen.getByRole('button', { name: '连接 Live' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始这一轮' })).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: '结束这一轮' })).toBeNull();
    expect(screen.getByText(/一轮只做一件事：先说完，再等老师回应/)).toBeTruthy();
  });

  it('forwards finalized live turns to the caller', async () => {
    const onTurnComplete = vi.fn();
    connectMock.mockImplementation(async (options) => {
      options.onStateChange?.('connected');
      options.onTurnComplete?.({
        inputTranscript: 'I go to work by subway.',
        outputTranscript: 'Nice. What do you usually do after work?',
        outputText: 'Nice. What do you usually do after work?',
      });
    });

    render(React.createElement(GeminiLiveVoicePanel, {
      onFallbackRequested: vi.fn(),
      onTurnComplete,
    }));

    fireEvent.click(screen.getByRole('button', { name: '连接 Live' }));

    await waitFor(() => {
      expect(onTurnComplete).toHaveBeenCalledWith({
        inputTranscript: 'I go to work by subway.',
        outputTranscript: 'Nice. What do you usually do after work?',
        outputText: 'Nice. What do you usually do after work?',
      });
    });
  });

  it('exposes an imperative close action for parent-controlled shutdown', async () => {
    const panelRef = React.createRef<GeminiLiveVoicePanelHandle>();
    connectMock.mockImplementation(async (options) => {
      options.onStateChange?.('connected');
    });

    render(React.createElement(GeminiLiveVoicePanel, {
      ref: panelRef,
      onFallbackRequested: vi.fn(),
    }));

    fireEvent.click(screen.getByRole('button', { name: '连接 Live' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始这一轮' })).toBeTruthy();
    });

    await act(async () => {
      panelRef.current?.closeConnection();
    });

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
