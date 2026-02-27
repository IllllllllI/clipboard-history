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
use std::net::IpAddr;
use std::net::ToSocketAddrs;
use std::path::Path;

use super::source::RawImageData;
use super::{ImageConfig, ImageError, ImageHandler};

impl ImageHandler {
    /// 从 URL 加载图片原始字节。
    pub(super) async fn load_from_url(
        &self,
        url: &str,
        config: &ImageConfig,
    ) -> Result<RawImageData, ImageError> {
        log::info!("🌐 开始下载图片 - URL: {}", url);

        Self::validate_url_safety(url, config)?;
        let bytes = self.download_with_validation(url, config).await?;
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

        let bytes = Self::parse_base64(data)?;

        if bytes.len() as u64 > config.max_file_size {
            return Err(ImageError::ResourceLimit(format!(
                "Base64 解码后体积过大：{:.2} MB（限制：{:.2} MB）",
                bytes.len() as f64 / 1024.0 / 1024.0,
                config.max_file_size as f64 / 1024.0 / 1024.0
            )));
        }
        Self::validate_image_signature(&bytes)?;

        Ok(RawImageData {
            bytes,
            source_hint: "base64",
        })
    }

    /// 从本地路径加载图片原始字节。
    pub(super) fn load_from_file(
        &self,
        path: &str,
        config: &ImageConfig,
    ) -> Result<RawImageData, ImageError> {
        log::info!("📁 开始读取本地图片 - 路径: {}", path);

        let file_path = Path::new(path);
        if !file_path.exists() {
            return Err(ImageError::FileSystem(format!("文件不存在：{}", path)));
        }

        let metadata = std::fs::metadata(file_path)
            .map_err(|e| ImageError::FileSystem(format!("无法读取文件信息：{}", e)))?;

        if metadata.len() > config.max_file_size {
            return Err(ImageError::ResourceLimit(format!(
                "文件过大：{:.2} MB（限制：{:.2} MB）",
                metadata.len() as f64 / 1024.0 / 1024.0,
                config.max_file_size as f64 / 1024.0 / 1024.0
            )));
        }

        let bytes = std::fs::read(file_path)
            .map_err(|e| ImageError::FileSystem(format!("无法读取图片文件：{}", e)))?;
        Self::validate_image_signature(&bytes)?;

        Ok(RawImageData {
            bytes,
            source_hint: "file",
        })
    }

