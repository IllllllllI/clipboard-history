import { motion, AnimatePresence } from 'motion/react';
import './styles/color-picker.css';

// TODO: 后续接入真实历史记录持久化
const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#64748B', '#000000',
];

interface HistoryColorsProps {
  visible: boolean;
  onSelect: (color: string) => void;
}

/** 预设 / 历史颜色面板（带展开动画） */
export function HistoryColors({ visible, onSelect }: HistoryColorsProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="clip-item-color-picker-history-wrap"
        >
          <div className="clip-item-color-picker-history-grid">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(c);
                }}
                className="clip-item-color-picker-history-swatch"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
