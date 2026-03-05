import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Check } from 'lucide-react';

/** 共享的 spring 过渡配置，避免每处重复声明 */
const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface AnimatedCopyIconProps {
  copied: boolean;
}

/**
 * Copy ↔ Check 动画切换图标。
 * 被宫格 FAB、轮播工具栏等多处复用。
 */
export const AnimatedCopyIcon = React.memo(function AnimatedCopyIcon({ copied }: AnimatedCopyIconProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {copied ? (
        <motion.div
          key="copied"
          initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={SPRING}
        >
          <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
        </motion.div>
      ) : (
        <motion.div
          key="copy"
          initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={SPRING}
        >
          <Copy className="img-gallery__icon-12" />
        </motion.div>
      )}
    </AnimatePresence>
  );
});
