//! # 加载与校验模块
//!
//! ## 设计思路
//!
//! 统一处理不同来源（URL / Base64 / 本地文件）的原始字节加载，并在“尽可能早”的阶段执行输入校验。
//! 目标是尽快失败，减少不必要内存与 CPU 消耗。
//!
//! ## 实现思路
//!
//! - URL：协议 + 主机安全 + 内容类型 + 体积校验 + 流式下载。
//! - Base64：格式解析 + 解码后体积限制。
//! - 文件：存在性 + metadata 体积限制 + 读取。
//! - 网络错误统一映射到 `ImageError`，便于上层处理。

use base64::{Engine as _, engine::general_purpose};
use bytes::Bytes;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use std::time::Duration;
use tokio::net::lookup_host;

use super::handler::CachedUrlDownload;
use super::source::RawImageData;
use super::{ImageConfig, ImageError, ImageHandler};

const STREAM_SIGNATURE_PROBE_BYTES: usize = 4096;
const NETWORK_RETRY_MAX_ATTEMPTS: u8 = 3;
const NETWORK_RETRY_BASE_DELAY_MS: u64 = 180;
const BUFFER_INITIAL_CAPACITY: usize = 16 * 1024;
const DOWNLOAD_CACHE_TTL_SECS: u64 = 25;
const DOWNLOAD_CACHE_MAX_ENTRIES: usize = 24;
/// 缓存清理最低间隔（秒），避免每次读写锁内都全量遍历。
const CACHE_CLEANUP_INTERVAL_SECS: u64 = 5;

impl ImageHandler {
    /// 从 URL 加载图片原始字节。
    pub(super) async fn load_from_url(
        &self,
        url: &str,
        config: &ImageConfig,
    ) -> Result<RawImageData, ImageError> {
        self.load_from_url_with_hooks(url, config, |_, _| {}, || false).await
    }

    pub(super) async fn load_from_url_with_hooks<P, C>(
        &self,
        url: &str,
        config: &ImageConfig,
        on_progress: P,
        is_cancelled: C,
    ) -> Result<RawImageData, ImageError>
    where
        P: Fn(u64, Option<u64>) + Send + Sync,
        C: Fn() -> bool + Send + Sync,
    {
        log::info!("🌐 开始下载图片 - URL: {}", Self::redact_url_for_log(url));

        // URL 安全校验已统一到 download 内部的 validate_url_and_build_clients 中，
        // 避免与 build_request_clients_for_url 重复 DNS 解析。
        let bytes = self
            .download_with_validation_with_hooks(url, config, &on_progress, &is_cancelled)
            .await?;
        Self::validate_image_signature(&bytes)?;

        Ok(RawImageData {
            bytes,
            source_hint: "url",
        })
    }

    /// 从 Base64 字符串加载图片原始字节。
    pub(super) fn load_from_base64(
        &self,
        data: &str,
        config: &ImageConfig,
    ) -> Result<RawImageData, ImageError> {
        log::info!("📝 开始处理 base64 图片");

        let bytes = Self::parse_base64_with_limit(data, config.max_file_size)?;
        // parse_base64_with_limit 已通过上界估算拒绝超限输入，
        // 实际解码长度 ≤ 上界 ≤ max_file_size，无需二次校验。
        Self::validate_image_signature(&bytes)?;

        Ok(RawImageData {
            bytes: Bytes::from(bytes),
            source_hint: "base64",
        })
    }

