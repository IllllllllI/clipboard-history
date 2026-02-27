use std::time::{Duration, Instant};
use std::collections::HashSet;

use rusqlite::{params, params_from_iter, Connection};

fn setup_db(rows: usize, target_refs: usize) -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory sqlite failed");

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE history (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             text TEXT NOT NULL,
             timestamp INTEGER NOT NULL DEFAULT 0,
             is_pinned INTEGER DEFAULT 0,
             is_snippet INTEGER DEFAULT 0,
             is_favorite INTEGER DEFAULT 0,
             picked_color TEXT
         );
         CREATE TABLE history_assets (
             item_id INTEGER NOT NULL,
             path TEXT NOT NULL,
             PRIMARY KEY (item_id, path)
         );
         CREATE INDEX idx_history_assets_path ON history_assets(path);",
    )
    .expect("create benchmark schema failed");

    let target_path = "D:/bench/images/img_target.png";

    for i in 0..rows {
        let is_target = i < target_refs;
        let path = if is_target {
            target_path.to_string()
        } else {
            format!("D:/bench/images/img_{i:06}.png")
        };

        let text = if i % 3 == 0 {
            format!("line-a\n{path}\nline-b")
        } else {
            path.clone()
        };

        conn.execute(
            "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
            params![text, i as i64],
        )
        .expect("insert history row failed");

        let item_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO history_assets (item_id, path) VALUES (?1, ?2)",
            params![item_id, path],
        )
        .expect("insert history_assets row failed");
    }

    conn
}

fn bench_like_lookup(conn: &Connection, path: &str, iters: usize) -> (i64, Duration) {
    let mut total_count = 0_i64;
    let started = Instant::now();

    for _ in 0..iters {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history
                 WHERE text = ?1
                    OR text LIKE ?2
                    OR text LIKE ?3
                    OR text LIKE ?4",
                params![
                    path,
                    format!("{path}\n%"),
                    format!("%\n{path}\n%"),
                    format!("%\n{path}"),
                ],
                |row| row.get(0),
            )
            .expect("LIKE lookup failed");
        total_count += count;
    }

    (total_count, started.elapsed())
}

fn bench_index_lookup(conn: &Connection, path: &str, iters: usize) -> (i64, Duration) {
    let mut total_count = 0_i64;
    let started = Instant::now();

    for _ in 0..iters {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history_assets WHERE path = ?1",
                params![path],
                |row| row.get(0),
            )
            .expect("index lookup failed");
        total_count += count;
    }

    (total_count, started.elapsed())
}

fn extract_generated_paths_from_text(text: &str) -> HashSet<String> {
    let mut paths = HashSet::new();
    for line in text.lines() {
        let value = line.trim();
        if value.starts_with("D:/bench/images/img_") && value.ends_with(".png") {
            paths.insert(value.to_string());
        }
    }

    if paths.is_empty() {
        let value = text.trim();
        if value.starts_with("D:/bench/images/img_") && value.ends_with(".png") {
            paths.insert(value.to_string());
        }
    }

    paths
}

fn build_in_clause_params(ids: &[i64]) -> (String, Vec<i64>) {
    let placeholders = vec!["?"; ids.len()].join(",");
    (placeholders, ids.to_vec())
}

fn bench_bulk_delete_legacy(conn: &Connection, ids: &[i64]) -> Duration {
    let started = Instant::now();

    let (placeholders, args) = build_in_clause_params(ids);
    let sql = format!("SELECT text FROM history WHERE id IN ({placeholders})");

    let mut stmt = conn.prepare(&sql).expect("prepare legacy select failed");
    let rows = stmt
        .query_map(params_from_iter(args.iter()), |row| row.get::<_, String>(0))
        .expect("query legacy select failed");

    let mut candidates = HashSet::new();
    for row in rows {
        let text = row.expect("read legacy row failed");
        candidates.extend(extract_generated_paths_from_text(&text));
    }

    let del_sql = format!("DELETE FROM history WHERE id IN ({placeholders})");
    conn.execute(&del_sql, params_from_iter(args.iter()))
        .expect("legacy delete failed");

    for path in candidates {
        let _: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history
                 WHERE text = ?1
                    OR text LIKE ?2
                    OR text LIKE ?3
                    OR text LIKE ?4",
                params![
                    path,
                    format!("{path}\n%"),
                    format!("%\n{path}\n%"),
                    format!("%\n{path}"),
                ],
                |row| row.get(0),
            )
            .expect("legacy orphan check failed");
    }

    started.elapsed()
}

