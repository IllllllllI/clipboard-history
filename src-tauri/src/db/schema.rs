use rusqlite::Connection;

use crate::error::AppError;

pub(super) fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .ok();

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            is_snippet INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0
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
    ).map_err(|e| AppError::Database(format!("创建表失败: {}", e)))?;

    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_pinned INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_snippet INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN is_favorite INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE history ADD COLUMN picked_color TEXT", []);

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
         CREATE INDEX IF NOT EXISTS idx_history_pinned_timestamp ON history(is_pinned, timestamp DESC);
         CREATE INDEX IF NOT EXISTS idx_history_favorite_timestamp ON history(is_favorite, timestamp DESC);
         CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
         CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);"
    ).map_err(|e| AppError::Database(format!("创建索引失败: {}", e)))?;

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

        assert_eq!(count, 1, "history table should exist exactly once");
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
        ] {
            assert!(
                index_set.contains(required),
                "missing required index: {required}"
            );
        }
    }
}
