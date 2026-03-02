import React, { useEffect, useState } from 'react';
import { Copy, Edit3, Pin, Star, Trash2 } from 'lucide-react';
import { TauriService } from './services/tauri';
import type { ClipItemHudActionType, ClipItemHudSnapshot } from './types';

export default function ClipItemHudApp() {
  const [snapshot, setSnapshot] = useState<ClipItemHudSnapshot | null>(null);
  const [isHoveringHud, setIsHoveringHud] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<ClipItemHudActionType | null>(null);

  const closeHud = () => {
    void TauriService.setClipItemHudMousePassthrough(true);
    void TauriService.hideClipItemHud();
  };

  useEffect(() => {
    if (!snapshot) return;

    const triggerKey = snapshot.triggerKey === 'ctrl' ? 'control' : snapshot.triggerKey;

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== triggerKey) return;

      if (snapshot.keepOpenOnHover && isHoveringHud) {
        return;
      }

      closeHud();
    };

    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isHoveringHud, snapshot]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    void TauriService.listenClipItemHudSnapshot((payload) => {
      if (!mounted) return;
      setSnapshot(payload);
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

  const sendAction = (action: ClipItemHudActionType) => {
    if (!snapshot) return;
    void TauriService.emitClipItemHudAction({
      itemId: snapshot.itemId,
      action,
    });
  };

  useEffect(() => {
    if (!snapshot || snapshot.triggerMouseMode !== 'press_release') return;

    const triggerButton = snapshot.triggerMouseButton === 'right' ? 2 : 1;

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== triggerButton) return;
      if (!hoveredAction) return;
      if (hoveredAction === 'edit' && !snapshot.canEdit) return;

      sendAction(hoveredAction);
      setHoveredAction(null);
      closeHud();
    };

    window.addEventListener('pointerup', onPointerUp, true);
    return () => {
      window.removeEventListener('pointerup', onPointerUp, true);
    };
  }, [hoveredAction, snapshot]);

  return (
    <div
      className="clipitem-hud-root"
      onMouseDown={(event) => {
        if (!snapshot || snapshot.triggerMouseMode !== 'click') return;
        if (event.target !== event.currentTarget) return;
        closeHud();
      }}
      onContextMenu={(event) => {
        if (snapshot?.triggerMouseButton === 'right') {
          event.preventDefault();
        }
      }}
      onMouseEnter={() => setIsHoveringHud(true)}
      onMouseLeave={() => setIsHoveringHud(false)}
    >
      <div
        className="clipitem-hud-card"
        role="status"
        aria-live="polite"
        data-theme={snapshot?.theme ?? 'dark'}
      >
        <div className="clipitem-hud-time-wrap">
          <span className="clipitem-hud-fav-slot" aria-hidden="true">
            <Star className="clipitem-hud-fav-icon" data-active={snapshot?.isFavorite ? 'true' : 'false'} />
          </span>
          <div className="clipitem-hud-text-wrap">
            <p className="clipitem-hud-date">{snapshot?.dateLine ?? '--/--'}</p>
            <p className="clipitem-hud-time">{snapshot?.timeLine ?? '--:--'}</p>
          </div>
        </div>

        <div className="clipitem-hud-actions" aria-label="条目快捷操作">
          <button
            type="button"
            className="clipitem-hud-btn"
            title="复制"
            onClick={() => sendAction('copy')}
            onPointerEnter={() => setHoveredAction('copy')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'copy' ? null : value))}
          >
            <Copy className="clipitem-hud-btn-icon" data-active={snapshot?.isCopied ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title="收藏"
            onClick={() => sendAction('favorite')}
            onPointerEnter={() => setHoveredAction('favorite')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'favorite' ? null : value))}
          >
            <Star className="clipitem-hud-btn-icon" data-active={snapshot?.isFavorite ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title="置顶"
            onClick={() => sendAction('pin')}
            onPointerEnter={() => setHoveredAction('pin')}
            onPointerLeave={() => setHoveredAction((value) => (value === 'pin' ? null : value))}
          >
            <Pin className="clipitem-hud-btn-icon" data-active={snapshot?.isPinned ? 'true' : 'false'} />
          </button>
          <button
            type="button"
            className="clipitem-hud-btn"
            title="编辑"
            disabled={!snapshot?.canEdit}
            onClick={() => sendAction('edit')}
            onPointerEnter={() => {
              if (snapshot?.canEdit) {
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
            onClick={() => sendAction('delete')}
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
