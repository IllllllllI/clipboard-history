# ClipItem

`ClipItem` 是单条剪贴板记录的模块化目录。

## 文件职责

- `index.ts`：对外统一导出入口（`ClipItemComponent` + 已抽离的可复用子模块）。
- `ClipItemComponent.tsx`：条目布局骨架与交互编排（编排层）。
- `ClipItemTimeMeta.tsx`：右侧时间区（图钉/收藏/时间按钮）展示与交互。
- `FavoriteBurstEffect.tsx`：收藏爆发 SVG 动效渲染。
- `useFavoriteVisualState.ts`：收藏动效时序（先爆发后显示星标）状态管理。
- `useClipItemHudController.ts`：条目 HUD 触发与全局指针/键盘控制逻辑。
- `ClipItemContent.tsx`：主体内容渲染（文本/代码/图片/文件等）。
- `ColorContentBlock.tsx`：颜色内容分支渲染与颜色复制/颜色板交互。
- `LinkOpenStatus.tsx`：链接/文件打开状态图标渲染（idle/opening/success/error）。
- `ActionButtons.tsx`：条目操作按钮区。
- `ImagePreview.tsx`：图片预览子视图。
- `DateTimeChip.tsx`：时间展示子视图。
- `HighlightText.tsx`：搜索高亮文本渲染。
- `TagDropdown.tsx`：标签下拉与选择交互。
- `constants.ts`：图标与类型映射等常量。
- `ClipItemColorPicker/`：条目内颜色相关子模块。
- `ClipItemColorPicker/styles/`：ColorPicker 子模块样式目录。
- `styles/`：ClipItem 语义化样式目录（按子组件拆分）。

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
