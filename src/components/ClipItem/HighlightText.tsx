import React, { useMemo } from 'react';
import { escapeRegExp } from '../../utils';

interface HighlightTextProps {
  text: string;
  highlight: string;
}

/** 安全的文本高亮（转义正则特殊字符） */
export const HighlightText = React.memo(function HighlightText({
  text,
  highlight,
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
              className="bg-yellow-200 dark:bg-yellow-800/50 text-inherit rounded-sm px-0.5"
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
