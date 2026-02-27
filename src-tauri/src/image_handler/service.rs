//! # 服务层（可注入状态）
//!
//! ## 设计思路
//!
//! 使用 `ImageServiceState` 作为 Tauri 注入状态，替代全局单例函数。
//! 好处：
//! 1. 生命周期清晰（由 `main.rs` 统一管理）
//! 2. 测试可创建独立实例，减少共享状态副作用
//! 3. 后续可扩展多实例或按会话配置
//!
//! ## 实现思路
//!
//! 对外仅暴露少量稳定 API：
//! - `process_source`：执行完整图片处理链路
//! - `set_performance_profile`：切换性能档位
//! - `get_performance_profile`：读取当前档位

use super::{ImageConfig, ImageError, ImageHandler, ImagePerformanceProfile, ImageSource};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageAdvancedConfig {
    pub allow_private_network: bool,
    pub resolve_dns_for_url_safety: bool,
    pub max_decoded_bytes: u64,
}

/// 图片处理服务状态。
///
/// 作为 Tauri `State` 注入到命令层，内部持有 `ImageHandler`。
pub struct ImageServiceState {
    handler: ImageHandler,
}

impl ImageServiceState {
    /// 使用默认配置创建服务状态。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn new() -> Result<Self, ImageError> {
        Self::with_config(ImageConfig::default())
    }

    /// 使用自定义配置创建服务状态。
    ///
    /// 主要用于测试或后续按场景注入不同策略。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::{ImageConfig, ImageServiceState};
    ///
    /// let mut config = ImageConfig::default();
    /// config.allow_private_network = true;
    /// let service = ImageServiceState::with_config(config)?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn with_config(config: ImageConfig) -> Result<Self, ImageError> {
        let handler = ImageHandler::new(config)?;
        Ok(Self { handler })
    }

    /// 执行完整处理流程：加载→解码→写入剪贴板。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::{ImageServiceState, ImageSource};
    ///
    /// # async fn demo() -> Result<(), clipboard_history::image_handler::ImageError> {
    /// let service = ImageServiceState::new()?;
    /// service
    ///     .process_source(ImageSource::Url("https://example.com/a.png".into()))
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn process_source(&self, source: ImageSource) -> Result<(), ImageError> {
        self.handler.process_and_copy(source).await
    }

    /// 设置性能档位。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// service.set_performance_profile("speed")?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn set_performance_profile(&self, profile: &str) -> Result<(), ImageError> {
        let profile = ImagePerformanceProfile::from_str(profile)?;
        self.handler.set_performance_profile(profile)
    }

    /// 获取当前生效性能档位（字符串）。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// let profile = service.get_performance_profile()?;
    /// assert!(matches!(profile.as_str(), "quality" | "balanced" | "speed"));
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn get_performance_profile(&self) -> Result<String, ImageError> {
        let profile = self.handler.get_performance_profile()?;
        Ok(profile.as_str().to_string())
    }

    pub fn set_advanced_config(&self, config: ImageAdvancedConfig) -> Result<(), ImageError> {
        self.handler.set_advanced_config(
            config.allow_private_network,
            config.resolve_dns_for_url_safety,
            config.max_decoded_bytes,
        )
    }

    pub fn get_advanced_config(&self) -> Result<ImageAdvancedConfig, ImageError> {
        let (allow_private_network, resolve_dns_for_url_safety, max_decoded_bytes) =
            self.handler.get_advanced_config()?;

        Ok(ImageAdvancedConfig {
            allow_private_network,
            resolve_dns_for_url_safety,
            max_decoded_bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn service_set_and_get_profile_roundtrip() {
        let service = ImageServiceState::new().expect("service init failed");

        service.set_performance_profile("quality").expect("set quality should succeed");
        let quality = service.get_performance_profile().expect("get profile should succeed");
        assert_eq!(quality, "quality");

        service.set_performance_profile("balanced").expect("set balanced should succeed");
        let balanced = service.get_performance_profile().expect("get profile should succeed");
        assert_eq!(balanced, "balanced");

        service.set_performance_profile("speed").expect("set speed should succeed");
        let speed = service.get_performance_profile().expect("get profile should succeed");
        assert_eq!(speed, "speed");

        service.set_performance_profile("balanced").expect("restore default profile should succeed");
    }

    #[test]
    fn service_rejects_invalid_profile() {
        let service = ImageServiceState::new().expect("service init failed");

        let result = service.set_performance_profile("unknown-profile");
        assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
    }

    #[test]
    fn service_profile_concurrent_access_stress() {
        let service = Arc::new(ImageServiceState::new().expect("service init failed"));

        let workers = 8;
        let iterations = 200;

        let mut handles = Vec::with_capacity(workers);
        for worker_id in 0..workers {
            let service = Arc::clone(&service);
            handles.push(thread::spawn(move || {
                let profiles = ["quality", "balanced", "speed"];

                for i in 0..iterations {
                    let profile = profiles[(worker_id + i) % profiles.len()];
                    service.set_performance_profile(profile).expect("set profile should succeed");

                    let current = service.get_performance_profile().expect("get profile should succeed");
                    assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
                }
            }));
        }

        for handle in handles {
            handle.join().expect("worker thread should not panic");
        }

        service.set_performance_profile("balanced").expect("restore default profile should succeed");
    }

    #[test]
    fn service_profile_concurrent_mixed_invalid_inputs() {
        let service = Arc::new(ImageServiceState::new().expect("service init failed"));

        let workers = 10;
        let iterations = 120;

        let mut handles = Vec::with_capacity(workers);
        for worker_id in 0..workers {
            let service = Arc::clone(&service);
            handles.push(thread::spawn(move || {
                let valid_profiles = ["quality", "balanced", "speed"];
                let invalid_profiles = ["", "ultra", "fastest", "balance-d"];

                for i in 0..iterations {
                    if (worker_id + i) % 3 == 0 {
                        let invalid = invalid_profiles[(worker_id + i) % invalid_profiles.len()];
                        let result = service.set_performance_profile(invalid);
                        assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
                    } else {
                        let valid = valid_profiles[(worker_id + i) % valid_profiles.len()];
                        service.set_performance_profile(valid).expect("set valid profile should succeed");
                    }

                    let current = service.get_performance_profile().expect("get profile should succeed");
                    assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
                }
            }));
        }

        for handle in handles {
            handle.join().expect("worker thread should not panic");
        }

        service.set_performance_profile("balanced").expect("restore default profile should succeed");
    }

    #[test]
    #[ignore = "long-running soak test"]
    fn service_profile_long_running_soak() {
        let service = Arc::new(ImageServiceState::new().expect("service init failed"));

        let workers = 12;
        let iterations = 10_000;

        let mut handles = Vec::with_capacity(workers);
        for worker_id in 0..workers {
            let service = Arc::clone(&service);
            handles.push(thread::spawn(move || {
                let profiles = ["quality", "balanced", "speed"];

                for i in 0..iterations {
                    let profile = profiles[(worker_id + i) % profiles.len()];
                    service.set_performance_profile(profile).expect("set profile should succeed");

                    let current = service.get_performance_profile().expect("get profile should succeed");
                    assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
                }
            }));
        }

        for handle in handles {
            handle.join().expect("worker thread should not panic");
        }

        service.set_performance_profile("balanced").expect("restore default profile should succeed");
    }
}
