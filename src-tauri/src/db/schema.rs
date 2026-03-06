//! Schema 初始化子模块
//!
//! ## 职责
//! - 创建/迁移数据库表结构与索引
//! - 设置 SQLite 运行参数（WAL、外键）
//! - 回填 `history_assets` 以兼容旧数据
//!
//! ## 设计决策
//!
//! ### 迁移策略
//! 每个版本增量对应一个独立迁移函数，由 `MIGRATIONS` 注册表驱动执行。
//! 新增迁移只需追加条目并更新 `SCHEMA_VERSION`，无需修改编排逻辑。
//!
//! ### 外键安全
//! SQLite 的 `ALTER TABLE RENAME` 会重写现有外键引用，
//! 导致在 `DROP TABLE old` 后外键悬空。
//! 所有涉及表重建的迁移通过 `rebuild_table()` + `with_fk_off()` 封装，
//! 确保 FK 开关的配对与错误恢复。
//!
//! ## 输入/输出
//! - 输入：`&Connection`
//! - 输出：`Result<(), AppError>`
//!
//! ## 错误语义
//! - DDL 或回填失败统一映射为 `AppError::Database`

use rusqlite::Connection;

use crate::error::AppError;

use super::db_err;

const SCHEMA_VERSION: i64 = 7;

// ── 版本管理 ─────────────────────────────────────────────────

fn get_user_version(conn: &Connection) -> Result<i64, AppError> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| db_err("读取数据库版本失败", e))
}

fn set_user_version(conn: &Connection, version: i64) -> Result<(), AppError> {
    conn.execute_batch(&format!("PRAGMA user_version = {version};"))
        .map_err(|e| db_err("写入数据库版本失败", e))
}

// ── 外键安全 helper ──────────────────────────────────────────

/// 在外键检查关闭的环境中执行操作，结束后无条件恢复
///
/// `PRAGMA foreign_keys` 是会话级设置，只能在事务外修改。
/// 即使 `op` 失败，也会尝试恢复 FK 检查，避免连接处于不安全状态。
fn with_fk_off(
    conn: &Connection,
    op: impl FnOnce(&Connection) -> Result<(), AppError>,
) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA foreign_keys=OFF;")
        .map_err(|e| db_err("关闭外键检查失败", e))?;
    let result = op(conn);
    // 无论操作是否成功，都恢复 FK 检查
    let restore = conn
        .execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| db_err("恢复外键检查失败", e));
    result?;
    restore
}

// ── 表重建 helper ────────────────────────────────────────────

/// 表重建规格：将旧表替换为新 DDL，保留数据
///
/// 用于修复因 `ALTER TABLE RENAME` 导致的外键悬空。
struct TableRebuildSpec {
    /// 待重建的表名
    name: &'static str,
    /// 新表的 `CREATE TABLE` DDL（表名使用 `{name}_new`）
    create_ddl: &'static str,
    /// 从旧表复制数据到新表的 SQL
    copy_sql: &'static str,
    /// 重建后需要创建的索引（多条语句用 `;` 分隔）
    index_ddl: &'static str,
}

/// 重建指定表：创建新表 → 复制数据 → 删除旧表 → 重命名
///
/// 在 `with_fk_off` 环境中使用事务保证原子性。
fn rebuild_table(conn: &Connection, spec: &TableRebuildSpec) -> Result<(), AppError> {
    with_fk_off(conn, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| db_err(&format!("开始 {} 重建事务失败", spec.name), e))?;
        tx.execute_batch(spec.create_ddl)
            .map_err(|e| db_err(&format!("创建 {}_new 表失败", spec.name), e))?;
        tx.execute_batch(spec.copy_sql)
            .map_err(|e| db_err(&format!("迁移 {} 数据失败", spec.name), e))?;
        tx.execute_batch(&format!("DROP TABLE IF EXISTS {};", spec.name))
            .map_err(|e| db_err(&format!("删除旧 {} 表失败", spec.name), e))?;
        tx.execute_batch(&format!(
            "ALTER TABLE {name}_new RENAME TO {name};",
            name = spec.name,
        ))
        .map_err(|e| db_err(&format!("重命名 {}_new 失败", spec.name), e))?;
        tx.commit()
            .map_err(|e| db_err(&format!("提交 {} 重建事务失败", spec.name), e))?;
        Ok(())
    })?;
    conn.execute_batch(spec.index_ddl)
        .map_err(|e| db_err(&format!("创建 {} 索引失败", spec.name), e))
}

