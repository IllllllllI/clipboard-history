import { useCallback, useEffect, useRef, useState } from 'react';
import { TauriService } from '../../services/tauri';
import { subscribeTauriEvent } from '../subscribe';
import type { RadialMenuSnapshot, RadialMenuActionType, ClipItemHudRadialMenuLayoutProfile } from '../../types';
import RadialMenu from './RadialMenu';

/** 合法的径向菜单布局档位集合 */
const VALID_PROFILES = new Set<string>(['compact', 'standard', 'relaxed']);

/** 从 AppSettings 中提取径向菜单相关配置，带类型窄化 */
function parseRadialSettings(stored: Record<string, unknown>): {
  fancyFx?: boolean;
  layoutProfile?: ClipItemHudRadialMenuLayoutProfile;
} {
  const fx = stored.clipItemHudRadialMenuFancyFx;
  const profile = stored.clipItemHudRadialMenuLayoutProfile;
  return {
    fancyFx: typeof fx === 'boolean' ? fx : undefined,
    layoutProfile: typeof profile === 'string' && VALID_PROFILES.has(profile)
      ? (profile as ClipItemHudRadialMenuLayoutProfile)
      : undefined,
  };
}

/**
 * 径向菜单独立窗口的 React 入口组件。
 *
 * 运行在 `radial-menu` Tauri 窗口中。
 * 通过 Tauri 事件接收快照数据，渲染 RadialMenu 组件，
 * 操作完成后通过事件将动作回报给主窗口。
 */
export default function RadialMenuApp({ initialSnapshot }: { initialSnapshot?: RadialMenuSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<RadialMenuSnapshot | null>(initialSnapshot ?? null);
  const [fancyFx, setFancyFx] = useState(true);
  const [layoutProfile, setLayoutProfile] = useState<ClipItemHudRadialMenuLayoutProfile>('standard');

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const closeMenu = useCallback(() => {
    void TauriService.setRadialMenuMousePassthrough(true);
    void TauriService.hideRadialMenu();
    setSnapshot(null);
  }, []);

  /** 从后端同步最新设置 */
  const syncSettings = useCallback(async () => {
    try {
      const stored = await TauriService.getAppSettings();
      if (!stored || typeof stored !== 'object') return;
      const parsed = parseRadialSettings(stored);
      if (parsed.fancyFx != null) setFancyFx(parsed.fancyFx);
      if (parsed.layoutProfile) setLayoutProfile(parsed.layoutProfile);
    } catch {
      // 忽略
    }
  }, []);

  useEffect(() => {
    void syncSettings();
    return subscribeTauriEvent(TauriService.listenRadialMenuSnapshot, (payload) => {
      void syncSettings();
      setSnapshot(payload);
    });
  }, [syncSettings]);

  const handleActionComplete = useCallback((action: RadialMenuActionType) => {
    const snap = snapshotRef.current;
    if (!snap) return;
    snapshotRef.current = null;
    void TauriService.emitRadialMenuAction({ itemId: snap.itemId, action })
      .finally(closeMenu);
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
