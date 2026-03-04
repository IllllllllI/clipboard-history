import React, { useEffect, useMemo, useState, useRef } from 'react';
import './RadialMenu.css';
import type { ClipItemHudRadialMenuLayoutProfile, RadialMenuSnapshot } from '../../types';
import { TauriService } from '../../services/tauri';
import {
  RADIAL_MENU_LAYOUT_PRESETS,
  DEFAULT_RADIAL_MENU_LAYOUT,
  MENU_SIZE,
  MENU_CENTER,
  polarToCartesian,
  describeSectorPath,
} from './layout';
import { RadialMenuIcon } from './icons';
import { buildRadialMenuActions, RadialMenuActionId } from './actions';

interface RadialMenuProps {
  snapshot: RadialMenuSnapshot;
  fancyFx?: boolean;
  layoutProfile?: ClipItemHudRadialMenuLayoutProfile;
  onActionComplete: (actionId: RadialMenuActionId) => void;
  onCancel: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ snapshot, fancyFx = true, layoutProfile = 'standard', onActionComplete, onCancel }) => {
  const radialLayout = RADIAL_MENU_LAYOUT_PRESETS[layoutProfile] ?? DEFAULT_RADIAL_MENU_LAYOUT;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string>('none');
  const activeIndexRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButton = snapshot.triggerMouseButton === 'right' ? 2 : 1;
  const triggerButtonMask = snapshot.triggerMouseButton === 'right' ? 2 : 4;
  const actions = useMemo(() => buildRadialMenuActions({
    isPinned: snapshot.isPinned,
    isFavorite: snapshot.isFavorite,
  }), [snapshot.isPinned, snapshot.isFavorite]);
  const activeAction = activeIndex !== null ? actions[activeIndex] : null;

  // ── 组件级动作防重 ref ──
  // 持久化跨 effect 重跑（如 layoutProfile 变化导致 deps 变动），
  // 组件卸载→重挂载时自动重置为 false。
  const actionFiredRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // 用 ref 保持回调引用稳定，避免 effect 因回调变化而重新执行
  const onActionCompleteRef = useRef(onActionComplete);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onActionCompleteRef.current = onActionComplete; }, [onActionComplete]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  // 用 ref 保持 radialLayout 引用最新，避免将其加入 effect 依赖
  const radialLayoutRef = useRef(radialLayout);
  useEffect(() => { radialLayoutRef.current = radialLayout; }, [radialLayout]);

  useEffect(() => {
    const resolveActionIndexByScreenPoint = (screenX: number, screenY: number): number | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const hudWindowScreenX = window.screenX;
      const hudWindowScreenY = window.screenY;
      const centerScreenX = hudWindowScreenX + rect.left + rect.width / 2;
      const centerScreenY = hudWindowScreenY + rect.top + rect.height / 2;
      const dx = screenX - centerScreenX;
      const dy = screenY - centerScreenY;

      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < radialLayoutRef.current.cancelDeadzoneRadius) {
        return null;
      }

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) {
        angle += 360;
      }

      let nearestIndex = 0;
      let minDiff = Infinity;
      actions.forEach((action, index) => {
        let diff = Math.abs(angle - action.angle);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff) {
          minDiff = diff;
          nearestIndex = index;
        }
      });

      return nearestIndex;
    };

    const handlePointerMove = (screenX: number, screenY: number) => {
      const nextIndex = resolveActionIndexByScreenPoint(screenX, screenY);
      setActiveIndex(nextIndex);
    };

    const executeAction = (actionId: RadialMenuActionId) => {
      setLastAction(actionId);
      onActionCompleteRef.current(actionId);
    };

    const handlePointerUpAt = (screenX: number, screenY: number, button: number) => {
      const isExpectedTriggerButton = button === triggerButton;
      if (!isExpectedTriggerButton) return;
      // 组件级 ref 防重：即使 effect 因 deps 变化重跑，flag 仍保持 true
      if (actionFiredRef.current) return;
      actionFiredRef.current = true;

      const releaseIndex = resolveActionIndexByScreenPoint(screenX, screenY);
      const selectedIndex = releaseIndex ?? activeIndexRef.current;
      setActiveIndex(selectedIndex);

      if (selectedIndex !== null) {
        const action = actions[selectedIndex];
        executeAction(action.id);
      } else {
        setLastAction('cancel');
        onCancelRef.current();
      }
    };

    // ── Tauri 全局事件通道 ──
    // 主窗口通过 emitTo 转发 pointermove/pointerup 至 radial-menu 窗口。
    // 当鼠标在径向菜单窗口外部释放时，只有 Tauri 通道能收到。
    const listenMove = TauriService.listenRadialMenuGlobalPointerMove;
    const listenUp = TauriService.listenRadialMenuGlobalPointerUp;

    const movePromise = listenMove((payload) => {
      if ((payload.buttons & triggerButtonMask) === 0) return;
      handlePointerMove(payload.screenX, payload.screenY);
    });
    const upPromise = listenUp((payload) => {
      handlePointerUpAt(payload.screenX, payload.screenY, payload.button);
    });

    // ── DOM 事件监听 ──
    // 当鼠标在径向菜单窗口内部释放时，DOM pointerup 直接在本窗口触发
    // （主窗口收不到，不会转发 Tauri 事件），因此必须保留 DOM 监听器。
    // actionFiredRef 保证 DOM 与 Tauri 两路中只有第一个生效。
    const handlePointerMoveEvent = (e: PointerEvent | MouseEvent) => {
      handlePointerMove(e.screenX, e.screenY);
    };

    const handlePointerUpEvent = (e: PointerEvent | MouseEvent) => {
      handlePointerUpAt(e.screenX, e.screenY, e.button);
    };

    // DOM 事件保留 pointermove + pointerup 即可（window 级别已覆盖所有场景）
    window.addEventListener('pointermove', handlePointerMoveEvent);
    window.addEventListener('pointerup', handlePointerUpEvent, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMoveEvent);
      window.removeEventListener('pointerup', handlePointerUpEvent, true);
      // Tauri 异步监听：即使 Promise 尚未 resolve（StrictMode 快速卸载），
      // 也通过 .then 链保证最终移除，避免泄漏重复监听器。
      void movePromise.then((dispose) => dispose()).catch(() => {});
      void upPromise.then((dispose) => dispose()).catch(() => {});
    };
  }, [actions, triggerButton, triggerButtonMask]);

  return (
    <div className='radial-menu-container' data-fx={fancyFx ? 'fancy' : 'normal'} ref={containerRef}>
      {import.meta.env.DEV && (
        <div className='radial-menu-debug'>
          <span>active: {activeIndex !== null ? actions[activeIndex].id : 'none'}</span>
          <span>last: {lastAction}</span>
        </div>
      )}
      <svg className='radial-menu-svg' viewBox={'0 0 ' + MENU_SIZE + ' ' + MENU_SIZE} aria-hidden='true'>
        <circle
          className='radial-menu-guide radial-menu-guide--outer'
          cx={MENU_CENTER}
          cy={MENU_CENTER}
          r={radialLayout.outerRadius}
        />
        <circle
          className='radial-menu-guide radial-menu-guide--inner'
          cx={MENU_CENTER}
          cy={MENU_CENTER}
          r={radialLayout.innerRadius}
        />

        {actions.map((action, index) => {
          const isActive = activeIndex === index;
          const startDeg = action.angle - radialLayout.sectorSpanDeg / 2;
          const endDeg = action.angle + radialLayout.sectorSpanDeg / 2;
          const classNameStr = [
            'radial-menu-sector',
            isActive ? 'active' : '',
            action.tone === 'danger' ? 'danger' : '',
          ].filter(Boolean).join(' ');

          return (
            <path
              key={action.id}
              d={describeSectorPath(startDeg, endDeg, radialLayout.innerRadius, radialLayout.outerRadius)}
              className={classNameStr}
            />
          );
        })}

        {activeAction && (
          <line
            className='radial-menu-pointer'
            x1={MENU_CENTER}
            y1={MENU_CENTER}
            x2={polarToCartesian(activeAction.angle, radialLayout.outerRadius + radialLayout.pointerTailExtra).x}
            y2={polarToCartesian(activeAction.angle, radialLayout.outerRadius + radialLayout.pointerTailExtra).y}
          />
        )}
      </svg>

      <div className='radial-menu-center'>
        <span className='radial-menu-center-title'>{activeAction ? activeAction.label : '松开取消'}</span>
        <span className='radial-menu-center-subtitle'>{activeAction ? '释放执行' : '向外滑动选择'}</span>
      </div>

      {actions.map((action, index) => {
        const isActive = activeIndex === index;
        const rad = action.angle * (Math.PI / 180);
        const x = Math.cos(rad) * radialLayout.nodeRadius;
        const y = Math.sin(rad) * radialLayout.nodeRadius;
        const lx = Math.cos(rad) * radialLayout.labelRadius;
        const ly = Math.sin(rad) * radialLayout.labelRadius;

        const classNameStr = [
          'radial-menu-item',
          isActive ? 'active' : '',
          action.tone === 'danger' ? 'danger' : ''
        ].filter(Boolean).join(' ');

        return (
          <React.Fragment key={action.id}>
            <div
              className='radial-menu-node-wrap'
              style={{
                transform: 'translate(' + x + 'px, ' + y + 'px)',
              }}
            >
              <div className={classNameStr}>
                <span className='radial-menu-icon'><RadialMenuIcon actionId={action.id} /></span>
              </div>
            </div>
            <div
              className='radial-menu-label-wrap'
              style={{
                transform: 'translate(' + lx + 'px, ' + ly + 'px)',
              }}
            >
              <span className='radial-menu-label-pill' data-active={isActive ? 'true' : 'false'}>{action.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default RadialMenu;