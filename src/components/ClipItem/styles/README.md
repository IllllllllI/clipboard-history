# ClipItem Styles

`ClipItem` 目录的样式拆分，采用语义化 class 命名并按组件分层。

## 文件职责

- `clip-item.css`：`ClipItemComponent` 条目骨架、状态、标签区、右侧元信息。
- `clip-item-content.css`：`ClipItemContent` 颜色块、图片信息、链接与正文文本。
- `action-buttons.css`：`ActionButtons` 操作按钮区与状态样式。
- `image-preview.css`：`ImagePreview` 缩略图与 hover 元信息层。
- `datetime-chip.css`：`DateTimeChip` 与日期时间弹层。
- `tag-dropdown.css`：`TagDropdown` 触发按钮、弹层与标签项。
- `highlight-text.css`：`HighlightText` 的 mark 高亮样式。

## 约定

- 组件内优先使用语义化 class，不再堆叠 Tailwind 原子类。
- 动态色值（如标签颜色）继续使用内联 `style`，结构样式放 CSS。
- 新增子组件时，优先新增对应样式文件并在此目录登记职责。