fn bench_bulk_delete_indexed(conn: &Connection, ids: &[i64]) -> Duration {
    let started = Instant::now();

    let (placeholders, args) = build_in_clause_params(ids);
    let collect_sql = format!(
        "SELECT DISTINCT path FROM history_assets WHERE item_id IN ({placeholders})"
    );
    let mut collect_stmt = conn
        .prepare(&collect_sql)
        .expect("prepare indexed collect failed");
    let rows = collect_stmt
        .query_map(params_from_iter(args.iter()), |row| row.get::<_, String>(0))
        .expect("query indexed collect failed");

    let mut candidates = Vec::new();
    for row in rows {
        candidates.push(row.expect("read indexed row failed"));
    }

    let del_history_sql = format!("DELETE FROM history WHERE id IN ({placeholders})");
    conn.execute(&del_history_sql, params_from_iter(args.iter()))
        .expect("indexed history delete failed");

    let del_assets_sql = format!("DELETE FROM history_assets WHERE item_id IN ({placeholders})");
    conn.execute(&del_assets_sql, params_from_iter(args.iter()))
        .expect("indexed assets delete failed");

    for path in candidates {
        let _: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history_assets WHERE path = ?1",
                params![path],
                |row| row.get(0),
            )
            .expect("indexed orphan check failed");
    }

    started.elapsed()
}

#[test]
#[ignore = "manual benchmark: run with cargo test --test db_cleanup_perf -- --ignored --nocapture"]
fn compare_cleanup_lookup_strategies() {
    let rows = 50_000;
    let target_refs = 500;
    let iters = 300;
    let target_path = "D:/bench/images/img_target.png";

    let conn = setup_db(rows, target_refs);

    let (like_total, like_elapsed) = bench_like_lookup(&conn, target_path, iters);
    let (index_total, index_elapsed) = bench_index_lookup(&conn, target_path, iters);

    assert_eq!(like_total, index_total, "lookup result mismatch");

    let speedup = like_elapsed.as_secs_f64() / index_elapsed.as_secs_f64().max(1e-9);

    println!("rows={rows}, target_refs={target_refs}, iters={iters}");
    println!("LIKE  lookup elapsed: {:?}", like_elapsed);
    println!("Index lookup elapsed: {:?}", index_elapsed);
    println!("Speedup (LIKE / Index): {:.2}x", speedup);
}

#[test]
#[ignore = "manual benchmark: run with cargo test --test db_cleanup_perf -- --ignored --nocapture"]
fn compare_bulk_delete_strategies() {
    let rows = 50_000;
    let target_refs = 2_000;

    for batch_size in [100_usize, 1_000_usize] {
        let ids: Vec<i64> = (1..=batch_size as i64).collect();

        let conn_legacy = setup_db(rows, target_refs);
        let conn_indexed = setup_db(rows, target_refs);

        let legacy_elapsed = bench_bulk_delete_legacy(&conn_legacy, &ids);
        let indexed_elapsed = bench_bulk_delete_indexed(&conn_indexed, &ids);

        let speedup = legacy_elapsed.as_secs_f64() / indexed_elapsed.as_secs_f64().max(1e-9);

        println!("bulk-delete rows={rows}, target_refs={target_refs}, batch_size={batch_size}");
        println!("Legacy bulk delete elapsed: {:?}", legacy_elapsed);
        println!("Indexed bulk delete elapsed: {:?}", indexed_elapsed);
        println!("Speedup (Legacy / Indexed): {:.2}x", speedup);
    }
}