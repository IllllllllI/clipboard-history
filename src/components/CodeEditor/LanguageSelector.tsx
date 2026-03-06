import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAvailableLanguages, type LanguageId } from '../../utils/languageDetect';

interface LanguageSelectorProps {
  currentLang: LanguageId;
  onChange: (id: LanguageId) => void;
  darkMode: boolean;
}

/** 代码语言下拉选择器 */
export const LanguageSelector = React.memo(function LanguageSelector({
  currentLang,
  onChange,
  darkMode,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const languages = useMemo(() => getAvailableLanguages(), []);
  const current = languages.find((l) => l.id === currentLang);

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

  // 打开时滚动并聚焦当前激活项
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const active = menuRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
      active.focus();
    }
  }, [open]);

  return (
    <div className="code-editor-lang" data-theme={darkMode ? 'dark' : 'light'}>
      <button
        onClick={() => setOpen(!open)}
        className="code-editor-lang-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="代码语言"
      >
        {current?.label ?? '纯文本'}
        <ChevronDown className="code-editor-lang-chevron" data-open={open ? 'true' : 'false'} />
      </button>

      {open && (
        <>
          <div className="code-editor-lang-backdrop" onClick={close} />
          <div className="code-editor-lang-menu custom-scrollbar" role="listbox" aria-label="代码语言" ref={menuRef}>
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  onChange(lang.id);
                  close();
                }}
                className="code-editor-lang-item"
                role="option"
                aria-selected={lang.id === currentLang}
                data-active={lang.id === currentLang ? 'true' : 'false'}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
