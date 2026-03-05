use super::*;
use crate::image_handler::config::ImageAdvancedConfig;
use crate::image_handler::source::{PreparedClipboardImage, RawImageData};
use base64::{Engine as _, engine::general_purpose};
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use std::io::Cursor;
use std::time::Instant;
use tokio::runtime::Runtime;

fn create_png_bytes(width: u32, height: u32) -> Vec<u8> {
    let img = ImageBuffer::from_fn(width, height, |x, y| {
        let r = (x % 255) as u8;
        let g = (y % 255) as u8;
        let b = ((x + y) % 255) as u8;
        Rgba([r, g, b, 255])
    });

    let dyn_img = DynamicImage::ImageRgba8(img);
    let mut cursor = Cursor::new(Vec::new());
    dyn_img
        .write_to(&mut cursor, ImageFormat::Png)
        .expect("failed to encode test image");
    cursor.into_inner()
}

#[test]
fn perf_decode_pipeline_multiple_sizes() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = handler.config_snapshot().expect("config snapshot failed");
    let cases = [(1024, 1024), (2048, 2048), (3840, 2160)];

    for (width, height) in cases {
        let png = create_png_bytes(width, height);
        let start = Instant::now();

        let prepared = ImageHandler::decode_and_prepare_for_clipboard(RawImageData {
                bytes: png.clone().into(),
                source_hint: "test",
            }, &config)
            .expect("decode pipeline should succeed");

        let elapsed = start.elapsed();
        println!(
            "[perf] decode {}x{} input={}KB output={}KB elapsed={}ms",
            width,
            height,
            png.len() / 1024,
            prepared.bytes.len() / 1024,
            elapsed.as_millis()
        );

        assert!(prepared.width <= width as usize);
        assert!(prepared.height <= height as usize);
        assert_eq!(prepared.bytes.len(), prepared.width * prepared.height * 4);
    }
}

#[test]
fn stress_rejects_too_many_pixels() {
    let mut config = ImageConfig::default();
    config.max_decoded_pixels = 1_000_000;

    let handler = ImageHandler::new(config).expect("handler init failed");
    let config = handler.config_snapshot().expect("config snapshot failed");
    let png = create_png_bytes(2000, 2000);

    let result = ImageHandler::decode_and_prepare_for_clipboard(RawImageData {
        bytes: png.into(),
        source_hint: "test",
    }, &config);

    assert!(matches!(result, Err(ImageError::ResourceLimit(_))));
}

#[test]
fn perf_base64_parse_and_decode() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = handler.config_snapshot().expect("config snapshot failed");
    let png = create_png_bytes(1920, 1080);
    let encoded = general_purpose::STANDARD.encode(&png);
    let data_url = format!("data:image/png;base64,{}", encoded);

    let parse_start = Instant::now();
    let decoded = ImageHandler::parse_base64(&data_url).expect("parse base64 failed");
    let parse_elapsed = parse_start.elapsed();

    let decode_start = Instant::now();
    let prepared = ImageHandler::decode_and_prepare_for_clipboard(RawImageData {
            bytes: decoded.into(),
            source_hint: "base64-test",
        }, &config)
        .expect("decode pipeline should succeed");
    let decode_elapsed = decode_start.elapsed();

    println!(
        "[perf] base64 parse={}ms decode={}ms output={}KB",
        parse_elapsed.as_millis(),
        decode_elapsed.as_millis(),
        prepared.bytes.len() / 1024
    );

    assert_eq!(prepared.width, 1920);
    assert_eq!(prepared.height, 1080);
}

#[test]
fn adaptive_resize_downscales_large_image() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = handler.config_snapshot().expect("config snapshot failed");
    let png = create_png_bytes(3840, 2160);

    let prepared = ImageHandler::decode_and_prepare_for_clipboard(RawImageData {
            bytes: png.into(),
            source_hint: "adaptive-test",
        }, &config)
        .expect("decode pipeline should succeed");

    assert!(prepared.width < 3840);
    assert!(prepared.height < 2160);
    assert_eq!(prepared.bytes.len(), prepared.width * prepared.height * 4);
}

fn default_advanced() -> ImageAdvancedConfig {
    ImageAdvancedConfig::from_full(&ImageConfig::default())
}

