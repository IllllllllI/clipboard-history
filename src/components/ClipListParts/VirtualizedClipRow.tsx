import React from 'react';
import { ClipItem } from '../../types';
import { ClipItemComponent } from '../ClipItem';

interface VirtualizedClipRowProps {
  item: ClipItem;
  index: number;
  start: number;
  onMeasure: (element: HTMLDivElement | null) => void;
}

export const VirtualizedClipRow = React.memo(function VirtualizedClipRow({
  item,
  index,
  start,
  onMeasure,
}: VirtualizedClipRowProps) {
  return (
    <div
      ref={onMeasure}
      data-index={index}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${start}px)`,
      }}
    >
      <ClipItemComponent item={item} index={index} />
    </div>
  );
});
