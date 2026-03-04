# TagManager 样式命名规范

> 返回总览：`docs/style-naming-overview.md`

本规范适用于 `src/components/TagManagerModal.tsx` 与 `src/components/TagManagerModalParts/**`，目标是：

- 类名语义清晰
- 状态表达统一
- 组件拆分后可维护

## 命名格式

采用语义前缀 + 组件结构命名：

- 主模块前缀：`tag-manager-*`
- 运行时状态统一使用 `data-*`（不再拼接状态类）

示例：

- `tag-manager-modal-shell`
- `tag-manager-row-action-btn-edit`
- `tag-manager-dialog-btn-cancel` + `data-theme='dark'`

## 书写规则

1. 新增类名必须以 `tag-manager-*` 开头。
2. 禁止新增 `is-*` 状态类名（已弃用运行时状态类名）。
3. 主题统一使用 `data-theme='dark|light'`。
4. 状态统一使用 `data-*`（如 `data-state` / `data-active` / `data-disabled`）。
5. 允许的少量通用类（过渡保留）：
   - `custom-scrollbar`
6. 禁止新增 `.dark .tag-manager-xxx` 祖先依赖，优先使用：
   - `.tag-manager-xxx[data-theme='dark'] { ... }`

## 新增样式建议流程

1. 先确定样式归属文件（`modal.css` / `list-row.css` / `dialog.*.css` / `colorpicker.css`）
2. 定义语义类名（保持 `tag-manager-*` 前缀一致）
3. 在 TSX 输出 `data-*` 状态，不拼接运行时状态类
4. 本地执行审计与 lint 验证

## 反例

- `className="is-active"`（已弃用运行时状态类名）
- `className="tag-manager-row --active --dark"`
- `.dark .tag-manager-row { ... }`

## 正例

- `className="tag-manager-row" data-theme='dark'`
- `.tag-manager-row[data-theme='dark'] { ... }`

## 自动审计

项目提供脚本：

- `npm run audit:tagmanager-style`

检查项：

- 是否出现 `is-*` 类名
- 是否出现已弃用运行时状态类（如 `--active`、`--dark`、`--light` 等）
- 是否出现不符合 `tag-manager-*` 的类名（排除白名单）

建议在改动 `TagManager` 后执行：

```bash
npm run audit:tagmanager-style
npm run lint
```
