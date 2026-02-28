import React, { useState, useMemo } from 'react';
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
  const languages = useMemo(() => getAvailableLanguages(), []);
  const current = languages.find((l) => l.id === currentLang);

  return (
    <div className="code-editor-lang" data-theme={darkMode ? 'dark' : 'light'}>
      <button
        onClick={() => setOpen(!open)}
        className="code-editor-lang-btn"
      >
        {current?.label ?? '纯文本'}
        <ChevronDown className="code-editor-lang-chevron" data-open={open ? 'true' : 'false'} />
      </button>

      {open && (
        <>
          <div className="code-editor-lang-backdrop" onClick={() => setOpen(false)} />
          <div className="code-editor-lang-menu custom-scrollbar">
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  onChange(lang.id);
                  setOpen(false);
                }}
                className="code-editor-lang-item"
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
