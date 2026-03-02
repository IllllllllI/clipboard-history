import React, { useEffect, useState, useRef } from 'react';
import './RadialMenu.css';
import { ClipItem, ClipItemHudSnapshot } from '../../types';
import { performActionOnClipItem } from '../../utils/hudActions';

interface RadialMenuProps {
  snapshot: ClipItemHudSnapshot;
  onActionComplete: () => void;
  onCancel: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ snapshot, onActionComplete, onCancel }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clipItem = { id: snapshot.itemId, favorite: snapshot.isFavorite, pinned: snapshot.isPinned };

  const actions = [
    { id: 'copy', label: '复制', angle: 0, icon: '📋' },
    { id: 'delete', label: '删除', angle: 72, icon: '🗑️' },
    { id: 'pin', label: clipItem.pinned ? '取消置顶' : '置顶', angle: 144, icon: '📌' },
    { id: 'favorite', label: clipItem.favorite ? '取消收藏' : '收藏', angle: 216, icon: '⭐' },
    { id: 'paste', label: '粘贴', angle: 288, icon: '📥' },
  ];

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
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
      if (activeIndex !== null) {
        const action = actions[activeIndex];
        await executeAction(action.id, clipItem);
      } else {
        onCancel();
      }
    };

    const executeAction = async (actionId: string, item: any) => {
      try {
        await performActionOnClipItem(actionId, item);
        onActionComplete();
      } catch (err) {
        console.error('Failed to execute radial action:', err);
        onCancel();
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeIndex, clipItem, actions, onActionComplete, onCancel]);

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





