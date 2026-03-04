import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TauriService } from '../../services/tauri';
import type { RadialMenuSnapshot, RadialMenuActionType, ClipItemHudRadialMenuLayoutProfile } from '../../types';
import RadialMenu from './RadialMenu';

/**
 * 径向菜单独立窗口的 React 入口组件。
 *
 * 运行在 `radial-menu` Tauri 窗口中。
 * 通过 Tauri 事件接收快照数据，渲染 RadialMenu 组件，
 * 操作完成后通过事件将动作回报给主窗口。
 */
export default function RadialMenuApp() {
  const [snapshot, setSnapshot] = useState<RadialMenuSnapshot | null>(null);
  const [fancyFx, setFancyFx] = useState(true);
  const [layoutProfile, setLayoutProfile] = useState<ClipItemHudRadialMenuLayoutProfile>('standard');

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const closeMenu = useCallback(() => {
    void TauriService.setRadialMenuMousePassthrough(true);
    void TauriService.hideRadialMenu();
    setSnapshot(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    const syncSettings = async () => {
      try {
        const stored = await TauriService.getAppSettings();
        if (!mounted || !stored || typeof stored !== 'object') return;
        const fx = (stored as Record<string, unknown>).clipItemHudRadialMenuFancyFx;
        const profile = (stored as Record<string, unknown>).clipItemHudRadialMenuLayoutProfile;
        if (typeof fx === 'boolean') setFancyFx(fx);
        if (profile === 'compact' || profile === 'standard' || profile === 'relaxed') {
          setLayoutProfile(profile);
        }
      } catch {
        // ignore
      }
    };

    void syncSettings();

    const listenPromise = TauriService.listenRadialMenuSnapshot((payload) => {
      if (!mounted) return;
      void syncSettings();
      setSnapshot(payload);
    });
    listenPromise.then((dispose) => {
      unlisten = dispose;
    }).catch(() => {});

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      } else {
        void listenPromise.then((dispose) => dispose()).catch(() => {});
      }
    };
  }, []);

  const handleActionComplete = useCallback((action: RadialMenuActionType) => {
    const snap = snapshotRef.current;
    if (!snap) return;
    snapshotRef.current = null;
    void (async () => {
      try {
        await TauriService.emitRadialMenuAction({
          itemId: snap.itemId,
          action,
        });
      } finally {
        closeMenu();
      }
    })();
  }, [closeMenu]);

  if (!snapshot) return null;

  return (
    <RadialMenu
      snapshot={snapshot}
      fancyFx={fancyFx}
      layoutProfile={layoutProfile}
      onActionComplete={handleActionComplete}
      onCancel={closeMenu}
    />
  );
}