const HISTORY_ASSETS_SPEC: TableRebuildSpec = TableRebuildSpec {
    name: "history_assets",
    create_ddl:
        "CREATE TABLE IF NOT EXISTS history_assets_new (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE
        );",
    copy_sql:
        "INSERT OR IGNORE INTO history_assets_new (item_id, path)
            SELECT item_id, path FROM history_assets;",
    index_ddl:
        "CREATE INDEX IF NOT EXISTS idx_history_assets_item_id ON history_assets(item_id);
         CREATE INDEX IF NOT EXISTS idx_history_assets_path ON history_assets(path);",
};

const ITEM_TAGS_SPEC: TableRebuildSpec = TableRebuildSpec {
    name: "item_tags",
    create_ddl:
        "CREATE TABLE IF NOT EXISTS item_tags_new (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );",
    copy_sql:
        "INSERT OR IGNORE INTO item_tags_new (item_id, tag_id)
            SELECT item_id, tag_id FROM item_tags;",
    index_ddl:
        "CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
         CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);",
};

// ── 基础表创建 ───────────────────────────────────────────────

/// 补充可能缺失的历史表列（兼容旧版数据库）
///
/// SQLite 的 `ALTER TABLE ADD COLUMN` 在列已存在时返回
/// "duplicate column name" 错误，此处安全忽略。
/// 仅为升级旧数据库服务；新建库已在 `CREATE TABLE` 中声明全部列。
fn ensure_history_columns(conn: &Connection) {
    const ALTER_STMTS: &[&str] = &[
        "ALTER TABLE history ADD COLUMN is_pinned INTEGER DEFAULT 0",
        "ALTER TABLE history ADD COLUMN is_snippet INTEGER DEFAULT 0",
        "ALTER TABLE history ADD COLUMN is_favorite INTEGER DEFAULT 0",
        "ALTER TABLE history ADD COLUMN picked_color TEXT",
        "ALTER TABLE history ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'",
    ];
    for ddl in ALTER_STMTS {
        let _ = conn.execute(ddl, []);
    }
}

fn create_history_indexes(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
         CREATE INDEX IF NOT EXISTS idx_history_pinned_timestamp ON history(is_pinned, timestamp DESC);
         CREATE INDEX IF NOT EXISTS idx_history_favorite_timestamp ON history(is_favorite, timestamp DESC);"
    ).map_err(|e| db_err("创建历史索引失败", e))
}

fn create_base_tables(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            is_snippet INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            picked_color TEXT
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );
        CREATE TABLE IF NOT EXISTS item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS clip_formats (
            item_id INTEGER NOT NULL,
            format  TEXT NOT NULL,
            content TEXT NOT NULL,
            PRIMARY KEY (item_id, format),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE
        );"
    ).map_err(|e| db_err("创建基础表失败", e))?;

    ensure_history_columns(conn);
    create_history_indexes(conn)?;

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
         CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
         CREATE INDEX IF NOT EXISTS idx_clip_formats_item_id ON clip_formats(item_id);"
    ).map_err(|e| db_err("创建基础索引失败", e))?;

    Ok(())
}

fn create_history_assets_table(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history_assets (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_history_assets_item_id ON history_assets(item_id);
        CREATE INDEX IF NOT EXISTS idx_history_assets_path ON history_assets(path);"
    ).map_err(|e| db_err("创建历史资源映射失败", e))
}

// ── 迁移函数 ─────────────────────────────────────────────────

/// v1 → v2: 创建 history_assets 表
fn migrate_to_v2(conn: &Connection) -> Result<(), AppError> {
    create_history_assets_table(conn)
}

/// v2 → v3: 回填缺失的 history_assets 映射
fn migrate_to_v3(conn: &Connection) -> Result<(), AppError> {
    super::cleanup::backfill_missing_history_assets(conn, 1000)
}