    /// 从本地路径加载图片原始字节。
    ///
    /// 使用 `tokio::fs` 异步 I/O，避免阻塞 tokio 工作线程。
    pub(super) async fn load_from_file(
        &self,
        path: &str,
        config: &ImageConfig,
    ) -> Result<RawImageData, ImageError> {
        log::info!("📁 开始读取本地图片 - 路径: {}", path);

        let file_path = Path::new(path);

        let metadata = tokio::fs::metadata(file_path)
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    ImageError::FileSystem(format!("文件不存在：{}", path))
                } else {
                    ImageError::FileSystem(format!("无法读取文件信息：{}", e))
                }
            })?;

        if metadata.len() > config.max_file_size {
            return Err(ImageError::ResourceLimit(format!(
                "文件过大：{:.2} MB（限制：{:.2} MB）",
                metadata.len() as f64 / 1024.0 / 1024.0,
                config.max_file_size as f64 / 1024.0 / 1024.0
            )));
        }

        let bytes = tokio::fs::read(file_path)
            .await
            .map_err(|e| ImageError::FileSystem(format!("无法读取图片文件：{}", e)))?;
        Self::validate_image_signature(&bytes)?;

        Ok(RawImageData {
            bytes: Bytes::from(bytes),
            source_hint: "file",
        })
    }

    /// 执行带校验的网络下载。
    ///
    /// 使用流式读取，避免一次性读入导致内存峰值过高。
    #[cfg(test)]
    pub(super) async fn download_with_validation(
        &self,
        url: &str,
        config: &ImageConfig,
    ) -> Result<Bytes, ImageError> {
        self.download_with_validation_with_hooks(url, config, |_, _| {}, || false)
            .await
    }

    pub(super) async fn download_with_validation_with_hooks<P, C>(
        &self,
        url: &str,
        config: &ImageConfig,
        on_progress: P,
        is_cancelled: C,
    ) -> Result<Bytes, ImageError>
    where
        P: Fn(u64, Option<u64>) + Send + Sync,
        C: Fn() -> bool + Send + Sync,
    {
        log::debug!("📡 发送 HTTP 请求...");
        let primary = reqwest::Url::parse(url)
            .map_err(|e| ImageError::InvalidFormat(format!("URL 格式错误：{}", e)))?;
        let primary_url = primary.to_string();

        if let Some(cached) = self.get_cached_download(&primary_url) {
            let total = cached.len() as u64;
            on_progress(total, Some(total));
            log::debug!("♻️ 命中下载缓存 - URL: {}", Self::redact_url_for_log(&primary_url));
            return Ok(cached);
        }

        let mut candidates = vec![primary_url.clone()];
        if let Some(upstream) = Self::extract_bing_upstream_url(&primary) {
            if upstream != primary_url {
                candidates.push(upstream);
            }
        }

        let mut last_err: Option<ImageError> = None;
        for (idx, candidate_url) in candidates.iter().enumerate() {
            if idx > 0 {
                log::warn!(
                    "⚠️ 主链接下载失败，尝试回源地址: {}",
                    Self::redact_url_for_log(candidate_url)
                );
                // Bing 回源地址的安全校验由 download_single_url 内部的
                // validate_url_and_build_clients 统一处理，避免重复 DNS 解析。
            }

            if let Some(cached) = self.get_cached_download(candidate_url) {
                let total = cached.len() as u64;
                on_progress(total, Some(total));
                return Ok(cached);
            }

            match self
                .download_single_url(
                    candidate_url,
                    config,
                    &on_progress,
                    &is_cancelled,
                )
                .await
            {
                Ok(bytes) => {
                    self.store_download_cache(candidate_url, &bytes);
                    if candidate_url != &primary_url {
                        self.store_download_cache(&primary_url, &bytes);
                    }
                    return Ok(bytes);
                }
                Err(err) => {
                    let should_try_next = idx == 0
                        && candidates.len() > 1
                        && Self::should_try_bing_upstream_fallback(&err);

                    if should_try_next {
                        last_err = Some(err);
                        continue;
                    }

                    return Err(err);
                }
            }
        }

        Err(last_err.unwrap_or_else(|| ImageError::Network("下载流程异常结束".to_string())))
    }

    /// 执行单个 URL 的带校验流式下载。
    ///
    /// 合并了 URL 安全校验和 HTTP 客户端构建，避免重复 DNS 解析。
    async fn download_single_url<P, C>(
        &self,
        url: &str,
        config: &ImageConfig,
        on_progress: &P,
        is_cancelled: &C,
    ) -> Result<Bytes, ImageError>
    where
        P: Fn(u64, Option<u64>) + Send + Sync,
        C: Fn() -> bool + Send + Sync,
    {
        let mut current_url = reqwest::Url::parse(url)
            .map_err(|e| ImageError::InvalidFormat(format!("URL 格式错误：{}", e)))?;

        for redirect_count in 0..=config.max_redirects {
            if is_cancelled() {
                return Err(ImageError::Cancelled("图片下载已取消".to_string()));
            }

            let referer = format!("{}://{}/", current_url.scheme(), current_url.host_str().unwrap_or(""));
            // 合并 URL 安全校验 + DNS 解析 + 客户端构建，单次解析即可。
            let request_clients = Self::validate_url_and_build_clients(&current_url, config).await?;
            let response = {
                let mut attempt: u8 = 1;
                loop {
                    if is_cancelled() {
                        return Err(ImageError::Cancelled("图片下载已取消".to_string()));
                    }

                    let client_idx = (attempt.saturating_sub(1) as usize) % request_clients.len();
                    let request_client = &request_clients[client_idx];

                    let send_result = self
                        .send_with_client(&request_client, current_url.clone(), &referer)
                        .await;

                    match send_result {
                        Ok(resp) => {
                            if attempt < NETWORK_RETRY_MAX_ATTEMPTS
                                && Self::is_retryable_http_status(resp.status())
                            {
                                let delay_ms = Self::compute_retry_delay_with_jitter(
                                    attempt,
                                    Self::retry_after_hint_ms(resp.headers()),
                                );

                                log::warn!(
                                    "⚠️ HTTP {}（第 {}/{} 次，可重试）；{}ms 后重试",
                                    resp.status().as_u16(),
                                    attempt,
                                    NETWORK_RETRY_MAX_ATTEMPTS,
                                    delay_ms
                                );

                                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                                attempt = attempt.saturating_add(1);
                                continue;
                            }

                            break resp;
                        }
                        Err(err) => {
                            if attempt >= NETWORK_RETRY_MAX_ATTEMPTS
                                || !Self::is_retryable_network_error(&err)
                            {
                                return Err(self.map_reqwest_error(err, current_url.as_str(), config));
                            }

                            let delay_ms = Self::compute_retry_delay_with_jitter(attempt, None);
                            let err_msg = Self::sanitize_error_message_with_redacted_url(
                                &err.to_string(),
                                current_url.as_str(),
                            );
                            log::warn!(
                                "⚠️ 网络请求失败（第 {}/{} 次，可重试）：{}；{}ms 后重试",
                                attempt,
                                NETWORK_RETRY_MAX_ATTEMPTS,
                                err_msg,
                                delay_ms
                            );
                            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                            attempt = attempt.saturating_add(1);
                        }
                    }
                }
            };

            if response.status().is_redirection() {
                if redirect_count >= config.max_redirects {
                    return Err(ImageError::Network(format!(
                        "重定向次数超过限制（{}）",
                        config.max_redirects
                    )));
                }

                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .ok_or_else(|| ImageError::Network("重定向响应缺少 Location 头".to_string()))?;

                let location_str = location
                    .to_str()
                    .map_err(|e| ImageError::InvalidFormat(format!("重定向地址无效：{}", e)))?;

                let next_url = current_url
                    .join(location_str)
                    .map_err(|e| ImageError::InvalidFormat(format!("重定向 URL 解析失败：{}", e)))?;

                // 对重定向目标做轻量安全校验（协议+主机名+IP），
                // DNS 级别的校验由下一轮循环顶部的 validate_url_and_build_clients 处理。
                Self::validate_url_safety(next_url.as_str(), config).await?;

                log::debug!("↪️ 跳转到: {}", Self::redact_url_for_log(next_url.as_str()));
                current_url = next_url;
                continue;
            }

            if !response.status().is_success() {
                return Err(ImageError::Network(format!(
                    "HTTP {}: {}",
                    response.status().as_u16(),
                    Self::status_message(response.status().as_u16())
                )));
            }

            if let Some(ct) = response.headers().get(reqwest::header::CONTENT_TYPE) {
                if let Ok(ct_str) = ct.to_str() {
                    if !Self::is_image_content_type(ct_str) {
                        return Err(ImageError::InvalidFormat(format!("不是图片类型：{}", ct_str)));
                    }
                }
            }

            let total_len = response
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|cl| cl.to_str().ok())
                .and_then(|cl| cl.parse::<u64>().ok());

            on_progress(0, total_len);

            if let Some(cl) = response.headers().get(reqwest::header::CONTENT_LENGTH) {
                if let Ok(cl_str) = cl.to_str() {
                    if let Ok(size) = cl_str.parse::<u64>() {
                        if size > config.max_file_size {
                            return Err(ImageError::ResourceLimit(format!(
                                "文件过大：{:.2} MB（限制：{:.2} MB）",
                                size as f64 / 1024.0 / 1024.0,
                                config.max_file_size as f64 / 1024.0 / 1024.0
                            )));
                        }
                    }
                }
            }

            let mut total: u64 = 0;
            let initial_capacity = total_len
                .map(|len| len.min(config.max_file_size).min(usize::MAX as u64) as usize)
                .filter(|len| *len > 0)
                .unwrap_or(BUFFER_INITIAL_CAPACITY);
            let mut buffer = Vec::with_capacity(initial_capacity);
            let mut response = response;
            let mut signature_validated = false;
            let mut received_first_chunk = false;

            loop {
                let read_timeout = if received_first_chunk {
                    Duration::from_millis(config.stream_chunk_timeout_ms)
                } else {
                    Duration::from_millis(config.stream_first_byte_timeout_ms)
                };

                let next_chunk_result = tokio::time::timeout(read_timeout, response.chunk())
                    .await
                    .map_err(|_| {
                        if received_first_chunk {
                            ImageError::Timeout("下载数据流读取超时".to_string())
                        } else {
                            ImageError::Timeout("下载首包超时".to_string())
                        }
                    })?;

                let Some(chunk) = next_chunk_result
                    .map_err(|e| ImageError::Network(format!("下载失败：{}", e)))?
                else {
                    break;
                };

                received_first_chunk = true;

                if is_cancelled() {
                    return Err(ImageError::Cancelled("图片下载已取消".to_string()));
                }

                total = total.saturating_add(chunk.len() as u64);
                if total > config.max_file_size {
                    return Err(ImageError::ResourceLimit("下载后文件超过大小限制".to_string()));
                }
                buffer.extend_from_slice(&chunk);

                on_progress(total, total_len);

                if !signature_validated {
                    signature_validated = Self::validate_stream_signature_probe(
                        &buffer,
                        STREAM_SIGNATURE_PROBE_BYTES,
                    )?;
                }
            }

            if !signature_validated {
                Self::validate_image_signature(&buffer)?;
            }

            on_progress(total, total_len.or(Some(total)));
            log::debug!("✅ 下载完成 - {} bytes", total);

            return Ok(Bytes::from(buffer));
        }

        Err(ImageError::Network("下载流程异常结束".to_string()))
    }

    async fn send_with_client(
        &self,
        client: &reqwest::Client,
        url: reqwest::Url,
        referer: &str,
    ) -> Result<reqwest::Response, reqwest::Error> {
        client
            .get(url)
            .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header(reqwest::header::ACCEPT, "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
            .header(reqwest::header::REFERER, referer)
            .send()
            .await
    }

    /// 合并 URL 安全校验 + DNS 解析 + HTTP 客户端构建，避免重复解析。
    ///
    /// 将原来 `validate_url_safety` + `build_request_clients_for_url` 两步合为一步，
    /// 对同一主机只做一次 DNS 解析。
    async fn validate_url_and_build_clients(
        url: &reqwest::Url,
        config: &ImageConfig,
    ) -> Result<Vec<reqwest::Client>, ImageError> {
        // 1. 协议校验
        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(ImageError::InvalidFormat("仅支持 HTTP/HTTPS".to_string()));
        }

        let host = url
            .host_str()
            .ok_or_else(|| ImageError::InvalidFormat("URL 缺少主机地址".to_string()))?;

        // 2. localhost 系主机名始终阻止（即使 allow_private_network=true），
        //    防止通过重定向绕过安全校验。
        if Self::is_local_hostname(host) {
            return Err(ImageError::InvalidFormat(format!(
                "禁止访问本地网络地址：{}",
                host
            )));
        }

        // 3. 允许内网 → 直接返回基础客户端
        if config.allow_private_network {
            return Ok(vec![Self::build_base_http_client(config)?]);
        }

        // 4. 纯 IP 地址路径
        if let Ok(ip) = host.parse::<IpAddr>() {
            if Self::is_private_or_local_ip(ip) {
                return Err(ImageError::InvalidFormat(format!(
                    "禁止访问内网 IP：{}",
                    ip
                )));
            }
            return Ok(vec![Self::build_base_http_client(config)?]);
        }

        // 5. 不需要 DNS 解析校验 → 返回基础客户端
        if !config.resolve_dns_for_url_safety {
            return Ok(vec![Self::build_base_http_client(config)?]);
        }

        // 6. DNS 解析 + SSRF 校验 + 构建绑定客户端（单次解析）
        let port = url
            .port_or_known_default()
            .ok_or_else(|| ImageError::InvalidFormat("URL 缺少端口信息".to_string()))?;

        let pinned = Self::resolve_public_socket_addrs(host, port).await?;
        if pinned.is_empty() {
            return Err(ImageError::InvalidFormat("URL 未解析到有效公网地址".to_string()));
        }

        let mut clients = Vec::with_capacity(pinned.len());
        for addr in pinned {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(config.download_timeout))
                .connect_timeout(Duration::from_secs(config.connect_timeout))
                .redirect(reqwest::redirect::Policy::none())
                .resolve(host, addr)
                .build()
                .map_err(|e| ImageError::Network(format!("无法创建 DNS 绑定客户端：{}", e)))?;
            clients.push(client);
        }

        Ok(clients)
    }

    fn build_base_http_client(config: &ImageConfig) -> Result<reqwest::Client, ImageError> {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(config.download_timeout))
            .connect_timeout(Duration::from_secs(config.connect_timeout))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| ImageError::Network(format!("无法创建 HTTP 客户端：{}", e)))
    }

    async fn resolve_public_socket_addrs(host: &str, port: u16) -> Result<Vec<SocketAddr>, ImageError> {
        let addrs = lookup_host((host, port))
            .await
            .map_err(|e| ImageError::InvalidFormat(format!("URL 主机解析失败：{}", e)))?;

        let mut result = Vec::new();
        for addr in addrs {
            if Self::is_private_or_local_ip(addr.ip()) {
                return Err(ImageError::InvalidFormat(format!(
                    "URL 解析结果命中内网地址：{}",
                    addr.ip()
                )));
            }

            result.push(addr);
        }

        Ok(result)
    }

    fn retry_after_hint_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
        let value = headers.get(reqwest::header::RETRY_AFTER)?;
        let text = value.to_str().ok()?.trim();
        let secs = text.parse::<u64>().ok()?;
        Some(secs.saturating_mul(1000))
    }

    fn compute_retry_delay_with_jitter(attempt: u8, server_hint_ms: Option<u64>) -> u64 {
        let exp = NETWORK_RETRY_BASE_DELAY_MS
            .saturating_mul(1_u64 << (attempt.saturating_sub(1) as u32));
        let base = server_hint_ms.unwrap_or(exp);
        let jitter_bound = (base / 2).max(1);
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        let jitter = seed % (jitter_bound + 1);
        base.saturating_add(jitter)
    }

    fn is_retryable_http_status(status: reqwest::StatusCode) -> bool {
        status == reqwest::StatusCode::REQUEST_TIMEOUT
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
            || status.is_server_error()
    }

    fn is_image_content_type(content_type: &str) -> bool {
        content_type
            .split(';')
            .next()
            .map(|base| base.trim().to_ascii_lowercase().starts_with("image/"))
            .unwrap_or(false)
    }

    fn redact_url_for_log(url: &str) -> String {
        let Ok(parsed) = reqwest::Url::parse(url) else {
            return "<invalid-url>".to_string();
        };

        let host = parsed.host_str().unwrap_or("<unknown-host>");
        let port = parsed.port().map(|p| format!(":{}", p)).unwrap_or_default();
        let path = parsed.path();

        format!("{}://{}{}{}", parsed.scheme(), host, port, path)
    }

    fn get_cached_download(&self, url: &str) -> Option<Bytes> {
        let mut cache = match self.download_cache.lock() {
            Ok(guard) => guard,
            Err(_) => return None,
        };

        // 懒清理：仅当距上次清理超过阈值时才遍历清理，降低热路径开销。
        let now = std::time::Instant::now();
        let ttl = Duration::from_secs(DOWNLOAD_CACHE_TTL_SECS);
        let needs_cleanup = cache.len() > 0
            && cache
                .values()
                .next()
                .map(|first| first.created_at.elapsed() > ttl)
                .unwrap_or(false);
        if needs_cleanup {
            cache.retain(|_, item| now.duration_since(item.created_at) <= ttl);
        }

        cache.get(url).map(|item| item.bytes.clone())
    }

    fn store_download_cache(&self, url: &str, bytes: &Bytes) {
        if bytes.is_empty() {
            return;
        }

        let mut cache = match self.download_cache.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        // 懒清理：缓存数量接近上限时才清理过期条目。
        if cache.len() >= DOWNLOAD_CACHE_MAX_ENTRIES {
            let ttl = Duration::from_secs(DOWNLOAD_CACHE_TTL_SECS);
            let now = std::time::Instant::now();
            cache.retain(|_, item| now.duration_since(item.created_at) <= ttl);

            // 清理后仍满则驱逐最老条目
            if cache.len() >= DOWNLOAD_CACHE_MAX_ENTRIES {
                if let Some(oldest_key) = cache
                    .iter()
                    .min_by_key(|(_, item)| item.created_at)
                    .map(|(key, _)| key.clone())
                {
                    cache.remove(&oldest_key);
                }
            }
        }

        cache.insert(
            url.to_string(),
            CachedUrlDownload {
                created_at: std::time::Instant::now(),
                bytes: bytes.clone(),
            },
        );
    }

    fn extract_bing_upstream_url(url: &reqwest::Url) -> Option<String> {
        let host = url.host_str()?.to_ascii_lowercase();
        if !host.ends_with("bing.com") {
            return None;
        }

        for (key, value) in url.query_pairs() {
            if key.eq_ignore_ascii_case("riu") {
                let candidate = value.trim();
                if candidate.is_empty() {
                    return None;
                }

                let parsed = reqwest::Url::parse(candidate).ok()?;
                if parsed.scheme() == "http" || parsed.scheme() == "https" {
                    return Some(parsed.to_string());
                }
            }
        }

        None
    }

    fn should_try_bing_upstream_fallback(err: &ImageError) -> bool {
        matches!(err, ImageError::Network(_) | ImageError::Timeout(_))
    }

    /// 校验 URL 安全性。
    ///
    /// 默认阻止本地/内网目标，防止 SSRF 风险。
    async fn validate_url_safety(url: &str, config: &ImageConfig) -> Result<(), ImageError> {
        let parsed = reqwest::Url::parse(url)
            .map_err(|e| ImageError::InvalidFormat(format!("URL 格式错误：{}", e)))?;

        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(ImageError::InvalidFormat("仅支持 HTTP/HTTPS".to_string()));
        }

        let host = parsed
            .host_str()
            .ok_or_else(|| ImageError::InvalidFormat("URL 缺少主机地址".to_string()))?;

        // localhost 系主机名始终阻止，即使 allow_private_network=true。
        if Self::is_local_hostname(host) {
            return Err(ImageError::InvalidFormat(format!(
                "禁止访问本地网络地址：{}",
                host
            )));
        }

        if config.allow_private_network {
            return Ok(());
        }

        if let Ok(ip) = host.parse::<IpAddr>() {
            if Self::is_private_or_local_ip(ip) {
                return Err(ImageError::InvalidFormat(format!(
                    "禁止访问内网 IP：{}",
                    ip
                )));
            }

            return Ok(());
        }

        if config.resolve_dns_for_url_safety {
            let port = parsed
                .port_or_known_default()
                .ok_or_else(|| ImageError::InvalidFormat("URL 缺少端口信息".to_string()))?;

            if Self::resolve_public_socket_addrs(host, port).await?.is_empty() {
                return Err(ImageError::InvalidFormat("URL 未解析到有效地址".to_string()));
            }
        }

        Ok(())
    }

    /// 判断主机名是否指向本地地址。
    fn is_local_hostname(host: &str) -> bool {
        host.eq_ignore_ascii_case("localhost") || host.eq_ignore_ascii_case("localhost.") || host.ends_with(".local")
    }

    /// 判断 IP 是否属于本地/内网/链路本地等受限范围。
    fn is_private_or_local_ip(ip: IpAddr) -> bool {
        match ip {
            IpAddr::V4(v4) => {
                if v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_broadcast() || v4.is_documentation() || v4.is_unspecified() || v4.is_multicast() {
                    return true;
                }

                let octets = v4.octets();
                octets[0] == 0
                    || (octets[0] == 100 && (octets[1] & 0b1100_0000) == 0b0100_0000)
            }
            IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    || v6.is_unique_local()
                    || v6.is_unicast_link_local()
                    || v6.is_multicast()
            }
        }
    }

    /// 解析 Base64 输入（支持 Data URL / 纯 Base64）。
    #[allow(dead_code)]
    pub(crate) fn parse_base64(data: &str) -> Result<Vec<u8>, ImageError> {
        Self::parse_base64_with_limit(data, u64::MAX)
    }

    fn estimate_base64_decoded_upper_bound_len(base64_data: &str) -> Result<u64, ImageError> {
        let len = base64_data.trim().len() as u64;
        let groups = len
            .checked_add(3)
            .ok_or_else(|| ImageError::ResourceLimit("Base64 输入长度溢出".to_string()))?
            / 4;

        groups
            .checked_mul(3)
            .ok_or_else(|| ImageError::ResourceLimit("Base64 解码体积估算溢出".to_string()))
    }

    fn parse_base64_with_limit(data: &str, max_file_size: u64) -> Result<Vec<u8>, ImageError> {
        let normalized = data.trim();

        if normalized.starts_with("data:image/") {
            let base64_start = normalized
                .find(";base64,")
                .ok_or_else(|| ImageError::InvalidFormat("缺少 base64 标记".to_string()))?;
            let base64_data = &normalized[base64_start + 8..];
            let estimated_len = Self::estimate_base64_decoded_upper_bound_len(base64_data)?;

            if estimated_len > max_file_size {
                return Err(ImageError::ResourceLimit(format!(
                    "Base64 预计解码体积过大：{:.2} MB（限制：{:.2} MB）",
                    estimated_len as f64 / 1024.0 / 1024.0,
                    max_file_size as f64 / 1024.0 / 1024.0
                )));
            }

            return general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| ImageError::Decode(format!("Base64 解码失败：{}", e)));
        }

        let estimated_len = Self::estimate_base64_decoded_upper_bound_len(normalized)?;
        if estimated_len > max_file_size {
            return Err(ImageError::ResourceLimit(format!(
                "Base64 预计解码体积过大：{:.2} MB（限制：{:.2} MB）",
                estimated_len as f64 / 1024.0 / 1024.0,
                max_file_size as f64 / 1024.0 / 1024.0
            )));
        }

        general_purpose::STANDARD
            .decode(normalized)
            .map_err(|e| ImageError::Decode(format!("Base64 解码失败：{}", e)))
    }

    /// 统一映射 reqwest 错误到业务错误。
    fn map_reqwest_error(&self, e: reqwest::Error, url: &str, config: &ImageConfig) -> ImageError {
        let err_msg = Self::sanitize_error_message_with_redacted_url(&e.to_string(), url);

        if e.is_timeout() {
            ImageError::Timeout(format!("下载超时（{}秒）", config.download_timeout))
        } else if e.is_connect() {
            ImageError::Network(format!("无法连接：{}", err_msg))
        } else {
            ImageError::Network(format!("请求失败：{}", err_msg))
        }
    }

    fn sanitize_error_message_with_redacted_url(error_msg: &str, url: &str) -> String {
        let redacted = Self::redact_url_for_log(url);
        error_msg.replace(url, &redacted)
    }

    fn is_retryable_network_error(error: &reqwest::Error) -> bool {
        if error.is_timeout() || error.is_connect() {
            return true;
        }

        let msg = error.to_string().to_lowercase();
        msg.contains("unexpected eof during handshake")
            || msg.contains("connection reset")
            || msg.contains("connection closed before message completed")
            || msg.contains("peer closed connection")
            || msg.contains("tls handshake")
    }

    /// 常见 HTTP 状态码本地化文案。
    fn status_message(code: u16) -> &'static str {
        match code {
            404 => "未找到",
            403 => "访问被拒绝",
            500..=599 => "服务器错误",
            _ => "请求失败",
        }
    }

    /// 通过文件签名（magic bytes）校验输入是否为图片。
    fn validate_image_signature(bytes: &[u8]) -> Result<(), ImageError> {
        if bytes.is_empty() {
            return Err(ImageError::InvalidFormat("图片内容为空".to_string()));
        }

        let kind = infer::get(bytes)
            .ok_or_else(|| ImageError::InvalidFormat("无法识别图片类型".to_string()))?;

        if kind.matcher_type() != infer::MatcherType::Image {
            return Err(ImageError::InvalidFormat(format!(
                "文件签名不是图片类型：{}",
                kind.mime_type()
            )));
        }

        Ok(())
    }

    /// 流式下载阶段的签名探测：尽早识别并拒绝非图片内容。
    ///
    /// 返回值：
    /// - `Ok(true)`：已识别为图片，可视为完成签名校验
    /// - `Ok(false)`：当前字节不足以判断，继续下载
    /// - `Err(...)`：已识别为非图片，或达到探测上限仍无法识别
    fn validate_stream_signature_probe(bytes: &[u8], probe_limit: usize) -> Result<bool, ImageError> {
        if bytes.is_empty() {
            return Ok(false);
        }

        if let Some(kind) = infer::get(bytes) {
            if kind.matcher_type() != infer::MatcherType::Image {
                return Err(ImageError::InvalidFormat(format!(
                    "下载内容不是图片类型：{}",
                    kind.mime_type()
                )));
            }
            return Ok(true);
        }

        if bytes.len() >= probe_limit {
            return Err(ImageError::InvalidFormat(format!(
                "下载前 {} 字节内无法识别图片类型",
                probe_limit
            )));
        }

        Ok(false)
    }
}

#[cfg(test)]
#[path = "tests/loader_tests.rs"]
mod tests;
