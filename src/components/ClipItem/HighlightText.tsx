import React from 'react';
import { escapeRegExp } from '../../utils';

/** 安全的文本高亮（转义正则特殊字符） */
export const HighlightText = React.memo(function HighlightText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight.trim()) return <>{text}</>;
  try {
    const escaped = escapeRegExp(highlight);
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
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
