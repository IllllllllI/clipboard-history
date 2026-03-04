# SettingsModal 样式命名规范

> 返回总览：`docs/style-naming-overview.md`

本规范仅用于 `src/components/SettingsModal` 相关样式，目标是：

- 类名语义清晰
- 状态表达统一
- 组件拆分后可维护

## 命名格式

采用语义前缀 + BEM 结构（仅用于结构语义）：

- Block：`sm-xxx`
- Element：`sm-xxx__yyy`
- 固定语义后缀可使用 `--`（如 `sm-panel__note--tiny`）
- 运行时状态统一使用 `data-*`（不再拼接状态类）

示例：

- `sm-modal`
- `sm-modal__panel`
- `sm-modal__header`
- `sm-panel__option-card`
- `sm-panel__option-card` + `data-active='true'`

## 书写规则

1. 新增类优先按 `sm-*` 语义命名，不引入 `is-*` 状态类名。
2. 状态统一使用 `data-state` / `data-active` / `data-disabled` 等属性。
3. 主题统一使用 `data-theme='dark|light'`。
4. 避免在 TSX 中堆叠 Tailwind 工具类，优先放到对应 CSS 模块。
5. 仅在必要时保留原子类（第三方图标或过渡性改造场景）。

## 文件拆分约定

- `settings-modal.css`：弹窗外壳（遮罩、容器、侧栏、标题栏）
- `settings-sections.css`：分区布局、统计区、选项卡片
- `settings-controls.css`：表单控件、路径选择、同步状态
- `settings-recorder.css`：快捷键录制器
- `settings-modal-panels.css`：聚合入口（仅 `@import`）

## 新增样式建议流程

1. 先确定归属模块（shell / sections / controls / recorder）
2. 定义语义类名（BEM）
3. 在 TSX 使用类名，不写临时工具类
4. 本地跑 `npm run lint` 做基础验证

## 反例

- `className="is-active"`
- `className="sm-modal__tab --active --dark"`
- `className="text-xs px-2 py-1 bg-neutral-800 ..."`（可提取到 CSS 却未提取）

## 正例

- `className="sm-panel__option-card" data-active='true' data-theme='dark'`
- `className="sm-path-selector__btn" data-theme='light' data-disabled='true' data-variant='danger'`

## 自动审计

项目提供脚本：

- `npm run audit:settings-style`

检查项：

- 是否出现已弃用的运行时状态类（如 `--active`、`--dark`、`--light` 等）
- 是否回退到 className 拼接运行时状态类的旧写法

建议在改动 `SettingsModal` 后执行：

```bash
npm run audit:settings-style
npm run lint
```
