import React, { useMemo } from 'react';
import { escapeRegExp } from '../../utils';
import './styles/highlight-text.css';

interface HighlightTextProps {
  text: string;
  highlight: string;
  darkMode?: boolean;
}

/** 安全的文本高亮（转义正则特殊字符） */
export const HighlightText = React.memo(function HighlightText({
  text,
  highlight,
  darkMode = false,
}: HighlightTextProps) {
  const trimmedHighlight = useMemo(() => highlight.trim(), [highlight]);
  const lowerHighlight = useMemo(() => trimmedHighlight.toLowerCase(), [trimmedHighlight]);

  const parts = useMemo(() => {
    if (!trimmedHighlight) return null;
    try {
      const escaped = escapeRegExp(trimmedHighlight);
      return text.split(new RegExp(`(${escaped})`, 'gi'));
    } catch {
      return null;
    }
  }, [text, trimmedHighlight]);

  if (!trimmedHighlight || !parts) return <>{text}</>;

  try {
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === lowerHighlight ? (
            <mark
              key={i}
              className="clip-item-highlight-mark"
              data-theme={darkMode ? 'dark' : 'light'}
            >
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
});
