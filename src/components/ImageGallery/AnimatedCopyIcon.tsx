import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import { SPRING_ICON, iconSwapInVariants, iconSwapOutVariants } from '../../utils/motionPresets';

export interface AnimatedCopyIconProps {
  copied: boolean;
  /**
   * 透传给图标的通用类名
   * @default "img-gallery__icon-12"
   */
  className?: string;
  /**
   * 复制成功状态下的附加类名
   * @default "img-gallery__copy-icon-ok"
   */
  activeClassName?: string;
  /**
   * 屏幕阅读器提示文本
   */
  ariaLabel?: string;
}

/**
 * Copy ↔ Check 动画切换图标。
 * 支持高度复用，优化了 layout-shift，并添加了无障碍语义支持。
 */
export const AnimatedCopyIcon = React.memo(function AnimatedCopyIcon({ 
  copied,
  className = "img-gallery__icon-12",
  activeClassName = "img-gallery__copy-icon-ok",
  ariaLabel = "复制"
}: AnimatedCopyIconProps) {
  return (
    <span 
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} 
      role="status" 
      aria-live="polite"
      aria-label={copied ? "已复制" : ariaLabel}
    >
      {/* 
        使用 popLayout 替代 wait 避免退出动画时的占位坍塌导致的抖动，
        提升重排性能体验并产生平滑无缝的交叉过渡 (Cross-fade) 效果。
      */}
      <AnimatePresence mode="popLayout" initial={false}>
        {copied ? (
          <motion.div
            key="copied"
            variants={iconSwapInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING_ICON}
            style={{ display: 'flex' }}
          >
            <Check className={`${className} ${activeClassName}`} aria-hidden="true" />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            variants={iconSwapOutVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING_ICON}
            style={{ display: 'flex' }}
          >
            <Copy className={className} aria-hidden="true" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
});
