'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '@/types';
import BrandAvatar from './BrandAvatar';

interface Props {
  message: ChatMessageType;
  brandName?: string;
  isQuizMode?: boolean;
  isStreaming?: boolean;
}

export default function ChatMessage({ message, brandName = 'Bot', isQuizMode, isStreaming = false }: Props) {
  const isUser = message.role === 'user';
  const [displayed, setDisplayed] = useState(isStreaming ? '' : message.content);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(message.content);
      return;
    }

    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(message.content.slice(0, i));
      if (i >= message.content.length) clearInterval(interval);
    }, 15);

    return () => clearInterval(interval);
  }, [message.content, isStreaming]);

  if (isUser) {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 px-4">
      <BrandAvatar name={brandName} size="sm" />
      <div
        className={`max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed ${
          isQuizMode
            ? 'bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100'
            : 'bg-muted text-foreground'
        }`}
      >
        {isQuizMode && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">🎯 퀴즈</p>
        )}
        <p className="whitespace-pre-wrap">
          {displayed}
          {isStreaming && displayed.length < message.content.length && (
            <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
}
