//! Schema 初始化子模块
//!
//! ## 职责
//! - 创建/迁移数据库表结构与索引
//! - 设置 SQLite 运行参数（WAL、外键）
//! - 回填 `history_assets` 以兼容旧数据
//!
//! ## 输入/输出
//! - 输入：`&Connection`
//! - 输出：`Result<(), AppError>`
//!
//! ## 错误语义
//! - DDL 或回填失败统一映射为 `AppError::Database`

use rusqlite::Connection;

use crate::error::AppError;

const SCHEMA_VERSION: i64 = 4;

fn get_user_version(conn: &Connection) -> Result<i64, AppError> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("读取数据库版本失败: {}", e)))
}

fn set_user_version(conn: &Connection, version: i64) -> Result<(), AppError> {
    conn.execute_batch(&format!("PRAGMA user_version = {version};"))
        .map_err(|e| AppError::Database(format!("写入数据库版本失败: {}", e)))
}

fn ensure_history_columns(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_pinned INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_snippet INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_favorite INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN picked_color TEXT", []);
}

fn create_history_indexes(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
         CREATE INDEX IF NOT EXISTS idx_history_pinned_timestamp ON history(is_pinned, timestamp DESC);
         CREATE INDEX IF NOT EXISTS idx_history_favorite_timestamp ON history(is_favorite, timestamp DESC);"
    ).map_err(|e| AppError::Database(format!("创建历史索引失败: {}", e)))
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
        );"
    ).map_err(|e| AppError::Database(format!("创建基础表失败: {}", e)))?;

    ensure_history_columns(conn);

    create_history_indexes(conn)?;

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
         CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);"
    ).map_err(|e| AppError::Database(format!("创建基础索引失败: {}", e)))?;

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
    ).map_err(|e| AppError::Database(format!("创建历史资源映射失败: {}", e)))
}

fn migrate_history_boolean_checks(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA foreign_keys=OFF;")
        .map_err(|e| AppError::Database(format!("关闭外键检查失败: {}", e)))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::Database(format!("开始 v4 迁移事务失败: {}", e)))?;

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
            id,
            text,
            timestamp,
            CASE WHEN is_pinned = 0 THEN 0 ELSE 1 END,
            CASE WHEN is_snippet = 0 THEN 0 ELSE 1 END,
            CASE WHEN is_favorite = 0 THEN 0 ELSE 1 END,
            picked_color
         FROM history_old;
         DROP TABLE history_old;"
    ).map_err(|e| AppError::Database(format!("执行 v4 历史表迁移失败: {}", e)))?;

    tx.commit()
        .map_err(|e| AppError::Database(format!("提交 v4 迁移事务失败: {}", e)))?;

    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| AppError::Database(format!("恢复外键检查失败: {}", e)))?;

    create_history_indexes(conn)?;

    Ok(())
}

pub(super) fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .ok();

    create_base_tables(conn)?;

    let mut version = get_user_version(conn)?;
    if version < 1 {
        set_user_version(conn, 1)?;
        version = 1;
    }

    if version < 2 {
        create_history_assets_table(conn)?;
        set_user_version(conn, 2)?;
        version = 2;
    }

    if version < 3 {
        super::cleanup::backfill_missing_history_assets(conn, 1000)?;
        set_user_version(conn, 3)?;
        version = 3;
    }

    if version < 4 {
        migrate_history_boolean_checks(conn)?;
        set_user_version(conn, 4)?;
        version = 4;
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
mod tests {
    use std::collections::HashSet;

    use rusqlite::Connection;

    use super::initialize_schema;

    #[test]
    fn initialize_schema_is_idempotent() {
        let conn = Connection::open_in_memory().expect("create memory db");

        initialize_schema(&conn).expect("first init should succeed");
        initialize_schema(&conn).expect("second init should succeed");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='history'", [], |row| row.get(0))
            .expect("query table count");

        let assets_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='history_assets'", [], |row| row.get(0))
            .expect("query history_assets table count");

        assert_eq!(count, 1, "history table should exist exactly once");
        assert_eq!(assets_count, 1, "history_assets table should exist exactly once");
    }

    #[test]
    fn initialize_schema_creates_expected_columns_and_indexes() {
        let conn = Connection::open_in_memory().expect("create memory db");
        initialize_schema(&conn).expect("init should succeed");

        let mut stmt = conn
            .prepare("PRAGMA table_info(history)")
            .expect("prepare table_info");
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect columns");
        let column_set: HashSet<String> = columns.into_iter().collect();

        for required in [
            "id",
            "text",
            "timestamp",
            "is_pinned",
            "is_snippet",
            "is_favorite",
            "picked_color",
        ] {
            assert!(
                column_set.contains(required),
                "missing required column: {required}"
            );
        }

        let mut index_stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
            .expect("prepare index query");
        let index_names = index_stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query indexes")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect indexes");
        let index_set: HashSet<String> = index_names.into_iter().collect();

        for required in [
            "idx_history_timestamp",
            "idx_history_pinned_timestamp",
            "idx_history_favorite_timestamp",
            "idx_item_tags_item_id",
            "idx_item_tags_tag_id",
            "idx_history_assets_item_id",
            "idx_history_assets_path",
        ] {
            assert!(
                index_set.contains(required),
                "missing required index: {required}"
            );
        }

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("query user_version");
        assert_eq!(version, super::SCHEMA_VERSION);
    }

    #[test]
    fn initialize_schema_enforces_boolean_flag_checks() {
        let conn = Connection::open_in_memory().expect("create memory db");
        initialize_schema(&conn).expect("init should succeed");

        let invalid_insert = conn.execute(
            "INSERT INTO history (text, timestamp, is_pinned, is_snippet, is_favorite)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ("invalid", 1_i64, 2_i32, 0_i32, 0_i32),
        );

        assert!(invalid_insert.is_err(), "CHECK 约束应拒绝无效标志值");
    }

    #[test]
    fn initialize_schema_migrates_v3_flags_to_v4_constraints() {
        let conn = Connection::open_in_memory().expect("create memory db");

        conn.execute_batch(
            "CREATE TABLE history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                is_pinned INTEGER DEFAULT 0,
                is_snippet INTEGER DEFAULT 0,
                is_favorite INTEGER DEFAULT 0,
                picked_color TEXT
            );
            CREATE TABLE tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT
            );
            CREATE TABLE item_tags (
                item_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (item_id, tag_id)
            );
            CREATE TABLE history_assets (
                item_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                PRIMARY KEY (item_id, path)
            );
            PRAGMA user_version = 3;"
        )
        .expect("prepare legacy v3 schema");

        conn.execute(
            "INSERT INTO history (text, timestamp, is_pinned, is_snippet, is_favorite)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ("legacy", 1_i64, 2_i32, -3_i32, 0_i32),
        )
        .expect("insert legacy v3 data");

        initialize_schema(&conn).expect("migrate from v3 to v4");

        let (is_pinned, is_snippet, is_favorite): (i32, i32, i32) = conn
            .query_row(
                "SELECT is_pinned, is_snippet, is_favorite FROM history WHERE text = 'legacy'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("query migrated flags");

        assert_eq!((is_pinned, is_snippet, is_favorite), (1, 1, 0));

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("query user_version after migrate");
        assert_eq!(version, super::SCHEMA_VERSION);

        let invalid_update = conn.execute(
            "UPDATE history SET is_snippet = 7 WHERE text = 'legacy'",
            [],
        );
        assert!(invalid_update.is_err(), "迁移后应启用 CHECK 约束");
    }
}
