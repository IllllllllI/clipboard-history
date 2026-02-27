import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FolderOpen, Loader2 } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { TauriService } from '../services/tauri';
import { getGlobalShortcutConflict, getImmersiveShortcutConflict } from '../utils';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** 自动清理选项 */
const AUTO_CLEAR_OPTIONS = [
  { value: 0,  label: '从不清理' },
  { value: 7,  label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
] as const;

const IMAGE_PERFORMANCE_OPTIONS = [
  { value: 'quality', label: '质量优先', desc: '尽量保留原图，适合清晰度要求高的场景' },
  { value: 'balanced', label: '平衡', desc: '默认推荐，兼顾清晰度与写入速度' },
  { value: 'speed', label: '速度优先', desc: '优先降低写入耗时，可能牺牲部分清晰度' },
] as const;

const MIN_DECODED_MB = 8;

// ============================================================================
// 样式工具
// ============================================================================

/** 次要按钮 */
const secondaryBtnClass = (dark: boolean) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`;

/** 输入框 / 路径显示框 */
const inputBoxClass = (dark: boolean) =>
  `px-3 py-2 rounded-lg text-sm border ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

function normalizeKeyName(key: string): string | null {
  if (!key || key === 'Dead' || key === 'Process') return null;
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();

  const lower = key.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'return') return 'Enter';
  if (lower === 'spacebar') return 'Space';
  if (lower === 'up') return 'ArrowUp';
  if (lower === 'down') return 'ArrowDown';
  if (lower === 'left') return 'ArrowLeft';
  if (lower === 'right') return 'ArrowRight';
  return key;
}

function normalizeCodeName(code: string): string | null {
  if (!code) return null;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backslash') return '\\';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Slash') return '/';
  if (code.startsWith('Numpad') && code.length > 6) return code;
  return null;
}

function formatShortcutFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const keyName = normalizeCodeName(e.code) ?? normalizeKeyName(e.key);
  if (!keyName) return null;
  parts.push(keyName);

  return parts.join('+');
}

// ============================================================================
// 子组件
// ============================================================================

/** 可复用的开关组件 */
const ToggleSwitch = React.memo(function ToggleSwitch({
  on,
  onToggle,
  dark,
}: {
  on: boolean;
  onToggle: () => void;
  dark: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full transition-colors relative ${on ? 'bg-indigo-500' : dark ? 'bg-neutral-700' : 'bg-neutral-300'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  );
});

/** 设置项行 */
const SettingRow = React.memo(function SettingRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs mt-0.5 text-neutral-500">{desc}</p>
      </div>
      {children}
    </div>
  );
});

