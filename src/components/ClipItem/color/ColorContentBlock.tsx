import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipItem } from '../../../types';
import { normalizeHex } from '../../../utils/colorConvert';
import { ColorPickerPopover } from './ColorPickerPopover';
import { scaleFeedbackVariants, DURATION_FAST } from '../../../utils/motionPresets';

const COPY_FEEDBACK_DURATION_MS = 2000;

interface ColorContentBlockProps {
  item: ClipItem;
  darkMode: boolean;
  onUpdatePickedColor: (id: number, color: string | null) => Promise<void>;
  onCopyAsNewColor: (color: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
}

export const ColorContentBlock = React.memo(function ColorContentBlock({
  item,
  darkMode,
  onUpdatePickedColor,
  onCopyAsNewColor,
  copyText,
}: ColorContentBlockProps) {
  const [localPickedColor, setLocalPickedColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const colorBtnRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalColor = item.text;
  const pickedColor = item.picked_color;

  const clearCopyFeedbackTimer = useCallback(() => {
    if (!copyFeedbackTimerRef.current) return;
    clearTimeout(copyFeedbackTimerRef.current);
    copyFeedbackTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearCopyFeedbackTimer();
    };
  }, [clearCopyFeedbackTimer]);

  const showCopiedFeedback = useCallback((value: string) => {
    setCopiedColor(value);
    clearCopyFeedbackTimer();
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedColor(null);
      copyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }, [clearCopyFeedbackTimer]);

  const handleColorConfirm = useCallback(async (color: string) => {
    setShowColorPicker(false);
    const nextPicked = normalizeHex(color) === normalizeHex(originalColor) ? null : color;
    await onUpdatePickedColor(item.id, nextPicked);
    setLocalPickedColor(null);
  }, [item.id, onUpdatePickedColor, originalColor]);

  const handleColorCopy = useCallback(async (color: string) => {
    await onCopyAsNewColor(color);
  }, [onCopyAsNewColor]);

  const handleColorClose = useCallback(() => {
    setShowColorPicker(false);
    setLocalPickedColor(null);
  }, []);

  const handleCopyColor = useCallback((event: React.MouseEvent, value: string) => {
    event.stopPropagation();
    void copyText(value).then(() => {
      showCopiedFeedback(value);
    });
  }, [copyText, showCopiedFeedback]);

  const renderColorCopyFeedback = useCallback((value: string | null, iconClassName: string) => (
    <AnimatePresence>
      {copiedColor === value && (
        <motion.div
          variants={scaleFeedbackVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={DURATION_FAST}
        >
          <Check className={iconClassName} />
        </motion.div>
      )}
    </AnimatePresence>
  ), [copiedColor]);

  const displayColor = localPickedColor || pickedColor || originalColor;
  const pickerColor = showColorPicker ? localPickedColor : pickedColor;
  const hasPickedDiff = Boolean(pickedColor && normalizeHex(pickedColor) !== normalizeHex(originalColor));

  const openPicker = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!showColorPicker) {
      setLocalPickedColor(pickedColor);
    }
    setShowColorPicker(!showColorPicker);
  }, [pickedColor, showColorPicker]);

  const handleCopyOriginalColor = useCallback((event: React.MouseEvent) => {
    handleCopyColor(event, originalColor);
  }, [handleCopyColor, originalColor]);

  const handleCopyPickedColor = useCallback((event: React.MouseEvent) => {
    if (!pickedColor) return;
    handleCopyColor(event, pickedColor);
  }, [handleCopyColor, pickedColor]);

  return (
    <div className="clip-item-content-color-row">
      {hasPickedDiff ? (
        <>
          <div
            className="clip-item-content-color-chip"
            title={`原始: ${originalColor}`}
          >
            <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: originalColor }} />
          </div>
          <span className="clip-item-content-color-arrow">→</span>
          <div
            ref={colorBtnRef}
            className="clip-item-content-color-chip clip-item-content-color-chip-picked clip-item-content-color-chip-clickable"
            title="点击修改颜色"
            onClick={openPicker}
          >
            <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: displayColor }} />
          </div>
        </>
      ) : (
        <div
          ref={colorBtnRef}
          className="clip-item-content-color-chip clip-item-content-color-chip-clickable"
          title="点击调出颜色板"
          onClick={openPicker}
        >
          <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: originalColor }} />
        </div>
      )}

      <div
        className="clip-item-content-color-text-wrap"
        onClick={handleCopyOriginalColor}
        title="点击复制原始颜色"
      >
        <p className="clip-item-content-color-text">{originalColor}</p>
        {renderColorCopyFeedback(originalColor, 'clip-item-content-copy-check')}
      </div>

      {hasPickedDiff && (
        <div
          className="clip-item-content-color-text-wrap"
          onClick={handleCopyPickedColor}
          title="点击复制新颜色"
        >
          <span className="clip-item-content-color-new">
            → {pickedColor}
          </span>
          {renderColorCopyFeedback(pickedColor, 'clip-item-content-copy-check-small')}
        </div>
      )}

      <ColorPickerPopover
        originalColor={originalColor}
        pickedColor={pickerColor}
        darkMode={darkMode}
        onColorChange={setLocalPickedColor}
        onConfirm={handleColorConfirm}
        onCopy={handleColorCopy}
        onClose={handleColorClose}
        anchorRef={colorBtnRef}
        isOpen={showColorPicker}
      />
    </div>
  );
});
