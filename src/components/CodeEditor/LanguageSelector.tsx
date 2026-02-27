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
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
          darkMode
            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
        }`}
      >
        {current?.label ?? '纯文本'}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 top-full mt-1 z-50 w-44 max-h-64 overflow-y-auto rounded-xl border shadow-xl ${
              darkMode
                ? 'bg-neutral-800 border-neutral-700'
                : 'bg-white border-neutral-200'
            }`}
          >
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  onChange(lang.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                  lang.id === currentLang
                    ? darkMode
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'bg-indigo-50 text-indigo-600'
                    : darkMode
                      ? 'hover:bg-neutral-700 text-neutral-300'
                      : 'hover:bg-neutral-50 text-neutral-700'
                }`}
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
