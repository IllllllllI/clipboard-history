use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DbConfig {
    #[serde(default)]
    db_dir: Option<String>,
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::Database(format!("获取应用数据目录失败: {}", e))
    })?;
    Ok(app_data_dir.join("config.json"))
}

fn load_db_config_from_path(config_path: &Path) -> DbConfig {
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    DbConfig { db_dir: None }
}

fn load_db_config(app: &AppHandle) -> DbConfig {
    let config_path = match get_config_path(app) {
        Ok(p) => p,
        Err(_) => return DbConfig { db_dir: None },
    };
    load_db_config_from_path(&config_path)
}

fn save_db_config_to_path(config_path: &Path, db_dir: Option<String>) -> Result<(), AppError> {
    let config = DbConfig { db_dir };
    let content = serde_json::to_string_pretty(&config).map_err(|e| {
        AppError::Database(format!("序列化配置失败: {}", e))
    })?;
    fs::write(config_path, content).map_err(|e| {
        AppError::Database(format!("写入配置文件失败: {}", e))
    })?;
    Ok(())
}

fn resolve_db_path_from_config(app_data_dir: &Path, config: &DbConfig) -> Result<PathBuf, AppError> {
    if let Some(ref dir) = config.db_dir {
        if !dir.is_empty() {
            let dir_path = PathBuf::from(dir);
            fs::create_dir_all(&dir_path).map_err(|e| {
                AppError::Database(format!("创建数据库目录失败: {}", e))
            })?;
            return Ok(dir_path.join("clipboard.db"));
        }
    }
    Ok(app_data_dir.join("clipboard.db"))
}

pub(crate) fn save_db_config(app: &AppHandle, db_dir: Option<String>) -> Result<(), AppError> {
    let config_path = get_config_path(app)?;
    save_db_config_to_path(&config_path, db_dir)
}

pub(crate) fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::Database(format!("获取应用数据目录失败: {}", e))
    })?;
    let config = load_db_config(app);
    resolve_db_path_from_config(&app_data_dir, &config)
}

#[cfg(test)]
mod tests {
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
}
