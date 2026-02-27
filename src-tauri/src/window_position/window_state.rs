//! 窗口状态管理模块
//!
//! 该模块负责读取窗口的关键运行态：可见性与焦点状态，
//! 为快捷键切换策略提供统一、轻量、可复用的状态查询接口。
//!
//! # 设计思路
//!
//! - 将“状态读取”从窗口切换流程中抽离，形成稳定的基础能力。
//! - 使用简单值对象承载状态，避免上层直接依赖平台查询细节。
//! - 错误在本层标准化为字符串，便于跨边界传递与日志输出。
//!
//! # 实现思路
//!
//! - 通过 `Window::is_visible` 与 `Window::is_focused` 进行原子查询。
//! - 将查询结果打包为 `WindowState`，由调用方按状态机分支处理。
//! - 任一查询失败立即返回错误，避免上层基于不完整状态做决策。

use tauri::Window;

/// 窗口状态信息
///
/// 该结构体用于描述窗口在“显示层面”和“输入焦点层面”的当前状态。
///
/// # 字段说明
/// * `is_visible` - 窗口当前是否可见
/// * `is_focused` - 窗口当前是否拥有键盘焦点
///
/// # 示例
/// ```ignore
/// let state = get_window_state(&window)?;
/// if state.is_visible && !state.is_focused {
///     // 窗口可见但未聚焦：重定位并恢复焦点
///     reposition_and_focus(window).await?;
/// }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowState {
    /// 窗口当前是否可见
    pub is_visible: bool,
    /// 窗口当前是否拥有焦点
    pub is_focused: bool,
}

/// 获取窗口当前状态（可见性 + 焦点）
///
/// 该函数用于读取窗口状态机决策所需的最小信息集合。
/// 调用方通常基于 `(is_visible, is_focused)` 二元状态决定：显示、重定位或隐藏。
///
/// # 设计思路
/// - 仅暴露稳定语义，不泄漏平台 API 细节。
/// - 通过返回结构体，确保状态读取结果具备完整性与可测试性。
///
/// # 实现思路
/// - 先查询可见性，再查询焦点状态。
/// - 使用 `Result` 报告失败场景，避免吞错。
/// - 成功后构造 `WindowState` 返回给上层逻辑。
///
/// # 常见用法
/// - **窗口不可见**：显示到光标附近
/// - **窗口可见但失焦**：重定位并恢复焦点
/// - **窗口可见且聚焦**：隐藏窗口（切换行为）
///
/// # 参数
/// * `window` - 需要查询状态的 Tauri 窗口
///
/// # 返回
/// - `Ok(WindowState)`：包含可见性与焦点信息
/// - `Err(String)`：状态读取失败
///
/// # 示例
/// ```ignore
/// use tauri::Window;
///
/// fn handle_shortcut(window: &Window) -> Result<(), String> {
///     let state = get_window_state(window)?;
///
///     match (state.is_visible, state.is_focused) {
///         (false, _) => {
///             // 窗口隐藏：显示到光标附近
///             println!("显示窗口到光标附近");
///         }
///         (true, false) => {
///             // 窗口可见但未聚焦：重定位并恢复焦点
///             println!("重定位并恢复窗口焦点");
///         }
///         (true, true) => {
///             // 窗口可见且已聚焦：隐藏
///             println!("隐藏窗口");
///         }
///     }
///
///     Ok(())
/// }
/// ```
pub fn get_window_state(window: &Window) -> Result<WindowState, crate::error::AppError> {
    let is_visible = window.is_visible()
        .map_err(|e| crate::error::AppError::Window(format!("Failed to query window visibility: {}", e)))?;

    let is_focused = window.is_focused()
        .map_err(|e| crate::error::AppError::Window(format!("Failed to query window focus status: {}", e)))?;

    Ok(WindowState {
        is_visible,
        is_focused,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_state_struct_creation() {
        let state1 = WindowState {
            is_visible: true,
            is_focused: true,
        };
        assert!(state1.is_visible);
        assert!(state1.is_focused);

        let state2 = WindowState {
            is_visible: true,
            is_focused: false,
        };
        assert!(state2.is_visible);
        assert!(!state2.is_focused);

        let state3 = WindowState {
            is_visible: false,
            is_focused: false,
        };
        assert!(!state3.is_visible);
        assert!(!state3.is_focused);
    }

    #[test]
    fn test_window_state_equality() {
        let state1 = WindowState {
            is_visible: true,
            is_focused: true,
        };
        let state2 = WindowState {
            is_visible: true,
            is_focused: true,
        };
        let state3 = WindowState {
            is_visible: false,
            is_focused: true,
        };

        assert_eq!(state1, state2, "Identical states should be equal");
        assert_ne!(state1, state3, "Different states should not be equal");
    }

    #[test]
    fn test_window_state_clone() {
        let state1 = WindowState {
            is_visible: true,
            is_focused: false,
        };
        let state2 = state1.clone();

        assert_eq!(state1, state2, "Cloned state should be equal to original");
        assert_eq!(state1.is_visible, state2.is_visible);
        assert_eq!(state1.is_focused, state2.is_focused);
    }

    #[test]
    fn test_window_state_copy() {
        let state1 = WindowState {
            is_visible: true,
            is_focused: true,
        };
        let state2 = state1;

        assert!(state1.is_visible);
        assert!(state2.is_visible);
    }

    #[test]
    fn test_window_state_debug() {
        let state = WindowState {
            is_visible: true,
            is_focused: false,
        };
        let debug_str = format!("{:?}", state);

        assert!(debug_str.contains("WindowState"));
        assert!(debug_str.contains("is_visible"));
        assert!(debug_str.contains("is_focused"));
    }

    #[test]
    fn test_toggle_window_state_transitions() {
        let state1 = WindowState {
            is_visible: false,
            is_focused: false,
        };
        assert!(!state1.is_visible);

        let state2 = WindowState {
            is_visible: false,
            is_focused: true,
        };
        assert!(!state2.is_visible);

        let state3 = WindowState {
            is_visible: true,
            is_focused: false,
        };
        assert!(state3.is_visible && !state3.is_focused);

        let state4 = WindowState {
            is_visible: true,
            is_focused: true,
        };
        assert!(state4.is_visible && state4.is_focused);
    }

    #[test]
    fn test_toggle_window_state_matching() {
        let test_cases = vec![
            (false, false, "show"),
            (false, true, "show"),
            (true, false, "reposition"),
            (true, true, "hide"),
        ];

        for (is_visible, is_focused, expected_action) in test_cases {
            let state = WindowState {
                is_visible,
                is_focused,
            };

            let action = match (state.is_visible, state.is_focused) {
                (false, _) => "show",
                (true, false) => "reposition",
                (true, true) => "hide",
            };

            assert_eq!(action, expected_action,
                "State (visible={}, focused={}) should trigger '{}' action",
                is_visible, is_focused, expected_action);
        }
    }
}
