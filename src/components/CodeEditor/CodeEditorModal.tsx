import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useAppContext } from '../../contexts/AppContext';
import { detectLanguage, loadLanguageExtension, type LanguageId } from '../../utils/languageDetect';
import { EditorHeader } from './EditorHeader';
import { EditorFooter } from './EditorFooter';
import './styles/code-editor.css';

/** CodeMirror 基础配置（静态常量，避免每次渲染创建新对象） */
const BASIC_SETUP = {
  lineNumbers: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  foldGutter: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: false,
  indentOnInput: true,
  syntaxHighlighting: true,
  searchKeymap: true,
  tabSize: 4,
} as const;

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;

const EDITOR_STYLE = { height: '100%', overflow: 'auto' } as const;

/**
 * 代码编辑器 Modal
 *
 * 职责：管理编辑状态（内容、语言、字号等）+ 布局骨架。
 * UI 细节委托给 EditorHeader / EditorFooter。
 */
export function CodeEditorModal() {
  const {
    editingClip,
    setEditingClip,
    handleUpdateClip,
    copyToClipboard,
    settings,
  } = useAppContext();

  const [content, setContent] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [langId, setLangId] = useState<LanguageId>('plaintext');
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [lineWrapping, setLineWrapping] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // ── 衍生状态 ──
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const hasChanges = editingClip ? content !== editingClip.text : false;

  // ── 初始化 ──
  useEffect(() => {
    if (editingClip) {
      setContent(editingClip.text);
      setLangId(detectLanguage(editingClip.text).id);
    }
  }, [editingClip]);

  useEffect(() => {
    let cancelled = false;

    const loadExtension = async () => {
      const extension = await loadLanguageExtension(langId);
      if (!cancelled) {
        setLanguageExtension(extension);
      }
    };

    loadExtension();

    return () => {
      cancelled = true;
    };
  }, [langId]);

  // ── 操作回调 ──
  const handleClose = useCallback(() => {
    setEditingClip(null);
    setContent('');
    setIsCopied(false);
  }, [setEditingClip]);

  const handleSave = useCallback(async () => {
    if (editingClip && content !== editingClip.text) {
      await handleUpdateClip(editingClip.id, content);
    }
    handleClose();
  }, [editingClip, content, handleUpdateClip, handleClose]);

  const handleCopy = useCallback(async () => {
    if (!editingClip) return;
    await copyToClipboard({ ...editingClip, text: content });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [editingClip, content, copyToClipboard]);

  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize((s) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, s + delta)));
  }, []);

  const handleToggleLineWrapping = useCallback(() => {
    setLineWrapping((w) => !w);
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  // ── CodeMirror 扩展 ──
  const extensions = useMemo(() => {
    const exts: Extension[] = [];
    const lineHeight = fontSize <= 12 ? 1.62 : 1.68;

    if (languageExtension) exts.push(languageExtension);
    if (lineWrapping) exts.push(EditorView.lineWrapping);
    exts.push(
      EditorView.theme({
        '&': {
          fontSize: `${fontSize}px`,
          lineHeight,
          letterSpacing: '0.01em',
        },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight,
        },
        '.cm-content': {
          padding: '12px 0',
          caretColor: settings.darkMode ? '#e5e7eb' : '#111827',
        },
        '.cm-line': {
          paddingLeft: '12px',
          paddingRight: '16px',
        },
        '.cm-activeLine': {
          backgroundColor: settings.darkMode ? 'rgb(99 102 241 / 0.08)' : 'rgb(99 102 241 / 0.06)',
        },
        '.cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: settings.darkMode ? 'rgb(99 102 241 / 0.35) !important' : 'rgb(99 102 241 / 0.22) !important',
        },
        '.cm-gutters': {
          display: focusMode ? 'none' : 'block',
          fontSize: `${Math.max(fontSize - 2, 10)}px`,
          background: settings.darkMode ? '#1e1e1e' : '#ffffff',
          color: settings.darkMode ? '#737373' : '#9ca3af',
          borderRight: settings.darkMode ? '1px solid rgb(64 64 64 / 0.7)' : '1px solid rgb(229 231 235)',
        },
        '.cm-activeLineGutter': {
          color: settings.darkMode ? '#a5b4fc' : '#4f46e5',
        },
      }),
    );
    return exts;
  }, [languageExtension, lineWrapping, fontSize, settings.darkMode, focusMode]);

  // ── 快捷键 ──
  useEffect(() => {
    if (!editingClip) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingClip, handleClose, handleSave]);

  // ── 渲染 ──
  return (
    <AnimatePresence>
      {editingClip && (
        <div className="code-editor-overlay">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="code-editor-backdrop"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="code-editor-modal"
            data-theme={settings.darkMode ? 'dark' : 'light'}
          >
            <EditorHeader
              darkMode={settings.darkMode}
              isSnippet={!!editingClip.is_snippet}
              hasChanges={hasChanges}
              langId={langId}
              fontSize={fontSize}
              lineWrapping={lineWrapping}
              focusMode={focusMode}
              isCopied={isCopied}
              onLangChange={setLangId}
              onFontSizeChange={handleFontSizeChange}
              onToggleLineWrapping={handleToggleLineWrapping}
              onToggleFocusMode={handleToggleFocusMode}
              onCopy={handleCopy}
              onClose={handleClose}
            />

            <div className="code-editor-body" data-theme={settings.darkMode ? 'dark' : 'light'}>
              <div className="code-editor-shell" data-theme={settings.darkMode ? 'dark' : 'light'}>
              <CodeMirror
                value={content}
                onChange={setContent}
                theme={settings.darkMode ? vscodeDark : vscodeLight}
                extensions={extensions}
                basicSetup={BASIC_SETUP}
                height="100%"
                style={EDITOR_STYLE}
              />
              </div>
            </div>

            <EditorFooter
              darkMode={settings.darkMode}
              lineCount={lineCount}
              charCount={content.length}
              hasChanges={hasChanges}
              onClose={handleClose}
              onSave={handleSave}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
