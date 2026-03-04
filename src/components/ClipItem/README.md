# ClipItem

`ClipItem` 是单条剪贴板记录的模块化目录，按职责拆分为 5 个子模块 + 4 个自定义 Hook。

## 目录结构

```
ClipItem/
├── index.ts                  # barrel 导出（对外唯一入口）
├── ClipItemComponent.tsx     # 条目布局骨架与交互编排（编排层）
├── ClipItemContent.tsx       # 主体内容路由（文本/代码/图片/文件/颜色等）
├── constants.ts              # 图标与类型映射等共享常量
├── useClickOutside.ts        # 统一的“点击外部关闭”Hook
├── useClipItemDerivedState.ts # 衍生状态 Hook（类型/图标/accent 等）
├── useClipItemCallbacks.ts   # 回调 Hook（gallery/filelist/color/time 操作）
├── useUrlOpenState.ts        # URL/文件打开异步状态 Hook
├── README.md
│
├── display/                  # 显示原语
│   ├── HighlightText.tsx     # 搜索关键词高亮渲染
│   ├── DateTimeChip.tsx      # 日期时间高亮标签 + 悬停格式转换弹窗
│   ├── LinkOpenStatus.tsx    # 链接/文件打开状态图标（idle/opening/success/error）
│   ├── ImagePreview.tsx      # 图片缩略图预览（格式/尺寸元信息）
│   └── styles/               # 对应样式文件
│
├── actions/                  # 交互与操作
│   ├── ActionButtons.tsx     # 操作按钮栏（复制/编辑/删除）
│   ├── TagDropdown.tsx       # 标签下拉选择器（Alt+点击快速切换）
│   └── styles/               # 对应样式文件
│
├── tags/                     # 标签列表
│   └── ClipItemTagList.tsx   # 标签列表组件（高度动画 + 两种布局）
│
├── favorite/                 # 收藏视觉效果
│   ├── ClipItemTimeMeta.tsx  # 右侧时间区（图钉/收藏/时间按钮）展示与交互
│   ├── FavoriteBurstEffect.tsx # 收藏爆发 SVG 动效渲染
│   └── useFavoriteVisualState.ts # 收藏动效时序（先爆发后显示星标）状态管理
│
├── color/                    # 颜色系统
│   ├── index.ts              # barrel 导出
│   ├── ColorContentBlock.tsx # 颜色内容分支渲染与颜色复制/颜色板交互
│   ├── ColorPickerPopover.tsx# 颜色选择弹窗主体
│   ├── useColorState.ts      # 颜色状态管理 Hook（HSLA 主状态）
│   ├── ColorPreview.tsx      # 颜色预览圆圈（当前色 vs 原色）
│   ├── ColorModeSelector.tsx # 颜色模式切换下拉（HEX/RGB/HSL）
│   ├── ColorInputPanel.tsx   # 颜色值输入区
│   ├── ChannelInput.tsx      # 单通道数值输入（含滚轮）
│   ├── HistoryColors.tsx     # 预设/历史颜色面板
│   ├── ActionBar.tsx         # 底部操作栏（复制+确认）
│   └── styles/               # 对应样式文件
│
└── styles/                   # 顶层样式（clip-item 主体 + HUD + 内容区）
```

## 维护约定

- 对外依赖统一走 `./ClipItem`（barrel），避免跨文件直接耦合内部实现。
- 复用逻辑优先下沉到子模块，`ClipItemComponent` 保持“编排层”职责。
- 新增子能力时优先在目录内按职责拆分，不回填到单文件巨型组件。
- 无行为重构优先提炼常量、复用 helper、去重复分支；避免改动现有交互语义。
- 样式命名遵循 `docs/clipitem-style-naming.md`，提交前建议运行 `npm run audit:clipitem-style`。
- 导入路径约束：目录外禁止直连 `ClipItem` 子文件，提交前建议运行 `npm run audit:clipitem-imports`。

## ImageGallery 列表交互约定

- `ImageGallery` 在 `list` 模式下采用“操作分离”策略：
  - 点击缩略图：仅打开大图预览（调用 `onImageClick`）。
  - 点击整行条目：仅执行单条目复制（调用 `onListItemClick`，由上层接到 `copyToClipboard(item)`）。
- `ImageGallery` 在 `carousel` 模式下提供“复制当前图片”按钮：
  - 始终复制当前激活索引对应的单张图片 URL。
  - 上层通过 `onCopyImage(url)` 复用 `copyToClipboard({ ...item, text: url })`，不改变原条目 id。
- `ImageGallery` 在 `grid` 模式下同样提供“复制当前图片”按钮：
  - 每个宫格图片提供悬浮“复制此图”按钮，点击即复制对应单图。
- 为避免嵌套交互元素冲突，列表行容器使用带 `role="button"` 的可聚焦行，并支持 `Enter` / `Space` 触发复制。
- 该约定由以下测试覆盖：
  - `src/components/ImageGallery/ImageGallery.test.tsx`
  - `src/components/__tests__/ClipItemImageGalleryInteraction.test.tsx`
