/**
 * ClipItem HUD 全局共享状态管理器
 *
 * 职责：跨组件实例协调 HUD 窗口的可见性、所有权和生命周期标志。
 * 所有 ClipItem 实例通过此状态判断"我是否拥有 HUD"以及"HUD 是否可见"。
 *
 * ## 设计原则
 * - **单一所有权**：同一时刻只有一个 itemId 拥有 HUD，认领时自动释放前任
 * - **不可聚焦窗口**：HUD 窗口设置了 focusable(false)，点击不抢焦点
 * - **声明式驱动**：外部通过 `requestSync()` 请求重新评估可见性，
 *   而非在各事件处理器中直接调用 show/hide
 */

// ── 状态定义 ──

interface ClipItemHudState {
  /** 当前拥有 HUD 的 itemId（null = 无人拥有） */
  ownerItemId: number | null;
  /** HUD 窗口是否可见 */
  isVisible: boolean;
  /** 全局拖拽标志：拖拽期间抑制 HUD 显示 */
  isDragging: boolean;
  /** 条目切换时的延迟隐藏定时器（平滑切换，避免闪烁） */
  switchGraceTimer: ReturnType<typeof setTimeout> | null;
  /** 注册的同步回调（由当前 owner 的 controller 设置） */
  syncCallback: (() => void) | null;
}

const state: ClipItemHudState = {
  ownerItemId: null,
  isVisible: false,
  isDragging: false,
  switchGraceTimer: null,
  syncCallback: null,
};

// ── 所有权管理 ──

/**
 * 认领 HUD 所有权。
 * 同一 item 重复认领为空操作；不同 item 认领时前任自动失效。
 */
export function claimOwnership(itemId: number): void {
  clearSwitchGraceTimer();
  state.ownerItemId = itemId;
}

/** 释放指定 item 的所有权（仅当确实是当前 owner 时生效） */
export function releaseOwnership(itemId: number): void {
  if (state.ownerItemId === itemId) {
    state.ownerItemId = null;
  }
}

export function isOwner(itemId: number): boolean {
  return state.ownerItemId === itemId;
}

export function getOwnerItemId(): number | null {
  return state.ownerItemId;
}

// ── 可见性 ──

export function isVisible(): boolean {
  return state.isVisible;
}

export function setVisible(visible: boolean): void {
  state.isVisible = visible;
}

// ── 拖拽标志 ──

export function setDragging(dragging: boolean): void {
  state.isDragging = dragging;
}

export function isDragging(): boolean {
  return state.isDragging;
}

// ── 切换宽限定时器 ──

export function clearSwitchGraceTimer(): void {
  if (state.switchGraceTimer !== null) {
    clearTimeout(state.switchGraceTimer);
    state.switchGraceTimer = null;
  }
}

/**
 * 延迟调用 hideFn，用于 item 切换时留出宽限期：
 * 如果新 item 在此期间认领了 HUD（走 claimOwnership），
 * 定时器会被 clear 掉，避免闪烁。
 */
export function scheduleSwitchGraceHide(hideFn: () => void, delayMs: number): void {
  clearSwitchGraceTimer();
  state.switchGraceTimer = setTimeout(() => {
    state.switchGraceTimer = null;
    hideFn();
  }, delayMs);
}

// ── 同步回调 ──

/**
 * 注册一个同步回调，由当前 owner 的 controller 设置。
 * 当外部需要触发可见性重新评估时（如窗口移动后），调用 requestSync()。
 */
export function registerSyncCallback(callback: (() => void) | null): void {
  state.syncCallback = callback;
}

/** 请求当前 owner 重新评估 HUD 可见性 */
export function requestSync(): void {
  state.syncCallback?.();
}

/**
 * 外部（如 AppContext action handler）直接通过 IPC 隐藏了 HUD 窗口后，
 * 调用此函数同步共享状态。
 *
 * 不触发 IPC（调用方已处理），仅重置 isVisible 和 ownerItemId，
 * 使后续 requestSync → openClipItemHud 能正确判断需要重新显示。
 */
export function notifyExternalHide(): void {
  state.isVisible = false;
  state.ownerItemId = null;
  clearSwitchGraceTimer();
}

// ── 向后兼容别名（供 UIContext 的拖拽逻辑使用） ──

export {
  setDragging as setClipItemHudDragging,
  setVisible as setClipItemHudVisible,
};
