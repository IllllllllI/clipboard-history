import React, { useMemo } from 'react';
import type { DateTimeMatch } from '../../../utils';
import { DateTimeChip } from './DateTimeChip';
import { HighlightText } from './HighlightText';

// ---------------------------------------------------------------------------
// 文本分段类型
// ---------------------------------------------------------------------------

interface TextSegment {
  /** 片段在原文中的起始偏移（用于稳定 key） */
  start: number;
  /** 片段文本 */
  text: string;
  /** 是否为日期时间匹配 */
  isDateTime: boolean;
  /** 对应 matches 数组的下标（-1 表示普通文本） */
  matchIdx: number;
}

// ---------------------------------------------------------------------------
// HighlightDateTimeText — 将日期时间片段包裹为 DateTimeChip
// ---------------------------------------------------------------------------

export interface HighlightDateTimeTextProps {
  text: string;
  matches: readonly DateTimeMatch[];
  searchQuery: string;
  isSelected: boolean;
  darkMode: boolean;
  copyText: (text: string) => Promise<void>;
}

/**
 * 将文本按日期时间匹配区间拆分为「普通文本 + DateTimeChip」交替片段。
 *
 * 使用 match 的 start 位置作为稳定 key，比数组下标更可靠——
 * 同一段文本中，每个日期时间匹配的起始偏移是唯一且不变的。
 */
export const HighlightDateTimeText = React.memo(function HighlightDateTimeText({
  text,
  matches,
  searchQuery,
  isSelected,
  darkMode,
  copyText,
}: HighlightDateTimeTextProps) {
  const segments = useMemo(() => {
    if (matches.length === 0) return null;

    const result: TextSegment[] = [];
    let lastEnd = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      // 匹配前的普通文本
      if (m.start > lastEnd) {
        result.push({ start: lastEnd, text: text.slice(lastEnd, m.start), isDateTime: false, matchIdx: -1 });
      }
      // 日期时间匹配片段
      result.push({ start: m.start, text: text.slice(m.start, m.end), isDateTime: true, matchIdx: i });
      lastEnd = m.end;
    }

    // 尾部剩余文本
    if (lastEnd < text.length) {
      result.push({ start: lastEnd, text: text.slice(lastEnd), isDateTime: false, matchIdx: -1 });
    }

    return result;
  }, [text, matches]);

  if (!segments) {
    return <HighlightText text={text} highlight={searchQuery} darkMode={darkMode} />;
  }

  return (
    <>
      {segments.map((seg) =>
        seg.isDateTime ? (
          <DateTimeChip
            key={`dt-${seg.start}`}
            match={matches[seg.matchIdx]}
            isSelected={isSelected}
            searchQuery={searchQuery}
            darkMode={darkMode}
            copyText={copyText}
          />
        ) : (
          <HighlightText
            key={`t-${seg.start}`}
            text={seg.text}
            highlight={searchQuery}
            darkMode={darkMode}
          />
        ),
      )}
    </>
  );
});
