# Clipboard History（Tauri + React）

[![CI / check:all](https://github.com/IllllllllI/clipboard-history/actions/workflows/ci.yml/badge.svg)](https://github.com/IllllllllI/clipboard-history/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/IllllllllI/clipboard-history?display_name=tag)](https://github.com/IllllllllI/clipboard-history/releases)

一个基于 **Tauri 2 + React 19 + TypeScript + Rust** 的桌面剪贴板历史工具，面向日常文本/代码/图片工作流。

## 文档导航

- 样式规范总览：`docs/style-naming-overview.md`
- 输入模块架构：`docs/input-module-architecture.md`
- 服务 API 使用矩阵：`docs/service-api-usage-matrix.md`
- SettingsModal：`docs/settings-modal-style-naming.md`
- ClipItem：`docs/clipitem-style-naming.md`
- TagManager：`docs/tagmanager-style-naming.md`
- FileList：`docs/filelist-style-naming.md`

## 主要功能

- 实时监听系统剪贴板并自动入库（SQLite）。
- 历史记录管理：置顶、收藏、删除、批量清理、自动过期清理。
- 代码片段能力：新增片段、编辑、语言识别与高亮展示。
- 标签体系：创建/编辑/删除标签，并给记录打标签。
- 多形态复制与粘贴：文本、图片、本地文件路径、双击粘贴、点击后粘贴。
- 图片链路：支持 URL 下载复制、Base64 复制、本地图片复制，并提供性能档位（`quality` / `balanced` / `speed`）。
- 桌面集成：系统托盘、全局快捷键呼出、窗口定位与隐藏逻辑。
- UI 体验：沉浸模式、暗色模式、拖拽交互、图片大图预览。

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS。
- 桌面框架：Tauri 2。
- 后端：Rust（`rusqlite`、`reqwest`、`image`、`arboard`、`enigo`）。
- 数据存储：SQLite（随应用本地持久化）。

## 目录结构（核心）

- `src/`：前端业务代码（组件、Context、Hooks、服务层）。
- `src/services/tauri.ts`：Tauri API 门面（窗口、快捷键、图片、文件、存储信息）。
- `src/services/db.ts`：数据库 IPC 门面（历史记录/标签/统计）。
- `src-tauri/src/main.rs`：应用入口、插件注册、托盘与命令注册。
- `src-tauri/src/lib.rs`：后端模块总览与导出。
- `src-tauri/src/db/`：数据库与标签等后端能力。
- `src-tauri/src/image_handler/`：图片下载、解码、限流、复制链路。
- `src-tauri/src/input/`：输入模拟、文件打开、文件图标等平台能力。
- `src-tauri/capabilities/default.json`：Tauri 权限清单。
- `docs/input-module-architecture.md`：输入模块分层架构说明。
- `docs/service-api-usage-matrix.md`：前端服务 API 使用矩阵（脚本生成）。
- `docs/style-naming-overview.md`：样式命名统一规则总览入口。
- `docs/settings-modal-style-naming.md`：SettingsModal 样式命名规范（BEM 约定）。
- `docs/clipitem-style-naming.md`：ClipItem 样式命名规范与审计约定。
- `docs/tagmanager-style-naming.md`：TagManager 样式命名规范与审计约定。

## 环境要求

- Node.js 18+（建议 LTS）。
- Rust stable（建议通过 `rustup` 安装）。
- Tauri 2 构建依赖（Windows 需安装 WebView2 与 MSVC 构建工具）。

## 快速开始

1. 安装依赖

```bash
npm install
```

1.1 安装仓库本地 Git hooks（启用 pre-commit 审计）

```bash
npm run hooks:install
```

安装后，`pre-commit` 会自动执行：

- `npm run check:all`（包含所有审计 + 类型检查）

2. 启动前端开发服务（可选，便于单独调 UI）

```bash
npm run dev
```

3. 启动 Tauri 桌面开发模式（推荐日常开发使用）

```bash
npm run tauri:dev
```

## 开发建议流程

推荐开发顺序：

1. 先启动前端：`npm run dev`
2. 再启动桌面壳：`npm run tauri:dev`
3. 提交前执行：`npm run check:all`

这样可以更快定位问题来源（前端、桌面壳、还是质量审计）。

## 构建发布

```bash
npm run build
npm run tauri:build
```

Windows 打包目标由 `src-tauri/tauri.conf.json` 配置为 `nsis` 与 `msi`。

## 常用脚本

- `npm run dev`：单实例启动 Vite 开发服务（端口 3000，若已启动则直接提示并退出）。
- `npm run dev:force`：强制清理 3000 端口占用后再启动 Vite 开发服务。
- `npm run tauri:dev`：启动桌面开发模式。
- `npm run build`：构建前端产物。
- `npm run tauri:build`：构建桌面安装包。
- `npm run lint`：TypeScript 类型检查。
- `npm run hooks:install`：将 Git hooks 路径指向仓库内 `.githooks`。
- `npm run audit:service-usage`：生成服务层调用审计结果。
- `npm run audit:clipitem-style`：检查 ClipItem 样式命名是否符合约定。
- `npm run audit:settings-style`：检查 SettingsModal 是否回退到旧的运行时状态类写法。
- `npm run audit:tagmanager-style`：检查 TagManager 是否回退到旧的运行时状态类写法。
- `npm run audit:docs-links`：检查 `README.md` 与 `docs/*.md` 中的 `docs/...md` 引用是否存在。
- `npm run audit:all`：按顺序执行 `audit:settings-style`、`audit:clipitem-style`、`audit:tagmanager-style`、`audit:docs-links`。
- `npm run check:all`：执行 `audit:all` + `lint`（与 pre-commit 对齐）。

## 样式治理现状

当前已落地“语义类名 + `data-*` 状态表达 + 审计/校验闭环”的模块与组件包括：

- SettingsModal
- ClipItem
- TagManager
- FileList
- Header / Footer
- ImageDisplay / LargeImagePreview
- Toast / DownloadProgressIndicator

统一入口见：`docs/style-naming-overview.md`

## 配置说明（默认值）

默认设置定义于 `src/constants/index.ts`，关键项包括：

- 全局快捷键：`Alt+V`
- 沉浸模式快捷键：`Ctrl+Shift+Z`
- 历史上限：`100`
- 自动清理天数：`30`
- 图片性能档位：`balanced`
- 全局唤起窗口位置：`smart_near_cursor`（智能贴近鼠标）
- `allowPrivateNetwork = false`
- `resolveDnsForUrlSafety = true`
- `maxDecodedBytes = 160MB`

全局唤起窗口位置（`windowPlacement`）支持以下模式：

- `smart_near_cursor`：智能贴近鼠标并自动避免越界
- `cursor_top_left`：窗口左上角对齐鼠标位置
- `cursor_center`：窗口中心对齐鼠标位置
- `monitor_center`：显示在鼠标所在屏幕中心
- `screen_center`：显示在主屏幕中心
- `custom`：使用自定义绝对坐标（`customX/customY`）
- `last_position`：保持窗口上次位置，不重新计算

## 图片链路说明

图片复制支持三种输入：

- 网络图片 URL（后端下载后写入剪贴板）
- Base64 Data URL
- 本地图片文件路径

后端通过 `ImageServiceState` 注入，命令层保持薄封装，核心逻辑位于 `loader / pipeline / clipboard_writer`。

### 图片写入失败日志字段（Windows）

当图片写入系统剪贴板失败时，后端日志会输出固定字段，便于检索与告警聚合：

- `format`：失败的剪贴板格式（如 `PNG`、`CF_DIBV5`）
- `hr`：原始 HRESULT（十六进制）
- `code`：从 HRESULT 解析出的 Win32 错误码（若可解析）
- `hint`：错误语义提示（例如剪贴板占用、内存不足、系统资源不足）

示例（简化）：

```text
SetClipboardData失败: format=PNG hr=0x8007058A code=1418 hint=剪贴板句柄未打开或已失效 ...
```

## 排障建议

- 先检查 Rust 编译链是否正常：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

- 若 `npm run dev` 或 `npm run tauri:dev` 失败，优先确认：
  - Node 版本是否满足要求；
  - Rust 工具链是否安装完整；
  - Windows 下 WebView2 与 C++ 构建工具是否可用。
- 若 `npm run dev` 提示端口占用或启动失败：

```bash
npm run dev:force
```

  该命令会先清理 3000 端口占用，再启动开发服务。
- 若窗口关闭后“像没退出”，这是预期行为：主窗口默认关闭转隐藏，可从托盘再次唤起。

## 安全与权限

本项目使用 Tauri 2 Capability 权限模型，相关权限声明在 `src-tauri/capabilities/default.json`，涉及：

- 窗口控制权限
- 全局快捷键权限
- 剪贴板读写权限
- 文件系统读取权限
- 系统对话框与 shell 打开权限

请在新增后端能力时同步更新权限清单，避免运行时权限拒绝。