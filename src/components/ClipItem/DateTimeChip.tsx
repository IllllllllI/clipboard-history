import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Copy, Check } from 'lucide-react';
import type { DateTimeMatch } from '../../utils';
import { getDateTimeFormats } from '../../utils';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';
import { HighlightText } from './HighlightText';

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
      className={`inline-flex items-center gap-0.5 px-1 py-0 rounded cursor-default transition-colors ${
        isSelected
          ? darkMode
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          : 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Clock className="w-3 h-3 shrink-0 opacity-60" />
      <HighlightText text={match.text} highlight={searchQuery} />

      {/* Portal Popover */}
      {showPopover &&
        formats.length > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            style={style}
            className="flex flex-col gap-0.5 p-1.5 rounded-xl shadow-xl border backdrop-blur-sm bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 min-w-[150px] max-w-[300px]"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[9px] text-neutral-400 dark:text-neutral-500 px-1 mb-0.5 font-medium select-none">
              快捷复制
            </span>
            {formats.map((fmt) => {
              const key = `${match.start}-${fmt.label}`;
              const isCopied = copiedKey === key;
              return (
                <button
                  key={key}
                  onClick={(e) => handleCopy(fmt.value, key, e)}
                  className={`flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded-lg transition-all duration-150 text-left whitespace-nowrap ${
                    isCopied
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {isCopied ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 shrink-0 opacity-40" />
                  )}
                  <span className="font-medium shrink-0 min-w-[2rem]">{fmt.label}</span>
                  <span className="opacity-60 truncate">{fmt.value}</span>
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
