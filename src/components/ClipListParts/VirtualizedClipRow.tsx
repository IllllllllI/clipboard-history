import React from 'react';
import { motion } from 'motion/react';
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
    <motion.div
      ref={onMeasure}
      data-index={index}
      initial={false}
      animate={{ y: start }}
      transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.85 }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        willChange: 'transform',
      }}
    >
      <ClipItemComponent item={item} index={index} />
    </motion.div>
  );
});