const ShortcutRecorder = React.memo(function ShortcutRecorder({
  dark,
  value,
  onChange,
  error,
  isRegistering,
  validateRegistration,
}: {
  dark: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  isRegistering?: boolean;
  validateRegistration?: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clearOnFocusRef = useRef(false);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CLEAR_DURATION_MS = 150;
  const shouldWaitValidation = !!validateRegistration;

  const cancelPendingClear = useCallback(() => {
    if (!clearTimeoutRef.current) return;
    clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = null;
    setIsClearing(false);
  }, []);

  const clearValueWithFade = useCallback(() => {
    cancelPendingClear();

    if (!value) {
      onChange('');
      setIsClearing(false);
      return;
    }

    setIsClearing(true);
    clearTimeoutRef.current = setTimeout(() => {
      onChange('');
      setIsClearing(false);
      clearTimeoutRef.current = null;
    }, CLEAR_DURATION_MS);
  }, [cancelPendingClear, onChange, value]);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingShortcut || !shouldWaitValidation) return;
    if (isRegistering) return;

    if (error) {
      setPendingShortcut(null);
      return;
    }

    if (value === pendingShortcut) {
      setPendingShortcut(null);
      setIsRecording(false);
      containerRef.current?.blur();
      return;
    }

    setPendingShortcut(null);
  }, [error, isRegistering, pendingShortcut, shouldWaitValidation, value]);

  const handleRecordingKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Tab') return;
    e.preventDefault();

    if (isClearing) {
      cancelPendingClear();
    }

    if (e.key === 'Escape') {
      setIsRecording(false);
      setRecordingHint(null);
      containerRef.current?.blur();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      clearValueWithFade();
      return;
    }

    const shortcut = formatShortcutFromEvent(e);
    if (!shortcut) {
      setRecordingHint('请按下“修饰键 + 其他键”的组合，例如 Alt+Z');
      return;
    }

    setRecordingHint(null);
    onChange(shortcut);
    if (shouldWaitValidation) {
      setPendingShortcut(shortcut);
      return;
    }

    // 录制成功后自动失去焦点，提升体验
    setIsRecording(false);
    containerRef.current?.blur();
  }, [cancelPendingClear, clearValueWithFade, isClearing, onChange, shouldWaitValidation]);

  useEffect(() => {
    if (!isRecording) return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      handleRecordingKeyDown(e);
      e.stopPropagation();
    };

    window.addEventListener('keydown', onWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown, true);
    };
  }, [handleRecordingKeyDown, isRecording]);

  const keys = value ? value.split('+') : [];

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-shortcut-recorder="true"
        tabIndex={0}
        onPointerDown={(e) => {
          clearOnFocusRef.current = true;
          e.currentTarget.focus();
        }}
        onFocus={() => {
          setIsRecording(true);
          setRecordingHint(null);
          if (clearOnFocusRef.current && value) clearValueWithFade();
          clearOnFocusRef.current = false;
        }}
        onBlur={() => {
          setIsRecording(false);
          setRecordingHint(null);
        }}
        className={`
          relative flex items-center min-h-[42px] px-3 py-2 rounded-xl border transition-all cursor-pointer outline-none
          ${isRecording
            ? `ring-2 ring-indigo-500/30 border-indigo-500 ${dark ? 'bg-indigo-500/10' : 'bg-indigo-50'}`
            : error
              ? `border-red-500/50 ${dark ? 'bg-red-500/10' : 'bg-red-50'}`
              : dark ? 'bg-neutral-900 border-neutral-700 hover:border-neutral-600' : 'bg-white border-neutral-200 hover:border-neutral-300'
          }
        `}
      >
        <motion.div
          className="flex-1 flex items-center gap-1.5 flex-wrap"
          animate={isClearing ? { opacity: 0, y: -2, scale: 0.99 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: CLEAR_DURATION_MS / 1000, ease: 'easeOut' }}
        >
          {isRecording && !value ? (
            <span className={`text-sm animate-pulse ${dark ? 'text-indigo-400' : 'text-indigo-500'}`}>
              请按下组合键...
            </span>
          ) : keys.length > 0 ? (
            keys.map((k, i) => (
              <React.Fragment key={i}>
                <kbd className={`
                  px-2 py-1 rounded-md text-xs font-sans font-medium border shadow-sm flex items-center
                  ${dark ? 'bg-neutral-800 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'}
                  ${isRecording ? 'border-indigo-500/30 shadow-indigo-500/20' : ''}
                `}>
                  {k}
                </kbd>
                {i < keys.length - 1 && <span className="text-neutral-400 text-xs font-medium">+</span>}
              </React.Fragment>
            ))
          ) : (
            <span className={`text-sm ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              点击设置快捷键
            </span>
          )}
        </motion.div>

        <div className="flex items-center gap-2 ml-2">
          {isRecording && (
            <span className="flex h-2.5 w-2.5 relative" title="正在录制">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRegistering ? 'bg-amber-400' : 'bg-indigo-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRegistering ? 'bg-amber-500' : 'bg-indigo-500'}`}></span>
            </span>
          )}
          {!isRecording && value && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearValueWithFade();
              }}
              className={`p-1 rounded-md transition-colors ${dark ? 'hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200' : 'hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600'}`}
              title="清除快捷键"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <motion.p
        className={`text-xs ${error ? 'text-red-500' : isRecording ? 'text-indigo-500' : 'text-neutral-500'}`}
        animate={isClearing ? { opacity: 0, y: -2 } : { opacity: 1, y: 0 }}
        transition={{
          duration: CLEAR_DURATION_MS / 1000,
          ease: 'easeOut',
          delay: isClearing ? 0 : 0.1,
        }}
      >
        {error
          ? error
          : isRecording && isRegistering
            ? '正在验证按键可用性，请稍候...'
            : isRecording && recordingHint
              ? recordingHint
            : isRecording
              ? '正在录制：请直接按下目标组合键 (按 Esc 取消)'
              : '点击上方区域后按组合键，或点击右侧 × 清空'}
      </motion.p>
    </div>
  );
});

