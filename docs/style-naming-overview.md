# 样式命名总览

本页用于汇总项目内已落地的样式命名与状态表达规则，作为快速入口。

## 统一原则

- 结构类名使用语义前缀（如 `sm-*`、`clip-item-*`）。
- 运行时状态统一使用 `data-*`（如 `data-theme`、`data-active`、`data-state`）。
- 禁止新增 `is-*` 运行时状态类名。
- 禁止在组件样式中回退到 className 拼接运行时状态类。

## 模块规范

- SettingsModal：见 `docs/settings-modal-style-naming.md`
- ClipItem：见 `docs/clipitem-style-naming.md`
- TagManager：见 `docs/tagmanager-style-naming.md`
- FileList：见 `docs/filelist-style-naming.md`

## 统一覆盖范围（无单独文档）

以下组件已按同一规则完成样式抽离与状态统一，当前不单独维护命名文档：

- `Header`
- `Footer`
- `ImageDisplay`
- `LargeImagePreview`
- `Toast`
- `DownloadProgressIndicator`

## 快速跳转

- SettingsModal 规范：`docs/settings-modal-style-naming.md`
- ClipItem 规范：`docs/clipitem-style-naming.md`
- TagManager 规范：`docs/tagmanager-style-naming.md`
- FileList 规范：`docs/filelist-style-naming.md`

## 审计命令

- `npm run audit:settings-style`：检查 SettingsModal 运行时状态类回退。
- `npm run audit:clipitem-style`：检查 ClipItem 命名前缀与状态类约束。
- `npm run audit:tagmanager-style`：检查 TagManager 运行时状态类回退。
- `npm run audit:filelist-style`：检查 FileList 命名前缀与状态类约束。
- `npm run audit:docs-links`：检查文档内 `docs/...md` 引用有效性。
- `npm run audit:all`：一次执行全部审计。
- `npm run check:all`：执行全部审计 + TypeScript 类型校验。

## 推荐执行顺序

```bash
npm run check:all
```

## 维护建议

- 新增组件先确定所属命名前缀，再实现结构类名。
- 组件主题与状态优先通过 `data-*` 输出，避免条件拼接状态 class。
- 改动样式后，至少运行对应模块审计 + `lint`。
