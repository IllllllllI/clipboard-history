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

/** =============== 自定义钩子 (Custom Hooks 隔离层) =============== */

/** 对编辑器视觉和缩进选项进行解耦管理 */
function useEditorConfig() {
  const [fontSize, setFontSize] = useState(14);
  const [lineWrapping, setLineWrapping] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [indentStyle, setIndentStyle] = useState<IndentStyle>('spaces');
  const [indentSize, setIndentSize] = useState<IndentSize>(4);

  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize((s) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, s + delta)));
  }, []);

  const handleToggleLineWrapping = useCallback(() => setLineWrapping((w) => !w), []);
  const handleToggleFocusMode = useCallback(() => setFocusMode((v) => !v), []);
  const handleToggleIndentStyle = useCallback(() => {
    setIndentStyle((s) => (s === 'spaces' ? 'tabs' : 'spaces'));
  }, []);
  const handleCycleIndentSize = useCallback(() => {
    setIndentSize((s) => {
      const idx = INDENT_SIZES.indexOf(s);
      return INDENT_SIZES[(idx + 1) % INDENT_SIZES.length];
    });
  }, []);

  return {
    fontSize, setFontSize,
    lineWrapping, setLineWrapping,
    focusMode, setFocusMode,
    indentStyle, setIndentStyle,
    indentSize, setIndentSize,
    handleFontSizeChange, handleToggleLineWrapping, handleToggleFocusMode,
    handleToggleIndentStyle, handleCycleIndentSize
  };
}


/**
 * 代码编辑器 Modal
 *
 * 职责：管理编辑状态（内容、语言、字号等）+ 布局骨架。
 * 基于性能考量，大量 O(n) 操作已转入 CodeMirror 拓展并提取了状态管理的层级。
 */
