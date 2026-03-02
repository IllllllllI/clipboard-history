import React, { useEffect, useState, useRef } from 'react';
import './RadialMenu.css';
import { ClipItem, ClipItemHudSnapshot } from '../../types';

interface RadialMenuProps {
  snapshot: ClipItemHudSnapshot;
  onActionComplete: (actionId: any) => void;
  onCancel: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ snapshot, onActionComplete, onCancel }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clipItemRef = useRef({ id: snapshot.itemId, favorite: snapshot.isFavorite, pinned: snapshot.isPinned });

  const actionsRef = useRef([
    { id: 'copy', label: '复制', angle: 0, icon: '📋' },
    { id: 'delete', label: '删除', angle: 72, icon: '🗑️' },
    { id: 'pin', label: clipItemRef.current.pinned ? '取消置顶' : '置顶', angle: 144, icon: '📌' },
    { id: 'favorite', label: clipItemRef.current.favorite ? '取消收藏' : '收藏', angle: 216, icon: '⭐' },
    { id: 'paste', label: '粘贴', angle: 288, icon: '📥' },
  ]);
  const actions = actionsRef.current;

  // Sync ref
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // console.log('[RadialMenu] pointermove', e.clientX, e.clientY);
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 30) {
        setActiveIndex(null);
        return;
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
      
      setActiveIndex(nearestIndex);
    };

    const handlePointerUp = async (e: PointerEvent) => {
      // console.log('[RadialMenu] pointerup', activeIndexRef.current);
      if (activeIndexRef.current !== null) {
        const action = actions[activeIndexRef.current];
        await executeAction(action.id, clipItemRef.current);
      } else {
        onCancel();
      }
    };

    const executeAction = async (actionId: string, item: any) => { onActionComplete(actionId); };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('mouseup', handlePointerUp, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('mouseup', handlePointerUp, true);
    };
  }, [actions, onActionComplete, onCancel]);

  return (
    <div className='radial-menu-container' ref={containerRef}>
      <div className='radial-menu-center'></div>
      {actions.map((action, index) => {
        const isActive = activeIndex === index;
        const rad = action.angle * (Math.PI / 180);
        const radius = 90; 
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        
        const classNameStr = isActive ? 'radial-menu-item active' : 'radial-menu-item';

        return (
          <div
            key={action.id}
            className={classNameStr}
            style={{
              transform: 'translate(' + x + 'px, ' + y + 'px) scale(' + (isActive ? 1.2 : 1) + ')'
            }}
          >
            <span className='radial-menu-icon'>{action.icon}</span>
            <span className='radial-menu-label'>{action.label}</span>
          </div>
        );
      })}
    </div>
  );
};