/** 通用路径选择器 */
const PathSelector = React.memo(function PathSelector({
  dark,
  title,
  description,
  displayPath,
  statusText,
  loading,
  showReset,
  onOpen,
  onSelect,
  onReset,
}: {
  dark: boolean;
  title: string;
  description: string;
  displayPath: string;
  statusText?: string;
  loading?: boolean;
  showReset: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{title}</p>
      <div className="flex gap-2">
        <div
          onClick={onOpen}
          title={displayPath}
          className={`flex-1 truncate flex items-center gap-1.5 ${
            displayPath && displayPath !== '加载中...' ? 'cursor-pointer hover:opacity-80' : ''
          } ${inputBoxClass(dark)}`}
        >
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
          <span className="truncate">{displayPath}</span>
        </div>
        <button
          disabled={loading}
          onClick={onSelect}
          className={`${secondaryBtnClass(dark)} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? '移动中...' : '选择'}
        </button>
        {showReset && (
          <button
            disabled={loading}
            onClick={onReset}
            className={`${secondaryBtnClass(dark)} text-red-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            重置
          </button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">{description}</p>
        {statusText && <p className="text-xs text-neutral-500">{statusText}</p>}
      </div>
    </div>
  );
});

// ============================================================================
// 主组件
// ============================================================================

export const SettingsModal = React.memo(function SettingsModal({ show, onClose }: SettingsModalProps) {
  const { settings, updateSettings, stats, shortcutError, shortcutRegistering, exportData, importData } = useAppContext();
  const dark = settings.darkMode;
  const globalShortcutConflict = getGlobalShortcutConflict(settings.globalShortcut, settings.immersiveShortcut);
  const immersiveShortcutConflict = getImmersiveShortcutConflict(settings.immersiveShortcut, settings.globalShortcut);

  // 图片目录信息
  const [imagesInfo, setImagesInfo] = useState<{ path: string; total_size: number; file_count: number } | null>(null);
  // 数据库信息
  const [dbInfo, setDbInfo] = useState<{ path: string; size: number } | null>(null);
  // 数据库操作加载状态
  const [dbMoving, setDbMoving] = useState(false);
  // 后端实际生效的图片性能档位
  const [backendImageProfile, setBackendImageProfile] = useState<typeof settings.imagePerformanceProfile | null>(null);
  const [backendProfileSyncState, setBackendProfileSyncState] = useState<'syncing' | 'synced' | 'failed'>('syncing');
  const [backendProfileError, setBackendProfileError] = useState<string | null>(null);
  const [backendProfileRetryToken, setBackendProfileRetryToken] = useState(0);
  const decodedMb = Math.max(MIN_DECODED_MB, Math.round(settings.maxDecodedBytes / 1024 / 1024));

  const fetchImagesInfo = useCallback(async () => {
    const info = await TauriService.getImagesDirInfo(settings.imagesDir || undefined);
    if (info) setImagesInfo(info);
  }, [settings.imagesDir]);

  const fetchDbInfo = useCallback(async () => {
    const info = await TauriService.getDbInfo();
    if (info) setDbInfo(info);
  }, []);

  useEffect(() => {
    if (show) {
      fetchImagesInfo();
      fetchDbInfo();
    }
  }, [show, fetchImagesInfo, fetchDbInfo]);

  useEffect(() => {
    if (!show) return;

    let cancelled = false;
    const MAX_ATTEMPTS = 6;
    const RETRY_DELAY_MS = 220;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const syncBackendProfile = async () => {
      setBackendProfileSyncState('syncing');
      setBackendProfileError(null);

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const profile = await TauriService.getImagePerformanceProfile();
          if (cancelled) return;

          if (!profile) {
            setBackendProfileSyncState('failed');
            setBackendProfileError('后端未返回档位');
            return;
          }

          setBackendImageProfile(profile);

          if (profile === settings.imagePerformanceProfile) {
            setBackendProfileSyncState('synced');
            return;
          }

          if (attempt < MAX_ATTEMPTS) {
            await wait(RETRY_DELAY_MS);
            if (cancelled) return;
            continue;
          }

          setBackendProfileSyncState('failed');
          setBackendProfileError('后端未在预期时间内应用新档位');
          return;
        } catch (error) {
          if (cancelled) return;

          if (attempt < MAX_ATTEMPTS) {
            await wait(RETRY_DELAY_MS);
            if (cancelled) return;
            continue;
          }

          setBackendProfileSyncState('failed');
          setBackendProfileError(error instanceof Error ? error.message : String(error));
          return;
        }
      }
    };

    syncBackendProfile();

    return () => {
      cancelled = true;
    };
  }, [show, settings.imagePerformanceProfile, backendProfileRetryToken]);

  // ── 图片路径操作 ──

  const handleOpenImagesDir = useCallback(() => {
    const path = imagesInfo?.path || settings.imagesDir;
    if (path) TauriService.openFile(path);
  }, [imagesInfo?.path, settings.imagesDir]);

  const handleSelectImagesDir = useCallback(async () => {
    const dir = await TauriService.selectDirectory();
    if (dir) {
      updateSettings({ imagesDir: dir });
      setTimeout(async () => {
        const info = await TauriService.getImagesDirInfo(dir);
        if (info) setImagesInfo(info);
      }, 100);
    }
  }, [updateSettings]);

  const handleResetImagesDir = useCallback(() => {
    updateSettings({ imagesDir: '' });
    setTimeout(() => fetchImagesInfo(), 100);
  }, [updateSettings, fetchImagesInfo]);

  // ── 数据库路径操作 ──

  const handleOpenDbDir = useCallback(() => {
    if (dbInfo?.path) {
      const dir = dbInfo.path.replace(/[/\\][^/\\]+$/, '');
      TauriService.openFile(dir);
    }
  }, [dbInfo?.path]);

  const handleSelectDbDir = useCallback(async () => {
    const dir = await TauriService.selectDirectory();
    if (dir) {
      setDbMoving(true);
      try {
        const result = await TauriService.moveDatabase(dir);
        if (result) setDbInfo(result);
      } finally {
        setDbMoving(false);
      }
    }
  }, []);

  const handleResetDbDir = useCallback(async () => {
    setDbMoving(true);
    try {
      const result = await TauriService.moveDatabase('');
      if (result) setDbInfo(result);
    } finally {
      setDbMoving(false);
    }
  }, []);

  // ── 开关设置配置 ──

  const toggleSettings: { key: keyof typeof settings; title: string; desc: string }[] = [
    { key: 'autoCapture',     title: '自动捕获',     desc: '实时监听剪切板变化并保存' },
    { key: 'doubleClickPaste', title: '双击粘贴',     desc: '双击记录项自动复制并粘贴到当前应用' },
  ];

  const toggleSettingsAfterShortcut: { key: keyof typeof settings; title: string; desc: string }[] = [
    { key: 'hideOnAction',     title: '双击后隐藏',   desc: '双击粘贴后自动隐藏窗口' },
    { key: 'hideOnDrag',       title: '拖拽时隐藏',   desc: '开始拖拽时隐藏窗口，防止拖拽被取消' },
    { key: 'hideAfterDrag',    title: '拖拽后隐藏',   desc: '拖拽粘贴完成后保持窗口隐藏' },
    { key: 'showImagePreview', title: '显示图片预览', desc: '在列表中显示图片或图片链接的预览' },
  ];

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${dark ? 'bg-neutral-900 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'}`}
          >
            {/* 标题栏 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
              <h2 className="text-lg font-semibold">设置</h2>
              <button onClick={onClose} className={`p-1.5 rounded-md transition-colors ${dark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* 统计卡片 */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: '总计', value: stats.total, color: '' },
                  { label: '今日', value: stats.today, color: 'text-indigo-500' },
                  { label: '置顶', value: stats.pinned, color: 'text-emerald-500' },
                  { label: '收藏', value: stats.favorites, color: 'text-amber-500' },
                ].map(s => (
                  <div key={s.label} className={`p-3 rounded-xl text-center ${dark ? 'bg-neutral-800/50' : 'bg-neutral-50'}`}>
                    <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">{s.label}</p>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* 开关设置（快捷键前） */}
              {toggleSettings.map(({ key, title, desc }) => (
                <SettingRow key={key} title={title} desc={desc}>
                  <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
                </SettingRow>
              ))}

              {/* 快捷键 */}
              <div className="space-y-2">
                <p className="font-medium text-sm">全局唤起快捷键</p>
                <ShortcutRecorder
                  dark={dark}
                  value={settings.globalShortcut}
                  onChange={(value) => updateSettings({ globalShortcut: value })}
                  error={globalShortcutConflict || (shortcutError ? `注册失败: ${shortcutError}` : null)}
                  isRegistering={shortcutRegistering}
                  validateRegistration
                />
              </div>

              {/* 沉浸模式快捷键 */}
              <div className="space-y-2">
                <p className="font-medium text-sm">沉浸模式快捷键</p>
                <ShortcutRecorder
                  dark={dark}
                  value={settings.immersiveShortcut}
                  onChange={(value) => updateSettings({ immersiveShortcut: value })}
                  error={immersiveShortcutConflict || null}
                />
              </div>

              {/* 开关设置（快捷键后） */}
              {toggleSettingsAfterShortcut.map(({ key, title, desc }) => (
                <SettingRow key={key} title={title} desc={desc}>
                  <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
                </SettingRow>
              ))}

              {/* 图片性能档位 */}
              <div className="space-y-2">
                <p className="font-medium text-sm">图片处理性能档位</p>
                <select
                  value={settings.imagePerformanceProfile}
                  onChange={(e) => updateSettings({ imagePerformanceProfile: e.target.value as typeof settings.imagePerformanceProfile })}
                  className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
                >
                  {IMAGE_PERFORMANCE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500">
                  {IMAGE_PERFORMANCE_OPTIONS.find(opt => opt.value === settings.imagePerformanceProfile)?.desc}
                </p>
                {backendProfileSyncState === 'failed' ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-red-500">
                      后端已生效：获取失败（{backendProfileError ?? '未知错误'}）
                    </p>
                    <button
                      type="button"
                      onClick={() => setBackendProfileRetryToken((token) => token + 1)}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${dark ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
                    >
                      重试
                    </button>
                  </div>
                ) : (
                  <div className={`text-xs flex items-center gap-1.5 ${backendProfileSyncState === 'synced' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {backendProfileSyncState === 'syncing' && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>
                      后端已生效：
                      {IMAGE_PERFORMANCE_OPTIONS.find(opt => opt.value === (backendImageProfile ?? settings.imagePerformanceProfile))?.label ?? '未知'}
                      {backendProfileSyncState === 'synced' ? '（已同步）' : '（同步中）'}
                    </span>
                  </div>
                )}
              </div>

              {/* 图片处理高级配置 */}
              <div className="space-y-3">
                <p className="font-medium text-sm">图片处理高级配置</p>

                <SettingRow
                  title="允许内网地址"
                  desc="开启后允许访问 127.0.0.1/内网网段图片链接（存在 SSRF 风险）"
                >
                  <ToggleSwitch
                    dark={dark}
                    on={settings.allowPrivateNetwork}
                    onToggle={() => updateSettings({ allowPrivateNetwork: !settings.allowPrivateNetwork })}
                  />
                </SettingRow>

                <SettingRow
                  title="DNS 解析安全校验"
                  desc="校验域名解析结果是否落入内网/本地地址，建议保持开启"
                >
                  <ToggleSwitch
                    dark={dark}
                    on={settings.resolveDnsForUrlSafety}
                    onToggle={() => updateSettings({ resolveDnsForUrlSafety: !settings.resolveDnsForUrlSafety })}
                  />
                </SettingRow>

                <div className="space-y-2">
                  <p className="font-medium text-sm">解码内存上限（MB）</p>
                  <input
                    type="number"
                    min={MIN_DECODED_MB}
                    step={8}
                    value={decodedMb}
                    onChange={(e) => {
                      const parsed = Number.parseInt(e.target.value || `${MIN_DECODED_MB}`, 10);
                      const nextMb = Number.isFinite(parsed) ? Math.max(MIN_DECODED_MB, parsed) : MIN_DECODED_MB;
                      updateSettings({ maxDecodedBytes: nextMb * 1024 * 1024 });
                    }}
                    className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
                  />
                  <p className="text-xs text-neutral-500">最小 {MIN_DECODED_MB}MB；值越大可处理更大图片，但峰值内存也会增加</p>
                </div>
              </div>

              {/* 图片保存路径 */}
              <PathSelector
                dark={dark}
                title="图片保存路径"
                description="设置图片和 SVG 文件的保存位置"
                displayPath={imagesInfo?.path || settings.imagesDir || '默认路径 (App Data/images)'}
                statusText={imagesInfo ? `${imagesInfo.file_count} 个文件 · ${formatSize(imagesInfo.total_size)}` : undefined}
                showReset={!!settings.imagesDir}
                onOpen={handleOpenImagesDir}
                onSelect={handleSelectImagesDir}
                onReset={handleResetImagesDir}
              />

              {/* 数据库路径 */}
              <PathSelector
                dark={dark}
                title="数据库路径"
                description="更改数据库存储位置（会自动移动数据）"
                displayPath={dbInfo?.path || '加载中...'}
                statusText={dbInfo ? formatSize(dbInfo.size) : undefined}
                loading={dbMoving}
                showReset
                onOpen={handleOpenDbDir}
                onSelect={handleSelectDbDir}
                onReset={handleResetDbDir}
              />

              {/* 历史上限 */}
              <div className="space-y-2">
                <p className="font-medium text-sm">历史记录上限</p>
                <input
                  type="range" min="10" max="500" step="10"
                  value={settings.maxItems}
                  onChange={(e) => updateSettings({ maxItems: parseInt(e.target.value) })}
                  className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 ${dark ? 'bg-neutral-700' : 'bg-neutral-200'}`}
                />
                <div className={`flex justify-between text-[10px] font-mono ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                  <span>10</span>
                  <span className="font-bold text-indigo-500">{settings.maxItems}</span>
                  <span>500</span>
                </div>
              </div>

              {/* 自动清理 */}
              <div className="space-y-2">
                <p className="font-medium text-sm">自动清理（天）</p>
                <select
                  value={settings.autoClearDays}
                  onChange={(e) => updateSettings({ autoClearDays: parseInt(e.target.value) })}
                  className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
                >
                  {AUTO_CLEAR_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 导入导出 */}
              <div className={`pt-4 border-t flex gap-3 ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                <button
                  onClick={exportData}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`}
                >导出数据</button>
                <label className={`flex-1 py-2 rounded-lg text-xs font-semibold text-center cursor-pointer transition-all ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
                  导入数据
                  <input type="file" accept=".json" onChange={importData} className="hidden" />
                </label>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