export function CodeEditorModal() {
  const {
    editingClip,
    setEditingClip,
    handleUpdateClip,
    copyToClipboard,
    settings,
  } = useAppContext();

  // 1. 内容与语言核心状态
  const [content, setContent] = useState('');
  const [textContent, setTextContent] = useState('');
  const [langId, setLangId] = useState<LanguageId>('plaintext');
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);

  // 2. 交互状态
  const [isCopied, setIsCopied] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 3. 提取的外围视觉和缩进配置
  const config = useEditorConfig();
  
  // 4. 富文本多格式状态
  const [contentFormat, setContentFormat] = useState<ContentFormatId>('text');
  const [clipFormats, setClipFormats] = useState<ClipFormat[]>([]);
  const originalFormatsRef = useRef<ClipFormat[]>([]);
  const formatsLoadedRef = useRef(false);

  // 5. O(1) 文档与光标性能监控
  const [cursorInfo, setCursorInfo] = useState<EditorCursorInfo>(INITIAL_CURSOR);
  const cursorInfoRef = useRef<EditorCursorInfo>(INITIAL_CURSOR);
  const [docStats, setDocStats] = useState({ lines: 1, chars: 0 });
  const docStatsRef = useRef({ lines: 1, chars: 0 });

  const isRichItem = editingClip?.content_type === 'rich';
  const isViewingFormat = isRichItem && contentFormat !== 'text';

  // ── 衍生状态计算 (变更检测防抖比对) ──
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
      setDocStats({ lines: 1, chars: editingClip.text.length });
      docStatsRef.current = { lines: 1, chars: editingClip.text.length };
      setShowExitConfirm(false);
    }
  }, [editingClip]);

  // ── 异步加载扩展 ──
  useEffect(() => {
    let cancelled = false;
    const loadExtension = async () => {
      const extension = await loadLanguageExtension(langId);
      if (!cancelled) setLanguageExtension(extension);
    };
    loadExtension();
    return () => { cancelled = true; };
  }, [langId]);

  // ── 加载富文本格式（rich 条目启动钩子） ──
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
    }).catch((err) => console.error('[CodeEditor] Failed to load formats:', err));
    return () => { cancelled = true; };
  }, [editingClip]);

  // ── 操作回调 ──

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

  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowExitConfirm(true);
      return;
    }
    doClose();
  }, [hasChanges, doClose]);

  const handleSave = useCallback(async () => {
    if (!editingClip) { doClose(); return; }
    if (textContent !== editingClip.text) {
      await handleUpdateClip(editingClip.id, textContent);
    }
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
    await copyToClipboard({ ...editingClip, text: content });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [editingClip, content, copyToClipboard]);

  const handleFormatChange = useCallback((fmt: ContentFormatId) => {
    if (contentFormat === 'text') {
      setTextContent(content);
    } else {
      setClipFormats((prev) => prev.map((f) => f.format === contentFormat ? { ...f, content } : f));
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

  const handleFormat = useCallback(async () => {
    if (isFormatting) return;
    setIsFormatting(true);
    try {
      const { formatted, changed } = await formatCode(content, { langId, indentStyle: config.indentStyle, indentSize: config.indentSize });
      if (changed) {
        setContent(formatted);
        if (!isViewingFormat) {
          setTextContent(formatted);
        } else {
          setClipFormats((prev) => prev.map((f) => f.format === contentFormat ? { ...f, content: formatted } : f));
        }
      }
    } catch (e) {
      console.error('[CodeEditor] Format failed:', e);
    } finally {
      setIsFormatting(false);
    }
  }, [content, isViewingFormat, contentFormat, isFormatting, langId, config.indentStyle, config.indentSize]);

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    if (!isViewingFormat) {
      setTextContent(value);
    } else {
      setClipFormats((prev) => prev.map((f) => f.format === contentFormat ? { ...f, content: value } : f));
    }
  }, [isViewingFormat, contentFormat]);

  // ── CodeMirror O(1) 监测扩展与视觉 ──
  const extensions = useMemo(() => {
    const exts: Extension[] = [];
    const lineHeight = config.fontSize <= 12 ? 1.62 : 1.68;

    if (languageExtension) exts.push(languageExtension);
    if (config.lineWrapping) exts.push(EditorView.lineWrapping);
    
    exts.push(
      EditorView.theme({
        '&': {
          fontSize: `${config.fontSize}px`,
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
          display: config.focusMode ? 'none' : 'block',
          fontSize: `${Math.max(config.fontSize - 2, 10)}px`,
          background: settings.darkMode ? '#1e1e1e' : '#ffffff',
          color: settings.darkMode ? '#737373' : '#9ca3af',
          borderRight: settings.darkMode ? '1px solid rgb(64 64 64 / 0.7)' : '1px solid rgb(229 231 235)',
        },
        '.cm-activeLineGutter': {
          color: settings.darkMode ? '#a5b4fc' : '#4f46e5',
        },
      }),
    );

    // 光标 / 选区追踪及 O(1) 行数提取
    exts.push(
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        
        // --- 文档总量统计 (O(1)) ---
        if (update.docChanged) {
          const lines = update.state.doc.lines;
          const chars = update.state.doc.length;
          const p = docStatsRef.current;
          if (p.lines !== lines || p.chars !== chars) {
            docStatsRef.current = { lines, chars };
            setDocStats({ lines, chars });
          }
        }

        // --- 追踪选取信息 ---
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
      EditorState.tabSize.of(config.indentSize),
      indentUnit.of(config.indentStyle === 'tabs' ? '\t' : ' '.repeat(config.indentSize)),
    );

    return exts;
  }, [languageExtension, config, settings.darkMode]);

  // ── 快捷键绑定 ──
  useEffect(() => {
    if (!editingClip) return;
    const handler = (e: KeyboardEvent) => {
      // 避免干扰 dialog 焦点捕获，我们主要拦截编辑区冒泡
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showExitConfirm) setShowExitConfirm(false);
        else handleClose();
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingClip, handleClose, handleSave, showExitConfirm]);

  // ── 缓存 FormatSelector ，避免每次按键使得 Header 重新打散重绘 ──
  const formatSelectorNode = useMemo(() => {
    if (!isRichItem) return undefined;
    return (
      <FormatSelector
        currentFormat={contentFormat}
        formats={clipFormats}
        onChange={handleFormatChange}
        darkMode={settings.darkMode}
      />
    );
  }, [isRichItem, contentFormat, clipFormats, handleFormatChange, settings.darkMode]);

  return (
    <AnimatePresence>
      {editingClip && (
        <div className="code-editor-overlay">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="initial" animate="animate" exit="exit"
            onClick={handleClose}
            className="code-editor-backdrop"
          />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="initial" animate="animate" exit="exit"
            className="code-editor-modal"
            data-theme={settings.darkMode ? 'dark' : 'light'}
          >
            <EditorHeader
              darkMode={settings.darkMode}
              isSnippet={!!editingClip.is_snippet}
              hasChanges={hasChanges}
              langId={langId}
              fontSize={config.fontSize}
              lineWrapping={config.lineWrapping}
              focusMode={config.focusMode}
              isCopied={isCopied}
              isReadOnly={false}
              isFormatting={isFormatting}
              onLangChange={setLangId}
              onFontSizeChange={config.handleFontSizeChange}
              onToggleLineWrapping={config.handleToggleLineWrapping}
              onToggleFocusMode={config.handleToggleFocusMode}
              onFormat={handleFormat}
              onCopy={handleCopy}
              onClose={handleClose}
              formatSelector={formatSelectorNode}
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
              lineCount={docStats.lines}
              charCount={docStats.chars}
              hasChanges={hasChanges}
              isReadOnly={false}
              cursorInfo={cursorInfo}
              indentStyle={config.indentStyle}
              indentSize={config.indentSize}
              onToggleIndentStyle={config.handleToggleIndentStyle}
              onCycleIndentSize={config.handleCycleIndentSize}
              onClose={handleClose}
              onSave={handleSave}
            />

            {/* 未保存关闭的高可用确认弹窗 */}
            <AnimatePresence>
              {showExitConfirm && (
                <motion.div
                  className="code-editor-confirm-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-dialog-title"
                >
                  <motion.div
                    className="code-editor-confirm-dialog"
                    role="alertdialog"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                  >
                    <p id="confirm-dialog-title" className="code-editor-confirm-text">
                      有未保存的修改，确定要关闭吗？
                    </p>
                    <div className="code-editor-confirm-actions">
                      <button
                        type="button"
                        className="code-editor-btn-ghost"
                        onClick={() => setShowExitConfirm(false)}
                        autoFocus
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="code-editor-btn-danger"
                        onClick={doClose}
                      >
                        不保存并关闭
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


