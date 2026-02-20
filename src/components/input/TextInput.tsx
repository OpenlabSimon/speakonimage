'use client';

import { useState } from 'react';

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TextInput({ onSubmit, disabled, placeholder }: TextInputProps) {
  const [text, setText] = useState('');

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
        placeholder={placeholder || "Type your English response here..."}
        disabled={disabled}
        className={`
          w-full h-32 px-4 py-3 border border-gray-200 rounded-xl resize-none
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
        `}
      />
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {wordCount} words / {text.length} characters
          <span className="ml-2 text-xs text-gray-400">(Ctrl+Enter to submit)</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className={`
            px-6 py-2 rounded-lg font-medium transition-colors
            ${disabled || !text.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
            }
          `}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