    /// 执行带校验的网络下载。
    ///
    /// 使用流式读取，避免一次性读入导致内存峰值过高。
    pub(super) async fn download_with_validation(
        &self,
        url: &str,
        config: &ImageConfig,
    ) -> Result<Vec<u8>, ImageError> {
        log::debug!("📡 发送 HTTP 请求...");

        let response = self
            .http_client
            .get(url)
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e, url, config))?;

        if !response.status().is_success() {
            return Err(ImageError::Network(format!(
                "HTTP {}: {}",
                response.status().as_u16(),
                Self::status_message(response.status().as_u16())
            )));
        }

        if let Some(ct) = response.headers().get("content-type") {
            if let Ok(ct_str) = ct.to_str() {
                if !ct_str.starts_with("image/") {
                    return Err(ImageError::InvalidFormat(format!("不是图片类型：{}", ct_str)));
                }
            }
        }

        if let Some(cl) = response.headers().get("content-length") {
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
        let mut buffer = Vec::new();
        let mut response = response;

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| ImageError::Network(format!("下载失败：{}", e)))?
        {
            total = total.saturating_add(chunk.len() as u64);
            if total > config.max_file_size {
                return Err(ImageError::ResourceLimit("下载后文件超过大小限制".to_string()));
            }
            buffer.extend_from_slice(&chunk);
        }

        log::debug!("✅ 下载完成 - {} bytes", total);

        Ok(buffer)
    }

    /// 校验 URL 安全性。
    ///
    /// 默认阻止本地/内网目标，防止 SSRF 风险。
    fn validate_url_safety(url: &str, config: &ImageConfig) -> Result<(), ImageError> {
        let parsed = reqwest::Url::parse(url)
            .map_err(|e| ImageError::InvalidFormat(format!("URL 格式错误：{}", e)))?;

        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(ImageError::InvalidFormat("仅支持 HTTP/HTTPS".to_string()));
        }

        if config.allow_private_network {
            return Ok(());
        }

        let host = parsed
            .host_str()
            .ok_or_else(|| ImageError::InvalidFormat("URL 缺少主机地址".to_string()))?;

        if Self::is_local_hostname(host) {
            return Err(ImageError::InvalidFormat(format!(
                "禁止访问本地网络地址：{}",
                host
            )));
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

            let addrs = (host, port).to_socket_addrs().map_err(|e| {
                ImageError::InvalidFormat(format!("URL 主机解析失败：{}", e))
            })?;

            let mut resolved_any = false;
            for addr in addrs {
                resolved_any = true;
                if Self::is_private_or_local_ip(addr.ip()) {
                    return Err(ImageError::InvalidFormat(format!(
                        "URL 解析结果命中内网地址：{}",
                        addr.ip()
                    )));
                }
            }

            if !resolved_any {
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
    pub(crate) fn parse_base64(data: &str) -> Result<Vec<u8>, ImageError> {
        let normalized = data.trim();

        if normalized.starts_with("data:image/") {
            let base64_start = normalized
                .find(";base64,")
                .ok_or_else(|| ImageError::InvalidFormat("缺少 base64 标记".to_string()))?;
            let base64_data = &normalized[base64_start + 8..];
            return general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| ImageError::Decode(format!("Base64 解码失败：{}", e)));
        }

        general_purpose::STANDARD
            .decode(normalized)
            .map_err(|e| ImageError::Decode(format!("Base64 解码失败：{}", e)))
    }

    /// 统一映射 reqwest 错误到业务错误。
    fn map_reqwest_error(&self, e: reqwest::Error, _url: &str, config: &ImageConfig) -> ImageError {
        if e.is_timeout() {
            ImageError::Timeout(format!("下载超时（{}秒）", config.download_timeout))
        } else if e.is_connect() {
            ImageError::Network(format!("无法连接：{}", e))
        } else {
            ImageError::Network(format!("请求失败：{}", e))
        }
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image_handler::ImageConfig;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn url_safety_blocks_private_targets_by_default() {
        let config = ImageConfig::default();

        assert!(matches!(
            ImageHandler::validate_url_safety("http://127.0.0.1/image.png", &config),
            Err(ImageError::InvalidFormat(_))
        ));

        assert!(matches!(
            ImageHandler::validate_url_safety("https://localhost/image.png", &config),
            Err(ImageError::InvalidFormat(_))
        ));
    }

    #[test]
    fn url_safety_allows_private_targets_when_enabled() {
        let mut config = ImageConfig::default();
        config.allow_private_network = true;

        assert!(ImageHandler::validate_url_safety("http://127.0.0.1/image.png", &config).is_ok());
    }

    #[test]
    fn load_from_base64_rejects_non_image_payload() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let config = ImageConfig::default();

        let result = handler.load_from_base64("SGVsbG8=", &config);

        assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
    }

    #[tokio::test]
    async fn load_from_url_rejects_non_image_body_even_when_content_type_is_image() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server failed");
        let addr = listener.local_addr().expect("read local addr failed");

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept failed");

            let mut req_buf = [0u8; 1024];
            let _ = stream.read(&mut req_buf);

            let body = b"hello world";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );

            stream
                .write_all(response.as_bytes())
                .expect("write headers failed");
            stream.write_all(body).expect("write body failed");
            stream.flush().expect("flush failed");
        });

        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let mut config = ImageConfig::default();
        config.allow_private_network = true;

        let url = format!("http://127.0.0.1:{}/fake.png", addr.port());
        let result = handler.load_from_url(&url, &config).await;

        server.join().expect("server thread failed");

        assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
    }
}
