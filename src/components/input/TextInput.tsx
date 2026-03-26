'use client';

import { useEffect, useState } from 'react';

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
}

export function TextInput({ onSubmit, disabled, placeholder, initialValue = '' }: TextInputProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "在这里输入你的英语回答..."}
        disabled={disabled}
        className={`
          w-full h-32 px-4 py-3 border border-gray-200 rounded-xl resize-none
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
        `}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-500">
          {wordCount} 词 / {text.length} 字符
          <span className="ml-0 block text-xs text-gray-400 sm:ml-2 sm:inline">(Ctrl+Enter 提交)</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className={`
            min-h-12 w-full rounded-lg px-6 py-2 font-medium transition-colors sm:w-auto
            ${disabled || !text.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          提交
        </button>
      </div>
    </div>
  );
}
