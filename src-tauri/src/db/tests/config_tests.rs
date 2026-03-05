use std::time::{SystemTime, UNIX_EPOCH};

use super::{load_db_config_from_path, resolve_db_path_from_config, save_db_config_to_path};

fn unique_temp_dir() -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock error")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("clipboard-history-config-test-{nanos}"));
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

#[test]
fn save_and_load_config_roundtrip() {
    let dir = unique_temp_dir();
    let config_path = dir.join("config.json");

    save_db_config_to_path(&config_path, Some("D:/custom/db".to_string())).expect("save config");
    let loaded = load_db_config_from_path(&config_path);

    assert_eq!(loaded.db_dir.as_deref(), Some("D:/custom/db"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn load_bad_config_falls_back_to_none() {
    let dir = unique_temp_dir();
    let config_path = dir.join("config.json");
    std::fs::write(&config_path, "not-json").expect("write invalid config");

    let loaded = load_db_config_from_path(&config_path);
    assert!(loaded.db_dir.is_none());

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn resolve_db_path_prefers_configured_dir_or_app_data_dir() {
    let dir = unique_temp_dir();
    let app_data_dir = dir.join("app-data");
    std::fs::create_dir_all(&app_data_dir).expect("create app-data");

    let configured = dir.join("configured");
    let configured_path = resolve_db_path_from_config(
        &app_data_dir,
        &super::DbConfig { db_dir: Some(configured.to_string_lossy().to_string()) },
    ).expect("resolve configured path");

    assert_eq!(configured_path, configured.join("clipboard.db"));
    assert!(configured.exists());

    let default_path = resolve_db_path_from_config(
        &app_data_dir,
        &super::DbConfig { db_dir: None },
    ).expect("resolve default path");

    assert_eq!(default_path, app_data_dir.join("clipboard.db"));
    let _ = std::fs::remove_dir_all(dir);
}
