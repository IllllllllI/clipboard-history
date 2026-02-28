import React from 'react';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { TAG_COLORS } from './constants';
import './styles/colorpicker.css';

interface ColorPickerProps {
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
  dark: boolean;
}

interface SwatchButtonProps {
  color: string | null;
  selected: boolean;
  dark: boolean;
  onSelect: (color: string | null) => void;
}

const SwatchButton = React.memo(function SwatchButton({
  color,
  selected,
  dark,
  onSelect,
}: SwatchButtonProps) {
  const isDefault = color === null;

  return (
    <div className="tag-manager-color-swatch-wrapper">
      <motion.button
        type="button"
        onClick={() => onSelect(color)}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        aria-pressed={selected}
        aria-label={isDefault ? '默认颜色' : `颜色 ${color}`}
        title={isDefault ? '默认颜色' : color}
        className="tag-manager-color-swatch-btn"
      >
        <div
          className={`tag-manager-color-swatch-inner ${
            isDefault
              ? 'tag-manager-color-swatch-default'
              : 'tag-manager-color-swatch-color'
          }`}
          data-theme={dark ? 'dark' : 'light'}
          style={isDefault ? undefined : { backgroundColor: color, boxShadow: color ? `0 2px 4px ${color}66` : undefined }}
        >
          {selected && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <Check
                className={isDefault ? 'tag-manager-color-swatch-check-default' : 'tag-manager-color-swatch-check-color'}
                strokeWidth={isDefault ? 2.5 : 3}
              />
            </motion.div>
          )}
        </div>
      </motion.button>
      {selected && (
        <motion.div
          layoutId="color-swatch-ring"
          className="tag-manager-color-swatch-selected-ring"
          style={isDefault ? { borderColor: '#d4d4d4' } : { borderColor: color }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
    </div>
  );
});

export const ColorPicker = React.memo(function ColorPicker({
  selectedColor,
  onSelect,
  dark,
}: ColorPickerProps) {
  return (
    <div className="tag-manager-color-grid">
      <SwatchButton
        color={null}
        selected={selectedColor === null}
        dark={dark}
        onSelect={onSelect}
      />

      {TAG_COLORS.map((color) => (
        <SwatchButton
          key={color}
          color={color}
          selected={selectedColor === color}
          dark={dark}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});
