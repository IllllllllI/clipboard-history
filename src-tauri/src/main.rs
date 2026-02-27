// 防止在 Windows 发布版本中显示额外的控制台窗口，不要删除！
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! # 剪贴板历史工具 — 应用入口
//!
//! 本文件仅负责应用初始化与插件/命令注册。
//! 业务逻辑分布在各子模块中，详见 `lib.rs` 架构文档。

use clipboard_history::{clipboard, db, image_handler, input, storage, window_position};
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
            let app_icon = Image::from_bytes(include_bytes!("../icons/Clipboard-256x256.png"))?;

            // 初始化数据库并注册为托管状态
            let handle = app.handle().clone();
            let conn = db::init_db(&handle)
                .expect("数据库初始化失败");
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            app.manage(
                image_handler::ImageServiceState::new()
                    .expect("图片服务初始化失败"),
            );

            // 显式设置主窗口图标，避免平台默认图标与配置不一致
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_icon(app_icon.clone());
            }

            // 启动剪贴板监控
            clipboard::start_monitoring(handle);

            // 创建托盘菜单
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // 创建托盘图标
            let _tray = TrayIconBuilder::new()
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
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
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
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // 窗口关闭时隐藏而非退出
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        // 注册所有 Tauri 命令
        .invoke_handler(tauri::generate_handler![
            // 剪贴板保存
            clipboard::save::save_clipboard_image,
            clipboard::save::save_clipboard_svg,
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
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
