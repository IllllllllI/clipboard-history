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
