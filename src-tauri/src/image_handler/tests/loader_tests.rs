use super::*;
use crate::image_handler::ImageConfig;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

#[tokio::test]
async fn url_safety_blocks_private_targets_by_default() {
    let config = ImageConfig::default();

    assert!(matches!(
        ImageHandler::validate_url_safety("http://127.0.0.1/image.png", &config).await,
        Err(ImageError::InvalidFormat(_))
    ));

    assert!(matches!(
        ImageHandler::validate_url_safety("https://localhost/image.png", &config).await,
        Err(ImageError::InvalidFormat(_))
    ));
}

#[tokio::test]
async fn url_safety_allows_private_targets_when_enabled() {
    let mut config = ImageConfig::default();
    config.allow_private_network = true;

    assert!(ImageHandler::validate_url_safety("http://127.0.0.1/image.png", &config)
        .await
        .is_ok());
}

#[test]
fn load_from_base64_rejects_non_image_payload() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = ImageConfig::default();

    let result = handler.load_from_base64("SGVsbG8=", &config);

    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
}

#[test]
fn parse_base64_with_limit_rejects_large_payload_before_decode() {
    let huge = "A".repeat(1024 * 1024);
    let result = ImageHandler::parse_base64_with_limit(&huge, 32);

    assert!(matches!(result, Err(ImageError::ResourceLimit(_))));
}

#[test]
fn content_type_parser_accepts_image_with_params() {
    assert!(ImageHandler::is_image_content_type("image/png; charset=utf-8"));
    assert!(ImageHandler::is_image_content_type("IMAGE/JPEG"));
    assert!(!ImageHandler::is_image_content_type("text/html; charset=utf-8"));
}

#[test]
fn retryable_http_status_is_expected() {
    assert!(ImageHandler::is_retryable_http_status(reqwest::StatusCode::TOO_MANY_REQUESTS));
    assert!(ImageHandler::is_retryable_http_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR));
    assert!(!ImageHandler::is_retryable_http_status(reqwest::StatusCode::BAD_REQUEST));
}

#[test]
fn redact_url_for_log_removes_query_and_fragment() {
    let redacted = ImageHandler::redact_url_for_log(
        "https://example.com:8443/path/img.png?token=abc123#hash",
    );

    assert_eq!(redacted, "https://example.com:8443/path/img.png");
}

#[test]
fn stream_signature_probe_recognizes_png_header() {
    let png_signature = [137_u8, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
    let result = ImageHandler::validate_stream_signature_probe(&png_signature, 64);

    assert!(matches!(result, Ok(true)));
}

#[test]
fn stream_signature_probe_rejects_non_image_payload() {
    let payload = b"<html><body>not an image</body></html>";
    let result = ImageHandler::validate_stream_signature_probe(payload, 64);

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

#[tokio::test]
async fn download_with_validation_blocks_redirect_to_localhost() {
    // 原始场景测试了 302 重定向到 localhost 时被拦截。
    // 重构后 validate_url_and_build_clients 把 URL 安全校验和客户端构建合并到一起，
    // localhost 系主机名在连接前即被 is_local_hostname 拦截。
    //
    // 这里直接测试 localhost URL 被 validate_url_and_build_clients 拒绝，
    // 而非搭建真实 TCP 服务器（因为初始连接地址本身也是私有 IP，
    // 用 allow_private_network 才能放行，但那样重定向目标也会被放行）。
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = ImageConfig::default();

    let result = handler
        .download_with_validation("http://localhost:9999/fake.png", &config)
        .await;
    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));

    let result2 = handler
        .download_with_validation("http://localhost./fake.png", &config)
        .await;
    assert!(matches!(result2, Err(ImageError::InvalidFormat(_))));
}

/// 用真实 TCP 服务器测试 302 重定向场景：
/// 初始地址合法（allow_private_network=true），重定向到 localhost 被拦截。
#[tokio::test]
async fn redirect_to_localhost_blocked_with_real_server() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server failed");
    let addr = listener.local_addr().expect("read local addr failed");

    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept failed");

        let mut req_buf = [0u8; 1024];
        let _ = stream.read(&mut req_buf);

        let response = format!(
            "HTTP/1.1 302 Found\r\nLocation: http://localhost:{}/final.png\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            addr.port()
        );

        stream
            .write_all(response.as_bytes())
            .expect("write redirect response failed");
        stream.flush().expect("flush failed");
    });

    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let mut config = ImageConfig::default();
    config.allow_private_network = true;
    config.download_timeout = 5;
    config.connect_timeout = 3;
    let url = format!("http://127.0.0.1:{}/start.png", addr.port());

    let result = handler.download_with_validation(&url, &config).await;

    server.join().expect("server thread failed");

    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
}

/// 验证默认配置下私有 IP 在连接阶段即被拦截（无需实际网络请求）。
#[tokio::test]
async fn download_with_validation_blocks_private_ip_before_connection() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = ImageConfig::default();

    let result = handler
        .download_with_validation("http://127.0.0.1:9999/fake.png", &config)
        .await;

    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
}
