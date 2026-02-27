import React from 'react';
import { Search, Plus, Sun, Moon, Settings, X, Tag, type LucideIcon } from 'lucide-react';
import { useAppContext, FilterType } from '../contexts/AppContext';

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
// 样式工具
// ============================================================================

/** 通用工具栏按钮样式 */
const toolBtnClass = (dark: boolean, extra?: string) =>
  `p-2 rounded-xl transition-all active:scale-95 ${dark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'} ${extra ?? ''}`;

/** 过滤标签样式 */
const filterTabClass = (active: boolean, dark: boolean) =>
  active
    ? (dark ? 'bg-indigo-500 text-white shadow-md shadow-indigo-900/20 active:scale-95' : 'bg-indigo-500 text-white shadow-md shadow-indigo-200 active:scale-95')
    : (dark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 active:scale-95' : 'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 active:scale-95');

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

  const dark = settings.darkMode;

  /** 工具栏按钮配置 */
  const toolbarActions: { icon: LucideIcon; title: string; onClick: () => void; className?: string }[] = [
    { icon: Plus,     title: '添加片段',                        onClick: () => setShowAddModal(true) },
    { icon: dark ? Sun : Moon, title: dark ? '切换浅色模式' : '切换深色模式', onClick: () => updateSettings({ darkMode: !dark }), className: dark ? 'text-yellow-400 hover:bg-neutral-800' : undefined },
    { icon: Tag,      title: '标签管理',                        onClick: () => setShowTagManager(true) },
    { icon: Settings, title: '设置',                            onClick: () => setShowSettings(true) },
  ];

  return (
    <header className={`shrink-0 flex flex-col z-10 shadow-sm transition-colors duration-300 backdrop-blur-md ${dark ? 'bg-neutral-900/80 border-b border-neutral-800' : 'bg-white/80 border-b border-neutral-200'}`}>
      <div className="flex items-center px-5 py-3.5">
        <Search className={`w-5 h-5 shrink-0 transition-colors ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
        <input
          type="text"
          autoFocus
          placeholder="搜索历史记录..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          className={`w-full px-4 py-2 text-lg bg-transparent outline-none placeholder:font-light transition-colors ${
            dark ? 'text-white placeholder:text-neutral-600' : 'text-neutral-800 placeholder:text-neutral-400'
          }`}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSelectedIndex(0); }}
            className={`p-1.5 rounded-full transition-all active:scale-90 ${dark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200'}`}
          >
            <X className="w-4 h-4 text-neutral-400" />
          </button>
        )}
        <div className={`flex items-center gap-1.5 ml-3 pl-4 border-l ${dark ? 'border-neutral-800' : 'border-neutral-200'}`}>
          {toolbarActions.map(({ icon: Icon, title, onClick, className }) => (
            <button
              key={title}
              onClick={onClick}
              className={className ? `p-2 rounded-xl transition-all ${className}` : toolBtnClass(dark)}
              title={title}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      <div className={`px-5 py-2.5 flex items-center gap-2 text-sm transition-colors ${dark ? 'bg-neutral-900/30' : 'bg-neutral-50/50'}`}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveFilter(tab.id); setSelectedIndex(0); }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterTabClass(activeFilter === tab.id, dark)}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
});
