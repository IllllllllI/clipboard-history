import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ClipFormat } from '../../types';

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
 * 性能：已使用 React.memo，上层调用中已抽离稳定节点引用。
 * 访问性：支持标准 WAI-ARIA 列表框规范，并提供完整的上下箭头与 Esc 快捷键支持。
 */
export const FormatSelector = React.memo(function FormatSelector({
  currentFormat,
  formats,
  onChange,
  darkMode,
}: FormatSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const availableOptions = useMemo(() => {
    const formatKeys = new Set(formats.map((f) => f.format));
    return ALL_FORMAT_OPTIONS.filter((o) => o.id === 'text' || formatKeys.has(o.id));
  }, [formats]);

  const current = availableOptions.find((o) => o.id === currentFormat);

  const close = useCallback(() => {
    setOpen(false);
    // 恢复焦点至触发器
    buttonRef.current?.focus();
  }, []);

  const handleSelect = useCallback((id: ContentFormatId) => {
    onChange(id);
    close();
  }, [onChange, close]);

  // 键盘导航 (Listbox 模式支持)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); // 阻止页面滚动
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []
      );
      if (!items.length) return;

      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      let nextIndex = 0;
      
      if (currentIndex === -1) {
        nextIndex = e.key === 'ArrowDown' ? 0 : items.length - 1;
      } else {
        if (e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % items.length;
        } else {
          nextIndex = (currentIndex - 1 + items.length) % items.length;
        }
      }
      items[nextIndex]?.focus();
    } else if (e.key === 'Tab') {
      // 在选项内按 Tab 应关闭菜单
      close();
    }
  }, [open, close]);

  // 全局点击遮罩关闭 (防异常解绑)
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    close();
  }, [close]);

  // 打开时聚焦当前激活项
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const active = menuRef.current.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (active) {
      active.focus();
    } else {
      // 若无选中，默认聚焦第一项
      menuRef.current.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
    }
  }, [open]);

  return (
    <div 
      className="code-editor-format" 
      data-theme={darkMode ? 'dark' : 'light'}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="code-editor-format-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="切换内容格式"
        aria-controls={open ? "format-selector-menu" : undefined}
      >
        {current?.label ?? '纯文本'}
        <ChevronDown className="code-editor-format-chevron" data-open={open ? 'true' : 'false'} aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Backdrop 用做透明遮罩层拦截外层点击 */}
          <div 
            className="code-editor-format-backdrop" 
            onClick={handleBackdropClick} 
            aria-hidden="true"
          />
          <div 
            id="format-selector-menu"
            className="code-editor-format-menu" 
            role="listbox" 
            aria-label="可用的内容格式" 
            ref={menuRef}
          >
            {availableOptions.map((opt) => {
              const isSelected = opt.id === currentFormat;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className="code-editor-format-item"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isSelected ? 'true' : 'false'}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
