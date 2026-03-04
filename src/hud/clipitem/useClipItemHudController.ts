import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipItemHudTriggerMouseButton, ClipItemHudTriggerMouseMode, ClipItemHudPositionMode } from '../../types';
import { isTauri, TauriService } from '../../services/tauri';
import * as HudManager from './clipItemHudManager';

const CLIPITEM_HUD_SWITCH_GRACE_MS = 180;
const MAIN_WINDOW_MOVE_SETTLE_MS = 160;
/**
 * blur 事件防抖：延迟后调用 Rust 侧 GetForegroundWindow 判断前景窗口是否仍属于本应用。
 * 设为 120ms 足以让 Win32 焦点切换完成，同时感知不到延迟。
 */
const BLUR_HIDE_DEBOUNCE_MS = 120;


interface UseClipItemHudControllerInput {
  rootRef: React.RefObject<HTMLDivElement>;
  isSelected: boolean;
  itemId: number;
  dateLine: string;
  timeLine: string;
  isFavorite: boolean;
  isPinned: boolean;
  canEdit: boolean;
  isCopied: boolean;
  theme: 'light' | 'dark';
  shouldEnableClipItemHud: boolean;
  shouldEnableRadialMenuHud: boolean;
  triggerMouseButton: ClipItemHudTriggerMouseButton;
  triggerMouseMode: ClipItemHudTriggerMouseMode;
  positionMode: ClipItemHudPositionMode;
}

