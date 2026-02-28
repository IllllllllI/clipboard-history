import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Copy, Check } from 'lucide-react';
import type { DateTimeMatch } from '../../utils';
import { getDateTimeFormats } from '../../utils';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';
import { HighlightText } from './HighlightText';
import './styles/datetime-chip.css';

// ---------------------------------------------------------------------------
// DateTimeChip — 单个日期时间高亮标签 + 悬停弹出格式转换
// ---------------------------------------------------------------------------

export const DateTimeChip = React.memo(function DateTimeChip({
  match,
  isSelected,
  searchQuery,
  darkMode,
  copyText,
}: {
  match: DateTimeMatch;
  isSelected: boolean;
  searchQuery: string;
  darkMode: boolean;
  copyText: (text: string) => Promise<void>;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  const formats = useMemo(() => getDateTimeFormats(match.info), [match.info]);
  const { popoverRef, style } = usePopoverPosition(chipRef, showPopover);

  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowPopover(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => setShowPopover(false), 200);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(
    async (value: string, key: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await copyText(value);
        setCopiedKey(key);
        if (copiedTimerRef.current) {
          clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = setTimeout(() => {
          setCopiedKey(null);
          copiedTimerRef.current = null;
        }, 1200);
      } catch (err) {
        console.error('Failed to copy datetime format', err);
      }
    },
    [copyText],
  );

  return (
    <span
      ref={chipRef}
      className={`clip-item-datetime-chip ${
        isSelected
          ? darkMode
            ? 'clip-item-datetime-chip-selected clip-item-datetime-chip-selected-dark'
            : 'clip-item-datetime-chip-selected'
          : 'clip-item-datetime-chip-default'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Clock className="clip-item-datetime-chip-icon" />
      <HighlightText text={match.text} highlight={searchQuery} />

      {/* Portal Popover */}
      {showPopover &&
        formats.length > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            style={style}
            className="clip-item-datetime-popover"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="clip-item-datetime-popover-title">
              快捷复制
            </span>
            {formats.map((fmt) => {
              const key = `${match.start}-${fmt.label}`;
              const isCopied = copiedKey === key;
              return (
                <button
                  key={key}
                  onClick={(e) => handleCopy(fmt.value, key, e)}
                  className={`clip-item-datetime-popover-btn ${
                    isCopied
                      ? 'clip-item-datetime-popover-btn-copied'
                      : ''
                  }`}
                >
                  {isCopied ? (
                    <Check className="clip-item-datetime-popover-icon clip-item-datetime-popover-icon-ok" />
                  ) : (
                    <Copy className="clip-item-datetime-popover-icon" />
                  )}
                  <span className="clip-item-datetime-popover-label">{fmt.label}</span>
                  <span className="clip-item-datetime-popover-value">{fmt.value}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
});

// ---------------------------------------------------------------------------
// HighlightDateTimeText — 将日期时间片段包裹为 DateTimeChip
// ---------------------------------------------------------------------------

export const HighlightDateTimeText = React.memo(function HighlightDateTimeText({
  text,
  matches,
  searchQuery,
  isSelected,
  darkMode,
  copyText,
}: {
  text: string;
  matches: DateTimeMatch[];
  searchQuery: string;
  isSelected: boolean;
  darkMode: boolean;
  copyText: (text: string) => Promise<void>;
}) {
  if (matches.length === 0) {
    return <HighlightText text={text} highlight={searchQuery} />;
  }

  const segments = useMemo(() => {
    const computed: { text: string; isDateTime: boolean; matchIdx: number }[] = [];
    let lastEnd = 0;
    for (let mi = 0; mi < matches.length; mi++) {
      const match = matches[mi];
      if (match.start > lastEnd) {
        computed.push({ text: text.slice(lastEnd, match.start), isDateTime: false, matchIdx: -1 });
      }
      computed.push({ text: text.slice(match.start, match.end), isDateTime: true, matchIdx: mi });
      lastEnd = match.end;
    }
    if (lastEnd < text.length) {
      computed.push({ text: text.slice(lastEnd), isDateTime: false, matchIdx: -1 });
    }
    return computed;
  }, [text, matches]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.isDateTime ? (
          <DateTimeChip
            key={i}
            match={matches[seg.matchIdx]}
            isSelected={isSelected}
            searchQuery={searchQuery}
            darkMode={darkMode}
            copyText={copyText}
          />
        ) : (
          <HighlightText key={i} text={seg.text} highlight={searchQuery} />
        ),
      )}
    </>
  );
});
