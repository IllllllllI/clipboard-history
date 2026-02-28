import React from 'react';
import { Search, Plus, Sun, Moon, Settings, X, Tag, type LucideIcon } from 'lucide-react';
import { useAppContext, FilterType } from '../contexts/AppContext';
import './styles/header.css';

// ============================================================================
// 常量
// ============================================================================

/** 过滤标签 */
const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: 'all',      label: '全部' },
  { id: 'pinned',   label: '置顶' },
  { id: 'favorite', label: '收藏' },
  { id: 'snippet',  label: '片段' },
  { id: 'url',      label: '链接' },
  { id: 'color',    label: '颜色' },
  { id: 'image',    label: '图片' },
  { id: 'file',     label: '文件' },
];

// ============================================================================
// 组件
// ============================================================================

/**
 * 顶部搜索栏 + 过滤标签 + 操作按钮
 */
export const Header = React.memo(function Header() {
  const {
    settings, updateSettings,
    searchQuery, setSearchQuery,
    setSelectedIndex,
    setShowAddModal, setShowSettings, setShowTagManager,
    activeFilter, setActiveFilter,
  } = useAppContext();

  const darkMode = settings.darkMode;

  /** 工具栏按钮配置 */
  const toolbarActions: { icon: LucideIcon; title: string; onClick: () => void; className?: string }[] = [
    { icon: Plus,     title: '添加片段',                        onClick: () => setShowAddModal(true) },
    { icon: darkMode ? Sun : Moon, title: darkMode ? '切换浅色模式' : '切换深色模式', onClick: () => updateSettings({ darkMode: !darkMode }), className: darkMode ? 'theme-toggle' : undefined },
    { icon: Tag,      title: '标签管理',                        onClick: () => setShowTagManager(true) },
    { icon: Settings, title: '设置',                            onClick: () => setShowSettings(true) },
  ];

  return (
    <header className="app-header" data-theme={darkMode ? 'dark' : 'light'}>
      <div className="app-header__top-row">
        <Search className="app-header__search-icon" />
        <input
          type="text"
          autoFocus
          placeholder="搜索历史记录..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          className="app-header__search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSelectedIndex(0); }}
            className="app-header__clear-btn"
          >
            <X className="app-header__clear-icon" />
          </button>
        )}
        <div className="app-header__toolbar">
          {toolbarActions.map(({ icon: Icon, title, onClick, className: modifier }) => (
            <button
              type="button"
              key={title}
              onClick={onClick}
              className="app-header__tool-btn"
              data-variant={modifier ?? 'default'}
              title={title}
            >
              <Icon className="app-header__tool-icon" />
            </button>
          ))}
        </div>
      </div>

      <div className="app-header__filter-row">
        {FILTER_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => { setActiveFilter(tab.id); setSelectedIndex(0); }}
            className="app-header__filter-tab"
            data-active={activeFilter === tab.id ? 'true' : 'false'}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
});