export function useClipItemHudController(input: UseClipItemHudControllerInput) {
  const {
    rootRef,
    isSelected,
    itemId,
    dateLine,
    timeLine,
    isFavorite,
    isPinned,
    canEdit,
    isCopied,
    theme,
    shouldEnableClipItemHud,
    shouldEnableRadialMenuHud,
    triggerMouseButton,
    triggerMouseMode,
    positionMode,
  } = input;

  const [isHudActive, setIsHudActive] = useState(false);
  const [suppressActiveFeedback, setSuppressActiveFeedback] = useState(false);
  const [radialMenuActive, setRadialMenuActive] = useState(false);
  const clipItemHudVisibleRef = useRef(false);
  const clipItemHudAxisRef = useRef<'horizontal' | 'vertical'>('horizontal');
  const clipItemHudRepositionInFlightRef = useRef(false);
  const clipItemHudRepositionQueuedRef = useRef(false);
  const clipItemHudRepositionRafRef = useRef<number | null>(null);
  const mainWindowFocusedRef = useRef(typeof document !== 'undefined' ? document.hasFocus() : true);
  const radialMenuVisibleRef = useRef(false);
  const mainWindowMovingRef = useRef(false);
  const mainWindowMoveSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 条目 DOM 元素是否在滚动容器可视区内 */
  const isInViewportRef = useRef(true);

  const clearMainWindowMoveSettleTimer = useCallback(() => {
    if (mainWindowMoveSettleTimerRef.current !== null) {
      clearTimeout(mainWindowMoveSettleTimerRef.current);
      mainWindowMoveSettleTimerRef.current = null;
    }
  }, []);

  const triggerPointerButton = useMemo(() => (triggerMouseButton === 'right' ? 2 : 1), [triggerMouseButton]);

  const clearSuppressActiveFeedback = useCallback(() => {
    setSuppressActiveFeedback(false);
  }, []);

  const emitClipItemHudSnapshot = useCallback(() => {
    if (!isTauri || !shouldEnableClipItemHud) return;

    void TauriService.emitClipItemHudSnapshot({
      itemId,
      dateLine,
      timeLine,
      isFavorite,
      isPinned,
      canEdit,
      isCopied,
      theme,
      triggerMouseButton,
      triggerMouseMode,
      hudAxis: clipItemHudAxisRef.current,
    });
  }, [
    itemId,
    dateLine,
    timeLine,
    isFavorite,
    isPinned,
    canEdit,
    isCopied,
    theme,
    triggerMouseButton,
    triggerMouseMode,
    shouldEnableClipItemHud,
  ]);

  // ── [Section 1] 状态快照同步：当 props 变化且 HUD 可见时推送新数据到 HUD 窗口 ──
  useEffect(() => {
    if (!clipItemHudVisibleRef.current) return;
    emitClipItemHudSnapshot();
  }, [emitClipItemHudSnapshot]);

  const hideClipItemHud = useCallback((force = false) => {
    if (!isTauri) return;
    if (!force && !HudManager.isOwner(itemId)) return;
    if (!clipItemHudVisibleRef.current && !HudManager.isVisible()) return;

    clipItemHudVisibleRef.current = false;
    setIsHudActive(false);
    HudManager.setVisible(false);
    HudManager.releaseOwnership(itemId);

    // 取消待执行的重定位 RAF，防止滞后 IPC 将窗口移回屏幕内
    if (clipItemHudRepositionRafRef.current !== null) {
      window.cancelAnimationFrame(clipItemHudRepositionRafRef.current);
      clipItemHudRepositionRafRef.current = null;
    }

    // 拖拽期间 handleDragStart 已发送 hide 命令，跳过冗余 IPC
    if (!HudManager.isDragging()) {
      void TauriService.hideClipItemHud();
    }
  }, [itemId]);

  const scheduleHideClipItemHud = useCallback(() => {
    if (!isTauri) return;
    HudManager.scheduleSwitchGraceHide(() => {
      hideClipItemHud();
    }, CLIPITEM_HUD_SWITCH_GRACE_MS);
  }, [hideClipItemHud]);

  const positionClipItemHudAtEdge = useCallback(async () => {
    let axis: 'horizontal' | 'vertical';
    if (positionMode === 'dynamic') {
      axis = await TauriService.positionClipItemHudNearCursor('edge');
    } else {
      axis = await TauriService.positionClipItemHudAtMainEdge(positionMode);
    }
    if (clipItemHudAxisRef.current !== axis) {
      clipItemHudAxisRef.current = axis;
      emitClipItemHudSnapshot();
    }
  }, [emitClipItemHudSnapshot, positionMode]);

  const repositionClipItemHud = useCallback(async () => {
    if (!clipItemHudVisibleRef.current || !isSelected) return;
    if (HudManager.isDragging()) return;

    if (clipItemHudRepositionInFlightRef.current) {
      clipItemHudRepositionQueuedRef.current = true;
      return;
    }

    clipItemHudRepositionInFlightRef.current = true;
    try {
      await positionClipItemHudAtEdge();
    } finally {
      clipItemHudRepositionInFlightRef.current = false;
      if (clipItemHudRepositionQueuedRef.current) {
        clipItemHudRepositionQueuedRef.current = false;
        void repositionClipItemHud();
      }
    }
  }, [isSelected, positionClipItemHudAtEdge]);

  const scheduleRepositionClipItemHud = useCallback(() => {
    if (!rootRef.current) return;
    if (!clipItemHudVisibleRef.current || !isSelected) return;
    if (HudManager.isDragging()) return;
    // 固定边缘模式下不需要跟随光标重定位
    if (positionMode !== 'dynamic') return;
    if (clipItemHudRepositionRafRef.current !== null) return;

    clipItemHudRepositionRafRef.current = window.requestAnimationFrame(() => {
      clipItemHudRepositionRafRef.current = null;
      void repositionClipItemHud();
    });
  }, [isSelected, positionMode, repositionClipItemHud, rootRef]);

  const openClipItemHud = useCallback(async () => {
    if (HudManager.isDragging()) return;
    if (clipItemHudVisibleRef.current && HudManager.isOwner(itemId)) return;
    HudManager.claimOwnership(itemId);

    await positionClipItemHudAtEdge();

    // 异步操作后重新检查：拖拽可能在 await 期间开始
    if (HudManager.isDragging()) {
      HudManager.releaseOwnership(itemId);
      return;
    }

    emitClipItemHudSnapshot();
    setIsHudActive(false);
    if (!HudManager.isVisible()) {
      await TauriService.setClipItemHudMousePassthrough(false);

      // 最终守卫：showClipItemHud 前最后一次检查
      if (HudManager.isDragging()) {
        HudManager.releaseOwnership(itemId);
        return;
      }

      await TauriService.showClipItemHud();
      HudManager.setVisible(true);
    }
    clipItemHudVisibleRef.current = true;
  }, [emitClipItemHudSnapshot, itemId, positionClipItemHudAtEdge]);

  const shouldShowClipItemHud = useCallback(() => {
    if (!shouldEnableClipItemHud || !isSelected) return false;
    if (HudManager.isDragging()) return false;
    if (mainWindowMovingRef.current) return false;
    if (!isInViewportRef.current) return false;
    return mainWindowFocusedRef.current;
  }, [isSelected, shouldEnableClipItemHud]);

  const syncClipItemHudVisibility = useCallback(() => {
    if (!isTauri) return;

    if (radialMenuVisibleRef.current) {
      hideClipItemHud();
      return;
    }

    // mainWindowFocusedRef 可能因 document.hasFocus() 不可靠而为 false（如点击了
    // 不可聚焦的 HUD 窗口）。此时改为异步走 Rust IPC 验证，不立即隐藏。
    if (!mainWindowFocusedRef.current) {
      // 先检查其他条件（如 isDragging、isSelected），能直接判否就跳过 IPC
      if (!shouldEnableClipItemHud || !isSelected || HudManager.isDragging() || mainWindowMovingRef.current) {
        hideClipItemHud();
        return;
      }
      // 不确定焦点状态 → 异步验证
      void TauriService.isAppForegroundWindow().then((isOurs) => {
        mainWindowFocusedRef.current = isOurs;
        if (isOurs) {
          void openClipItemHud();
        } else {
          hideClipItemHud();
        }
      }).catch(() => {
        mainWindowFocusedRef.current = false;
        hideClipItemHud();
      });
      return;
    }

    if (shouldShowClipItemHud()) {
      void openClipItemHud();
      return;
    }

    hideClipItemHud();
  }, [hideClipItemHud, isSelected, openClipItemHud, shouldEnableClipItemHud, shouldShowClipItemHud]);

  // ── [Section 2] 径向菜单（独立窗口）管理 ──

  const hideRadialMenu = useCallback(() => {
    if (!isTauri || !radialMenuVisibleRef.current) return;
    radialMenuVisibleRef.current = false;
    setRadialMenuActive(false);
    setIsHudActive(false);
    void TauriService.setRadialMenuMousePassthrough(true);
    void TauriService.hideRadialMenu();
  }, []);

  const openRadialMenu = useCallback(async () => {
    if (!isTauri || !shouldEnableRadialMenuHud) return;
    if (radialMenuVisibleRef.current) return;

    setIsHudActive(false);

    // 先隐藏线性 HUD（如果可见）— hide 不再销毁窗口，只移到屏外
    if (clipItemHudVisibleRef.current) {
      clipItemHudVisibleRef.current = false;
      HudManager.setVisible(false);
      HudManager.releaseOwnership(itemId);
      void TauriService.hideClipItemHud();
    }

    // 单次 IPC 完成：定位 + 快照 + 穿透 + 显示 + 置顶
    await TauriService.openRadialMenuAtCursor({
      itemId,
      isFavorite,
      isPinned,
      canEdit,
      theme,
      triggerMouseButton,
      triggerMouseMode,
    });
    radialMenuVisibleRef.current = true;
    setRadialMenuActive(true);
    setIsHudActive(true);
  }, [itemId, isFavorite, isPinned, canEdit, theme, triggerMouseButton, triggerMouseMode, shouldEnableRadialMenuHud]);

  // 转发全局鼠标事件到径向菜单窗口
  useEffect(() => {
    if (!isTauri || !shouldEnableRadialMenuHud || !radialMenuActive) return;

    const forwardPointerMove = (e: PointerEvent) => {
      if (!radialMenuVisibleRef.current) return;
      setIsHudActive(true);

      void TauriService.emitRadialMenuGlobalPointerMove({
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
        buttons: e.buttons,
      });
    };

    const forwardPointerUp = (e: PointerEvent) => {
      if (!radialMenuVisibleRef.current) return;
      void TauriService.emitRadialMenuGlobalPointerUp({
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
      });
      // 径向菜单在 pointerup 后会自行关闭，同步本地状态
      radialMenuVisibleRef.current = false;
      setRadialMenuActive(false);
      setIsHudActive(false);
      syncClipItemHudVisibility();
    };

    window.addEventListener('pointermove', forwardPointerMove, true);
    window.addEventListener('pointerup', forwardPointerUp, true);

    return () => {
      window.removeEventListener('pointermove', forwardPointerMove, true);
      window.removeEventListener('pointerup', forwardPointerUp, true);
    };
  }, [radialMenuActive, shouldEnableRadialMenuHud, syncClipItemHudVisibility]);

  useEffect(() => {
    if (!isTauri || !shouldEnableClipItemHud || !isSelected) return;

    let mounted = true;
    let unlisten: (() => void) | null = null;

    const handleWindowMoved = () => {
      if (!mounted) return;
      mainWindowMovingRef.current = true;
      hideClipItemHud(true);
      clearMainWindowMoveSettleTimer();
      mainWindowMoveSettleTimerRef.current = setTimeout(() => {
        mainWindowMoveSettleTimerRef.current = null;
        mainWindowMovingRef.current = false;
        syncClipItemHudVisibility();
      }, MAIN_WINDOW_MOVE_SETTLE_MS);
    };

    void TauriService.listenMainWindowMoved(handleWindowMoved).then((dispose) => {
      if (!mounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    }).catch(() => {
      // 忽略窗口移动监听失败
    });

    return () => {
      mounted = false;
      clearMainWindowMoveSettleTimer();
      mainWindowMovingRef.current = false;
      if (unlisten) unlisten();
    };
  }, [clearMainWindowMoveSettleTimer, hideClipItemHud, isSelected, shouldEnableClipItemHud, syncClipItemHudVisibility]);

  // ── [Section 3] 事件处理器（供 ClipItemComponent root div 绑定） ──

  const isInteractiveElementTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('.file-list-item')) return false;
    return Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
  }, []);

  const isHudMouseTriggerEligibleTarget = useCallback((target: EventTarget | null) => (
    !isInteractiveElementTarget(target)
  ), [isInteractiveElementTarget]);

  const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const isInteractiveTarget = isInteractiveElementTarget(e.target);
    setSuppressActiveFeedback(isInteractiveTarget);

    // 鼠标触发径向菜单：按下配置的触发按钮（非交互元素上）
    if (
      isTauri &&
      shouldEnableRadialMenuHud &&
      !isInteractiveTarget &&
      e.button === triggerPointerButton &&
      triggerMouseMode === 'press_release'
    ) {
      e.preventDefault();
      void openRadialMenu();
    }
  }, [isInteractiveElementTarget, shouldEnableRadialMenuHud, triggerPointerButton, triggerMouseMode, openRadialMenu]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveElementTarget(e.target)) {
      setSuppressActiveFeedback(true);
    }
  }, [isInteractiveElementTarget]);

  const handlePointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    clearSuppressActiveFeedback();
    if (e.button !== triggerPointerButton) return;
    if (!clipItemHudVisibleRef.current) return;
    scheduleRepositionClipItemHud();
  }, [clearSuppressActiveFeedback, scheduleRepositionClipItemHud, triggerPointerButton]);

  const handleRootPointerCancel = useCallback(() => {
    clearSuppressActiveFeedback();
  }, [clearSuppressActiveFeedback]);

  const handleRootPointerMove = useCallback(() => {
    scheduleRepositionClipItemHud();
  }, [scheduleRepositionClipItemHud]);

  const handleRootPointerLeave = useCallback(() => {
    clearSuppressActiveFeedback();
  }, [clearSuppressActiveFeedback]);

  const handleRootContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!shouldEnableRadialMenuHud || triggerMouseButton !== 'right') return;
    e.preventDefault();
  }, [shouldEnableRadialMenuHud, triggerMouseButton]);

  const handleRootAuxClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (triggerMouseButton !== 'middle' || e.button !== 1) return;
    if (!shouldEnableRadialMenuHud) return;
    if (!isHudMouseTriggerEligibleTarget(e.target)) return;
    e.preventDefault();
  }, [isHudMouseTriggerEligibleTarget, shouldEnableRadialMenuHud, triggerMouseButton]);

  // ── [Section 4] 副作用：径向菜单禁用时关闭 ──
  useEffect(() => {
    if (!shouldEnableRadialMenuHud) {
      hideRadialMenu();
    }
  }, [hideRadialMenu, shouldEnableRadialMenuHud]);

  // ── [Section 5] 副作用：全局指针移动追踪（重定位 HUD） ──
  useEffect(() => {
    if (!isSelected) return;

    const handleGlobalPointerMove = () => {
      scheduleRepositionClipItemHud();
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, true);
    window.addEventListener('pointerrawupdate', handleGlobalPointerMove as EventListener, true);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove, true);
      window.removeEventListener('pointerrawupdate', handleGlobalPointerMove as EventListener, true);
    };
  }, [isSelected, scheduleRepositionClipItemHud]);

  // ── [Section 5.5] 视口检测：条目滚出可见区域时立即隐藏 HUD，滚回后重新显示 ──
  useEffect(() => {
    if (!isTauri || !shouldEnableClipItemHud || !isSelected) return;
    const el = rootRef.current;
    if (!el) return;

    // 找到最近的滚动容器作为 IntersectionObserver root，
    // 使其能正确检测虚拟列表中 absolute 定位元素的可见性。
    let scrollRoot: Element | null = null;
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollRoot = node;
        break;
      }
      node = node.parentElement;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasInViewport = isInViewportRef.current;
        isInViewportRef.current = entry.isIntersecting;

        if (!wasInViewport && entry.isIntersecting) {
          // 条目滚回可视区 → 重新评估 HUD 可见性
          syncClipItemHudVisibility();
        } else if (wasInViewport && !entry.isIntersecting) {
          // 条目离开可视区 → 立即隐藏 HUD
          hideClipItemHud();
        }
      },
      { root: scrollRoot, threshold: 0 },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [hideClipItemHud, isSelected, rootRef, shouldEnableClipItemHud, syncClipItemHudVisibility]);

  // ── [Section 6] 副作用：HUD 禁用时强制隐藏 ──
  useEffect(() => {
    if (shouldEnableClipItemHud) return;
    hideClipItemHud(true);
  }, [shouldEnableClipItemHud, hideClipItemHud]);

  // ── [Section 7] 核心可见性引擎：isSelected / radialMenuActive 变化时重新评估 ──
  useEffect(() => {
    if (!isTauri) return;

    if (!isSelected && !radialMenuActive) {
      if (clipItemHudVisibleRef.current || HudManager.isOwner(itemId)) {
        // 使用宽限定时器延迟隐藏：
        // 如果 action（pin/favorite）导致列表重排，selectedIndex 会被快速修正，
        // 新的 isSelected=true 触发 claimOwnership → 清除此定时器 → 无闪烁。
        // 如果是真正的条目切换，新 owner 的 claimOwnership 同样会清除定时器。
        scheduleHideClipItemHud();
      }
      hideRadialMenu();
      return;
    }

    if (!shouldEnableClipItemHud) {
      hideClipItemHud(true);
    }

    if (!shouldEnableRadialMenuHud) {
      hideRadialMenu();
    }

    if (isSelected && shouldEnableClipItemHud) {
      HudManager.claimOwnership(itemId);
      syncClipItemHudVisibility();
    }
  }, [hideClipItemHud, hideRadialMenu, isSelected, itemId, radialMenuActive, scheduleHideClipItemHud, shouldEnableClipItemHud, shouldEnableRadialMenuHud, syncClipItemHudVisibility]);

  // ── [Section 8] 焦点管理：blur/focus + Rust IPC GetForegroundWindow 验证 ──
  useEffect(() => {
    if (!isTauri || !shouldEnableClipItemHud || !isSelected) return;

    const handleWindowFocus = () => {
      // 焦点回到主窗口 → 取消任何待执行的 blur 隐藏
      if (blurHideTimerRef.current !== null) {
        clearTimeout(blurHideTimerRef.current);
        blurHideTimerRef.current = null;
      }
      mainWindowFocusedRef.current = true;
      syncClipItemHudVisibility();
    };

    const handleWindowBlur = () => {
      // 防抖 + Rust 侧验证：
      // Windows 上点击不可聚焦的 HUD 窗口仍会触发主窗口 blur，
      // document.hasFocus() 也不可靠。延迟后调用 Rust 端
      // GetForegroundWindow 真正判断前景窗口是否属于本应用。
      if (blurHideTimerRef.current !== null) {
        clearTimeout(blurHideTimerRef.current);
      }
      blurHideTimerRef.current = setTimeout(() => {
        blurHideTimerRef.current = null;
        void TauriService.isAppForegroundWindow().then((isOurs) => {
          if (isOurs) {
            // 前景窗口仍属于本应用（HUD/主窗口），不隐藏
            mainWindowFocusedRef.current = true;
            return;
          }
          // 真正切换到了其他应用
          mainWindowFocusedRef.current = false;
          syncClipItemHudVisibility();
        }).catch(() => {
          // IPC 失败时回退为安全隐藏
          mainWindowFocusedRef.current = false;
          syncClipItemHudVisibility();
        });
      }, BLUR_HIDE_DEBOUNCE_MS);
    };

    // effect 初始化不信任 document.hasFocus()（HUD 窗口不可聚焦时不可靠），
    // 而是直接调用 syncClipItemHudVisibility，它会在 mainWindowFocusedRef=false 时
    // 走异步 IPC 验证路径。
    syncClipItemHudVisibility();

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      if (blurHideTimerRef.current !== null) {
        clearTimeout(blurHideTimerRef.current);
        blurHideTimerRef.current = null;
      }
    };
  }, [isSelected, shouldEnableClipItemHud, syncClipItemHudVisibility]);

  // ── [Section 8.5] HUD 窗口失焦事件监听：事件驱动的焦点丢失检测 ──
  //
  // 解决场景：用户点击 HUD 按钮 → HUD 获焦 → 主窗口早已 blur →
  // 再点外部应用 → HUD 触发 blur → 发送 windowBlur 事件到主窗口 →
  // 主窗口收到后检查前台窗口 → 确认不属于本应用 → 隐藏 HUD。
  useEffect(() => {
    if (!isTauri || !shouldEnableClipItemHud || !isSelected) return;

    let mounted = true;
    let unlisten: (() => void) | null = null;

    const handleHudWindowBlur = () => {
      if (!mounted) return;
      // 与 Section 8 相同的防抖 + IPC 验证逻辑
      setTimeout(() => {
        if (!mounted) return;
        void TauriService.isAppForegroundWindow().then((isOurs) => {
          if (!mounted) return;
          if (isOurs) {
            // 焦点回到了主窗口或其他子窗口，不隐藏
            mainWindowFocusedRef.current = true;
            return;
          }
          mainWindowFocusedRef.current = false;
          syncClipItemHudVisibility();
        }).catch(() => {
          if (!mounted) return;
          mainWindowFocusedRef.current = false;
          syncClipItemHudVisibility();
        });
      }, BLUR_HIDE_DEBOUNCE_MS);
    };

    void TauriService.listenClipItemHudWindowBlur(handleHudWindowBlur).then((dispose) => {
      if (!mounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    }).catch(() => {
      // 忽略监听初始化失败
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [isSelected, shouldEnableClipItemHud, syncClipItemHudVisibility]);

  // ── [Section 8.6] HUD 宿主窗口就绪事件：懒创建后补发快照 ──
  //
  // 所有 HUD 共享一个 WebView2 宿主窗口。当该窗口由 Rust 侧懒创建时，
  // WebView2 需要时间加载前端代码。如果此时主窗口已经发送了快照事件，
  // HUD 的 React 组件尚未挂载，事件会被丢弃。
  // 收到 hud-host-ready 后，根据当前状态重新补发快照。
  useEffect(() => {
    if (!isTauri || (!shouldEnableClipItemHud && !shouldEnableRadialMenuHud)) return;

    let mounted = true;
    let unlisten: (() => void) | null = null;

    const handleHudHostReady = () => {
      if (!mounted) return;

      // 补发 ClipItem HUD 快照
      if (shouldEnableClipItemHud && isSelected) {
        emitClipItemHudSnapshot();
        void positionClipItemHudAtEdge().then(() => {
          if (!mounted) return;
          void TauriService.showClipItemHud();
          void TauriService.setClipItemHudMousePassthrough(false);
        });
      }

      // 补发径向菜单快照
      if (shouldEnableRadialMenuHud && radialMenuVisibleRef.current) {
        void TauriService.emitRadialMenuSnapshot({
          itemId,
          isFavorite,
          isPinned,
          canEdit,
          theme,
          triggerMouseButton,
          triggerMouseMode,
        });
      }
    };

    void TauriService.listenHudHostReady(handleHudHostReady).then((dispose) => {
      if (!mounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    }).catch(() => {});

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [isSelected, shouldEnableClipItemHud, shouldEnableRadialMenuHud,
      emitClipItemHudSnapshot, positionClipItemHudAtEdge,
      itemId, isFavorite, isPinned, theme, triggerMouseButton, triggerMouseMode]);

  // ── [Section 9] visibilitychange / pagehide → 强制隐藏 ──
  useEffect(() => {
    if (!isTauri || !shouldEnableClipItemHud || !isSelected) return;

    const handleVisibilityOrPageHide = () => {
      if (document.visibilityState === 'hidden') {
        hideClipItemHud(true);
        hideRadialMenu();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
      window.removeEventListener('pagehide', handleVisibilityOrPageHide);
    };
  }, [hideClipItemHud, hideRadialMenu, isSelected, shouldEnableClipItemHud]);

  // ── [Section 10] 同步回调注册：允许外部请求重新评估可见性 ──
  useEffect(() => {
    if (!isTauri || !isSelected || !shouldEnableClipItemHud) return;
    HudManager.registerSyncCallback(syncClipItemHudVisibility);
    return () => {
      HudManager.registerSyncCallback(null);
    };
  }, [isSelected, shouldEnableClipItemHud, syncClipItemHudVisibility]);

  // ── [Section 11] 组件卸载清理 ──
  useEffect(() => {
    return () => {
      // 取消待执行的重定位 RAF
      if (clipItemHudRepositionRafRef.current !== null) {
        window.cancelAnimationFrame(clipItemHudRepositionRafRef.current);
        clipItemHudRepositionRafRef.current = null;
      }
      // 清理定时器
      clearMainWindowMoveSettleTimer();
      HudManager.clearSwitchGraceTimer();
      if (blurHideTimerRef.current !== null) {
        clearTimeout(blurHideTimerRef.current);
        blurHideTimerRef.current = null;
      }
      // 隐藏 HUD 和径向菜单
      hideClipItemHud();
      hideRadialMenu();
    };
  }, [clearMainWindowMoveSettleTimer, hideClipItemHud, hideRadialMenu]);

  return {
    isHudActive,
    suppressActiveFeedback,
    handleMouseDownCapture,
    handlePointerDownCapture,
    handleRootPointerMove,
    handlePointerUpCapture,
    handleRootPointerCancel,
    handleRootPointerLeave,
    handleRootContextMenu,
    handleRootAuxClick,
  };
}
