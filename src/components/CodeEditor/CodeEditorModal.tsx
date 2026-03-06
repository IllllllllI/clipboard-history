import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { useAppContext } from '../../contexts/AppContext';
import { ClipboardDB } from '../../services/db';
import type { ClipFormat } from '../../types';
import { detectLanguage, loadLanguageExtension, type LanguageId } from '../../utils/languageDetect';
import { backdropVariants, modalVariants } from '../../utils/motionPresets';
import { EditorHeader } from './EditorHeader';
import { EditorFooter } from './EditorFooter';
import { FormatSelector, type ContentFormatId } from './FormatSelector';
import { INDENT_SIZES, INITIAL_CURSOR, type EditorCursorInfo, type IndentSize, type IndentStyle } from './types';
import { formatCode } from './formatCode';
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
  tabSize: undefined, // 由 extension 动态控制
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

  // ── 光标 / 选区追踪 ──
  const [cursorInfo, setCursorInfo] = useState<EditorCursorInfo>(INITIAL_CURSOR);
  const cursorInfoRef = useRef<EditorCursorInfo>(INITIAL_CURSOR);

  // ── 缩进设置 ──
  const [indentStyle, setIndentStyle] = useState<IndentStyle>('spaces');
  const [indentSize, setIndentSize] = useState<IndentSize>(4);

  // ── 未保存退出确认 ──
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // ── 格式化中状态 ──
  const [isFormatting, setIsFormatting] = useState(false);

  // ── 格式切换状态（仅 rich 条目） ──
  const [contentFormat, setContentFormat] = useState<ContentFormatId>('text');
  const [clipFormats, setClipFormats] = useState<ClipFormat[]>([]);
  const formatsLoadedRef = useRef(false);
  /** 原始文本内容（编辑针对 text 格式） */
  const [textContent, setTextContent] = useState('');
  /** 原始格式内容快照（用于变更检测） */
  const originalFormatsRef = useRef<ClipFormat[]>([]);

  const isRichItem = editingClip?.content_type === 'rich';
  const isViewingFormat = isRichItem && contentFormat !== 'text';

  // ── 衍生状态 ──
  const lineCount = useMemo(() => {
    let n = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) n++;
    }
    return n;
  }, [content]);
  const hasTextChanges = editingClip ? textContent !== editingClip.text : false;
  const hasFormatChanges = useMemo(() => {
    if (!isRichItem) return false;
    return clipFormats.some((f) => {
      const orig = originalFormatsRef.current.find((o) => o.format === f.format);
      return orig ? orig.content !== f.content : false;
    });
  }, [isRichItem, clipFormats]);
  const hasChanges = hasTextChanges || hasFormatChanges;

  // ── 初始化 ──
  useEffect(() => {
    if (editingClip) {
      setContent(editingClip.text);
      setTextContent(editingClip.text);
      setLangId(detectLanguage(editingClip.text).id);
      setContentFormat('text');
      setClipFormats([]);
      formatsLoadedRef.current = false;
      setCursorInfo(INITIAL_CURSOR);
      setShowExitConfirm(false);
    }
  }, [editingClip]);

  // ── 加载富文本格式（rich 条目打开时自动加载） ──
  useEffect(() => {
    if (!editingClip || editingClip.content_type !== 'rich') return;
    if (formatsLoadedRef.current) return;

    let cancelled = false;
    formatsLoadedRef.current = true;

    void ClipboardDB.getClipFormats(editingClip.id).then((formats) => {
      if (!cancelled) {
        setClipFormats(formats);
        originalFormatsRef.current = formats.map((f) => ({ ...f }));
      }
    }).catch((err) => {
      console.error('[CodeEditor] Failed to load formats:', err);
    });

    return () => { cancelled = true; };
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

  /** 实际关闭（无条件） */
  const doClose = useCallback(() => {
    setEditingClip(null);
    setContent('');
    setTextContent('');
    setIsCopied(false);
    setContentFormat('text');
    setClipFormats([]);
    formatsLoadedRef.current = false;
    setShowExitConfirm(false);
  }, [setEditingClip]);

  /** 请求关闭：有未保存修改时弹出确认 */
  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowExitConfirm(true);
      return;
    }
    doClose();
  }, [hasChanges, doClose]);

  const handleSave = useCallback(async () => {
    if (!editingClip) { doClose(); return; }
    // 保存纯文本
    if (textContent !== editingClip.text) {
      await handleUpdateClip(editingClip.id, textContent);
    }
    // 保存被修改的格式内容（html / rtf）
    for (const fmt of clipFormats) {
      const orig = originalFormatsRef.current.find((o) => o.format === fmt.format);
      if (orig && orig.content !== fmt.content) {
        await ClipboardDB.updateClipFormat(editingClip.id, fmt.format, fmt.content);
      }
    }
    doClose();
  }, [editingClip, textContent, clipFormats, handleUpdateClip, doClose]);

  const handleCopy = useCallback(async () => {
    if (!editingClip) return;
    // 复制当前显示的内容（可能是格式内容）
    await copyToClipboard({ ...editingClip, text: content });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [editingClip, content, copyToClipboard]);

  /** 切换内容格式 */
  const handleFormatChange = useCallback((fmt: ContentFormatId) => {
    // 先把当前编辑的内容写回对应的存储
    if (contentFormat === 'text') {
      setTextContent(content);
    } else {
      // 写回格式内容
      setClipFormats((prev) =>
        prev.map((f) => f.format === contentFormat ? { ...f, content } : f),
      );
    }

    setContentFormat(fmt);

    if (fmt === 'text') {
      setContent(textContent);
      setLangId(detectLanguage(textContent).id);
    } else {
      const formatData = clipFormats.find((f) => f.format === fmt);
      const formatContent = formatData?.content ?? '';
      setContent(formatContent);
      setLangId(fmt === 'html' ? 'html' : 'plaintext');
    }
  }, [contentFormat, content, textContent, clipFormats]);

  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize((s) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, s + delta)));
  }, []);

  const handleToggleLineWrapping = useCallback(() => {
    setLineWrapping((w) => !w);
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  /** 切换缩进风格 */
  const handleToggleIndentStyle = useCallback(() => {
    setIndentStyle((s) => (s === 'spaces' ? 'tabs' : 'spaces'));
  }, []);

  /** 循环切换缩进宽度 */
  const handleCycleIndentSize = useCallback(() => {
    setIndentSize((s) => {
      const idx = INDENT_SIZES.indexOf(s);
      return INDENT_SIZES[(idx + 1) % INDENT_SIZES.length];
    });
  }, []);

  /** 格式化代码（async — Prettier / sql-formatter） */
  const handleFormat = useCallback(async () => {
    if (isFormatting) return;
    setIsFormatting(true);
    try {
      const { formatted, changed } = await formatCode(content, { langId, indentStyle, indentSize });
      if (changed) {
        setContent(formatted);
        // 同步到对应存储
        if (!isViewingFormat) {
          setTextContent(formatted);
        } else {
          setClipFormats((prev) =>
            prev.map((f) => f.format === contentFormat ? { ...f, content: formatted } : f),
          );
        }
      }
    } catch (e) {
      console.error('[CodeEditor] Format failed:', e);
    } finally {
      setIsFormatting(false);
    }
  }, [content, isViewingFormat, contentFormat, isFormatting, langId, indentStyle, indentSize]);

  /** 编辑器内容变更 */
  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    if (!isViewingFormat) {
      setTextContent(value);
    } else {
      // 实时同步到 clipFormats
      setClipFormats((prev) =>
        prev.map((f) => f.format === contentFormat ? { ...f, content: value } : f),
      );
    }
  }, [isViewingFormat, contentFormat]);

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
    // 光标 / 选区追踪
    exts.push(
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const state = update.state;
        const sel = state.selection.main;
        const line = state.doc.lineAt(sel.head);
        const col = sel.head - line.from + 1;
        const selectedChars = Math.abs(sel.to - sel.from);
        let selectedLines = 0;
        if (selectedChars > 0) {
          const fromLine = state.doc.lineAt(sel.from).number;
          const toLine = state.doc.lineAt(sel.to).number;
          selectedLines = toLine - fromLine + 1;
        }
        const next: EditorCursorInfo = { line: line.number, col, selectedChars, selectedLines };
        const prev = cursorInfoRef.current;
        if (prev.line !== next.line || prev.col !== next.col ||
            prev.selectedChars !== next.selectedChars || prev.selectedLines !== next.selectedLines) {
          cursorInfoRef.current = next;
          setCursorInfo(next);
        }
      }),
    );

    // tab 缩进控制
    exts.push(
      EditorState.tabSize.of(indentSize),
      indentUnit.of(indentStyle === 'tabs' ? '\t' : ' '.repeat(indentSize)),
    );

    return exts;
  }, [languageExtension, lineWrapping, fontSize, settings.darkMode, focusMode, indentSize, indentStyle]);

  // ── 快捷键 ──
  useEffect(() => {
    if (!editingClip) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showExitConfirm) {
          setShowExitConfirm(false);
        } else {
          handleClose();
        }
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingClip, handleClose, handleSave, showExitConfirm]);

  // ── 渲染 ──
  return (
    <AnimatePresence>
      {editingClip && (
        <div className="code-editor-overlay">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={handleClose}
            className="code-editor-backdrop"
          />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
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
              isReadOnly={false}
              isFormatting={isFormatting}
              onLangChange={setLangId}
              onFontSizeChange={handleFontSizeChange}
              onToggleLineWrapping={handleToggleLineWrapping}
              onToggleFocusMode={handleToggleFocusMode}
              onFormat={handleFormat}
              onCopy={handleCopy}
              onClose={handleClose}
              formatSelector={isRichItem ? (
                <FormatSelector
                  currentFormat={contentFormat}
                  formats={clipFormats}
                  onChange={handleFormatChange}
                  darkMode={settings.darkMode}
                />
              ) : undefined}
            />

            <div className="code-editor-body" data-theme={settings.darkMode ? 'dark' : 'light'}>
              <div className="code-editor-shell" data-theme={settings.darkMode ? 'dark' : 'light'}>
              <CodeMirror
                value={content}
                onChange={handleContentChange}
                theme={settings.darkMode ? vscodeDark : vscodeLight}
                extensions={extensions}
                basicSetup={BASIC_SETUP}
                height="100%"
                style={EDITOR_STYLE}
                readOnly={false}
                editable={true}
              />
              </div>
            </div>

            <EditorFooter
              darkMode={settings.darkMode}
              lineCount={lineCount}
              charCount={content.length}
              hasChanges={hasChanges}
              isReadOnly={false}
              cursorInfo={cursorInfo}
              indentStyle={indentStyle}
              indentSize={indentSize}
              onToggleIndentStyle={handleToggleIndentStyle}
              onCycleIndentSize={handleCycleIndentSize}
              onClose={handleClose}
              onSave={handleSave}
            />

            {/* 未保存关闭确认 */}
            <AnimatePresence>
              {showExitConfirm && (
                <motion.div
                  className="code-editor-confirm-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <motion.div
                    className="code-editor-confirm-dialog"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                  >
                    <p className="code-editor-confirm-text">
                      有未保存的修改，确定要关闭吗？
                    </p>
                    <div className="code-editor-confirm-actions">
                      <button
                        className="code-editor-btn-ghost"
                        onClick={() => setShowExitConfirm(false)}
                      >
                        取消
                      </button>
                      <button
                        className="code-editor-confirm-discard"
                        onClick={doClose}
                      >
                        放弃修改
                      </button>
                      <button
                        className="code-editor-btn-save"
                        onClick={() => void handleSave()}
                      >
                        保存并关闭
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
