import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { HexAlphaColorPicker } from 'react-colorful';
import { History } from 'lucide-react';
import { usePopoverPosition } from '../../../hooks/usePopoverPosition';
import { useColorState } from './useColorState';
import { ColorPreview } from './ColorPreview';
import { ColorModeSelector } from './ColorModeSelector';
import { ColorInputPanel } from './ColorInputPanel';
import { HistoryColors } from './HistoryColors';
import { ActionBar } from './ActionBar';

// ============================================================================
// Props & Hook: 点击外部关闭
// ============================================================================

function useClickOutside(
  popoverRef: React.RefObject<HTMLElement | null>,
  anchorRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClickOutside: () => void,
) {
  const onClickOutsideRef = useRef(onClickOutside);

  useEffect(() => {
    onClickOutsideRef.current = onClickOutside;
  }, [onClickOutside]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClickOutsideRef.current();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, popoverRef, anchorRef]);
}

// ============================================================================
// 主组件
// ============================================================================

interface ColorPickerPopoverProps {
  originalColor: string;
  pickedColor: string | null;
  darkMode: boolean;
  onColorChange: (color: string) => void;
  onConfirm: (color: string) => void;
  onCopy: (color: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
}

export const ColorPickerPopover = React.memo(function ColorPickerPopover({
  originalColor,
  pickedColor,
  darkMode,
  onColorChange,
  onConfirm,
  onCopy,
  onClose,
  anchorRef,
  isOpen,
}: ColorPickerPopoverProps) {
  const { popoverRef, style } = usePopoverPosition(anchorRef, isOpen);
  const [showHistory, setShowHistory] = useState(false);

  const colorState = useColorState(originalColor, pickedColor, onColorChange);
  const { hex, isChanged, setFromPicker, resetColor, mode, cycleMode, setMode } = colorState;

  // 点击外部：已改色则确认，否则关闭
  useClickOutside(
    popoverRef,
    anchorRef,
    isOpen,
    isChanged ? () => onConfirm(hex) : onClose,
  );

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -8 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        ref={popoverRef}
        style={style}
        className={`z-50 w-[260px] rounded-2xl shadow-xl border flex flex-col overflow-hidden backdrop-blur-md ring-1 ring-white/40 dark:ring-white/5 ${
          darkMode
            ? 'bg-neutral-900/95 border-neutral-700/50 shadow-black/40'
            : 'bg-white/95 border-neutral-200/50 shadow-neutral-300/30'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 取色器 */}
        <div className="p-3 pb-0">
          <div className="rounded-xl overflow-hidden shadow-inner [&_.react-colorful]:!w-full [&_.react-colorful]:!h-[160px] [&_.react-colorful\_\_saturation]:!rounded-t-xl [&_.react-colorful\_\_alpha]:!rounded-b-xl [&_.react-colorful\_\_pointer]:!w-4 [&_.react-colorful\_\_pointer]:!h-4 [&_.react-colorful\_\_pointer]:!shadow-md">
            <HexAlphaColorPicker color={hex} onChange={setFromPicker} />
          </div>
        </div>

        {/* 控制面板 */}
        <div className="p-3 flex flex-col gap-3">
          {/* 预览 + 模式 + 历史 */}
          <div className="flex items-center gap-2">
            <ColorPreview
              originalColor={originalColor}
              currentColor={hex}
              isChanged={isChanged}
              onReset={resetColor}
            />
            <ColorModeSelector mode={mode} onCycle={cycleMode} onSelect={setMode} />

            {/* 历史颜色开关 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHistory((v) => !v);
              }}
              className={`flex-1 flex items-center justify-center h-8 rounded-xl border transition-colors
                bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200/50 dark:border-neutral-600/60
                text-neutral-500 dark:text-neutral-300
                hover:bg-neutral-100 dark:hover:bg-neutral-700/80
                hover:text-neutral-700 dark:hover:text-neutral-100
                ${showHistory ? '!bg-neutral-200 dark:!bg-neutral-800 !text-neutral-800 dark:!text-neutral-200' : ''}`}
              title="历史颜色"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>

          <HistoryColors visible={showHistory} onSelect={onColorChange} />
          <ColorInputPanel state={colorState} />
        </div>

        <ActionBar hex={hex} onConfirm={onConfirm} onCopy={onCopy} />
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
});
