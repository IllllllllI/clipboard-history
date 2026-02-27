import React, { useState, useCallback } from 'react';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ClipList } from './components/ClipList';
import { AddSnippetModal } from './components/AddSnippetModal';
import { CodeEditorModal } from './components/CodeEditor';
import { SettingsModal } from './components/SettingsModal';
import { TagManagerModal } from './components/TagManagerModal';
import { LargeImagePreview } from './components/LargeImagePreview';
import { DownloadProgressIndicator } from './components/DownloadProgressIndicator';
import { ToastContainer } from './components/Toast';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * App 内部布局组件
 * 
 * 仅负责编排子组件，所有业务逻辑由 AppContext 管理。
 */
function AppLayout() {
  const {
    settings,
    immersiveMode, toggleImmersiveMode,
    showSettings, setShowSettings,
    showAddModal, setShowAddModal,
    showTagManager, setShowTagManager,
    previewImageUrl, setPreviewImageUrl,
    downloadState,
  } = useAppContext();

  // 鼠标悬停在顶部时临时显示 Header
  const [headerHover, setHeaderHover] = useState(false);
  const showHeader = !immersiveMode || headerHover;
  const showFooter = !immersiveMode;

  const handleTopHoverEnter = useCallback(() => setHeaderHover(true), []);
  const handleTopHoverLeave = useCallback(() => setHeaderHover(false), []);
  const immersiveShortcut = settings.immersiveShortcut?.trim() || 'Alt+Z';

  return (
    <div className={`h-screen w-screen overflow-hidden transition-colors duration-300 ${settings.darkMode ? 'bg-neutral-900 text-neutral-200' : 'bg-neutral-50 text-neutral-800'} font-sans selection:bg-indigo-500/30 flex flex-col relative`}>
      {/* Subtle background pattern/gradient */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-20 ${settings.darkMode ? 'bg-indigo-900' : 'bg-indigo-200'}`} />
        <div className={`absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[100px] opacity-20 ${settings.darkMode ? 'bg-purple-900' : 'bg-purple-200'}`} />
      </div>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        {/* 沉浸模式：鼠标悬停顶部触发区 */}
        {immersiveMode && (
          <div
            className="absolute top-0 left-0 right-0 h-2 z-50"
            onMouseEnter={handleTopHoverEnter}
          />
        )}

        {/* Header — 沉浸模式下上滑隐藏，鼠标悬停时临时显示 */}
        <div
          className={`shrink-0 transition-all duration-300 ease-in-out ${
            showHeader
              ? 'max-h-[200px] opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 -translate-y-2 overflow-hidden'
          }`}
          onMouseEnter={immersiveMode ? handleTopHoverEnter : undefined}
          onMouseLeave={immersiveMode ? handleTopHoverLeave : undefined}
        >
          <Header />
        </div>

        <ClipList />

        {/* Footer — 沉浸模式下下滑隐藏 */}
        <div
          className={`shrink-0 transition-all duration-300 ease-in-out ${
            showFooter
              ? 'max-h-[60px] opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 translate-y-2 overflow-hidden'
          }`}
        >
          <Footer />
        </div>
      </main>

      {/* 沉浸模式切换浮标 */}
      <button
        onClick={toggleImmersiveMode}
        className={`fixed bottom-3 right-3 z-50 p-1.5 rounded-lg transition-all duration-200 group bg-transparent shadow-none active:scale-90 ${
          immersiveMode
            ? `${settings.darkMode ? 'text-white/70 hover:text-white hover:bg-indigo-500/70' : 'text-indigo-500/70 hover:text-white hover:bg-indigo-500/70'} opacity-60 hover:opacity-100`
            : `${settings.darkMode ? 'text-neutral-400 hover:text-white hover:bg-neutral-800/80' : 'text-neutral-400 hover:text-neutral-700 hover:bg-white/90'} opacity-50 hover:opacity-100`
        }`}
        title={immersiveMode ? `退出沉浸模式 (${immersiveShortcut})` : `沉浸模式 (${immersiveShortcut})`}
      >
        {immersiveMode
          ? <Minimize2 className="w-3.5 h-3.5 opacity-20 group-hover:opacity-100 transition-opacity" />
          : <Maximize2 className="w-3.5 h-3.5 opacity-20 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      <SettingsModal 
        show={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <TagManagerModal
        show={showTagManager}
        onClose={() => setShowTagManager(false)}
      />

      <AddSnippetModal 
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      <CodeEditorModal />

      <LargeImagePreview 
        url={previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />

      <DownloadProgressIndicator downloadState={downloadState} />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}
