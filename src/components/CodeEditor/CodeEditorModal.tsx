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

  // ── CodeMirror 扩展 ──
  const extensions = useMemo(() => {
    const exts: Extension[] = [];
    if (languageExtension) exts.push(languageExtension);
    if (lineWrapping) exts.push(EditorView.lineWrapping);
    exts.push(
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize - 2}px` },
      }),
    );
    return exts;
  }, [languageExtension, lineWrapping, fontSize]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`relative w-full max-w-6xl h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${
              settings.darkMode
                ? 'bg-[#1e1e1e] border-neutral-800 text-neutral-200'
                : 'bg-white border-neutral-200 text-neutral-800'
            }`}
          >
            <EditorHeader
              darkMode={settings.darkMode}
              isSnippet={!!editingClip.is_snippet}
              hasChanges={hasChanges}
              langId={langId}
              fontSize={fontSize}
              lineWrapping={lineWrapping}
              isCopied={isCopied}
              onLangChange={setLangId}
              onFontSizeChange={handleFontSizeChange}
              onToggleLineWrapping={handleToggleLineWrapping}
              onCopy={handleCopy}
              onClose={handleClose}
            />

            <div className="flex-1 overflow-hidden">
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
