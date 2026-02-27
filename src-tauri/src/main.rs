// 防止在 Windows 发布版本中显示额外的控制台窗口，不要删除！
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! # 剪贴板历史工具 — 应用入口
//!
//! 本文件仅负责应用初始化与插件/命令注册。
//! 业务逻辑分布在各子模块中，详见 `lib.rs` 架构文档。

use clipboard_history::{clipboard, db, image_handler, input, settings, storage, window_position};
use tauri::Manager;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{
    MouseButton as TauriMouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        // 插件初始化
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 应用设置
        .setup(|app| {
            log::info!("setup: begin");
            let app_icon = Image::from_bytes(include_bytes!("../icons/Clipboard-256x256.png"))?;
            log::info!("setup: icon loaded");

            // 初始化数据库并注册为托管状态
            let handle = app.handle().clone();
            match db::init_db(&handle) {
                Ok(db_state) => {
                    app.manage(db_state);
                    log::info!("setup: db state managed");
                }
                Err(err) => {
                    log::error!("setup: 数据库初始化失败，应用将以受限模式运行: {err}");
                }
            }

            match image_handler::ImageServiceState::new() {
                Ok(image_service_state) => {
                    app.manage(image_service_state);
                    log::info!("setup: image service managed");
                }
                Err(err) => {
                    log::error!("setup: 图片服务初始化失败，应用将以受限模式运行: {err}");
                }
            }

            // 显式设置主窗口图标，避免平台默认图标与配置不一致
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_icon(app_icon.clone());
            }
            log::info!("setup: main window icon set");

            // 启动剪贴板监控
            clipboard::start_monitoring(handle);
            log::info!("setup: clipboard monitor stage done");

            // 创建托盘菜单
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // 创建托盘图标（失败时回退显示主窗口，避免进程在后台无入口）
            let tray_result = TrayIconBuilder::new()
                .icon(app_icon.clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        if let Err(err) = app.global_shortcut().unregister_all() {
                            log::warn!("退出前清理全局快捷键失败: {err}");
                        }
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            if let Err(err) = w.unminimize() {
                                log::warn!("托盘菜单显示窗口失败（unminimize）: {err}");
                            }
                            if let Err(err) = w.show() {
                                log::warn!("托盘菜单显示窗口失败（show）: {err}");
                            }
                            if let Err(err) = w.set_focus() {
                                log::warn!("托盘菜单显示窗口失败（focus）: {err}");
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: TauriMouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            if let Err(err) = w.unminimize() {
                                log::warn!("托盘点击显示窗口失败（unminimize）: {err}");
                            }
                            if let Err(err) = w.show() {
                                log::warn!("托盘点击显示窗口失败（show）: {err}");
                            }
                            if let Err(err) = w.set_focus() {
                                log::warn!("托盘点击显示窗口失败（focus）: {err}");
                            }
                        }
                    }
                })
                .build(app);

            if let Err(err) = tray_result {
                log::warn!("托盘图标创建失败，回退为显示主窗口: {err}");
                if let Some(w) = app.get_webview_window("main") {
                    if let Err(err) = w.unminimize() {
                        log::warn!("托盘失败回退显示窗口失败（unminimize）: {err}");
                    }
                    if let Err(err) = w.show() {
                        log::warn!("托盘失败回退显示窗口失败（show）: {err}");
                    }
                    if let Err(err) = w.set_focus() {
                        log::warn!("托盘失败回退显示窗口失败（focus）: {err}");
                    }
                }
            }

            log::info!("setup: complete");

            Ok(())
        })
        // 窗口关闭时隐藏而非退出
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Err(err) = window.hide() {
                    log::warn!("窗口关闭转隐藏失败: {err}");
                }
                api.prevent_close();
            }
        })
        // 注册所有 Tauri 命令
        .invoke_handler(tauri::generate_handler![
            // 剪贴板保存
            clipboard::save::save_clipboard_image,
            clipboard::save::save_clipboard_svg,
            clipboard::save::capture_clipboard_snapshot,
            clipboard::save::copy_image_from_file,
            clipboard::save::copy_svg_from_file,
            clipboard::save::read_clipboard_files,
            clipboard::save::write_text_to_clipboard,
            // 图片处理
            image_handler::commands::download_and_copy_image,
            image_handler::commands::copy_base64_image_to_clipboard,
            image_handler::commands::copy_image_to_clipboard,
            image_handler::commands::set_image_performance_profile,
            image_handler::commands::get_image_performance_profile,
            image_handler::commands::set_image_advanced_config,
            image_handler::commands::get_image_advanced_config,
            // 输入模拟 & 文件操作
            input::paste_text,
            input::click_and_paste,
            input::copy_file_to_clipboard,
            input::open_file,
            input::open_file_location,
            input::get_file_icon,
            // 窗口定位
            window_position::show_window_at_cursor,
            window_position::reposition_and_focus,
            window_position::toggle_window,
            window_position::handle_global_shortcut,
            // 数据库操作
            db::db_auto_clear,
            db::db_get_stats,
            db::db_get_history,
            db::db_add_clip,
            db::db_add_clip_and_get,
            db::db_toggle_pin,
            db::db_toggle_favorite,
            db::db_delete_clip,
            db::db_update_clip,
            db::db_update_picked_color,
            db::db_clear_all,
            db::db_bulk_delete,
            db::db_bulk_pin,
            db::db_import_data,
            // 标签操作
            db::db_get_tags,
            db::db_create_tag,
            db::db_update_tag,
            db::db_delete_tag,
            db::db_add_tag_to_item,
            db::db_remove_tag_from_item,
            // 数据库管理
            db::db_get_info,
            db::db_move_database,
            // 存储目录信息
            storage::get_images_dir_info,
            // 应用设置存储
            settings::get_app_settings,
            settings::set_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
