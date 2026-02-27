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
  - `src/image_handler/`: 图片处理模块（下载 / 解码 / 复制）。
    - `mod.rs`: 模块导出入口。
    - `service.rs`: `ImageServiceState`（Tauri `State` 注入模式）。
    - `commands.rs`: Tauri 命令薄封装。
    - `handler.rs`: 核心编排与集成测试。
    - `loader.rs`: URL/Base64/文件加载与校验。
    - `pipeline.rs`: 解码、像素限制、降采样。
    - `clipboard_writer.rs`: 剪贴板写入与重试。
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
- 图片处理性能基线（Debug）：`cargo test --manifest-path src-tauri/Cargo.toml image_handler::handler::tests -- --nocapture`
- 图片处理性能基线（Release）：`cargo test --manifest-path src-tauri/Cargo.toml --release image_handler::handler::tests -- --nocapture`
- 阶段拆分基线（剪贴板写入）：`cargo test --manifest-path src-tauri/Cargo.toml --release perf_decode_vs_clipboard_write_stage -- --ignored --nocapture`
- 服务层并发与鲁棒性测试：`cargo test --manifest-path src-tauri/Cargo.toml image_handler::service::tests -- --nocapture`
- 服务层长时 Soak（默认忽略）：`cargo test --manifest-path src-tauri/Cargo.toml image_handler::service::tests::service_profile_long_running_soak -- --ignored --nocapture`
- 前端设置同步定向测试：`npx vitest run src/hooks/useSettings.test.ts`

> Windows 下若遇到 `target/debug/clipboard-history.exe` 文件占用导致测试失败，可使用：
> `CARGO_TARGET_DIR=src-tauri/target-test cargo test --manifest-path src-tauri/Cargo.toml db:: -- --nocapture`

## 图片处理性能与内存基线

以下数据来自 `src-tauri/src/image_handler/handler.rs` 中的 `image_handler::handler::tests` 压测用例。

## 图片模块架构说明

- 当前图片模块采用 **Tauri State 注入模式**：在 `main.rs` 中注册 `ImageServiceState`，命令层通过 `State<'_, ImageServiceState>` 调用业务逻辑。
- 命令层保持薄封装，仅做参数接收与结果返回；核心逻辑集中在 `handler/loader/pipeline/clipboard_writer`。
- 该模式相较全局单例更利于测试隔离与后续扩展（例如按窗口或按会话配置实例）。

## 图片性能档位调参模板

### 档位建议

- `quality`：优先保真，适合设计稿、截图精细比对、OCR 前处理。
- `balanced`：默认推荐，适合大多数日常复制场景。
- `speed`：优先吞吐，适合高频复制、低性能设备、远程桌面环境。

### 场景化推荐

- 如果用户反馈“图片模糊”：先切 `quality`。
- 如果用户反馈“复制卡顿”：先切 `speed`。
- 如果用户反馈“偶发慢但可接受”：保持 `balanced`，结合日志看 `copy` 阶段耗时。

### 调参顺序（建议）

1. 先调整档位（`quality/balanced/speed`），不要一次改多个底层参数。
2. 观察阶段耗时日志：`load` / `decode` / `copy` / `total`。
3. 若主要慢在 `copy`，优先降低输出像素（使用 `balanced` 或 `speed`）。
4. 若主要慢在 `decode`，优先检查输入尺寸与格式（超大图、异常编码）。
5. 若是网络图慢，检查 URL 来源与下载体积限制。

### 团队默认策略（建议）

- 默认档位使用 `balanced`。
- 客诉“清晰度不足”时临时切 `quality`，确认后再固化。
- 客诉“延迟高”时临时切 `speed`，并记录设备型号与分辨率作为回归样本。

## 图片高级配置说明

- 设置面板新增高级项并与后端实时同步：
  - `allowPrivateNetwork`：是否允许访问内网/本地地址图片资源（默认 `false`）。
  - `resolveDnsForUrlSafety`：是否对域名解析结果执行内网拦截校验（默认 `true`）。
  - `maxDecodedBytes`：解码后像素缓冲内存上限（默认 `160MB`，最小 `8MB`）。
- 对应后端命令：
  - `set_image_advanced_config`
  - `get_image_advanced_config`
- 安全建议：生产环境保持 `allowPrivateNetwork=false` 且 `resolveDnsForUrlSafety=true`。

## 线上排障速查表

### 步骤 1：先确认后端配置可用

- 命令：`cargo check --manifest-path src-tauri/Cargo.toml`
- 观察点：编译必须通过；若失败先修复构建环境再做性能判断。

### 步骤 2：跑图片链路基线

- 命令：`CARGO_TARGET_DIR=src-tauri/target-test cargo test --manifest-path src-tauri/Cargo.toml image_handler::handler::tests -- --nocapture`
- 观察点：关注日志中的 `load / decode / copy / total`。

### 步骤 3：定位瓶颈并切档验证

- `copy` 明显最高：优先切 `speed`，通常是系统剪贴板写入瓶颈。
- `decode` 明显最高：检查图片尺寸/格式，优先降档或缩小输入。
- `load` 明显最高：检查 URL 来源、网络状态、文件体积与重定向链。

### 常见结论模板

- **结论 A（写入瓶颈）**：切 `speed` 后 `copy` 下降明显，可判定为剪贴板阶段瓶颈。
- **结论 B（解码瓶颈）**：`decode` 与图片像素规模线性上升，优先控制输入分辨率。
- **结论 C（网络瓶颈）**：`load` 波动大且占比最高，优先排查网络与资源地址。

### Debug（开发构建）

- `decode 1024x1024`：输入 `1153KB`，输出 `4096KB`，耗时 `115ms`
- `decode 2048x2048`：输入 `4611KB`，输出 `16384KB`，耗时 `447ms`
- `decode 3840x2160`：输入 `9118KB`，输出 `14400KB`，耗时 `2769ms`（含降采样）
- `base64 1920x1080`：解析 `10ms`，解码 `239ms`，输出 `8100KB`

### Release（优化构建）

- `decode 1024x1024`：输入 `1153KB`，输出 `4096KB`，耗时 `8ms`
- `decode 2048x2048`：输入 `4611KB`，输出 `16384KB`，耗时 `34ms`
- `decode 3840x2160`：输入 `9118KB`，输出 `14400KB`，耗时 `128ms`（含降采样）
- `base64 1920x1080`：解析 `0ms`，解码 `17ms`，输出 `8100KB`

### Release 阶段拆分（解码 vs 写入剪贴板）

- `stage 1920x1080`：解码 `16ms`，剪贴板写入平均 `84ms`，输出 `8100KB`
- `stage 3840x2160`：解码 `129ms`，剪贴板写入平均 `26ms`，输出 `14400KB`

### 说明

- 解码后内存主要由 RGBA 像素缓冲决定，近似为 `width × height × 4` 字节。
- 当前实现已增加像素上限、下载体积上限、重试零额外拷贝，并加入自适应降采样（默认开启）。
- 对超大图（如 4K），会以更低像素输出换取更快剪贴板写入与更低写入内存开销。
- 不同机器与编译器版本会影响绝对耗时，建议关注相对趋势与回归差值。

## 注意事项

- **权限**: Tauri 2.0 引入了严苛的权限系统，所有插件功能必须在 `src-tauri/capabilities/default.json` 中声明。
- **Rust 报错**: 如果遇到 `OUT_DIR` 错误，请运行一次 `npx tauri dev` 以生成编译环境。
