# FileList 样式命名规范

> 返回总览：`docs/style-naming-overview.md`

本规范适用于 `src/components/FileListDisplay.tsx` 与 `src/components/styles/file-list-display.css`，目标是：

- 类名语义清晰
- 状态表达统一
- 列表项结构与交互易维护

## 命名格式

采用语义前缀 + 组件结构命名：

- 主模块前缀：`file-list-*`
- 运行时状态统一使用 `data-*`（不再拼接状态类）

示例：

- `file-list-display`
- `file-list-item__action-btn`
- `file-list-item` + `data-theme='dark'` + `data-selected='true'`

## 书写规则

1. 新增类名必须以 `file-list-*` 开头。
2. 禁止新增 `is-*` 状态类名（已弃用运行时状态类名）。
3. 主题统一使用 `data-theme='dark|light'`。
4. 选中态、紧凑态等统一使用 `data-*`（如 `data-selected` / `data-compact` / `data-single`）。
5. 禁止新增 `.dark .file-list-xxx` 祖先依赖，优先使用：
   - `.file-list-xxx[data-theme='dark'] { ... }`

## 新增样式建议流程

1. 先确定结构层级（`display` / `item` / `actions` / `summary`）
2. 定义语义类名（保持 `file-list-*` 前缀一致）
3. 在 TSX 输出 `data-*` 状态，不拼接运行时状态类
4. 本地执行审计与 lint 验证

## 反例

- `className="is-selected"`
- `className="file-list-item --active --dark"`
- `.dark .file-list-item { ... }`

## 正例

- `className="file-list-item" data-theme='dark' data-selected='true'`
- `.file-list-item[data-theme='dark'][data-selected='false'] { ... }`

## 自动审计

项目提供脚本：

- `npm run audit:filelist-style`

检查项：

- 是否出现 `is-*` 类名
- 是否出现已弃用运行时状态类（如 `--active`、`--dark`、`--light` 等）
- 是否出现不符合 `file-list-*` 的类名

建议在改动 `FileList` 后执行：

```bash
npm run audit:filelist-style
npm run lint
```
