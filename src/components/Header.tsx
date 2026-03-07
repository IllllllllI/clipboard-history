import React, { useMemo, useCallback } from 'react';
import { Search, Plus, Sun, Moon, Settings, X, Tag, List, Pin, PinOff, Star, FileText, Link2, Palette, Image, FolderOpen, Type, type LucideIcon } from 'lucide-react';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useUIContext, FilterType } from '../contexts/UIContext';
import './styles/header.css';

// ============================================================================
// 常量
// ============================================================================

/** 过滤标签 */
const FILTER_TABS: { id: FilterType; label: string; icon: LucideIcon }[] = [
  { id: 'all',      label: '全部', icon: List },
  { id: 'pinned',   label: '置顶', icon: Pin },
  { id: 'favorite', label: '收藏', icon: Star },
  { id: 'text',     label: '文本', icon: Type },
  { id: 'snippet',  label: '片段', icon: FileText },
  { id: 'url',      label: '链接', icon: Link2 },
  { id: 'color',    label: '颜色', icon: Palette },
  { id: 'image',    label: '图片', icon: Image },
  { id: 'file',     label: '文件', icon: FolderOpen },
];

// ============================================================================
// 组件
// ============================================================================

/**
 * 顶部搜索栏 + 过滤标签 + 操作按钮
 */
export const Header = React.memo(function Header() {
  const { settings, updateSettings } = useSettingsContext();
  const {
    searchQuery, setSearchQuery,
    setSelectedIndex,
    setShowSettings, setShowAddModal, setShowTagManager,
    activeFilter, setActiveFilter,
  } = useUIContext();

  const darkMode = settings.darkMode;
  const handleToggleDarkMode = useCallback(
    () => updateSettings({ darkMode: !darkMode }),
    [updateSettings, darkMode],
  );

  const alwaysOnTop = settings.alwaysOnTop;
  const handleToggleAlwaysOnTop = useCallback(
    () => updateSettings({ alwaysOnTop: !alwaysOnTop }),
    [updateSettings, alwaysOnTop],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedIndex(0);
  }, [setSearchQuery, setSelectedIndex]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setSelectedIndex(0);
  }, [setSearchQuery, setSelectedIndex]);

  const handleFilterClick = useCallback((id: FilterType) => {
    setActiveFilter(id);
    setSelectedIndex(0);
  }, [setActiveFilter, setSelectedIndex]);

  /** 工具栏按钮配置（memoize 避免每次渲染重建数组 + 内联函数） */
  const toolbarActions = useMemo<{ icon: LucideIcon; title: string; onClick: () => void; className?: string }[]>(() => [
    { icon: Plus,     title: '添加片段',                        onClick: () => setShowAddModal(true) },
    { icon: darkMode ? Sun : Moon, title: darkMode ? '切换为浅色模式' : '切换为深色模式', onClick: handleToggleDarkMode, className: darkMode ? 'theme-toggle' : undefined },
    { icon: alwaysOnTop ? Pin : PinOff, title: alwaysOnTop ? '取消窗口置顶' : '设置窗口置顶', onClick: handleToggleAlwaysOnTop, className: alwaysOnTop ? 'pin-active' : undefined },
    { icon: Tag,      title: '标签管理',                        onClick: () => setShowTagManager(true) },
    { icon: Settings, title: '偏好设置',                        onClick: () => setShowSettings(true) },
  ], [darkMode, alwaysOnTop, setShowAddModal, setShowTagManager, setShowSettings, handleToggleDarkMode, handleToggleAlwaysOnTop]);

  return (
    <header className="app-header" data-theme={darkMode ? 'dark' : 'light'}>
      <div className="app-header__top-row">
        <label htmlFor="search-input" className="sr-only">搜索历史记录</label>
        <Search className="app-header__search-icon" aria-hidden="true" />
        <input
          id="search-input"
          type="text"
          autoFocus
          placeholder="搜索历史记录..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="app-header__search-input"
          autoComplete="off"
          spellCheck="false"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="app-header__clear-btn animate-fade-in"
            title="清空搜索内容"
            aria-label="清空搜索内容"
          >
            <X className="app-header__clear-icon" aria-hidden="true" />
          </button>
        )}
        <div className="app-header__toolbar" role="toolbar" aria-label="应用功能菜单">
          {toolbarActions.map(({ icon: Icon, title, onClick, className: modifier }) => (
            <button
              type="button"
              key={title}
              onClick={onClick}
              className="app-header__tool-btn"
              data-variant={modifier ?? 'default'}
              title={title}
              aria-label={title}
            >
              <Icon className="app-header__tool-icon" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <nav className="app-header__filter-row" aria-label="数据类型筛选">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFilter === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleFilterClick(tab.id)}
              className="app-header__filter-tab"
              data-active={isActive ? 'true' : 'false'}
              title={`筛选：${tab.label}`}
              aria-pressed={isActive}
            >
              <Icon className="app-header__filter-icon" aria-hidden="true" />
              <span className="app-header__filter-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
});
