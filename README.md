# Clipboard Master (Tauri + React)

这是一个使用 Tauri 2.0 和 React 构建的专业级剪切板历史管理工具。

## 核心功能

- **实时监控**：使用 Rust 后端实时监听系统剪切板变化。
- **本地数据库**：使用 SQLite 永久保存剪切板历史。
- **双击粘贴**：双击记录项自动复制并模拟键盘粘贴到当前活动窗口。
- **拖拽支持**：支持将记录项直接拖拽到其他应用中。
- **设置面板**：可配置自动捕获、双击粘贴及历史记录上限。

## 项目结构

- `src/`: 前端 React 代码。
- `src-tauri/`: 后端 Rust 代码及配置。
  - `capabilities/`: **Tauri 2.0 权限配置**（数据库和剪切板访问）。
  - `src/main.rs`: 应用入口与命令注册。
  - `src/db.rs`: 数据库门面模块（对外保持 `db::xxx` 命令入口）。
  - `src/db/`: 数据库子模块。
    - `schema.rs`: 表结构/索引初始化与迁移。
    - `history.rs`: 历史记录与批量操作命令。
    - `tags.rs`: 标签管理命令。
    - `cleanup.rs`: 删除条目后的本地文件清理逻辑。
    - `storage.rs`: 数据库路径查询与迁移。
    - `config.rs`: 数据库目录配置读写与路径解析。

## 如何在本地运行

1. **安装依赖**: `npm install`
2. **生成图标**: `npx tauri icon ./icon.png` (需准备一张 512x512 的图片)
3. **启动开发**: `npx tauri dev`

## 测试与构建

- 前端构建：`npm run build`
- Rust 编译检查：`cargo check --manifest-path src-tauri/Cargo.toml`
- 数据库模块测试：`cargo test --manifest-path src-tauri/Cargo.toml db:: -- --nocapture`

> Windows 下若遇到 `target/debug/clipboard-history.exe` 文件占用导致测试失败，可使用：
> `CARGO_TARGET_DIR=src-tauri/target-test cargo test --manifest-path src-tauri/Cargo.toml db:: -- --nocapture`

## 注意事项

- **权限**: Tauri 2.0 引入了严苛的权限系统，所有插件功能必须在 `src-tauri/capabilities/default.json` 中声明。
- **Rust 报错**: 如果遇到 `OUT_DIR` 错误，请运行一次 `npx tauri dev` 以生成编译环境。
