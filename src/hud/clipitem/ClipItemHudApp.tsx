import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Edit3, Pin, Star, Trash2 } from '../icons';
import { TauriService } from '../../services/tauri';
import { subscribeTauriEvent } from '../subscribe';
import type { ClipItemHudActionType, ClipItemHudSnapshot } from '../../types';

// ── 按钮配置定义 ──

interface ActionButtonDef {
  action: ClipItemHudActionType;
  Icon: typeof Copy;
  getTitle: (s: ClipItemHudSnapshot) => string;
  /** 返回 boolean 则渲染 data-active="true"/"false"；undefined 则不渲染 data-active */
  getActive?: (s: ClipItemHudSnapshot) => boolean;
  /** 返回 true 时按钮为 disabled 状态 */
  isDisabled?: (s: ClipItemHudSnapshot) => boolean;
  /** 点击后是否触发闪烁反馈 */
  hasFlash: boolean;
  /** 额外 CSS 类名 */
  extraClass?: string;
}

/**
 * 操作按钮声明式配置。
 * 新增/删除按钮只需修改此数组，无需改动 JSX。
 */
const ACTION_BUTTONS: ActionButtonDef[] = [
  { action: 'copy',     Icon: Copy,   getTitle: () => '复制',                                    getActive: (s) => s.isCopied,   hasFlash: true },
  { action: 'favorite', Icon: Star,   getTitle: (s) => (s.isFavorite ? '取消收藏' : '收藏'),     getActive: (s) => s.isFavorite, hasFlash: true },
  { action: 'pin',      Icon: Pin,    getTitle: () => '置顶',                                    getActive: (s) => s.isPinned,   hasFlash: true },
  { action: 'edit',     Icon: Edit3,  getTitle: () => '编辑',  isDisabled: (s) => !s.canEdit,                                    hasFlash: false },
  { action: 'delete',   Icon: Trash2, getTitle: () => '删除',                                                                    hasFlash: false, extraClass: 'clipitem-hud-btn-delete' },
];

const FLASH_DURATION_MS = 360;

// ── 组件 ──

/**
 * 线性 HUD 窗口的 React 入口组件。
 *
 * 仅负责线性条状 HUD 卡片的渲染，不包含径向菜单逻辑。
 *
 * **设计原则**：HUD 窗口只发事件，不直接调用 hide/show IPC。
 * 显示/隐藏的控制权完全在主窗口侧的 useClipItemHudController，
 * 避免双向 IPC 竞态。
 */
export default function ClipItemHudApp({ initialSnapshot }: { initialSnapshot?: ClipItemHudSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<ClipItemHudSnapshot | null>(initialSnapshot ?? null);
  const [hoveredAction, setHoveredAction] = useState<ClipItemHudActionType | null>(null);
  const [flashedAction, setFlashedAction] = useState<ClipItemHudActionType | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 监听快照更新 ──
  useEffect(() =>
    subscribeTauriEvent(TauriService.listenClipItemHudSnapshot, (payload) => {
      setSnapshot(payload);
      setHoveredAction(null);
    }),
  []);

  // ── 窗口失焦通知主窗口 ──
  useEffect(() => {
    const handleBlur = () => { void TauriService.emitClipItemHudWindowBlur(); };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  const triggerFlash = useCallback((action: ClipItemHudActionType) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashedAction(action);
    flashTimerRef.current = setTimeout(() => {
      setFlashedAction(null);
      flashTimerRef.current = null;
    }, FLASH_DURATION_MS);
  }, []);

  const sendAction = useCallback(async (action: ClipItemHudActionType) => {
    if (!snapshot) return;
    await TauriService.emitClipItemHudAction({ itemId: snapshot.itemId, action });
  }, [snapshot]);

  // ── press_release 模式：全局 pointerup 触发动作 ──
  useEffect(() => {
    if (!snapshot || snapshot.triggerMouseMode !== 'press_release') return;

    const triggerButton = snapshot.triggerMouseButton === 'right' ? 2 : 1;

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== triggerButton) return;

      const currentAction = hoveredAction;

      if (!currentAction || (currentAction === 'edit' && !snapshot.canEdit)) {
        void sendAction('dismiss');
        return;
      }

      void sendAction(currentAction);
      setHoveredAction(null);
    };

    window.addEventListener('pointerup', onPointerUp, true);
    return () => {
      window.removeEventListener('pointerup', onPointerUp, true);
    };
  }, [hoveredAction, snapshot, sendAction]);

  if (!snapshot) return null;

  const hudAxis = snapshot.hudAxis ?? 'horizontal';

  return (
    <div
      className="clipitem-hud-root"
      onMouseDown={(e) => {
        if (snapshot.triggerMouseMode !== 'click' || e.target !== e.currentTarget) return;
        void sendAction('dismiss');
      }}
      onContextMenu={(e) => {
        if (snapshot.triggerMouseButton === 'right') e.preventDefault();
      }}
    >
      <div
        className="clipitem-hud-card"
        role="status"
        aria-live="polite"
        data-theme={snapshot.theme ?? 'dark'}
        data-axis={hudAxis}
      >
        {/* 时间与收藏状态 */}
        <div className="clipitem-hud-time-wrap">
          <span className="clipitem-hud-fav-slot" aria-hidden="true">
            <Star className="clipitem-hud-fav-icon" data-active={snapshot.isFavorite ? 'true' : 'false'} />
          </span>
          <div className="clipitem-hud-text-wrap">
            <p className="clipitem-hud-date">{snapshot.dateLine ?? '--/--'}</p>
            <p className="clipitem-hud-time">{snapshot.timeLine ?? '--:--'}</p>
          </div>
        </div>

        {/* 操作按钮组 — 配置驱动渲染 */}
        <div className="clipitem-hud-actions" aria-label="条目快捷操作">
          {ACTION_BUTTONS.map(({ action, Icon, getTitle, getActive, isDisabled: getDisabled, hasFlash, extraClass }) => {
            const disabled = getDisabled?.(snapshot) ?? false;
            const active = getActive?.(snapshot);

            return (
              <button
                key={action}
                type="button"
                className={extraClass ? `clipitem-hud-btn ${extraClass}` : 'clipitem-hud-btn'}
                title={getTitle(snapshot)}
                disabled={disabled}
                data-flash={hasFlash && flashedAction === action ? 'true' : undefined}
                onClick={() => {
                  if (hasFlash) triggerFlash(action);
                  void sendAction(action);
                }}
                onPointerEnter={() => { if (!disabled) setHoveredAction(action); }}
                onPointerLeave={() => setHoveredAction((v) => (v === action ? null : v))}
              >
                <Icon
                  className="clipitem-hud-btn-icon"
                  data-active={active != null ? String(active) : undefined}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}