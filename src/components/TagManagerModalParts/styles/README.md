# TagManagerModalParts Styles

本目录按“结构模块”拆分样式，各组件按需直接引入对应 CSS。

## 文件职责

- `modal.css`：`TagManagerModal` 父层容器、头部、主操作区。
- `dialog.shared.css`：编辑/删除弹窗共享基础（遮罩、弹窗壳、按钮、通用图标尺寸）。
- `dialog.editor.css`：编辑弹窗专属样式。
- `dialog.delete.css`：删除确认弹窗专属样式。
- `list-row.css`：标签列表、行项样式。
- `colorpicker.css`：颜色选择器样式。

## 维护约定

- 组件内优先使用语义化 class，避免新增 Tailwind 原子类堆叠。
- 公共样式优先放 `dialog.shared.css`，避免重复定义。
- 仅在涉及动态值（如用户选色）时使用内联 `style`。
- 新增样式时，先判断归属模块，再放入对应文件；不要直接回填到入口文件。

## 命名前缀规范

- `tag-manager-modal-*`：父容器与头部区域。
- `tag-manager-dialog-*`：编辑/删除弹窗通用结构与按钮。
- `tag-manager-editor-*`：编辑弹窗专属。
- `tag-manager-delete-*`：删除弹窗专属。
- `tag-manager-row-*`：标签行项。
- `tag-manager-color-*`：颜色选择器。
- `tag-manager-icon-*`：通用尺寸类（如 `-14`、`-16`）。
