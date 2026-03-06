import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ClipFormat } from '../../types';

/** 可显示的格式标识 */
export type ContentFormatId = 'text' | 'html' | 'rtf';

export interface ContentFormatOption {
  id: ContentFormatId;
  label: string;
}

const ALL_FORMAT_OPTIONS: ContentFormatOption[] = [
  { id: 'text', label: '纯文本' },
  { id: 'html', label: 'HTML' },
  { id: 'rtf',  label: 'RTF' },
];

interface FormatSelectorProps {
  currentFormat: ContentFormatId;
  formats: ClipFormat[];
  onChange: (id: ContentFormatId) => void;
  darkMode: boolean;
}

/**
 * 内容格式下拉选择器（用于富文本条目的 CodeEditor 工具栏）。
 *
 * 根据已加载的 formats 动态过滤可选项：
 * - 始终显示 "纯文本"
 * - 仅当 formats 中存在对应项时才显示 HTML / RTF
 */
export const FormatSelector = React.memo(function FormatSelector({
  currentFormat,
  formats,
  onChange,
  darkMode,
}: FormatSelectorProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const availableOptions = useMemo(() => {
    const formatKeys = new Set(formats.map((f) => f.format));
    return ALL_FORMAT_OPTIONS.filter((o) => o.id === 'text' || formatKeys.has(o.id));
  }, [formats]);

  const current = availableOptions.find((o) => o.id === currentFormat);

  const close = useCallback(() => setOpen(false), []);

  // Escape 关闭菜单
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, close]);

  // 打开时聚焦当前激活项
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const active = menuRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
    active?.focus();
  }, [open]);

  return (
    <div className="code-editor-format" data-theme={darkMode ? 'dark' : 'light'}>
      <button
        onClick={() => setOpen(!open)}
        className="code-editor-format-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="内容格式"
      >
        {current?.label ?? '纯文本'}
        <ChevronDown className="code-editor-format-chevron" data-open={open ? 'true' : 'false'} />
      </button>

      {open && (
        <>
          <div className="code-editor-format-backdrop" onClick={close} />
          <div className="code-editor-format-menu" role="listbox" aria-label="内容格式" ref={menuRef}>
            {availableOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  close();
                }}
                className="code-editor-format-item"
                role="option"
                aria-selected={opt.id === currentFormat}
                data-active={opt.id === currentFormat ? 'true' : 'false'}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