#[test]
fn advanced_config_rejects_invalid_connect_timeout() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

    let result = handler.set_advanced_config(&ImageAdvancedConfig {
        connect_timeout: 0,
        ..default_advanced()
    });

    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
}

#[test]
fn advanced_config_rejects_invalid_stream_timeouts() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

    let first_byte_result = handler.set_advanced_config(&ImageAdvancedConfig {
        stream_first_byte_timeout_ms: 100,
        ..default_advanced()
    });
    assert!(matches!(first_byte_result, Err(ImageError::InvalidFormat(_))));

    let chunk_result = handler.set_advanced_config(&ImageAdvancedConfig {
        stream_chunk_timeout_ms: 100,
        ..default_advanced()
    });
    assert!(matches!(chunk_result, Err(ImageError::InvalidFormat(_))));

    let retry_budget_result = handler.set_advanced_config(&ImageAdvancedConfig {
        clipboard_retry_max_total_ms: 100,
        ..default_advanced()
    });
    assert!(matches!(retry_budget_result, Err(ImageError::InvalidFormat(_))));

    let retry_max_delay_result = handler.set_advanced_config(&ImageAdvancedConfig {
        clipboard_retry_max_delay_ms: 6_000,
        ..default_advanced()
    });
    assert!(matches!(retry_max_delay_result, Err(ImageError::InvalidFormat(_))));
}

#[test]
fn advanced_config_accepts_valid_timeout_ranges() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

    let input = ImageAdvancedConfig {
        allow_private_network: true,
        resolve_dns_for_url_safety: false,
        max_decoded_bytes: 96 * 1024 * 1024,
        connect_timeout: 12,
        stream_first_byte_timeout_ms: 12_000,
        stream_chunk_timeout_ms: 18_000,
        clipboard_retry_max_total_ms: 2_400,
        clipboard_retry_max_delay_ms: 1_200,
    };

    handler
        .set_advanced_config(&input)
        .expect("advanced config should accept valid timeout values");

    let got = handler.get_advanced_config().expect("read advanced config failed");

    assert!(got.allow_private_network);
    assert!(!got.resolve_dns_for_url_safety);
    assert_eq!(got.max_decoded_bytes, 96 * 1024 * 1024);
    assert_eq!(got.connect_timeout, 12);
    assert_eq!(got.stream_first_byte_timeout_ms, 12_000);
    assert_eq!(got.stream_chunk_timeout_ms, 18_000);
    assert_eq!(got.clipboard_retry_max_total_ms, 2_400);
    assert_eq!(got.clipboard_retry_max_delay_ms, 1_200);
}

#[test]
#[ignore = "requires system clipboard access"]
fn perf_decode_vs_clipboard_write_stage() {
    let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
    let config = handler.config_snapshot().expect("config snapshot failed");
    let runtime = Runtime::new().expect("runtime init failed");

    let cases = [(1920, 1080), (3840, 2160)];

    for (width, height) in cases {
        let png = create_png_bytes(width, height);

        let decode_start = Instant::now();
        let prepared = ImageHandler::decode_and_prepare_for_clipboard(RawImageData {
                bytes: png.into(),
                source_hint: "clipboard-stage-test",
            }, &config)
            .expect("decode pipeline should succeed");
        let decode_elapsed = decode_start.elapsed();

        let write_iterations = 3u128;
        let mut write_total_ms = 0u128;

        for _ in 0..write_iterations {
            let write_image = PreparedClipboardImage {
                width: prepared.width,
                height: prepared.height,
                bytes: prepared.bytes.clone(),
            };

            let write_start = Instant::now();
            runtime
                .block_on(handler.copy_to_clipboard_with_retry(write_image, &config))
                .expect("clipboard write should succeed");
            write_total_ms += write_start.elapsed().as_millis();
        }

        let write_avg_ms = write_total_ms / write_iterations;

        println!(
            "[perf] stage {}x{} decode={}ms clipboard_write_avg={}ms output={}KB",
            width,
            height,
            decode_elapsed.as_millis(),
            write_avg_ms,
            prepared.bytes.len() / 1024
        );
    }
}
