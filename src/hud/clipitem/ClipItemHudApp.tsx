import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Edit3, Pin, Star, Trash2 } from 'lucide-react';
import { TauriService } from '../../services/tauri';
import type { ClipItemHudActionType, ClipItemHudSnapshot } from '../../types';

/**
 * 线性 HUD 窗口（clipitem-hud）的 React 入口组件。
 *
 * 仅负责线性条状 HUD 卡片的渲染，不再包含径向菜单逻辑。
 * 径向菜单已移至独立的 radial-menu 窗口（RadialMenuApp）。
 *
 * **设计原则**：HUD 窗口只发事件，不直接调用 hide/show IPC。
 * 显示/隐藏的控制权完全在主窗口侧的 useClipItemHudController，
 * 避免双向 IPC 竞态。
 */
export default function ClipItemHudApp() {
  const [snapshot, setSnapshot] = useState<ClipItemHudSnapshot | null>(null);
  const [hoveredAction, setHoveredAction] = useState<ClipItemHudActionType | null>(null);
  const [flashedAction, setFlashedAction] = useState<ClipItemHudActionType | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    void TauriService.listenClipItemHudSnapshot((payload) => {
      if (!mounted) return;
      setSnapshot(payload);
      setHoveredAction(null);
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {
      // 忽略 HUD 监听初始化失败
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  const triggerFlash = useCallback((action: ClipItemHudActionType) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashedAction(action);
    flashTimerRef.current = setTimeout(() => {
      setFlashedAction(null);
      flashTimerRef.current = null;
    }, 360);
  }, []);

  const sendAction = useCallback(async (action: ClipItemHudActionType) => {
    if (!snapshot) return;
    await TauriService.emitClipItemHudAction({
      itemId: snapshot.itemId,
      action,
    });
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.triggerMouseMode !== 'press_release') return;

    const triggerButton = snapshot.triggerMouseButton === 'right' ? 2 : 1;

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== triggerButton) return;

      const currentAction = hoveredAction;

      if (!currentAction || (currentAction === 'edit' && !snapshot.canEdit)) {
        // 释放在空白处 / 不可用按钮上 → 发送 dismiss 让主窗口关闭
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
      onMouseDown={(event) => {
        if (snapshot.triggerMouseMode !== 'click') return;
        if (event.target !== event.currentTarget) return;
        // 点击空白背景 → 发送 dismiss 让主窗口关闭
        void sendAction('dismiss');
      }}
      onContextMenu={(event) => {
        if (snapshot.triggerMouseButton === 'right') {
          event.preventDefault();
        }
      }}
    >
      <div
        className="clipitem-hud-card"
        role="status"
        aria-live="polite"
        data-theme={snapshot.theme ?? 'dark'}
        data-axis={hudAxis}
      >
        <div className="clipitem-hud-time-wrap">
          <span className="clipitem-hud-fav-slot" aria-hidden="true">
            <Star className="clipitem-hud-fav-icon" data-active={snapshot.isFavorite ? 'true' : 'false'} />
          </span>
          <div className="clipitem-hud-text-wrap">
            <p className="clipitem-hud-date">{snapshot.dateLine ?? '--/--'}</p>
            <p className="clipitem-hud-time">{snapshot.timeLine ?? '--:--'}</p>
          </div>
        </div>

        <div className="clipitem-hud-actions" aria-label="条目快捷操作">
          <button
            type="button"
            className="clipitem-hud-btn"
            title="复制"
            data-flash={flashedAction === 'copy' ? 'true' : undefined}
            onClick={() => {
              triggerFlash('copy');
              void sendAction('copy');
            }}
            onPointerEnter={() => setHoveredAction('copy')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'copy' ? null : value))}
          >
            <Copy className="clipitem-hud-btn-icon" data-active={snapshot.isCopied ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title={snapshot.isFavorite ? '取消收藏' : '收藏'}
            data-flash={flashedAction === 'favorite' ? 'true' : undefined}
            onClick={() => {
              triggerFlash('favorite');
              void sendAction('favorite');
            }}
            onPointerEnter={() => setHoveredAction('favorite')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'favorite' ? null : value))}
          >
            <Star className="clipitem-hud-btn-icon" data-active={snapshot.isFavorite ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title="置顶"
            data-flash={flashedAction === 'pin' ? 'true' : undefined}
            onClick={() => {
              triggerFlash('pin');
              void sendAction('pin');
            }}
            onPointerEnter={() => setHoveredAction('pin')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'pin' ? null : value))}
          >
            <Pin className="clipitem-hud-btn-icon" data-active={snapshot.isPinned ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title="编辑"
            disabled={!snapshot.canEdit}
            onClick={() => {
              void sendAction('edit');
            }}
            onPointerEnter={() => {
              if (snapshot.canEdit) {
                setHoveredAction('edit');
              }
            }}
            onPointerLeave={() => setHoveredAction((value) => (value === 'edit' ? null : value))}
          >
            <Edit3 className="clipitem-hud-btn-icon" />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn clipitem-hud-btn-delete"
            title="删除"
            onClick={() => {
              void sendAction('delete');
            }}
            onPointerEnter={() => setHoveredAction('delete')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'delete' ? null : value))}
          >
            <Trash2 className="clipitem-hud-btn-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}


