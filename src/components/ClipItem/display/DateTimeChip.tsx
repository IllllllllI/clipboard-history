import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Copy, Check } from 'lucide-react';
import type { DateTimeMatch } from '../../../utils';
import { getDateTimeFormats } from '../../../utils';
import { usePopoverPosition } from '../../../hooks/usePopoverPosition';
import { HighlightText } from './HighlightText';
import './styles/datetime-chip.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HIDE_DELAY = 200;
const COPIED_RESET_DELAY = 1200;

/** 安全清除定时器并置空 */
function clearTimer(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

// ---------------------------------------------------------------------------
// DateTimeChip — 单个日期时间高亮标签 + 悬停弹出格式转换
// ---------------------------------------------------------------------------

export interface DateTimeChipProps {
  match: DateTimeMatch;
  isSelected: boolean;
  searchQuery: string;
  darkMode: boolean;
  copyText: (text: string) => Promise<void>;
}

export const DateTimeChip = React.memo(function DateTimeChip({
  match,
  isSelected,
  searchQuery,
  darkMode,
  copyText,
}: DateTimeChipProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  // 性能: 仅在 popover 可见时计算格式列表，避免每个 chip 在关闭态下白做运算
  const formats = useMemo(
    () => (showPopover ? getDateTimeFormats(match.info) : []),
    [showPopover, match.info],
  );

  const { popoverRef, style } = usePopoverPosition(chipRef, showPopover);

  const handleMouseEnter = useCallback(() => {
    clearTimer(hideTimerRef);
    setShowPopover(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimer(hideTimerRef);
    hideTimerRef.current = setTimeout(() => setShowPopover(false), HIDE_DELAY);
  }, []);

  // 键盘：Enter/Space 切换 popover，Escape 关闭
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowPopover((prev) => !prev);
    } else if (e.key === 'Escape' && showPopover) {
      setShowPopover(false);
    }
  }, [showPopover]);

  // 卸载时统一清理定时器
  useEffect(() => () => { clearTimer(hideTimerRef); clearTimer(copiedTimerRef); }, []);

  const handleCopy = useCallback(
    async (value: string, key: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await copyText(value);
        setCopiedKey(key);
        clearTimer(copiedTimerRef);
        copiedTimerRef.current = setTimeout(() => {
          setCopiedKey(null);
          copiedTimerRef.current = null;
        }, COPIED_RESET_DELAY);
      } catch (err) {
        console.error('Failed to copy datetime format', err);
      }
    },
    [copyText],
  );

  const theme = darkMode ? 'dark' : 'light';

  return (
    <span
      ref={chipRef}
      className="clip-item-datetime-chip"
      data-selected={isSelected || undefined}
      data-theme={theme}
      tabIndex={0}
      role="button"
      aria-haspopup="menu"
      aria-expanded={showPopover}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <Clock className="clip-item-datetime-chip-icon" aria-hidden="true" />
      <HighlightText text={match.text} highlight={searchQuery} darkMode={darkMode} />

      {showPopover &&
        formats.length > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            style={style}
            className="clip-item-datetime-popover"
            data-theme={theme}
            role="menu"
            aria-label="日期时间格式"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="clip-item-datetime-popover-title" aria-hidden="true">
              快捷复制
            </span>
            {formats.map((fmt) => {
              const key = `${match.start}-${fmt.label}`;
              const isCopied = copiedKey === key;
              return (
                <button
                  key={key}
                  role="menuitem"
                  className="clip-item-datetime-popover-btn"
                  data-copied={isCopied || undefined}
                  data-theme={theme}
                  title={`复制: ${fmt.value}`}
                  onClick={(e) => handleCopy(fmt.value, key, e)}
                >
                  {isCopied ? (
                    <Check
                      className="clip-item-datetime-popover-icon clip-item-datetime-popover-icon-ok"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy className="clip-item-datetime-popover-icon" aria-hidden="true" />
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
