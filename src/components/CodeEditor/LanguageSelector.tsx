import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAvailableLanguages, type LanguageId } from '../../utils/languageDetect';

interface LanguageSelectorProps {
  currentLang: LanguageId;
  onChange: (id: LanguageId) => void;
  darkMode: boolean;
}

/** 
 * 代码语言下拉选择器
 * 
 * 性能：使用 React.memo 和 useCallback 免除多余渲染。
 * 访问性：全面支持 WAI-ARIA Listbox 规范与键盘上下焦点导航。
 */
export const LanguageSelector = React.memo(function LanguageSelector({
  currentLang,
  onChange,
  darkMode,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const languages = useMemo(() => getAvailableLanguages(), []);
  const current = languages.find((l) => l.id === currentLang);

  const close = useCallback(() => {
    setOpen(false);
    // 菜单关闭后焦点回落，防止纯键盘用户迷失重点
    buttonRef.current?.focus();
  }, []);

  const handleSelect = useCallback((id: LanguageId) => {
    onChange(id);
    close();
  }, [onChange, close]);

  // 键盘操作拦截与焦点导航
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
        // 当前没有焦点项，向下则选第一个，向上则选最后一个
        nextIndex = e.key === 'ArrowDown' ? 0 : items.length - 1;
      } else {
        if (e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % items.length;
        } else {
          nextIndex = (currentIndex - 1 + items.length) % items.length;
        }
      }
      
      const targetItem = items[nextIndex];
      targetItem?.focus();
      targetItem?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Tab') {
      // 若按 Tab 就顺便关闭菜单，走默认焦点流
      close();
    }
  }, [open, close]);

  // 全局遮罩点击，采用稳定函数防渲染跳动
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    close();
  }, [close]);

  // 动态打开时滚动并聚焦当前激活项
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const active = menuRef.current.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (active) {
      // 保证开启时定位准确
      active.scrollIntoView({ block: 'nearest' });
      active.focus();
    } else {
      // 未命中当前项时，给默认第一项获得焦点
      menuRef.current.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
    }
  }, [open]);

  return (
    <div 
      className="code-editor-lang" 
      data-theme={darkMode ? 'dark' : 'light'}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="code-editor-lang-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择代码语言"
        aria-controls={open ? "lang-selector-menu" : undefined}
      >
        {current?.label ?? '纯文本'}
        <ChevronDown 
          className="code-editor-lang-chevron" 
          data-open={open ? 'true' : 'false'} 
          aria-hidden="true" 
        />
      </button>

      {open && (
        <>
          <div 
            className="code-editor-lang-backdrop" 
            onClick={handleBackdropClick} 
            aria-hidden="true"
          />
          <div 
            id="lang-selector-menu"
            className="code-editor-lang-menu custom-scrollbar" 
            role="listbox" 
            aria-label="可用语言列表" 
            ref={menuRef}
          >
            {languages.map((lang) => {
              const isSelected = lang.id === currentLang;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleSelect(lang.id)}
                  className="code-editor-lang-item"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isSelected ? 'true' : 'false'}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
