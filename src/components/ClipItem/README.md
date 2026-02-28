# ClipItem

`ClipItem` 是单条剪贴板记录的模块化目录。

## 文件职责

- `index.tsx`：对外统一导出入口（当前仅导出 `ClipItemComponent`）。
- `ClipItemComponent.tsx`：条目布局骨架与交互编排。
- `ClipItemContent.tsx`：主体内容渲染（文本/代码/图片/文件等）。
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