/// v3 → v4: 重建 history 表，添加布尔列的 CHECK 约束
///
/// `ALTER TABLE RENAME` 会重写 `history_assets` / `item_tags` 的 FK 引用为
/// `REFERENCES history_old(id)`，所以在 DROP `history_old` 后必须重建这两张表。
fn migrate_to_v4(conn: &Connection) -> Result<(), AppError> {
    with_fk_off(conn, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| db_err("开始 v4 迁移事务失败", e))?;
        tx.execute_batch(
            "ALTER TABLE history RENAME TO history_old;
             CREATE TABLE history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
                is_snippet INTEGER NOT NULL DEFAULT 0 CHECK (is_snippet IN (0, 1)),
                is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
                picked_color TEXT
             );
             INSERT INTO history (id, text, timestamp, is_pinned, is_snippet, is_favorite, picked_color)
             SELECT
                id, text, timestamp,
                CASE WHEN is_pinned = 0 THEN 0 ELSE 1 END,
                CASE WHEN is_snippet = 0 THEN 0 ELSE 1 END,
                CASE WHEN is_favorite = 0 THEN 0 ELSE 1 END,
                picked_color
             FROM history_old;
             DROP TABLE history_old;"
        ).map_err(|e| db_err("执行 v4 历史表迁移失败", e))?;
        tx.commit().map_err(|e| db_err("提交 v4 迁移事务失败", e))?;
        Ok(())
    })?;
    create_history_indexes(conn)?;
    // RENAME 会破坏关联表外键，必须重建
    rebuild_table(conn, &HISTORY_ASSETS_SPEC)?;
    rebuild_table(conn, &ITEM_TAGS_SPEC)?;
    Ok(())
}

/// v4 → v5: 修复 v4 遗留的 history_assets 外键悬空
fn migrate_to_v5(conn: &Connection) -> Result<(), AppError> {
    rebuild_table(conn, &HISTORY_ASSETS_SPEC)
}

/// v5 → v6: 修复 v4 遗留的 item_tags 外键悬空
fn migrate_to_v6(conn: &Connection) -> Result<(), AppError> {
    rebuild_table(conn, &ITEM_TAGS_SPEC)
}

/// v6 → v7: 引入多格式剪贴板支持
///
/// - `history` 新增 `content_type` 列，标识条目的内容类型
/// - 新建 `clip_formats` 表，存储每条记录的附加格式（HTML/RTF/图片）
fn migrate_to_v7(conn: &Connection) -> Result<(), AppError> {
    // 新增列（旧记录统一为 'text'）
    let _ = conn.execute("ALTER TABLE history ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'", []);

    // 创建附加格式表
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clip_formats (
            item_id INTEGER NOT NULL,
            format  TEXT NOT NULL,
            content TEXT NOT NULL,
            PRIMARY KEY (item_id, format),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_clip_formats_item_id ON clip_formats(item_id);"
    ).map_err(|e| db_err("创建 clip_formats 表失败", e))?;

    Ok(())
}

// ── 迁移注册表 ───────────────────────────────────────────────

type MigrationFn = fn(&Connection) -> Result<(), AppError>;

/// 增量迁移注册表
///
/// 每个条目 `(target_version, migration_fn)` 表示：
/// 当前版本 < `target_version` 时执行 `migration_fn`，然后提升到该版本。
///
/// 新增迁移只需追加条目并更新 `SCHEMA_VERSION`。
const MIGRATIONS: &[(i64, MigrationFn)] = &[
    (2, migrate_to_v2),
    (3, migrate_to_v3),
    (4, migrate_to_v4),
    (5, migrate_to_v5),
    (6, migrate_to_v6),
    (7, migrate_to_v7),
];

// ── 入口 ─────────────────────────────────────────────────────

pub(super) fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .ok();

    create_base_tables(conn)?;

    let mut version = get_user_version(conn)?;
    if version < 1 {
        set_user_version(conn, 1)?;
        version = 1;
    }

    for &(target, migrate) in MIGRATIONS {
        if version < target {
            migrate(conn)?;
            set_user_version(conn, target)?;
            version = target;
        }
    }

    if version != SCHEMA_VERSION {
        return Err(AppError::Database(format!(
            "数据库版本不匹配: current={}, expected={}",
            version, SCHEMA_VERSION
        )));
    }

    Ok(())
}

#[cfg(test)]
#[path = "tests/schema_tests.rs"]
mod tests;
