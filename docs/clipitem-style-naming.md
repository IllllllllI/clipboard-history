# ClipItem 样式命名规范

> 返回总览：`docs/style-naming-overview.md`

本规范适用于 `src/components/ClipItem` 目录及其子目录，目标是：

- 类名语义清晰
- 状态表达统一
- 组件拆分后可维护

## 命名格式

采用语义前缀 + 组件结构命名：

- 主模块前缀：`clip-item-*`
- ColorPicker 子模块前缀：`clip-item-color-picker-*`
- 运行时状态统一使用 `data-*`（不再拼接状态类）

示例：

- `clip-item-root`
- `clip-item-action-btn`
- `clip-item-action-btn-delete`
- `clip-item-datetime-popover-btn` + `data-copied='true'`

## 书写规则

1. 新增类名必须以 `clip-item-*` 或 `clip-item-color-picker-*` 开头。
2. 禁止新增 `is-*` 状态类名（已弃用运行时状态类名）。
3. 主题统一使用 `data-theme='dark|light'`。
4. 状态统一使用 `data-*`（如 `data-active` / `data-selected` / `data-disabled` / `data-copied`）。
5. 允许的少量通用类（过渡保留）：
   - `truncate`
   - `custom-scrollbar`
   - `dark`（主题根类选择器）
   - `react-colorful*`（第三方颜色选择器内部类）
6. 禁止新增 `.dark .clip-item-xxx` 祖先依赖，优先使用：
   - `.clip-item-xxx[data-theme='dark'] { ... }`

## 新增样式建议流程

1. 先确定样式归属文件（`clip-item.css` / `clip-item-content.css` / `action-buttons.css` 等）
2. 定义语义类名（保持前缀一致）
3. 在 TSX 输出 `data-*` 状态，不拼接运行时状态类
4. 本地执行审计与 lint 验证

## 反例

- `className="is-active"`（已弃用运行时状态类名）
- `className="clip-item-action-btn --active --dark"`
- `.dark .clip-item-content-link { ... }`

## 正例

- `className="clip-item-action-btn" data-active='true' data-theme='dark'`
- `.clip-item-content-link[data-theme='dark'] { ... }`

## 自动审计

项目提供脚本：

- `npm run audit:clipitem-style`

检查项：

- 是否出现 `is-*` 类名
- 是否出现不符合 `clip-item-*` / `clip-item-color-picker-*` 的类名（排除白名单）

建议在改动 `ClipItem` 后执行：

```bash
npm run audit:clipitem-style
npm run lint
```
