import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import { SPRING_ICON, iconSwapInVariants, iconSwapOutVariants } from '../../utils/motionPresets';

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
          variants={iconSwapInVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SPRING_ICON}
        >
          <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
        </motion.div>
      ) : (
        <motion.div
          key="copy"
          variants={iconSwapOutVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SPRING_ICON}
        >
          <Copy className="img-gallery__icon-12" />
        </motion.div>
      )}
    </AnimatePresence>
  );
});
