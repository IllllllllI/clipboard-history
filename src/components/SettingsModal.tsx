import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings, Keyboard, Monitor, HardDrive } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { TauriService } from '../services/tauri';
import { getGlobalShortcutConflict, getImmersiveShortcutConflict } from '../utils';
import type { WindowPlacementMode } from '../types';
import {
  GeneralSettingsPanel,
  ShortcutSettingsPanel,
  WindowSettingsPanel,
  StorageSettingsPanel,
  ToggleSwitch,
  SettingRow,
  ShortcutRecorder,
  PathSelector,
} from './SettingsModal/index';
import type { SettingToggle } from './SettingsModal/index';

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

const WINDOW_PLACEMENT_OPTIONS: { value: WindowPlacementMode; label: string; desc: string }[] = [
  { value: 'smart_near_cursor', label: '智能贴近鼠标', desc: '按当前算法靠近鼠标并自动避免超出屏幕' },
  { value: 'cursor_top_left', label: '窗口左上角对齐鼠标', desc: '窗口左上角对齐到鼠标位置（会做边界修正）' },
  { value: 'cursor_center', label: '窗口中心对齐鼠标', desc: '窗口中心对齐鼠标位置（会做边界修正）' },
  { value: 'custom_anchor', label: '窗口内自定义锚点', desc: '指定窗口内某像素点对齐鼠标位置' },
  { value: 'monitor_center', label: '当前屏幕中心', desc: '显示到鼠标所在屏幕的中心位置' },
  { value: 'screen_center', label: '主屏幕中心', desc: '显示到主显示器（首屏）中心位置' },
  { value: 'custom', label: '自定义坐标', desc: '使用你指定的屏幕绝对坐标（X,Y）' },
  { value: 'last_position', label: '保持上次位置', desc: '不重算位置，保持窗口当前坐标' },
];

const MIN_DECODED_MB = 8;

type TabId = 'general' | 'shortcuts' | 'window' | 'storage';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: '常规', icon: <Settings className="w-4 h-4" /> },
  { id: 'shortcuts', label: '快捷键', icon: <Keyboard className="w-4 h-4" /> },
  { id: 'window', label: '窗口', icon: <Monitor className="w-4 h-4" /> },
  { id: 'storage', label: '图片与存储', icon: <HardDrive className="w-4 h-4" /> },
];

// ============================================================================
// 样式工具
// ============================================================================

// ============================================================================
// 主组件
// ============================================================================

export const SettingsModal = React.memo(function SettingsModal({ show, onClose }: SettingsModalProps) {
  const { settings, updateSettings, stats, shortcutError, shortcutRegistering, exportData, importData } = useAppContext();
  const dark = settings.darkMode;
  const globalShortcutConflict = getGlobalShortcutConflict(settings.globalShortcut, settings.immersiveShortcut);
  const immersiveShortcutConflict = getImmersiveShortcutConflict(settings.immersiveShortcut, settings.globalShortcut);

  const [activeTab, setActiveTab] = useState<TabId>('general');

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
  const isCustomPlacement = settings.windowPlacement.mode === 'custom';
  const isCustomAnchorPlacement = settings.windowPlacement.mode === 'custom_anchor';
  const selectedPlacementOption = WINDOW_PLACEMENT_OPTIONS.find(opt => opt.value === settings.windowPlacement.mode);

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

  const toggleSettings: SettingToggle[] = [
    { key: 'autoCapture',     title: '自动捕获',     desc: '实时监听剪切板变化并保存' },
    { key: 'doubleClickPaste', title: '双击粘贴',     desc: '双击记录项自动复制并粘贴到当前应用' },
  ];

  const toggleSettingsAfterShortcut: SettingToggle[] = [
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
            className={`relative w-full max-w-3xl h-[70vh] rounded-2xl shadow-2xl overflow-hidden border flex flex-col ${dark ? 'bg-neutral-900 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'}`}
          >
            {/* 标题栏 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
              <h2 className="text-lg font-semibold">设置</h2>
              <button onClick={onClose} className={`p-1.5 rounded-md transition-colors ${dark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* 侧边栏 */}
              <div className={`w-48 flex-shrink-0 border-r p-3 space-y-1 overflow-y-auto ${dark ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? (dark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
                        : (dark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 内容区 */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'general' && (
                  <GeneralSettingsPanel
                    dark={dark}
                    stats={stats}
                    settings={settings}
                    toggleSettings={toggleSettings}
                    autoClearOptions={[...AUTO_CLEAR_OPTIONS]}
                    updateSettings={updateSettings}
                    ToggleSwitch={ToggleSwitch}
                    SettingRow={SettingRow}
                  />
                )}

                {activeTab === 'shortcuts' && (
                  <ShortcutSettingsPanel
                    dark={dark}
                    settings={settings}
                    globalShortcutError={globalShortcutConflict || (shortcutError ? `注册失败: ${shortcutError}` : null)}
                    immersiveShortcutError={immersiveShortcutConflict || null}
                    shortcutRegistering={shortcutRegistering}
                    updateSettings={updateSettings}
                    ShortcutRecorder={ShortcutRecorder}
                  />
                )}

                {activeTab === 'window' && (
                  <WindowSettingsPanel
                    dark={dark}
                    settings={settings}
                    toggleSettingsAfterShortcut={toggleSettingsAfterShortcut}
                    windowPlacementOptions={WINDOW_PLACEMENT_OPTIONS}
                    selectedPlacementLabel={selectedPlacementOption?.label}
                    isCustomPlacement={isCustomPlacement}
                    isCustomAnchorPlacement={isCustomAnchorPlacement}
                    updateSettings={updateSettings}
                    ToggleSwitch={ToggleSwitch}
                    SettingRow={SettingRow}
                  />
                )}

                {activeTab === 'storage' && (
                  <StorageSettingsPanel
                    dark={dark}
                    settings={settings}
                    minDecodedMb={MIN_DECODED_MB}
                    decodedMb={decodedMb}
                    imagePerformanceOptions={[...IMAGE_PERFORMANCE_OPTIONS]}
                    backendProfileSyncState={backendProfileSyncState}
                    backendProfileError={backendProfileError}
                    backendImageProfile={backendImageProfile}
                    imagesPath={imagesInfo?.path || settings.imagesDir || '默认路径 (App Data/images)'}
                    imagesStatusText={imagesInfo ? `${imagesInfo.file_count} 个文件 · ${formatSize(imagesInfo.total_size)}` : undefined}
                    showImagesReset={!!settings.imagesDir}
                    dbPath={dbInfo?.path || '加载中...'}
                    dbStatusText={dbInfo ? formatSize(dbInfo.size) : undefined}
                    dbMoving={dbMoving}
                    updateSettings={updateSettings}
                    onRetryBackendProfile={() => setBackendProfileRetryToken((token) => token + 1)}
                    onOpenImagesDir={handleOpenImagesDir}
                    onSelectImagesDir={handleSelectImagesDir}
                    onResetImagesDir={handleResetImagesDir}
                    onOpenDbDir={handleOpenDbDir}
                    onSelectDbDir={handleSelectDbDir}
                    onResetDbDir={handleResetDbDir}
                    onExportData={exportData}
                    onImportData={importData}
                    ToggleSwitch={ToggleSwitch}
                    SettingRow={SettingRow}
                    PathSelector={PathSelector}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
