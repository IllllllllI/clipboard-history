import { RotateCcw } from 'lucide-react';
import './styles/color-picker.css';

/** 棋盘格背景 data URL（用于透明色预览） */
const CHECKER_BG =
  "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/EN6jIigbBvQzOHEtwzB8QIAAAwA1EQQJ/1/zYAAAAABJRU5ErkJggg==')";

interface ColorPreviewProps {
  originalColor: string;
  currentColor: string;
  isChanged: boolean;
  onReset: () => void;
}

/** 颜色预览圆圈：显示当前色 / 原色与当前色对半显示 */
export function ColorPreview({ originalColor, currentColor, isChanged, onReset }: ColorPreviewProps) {
  return (
    <div
      className="clip-item-color-picker-preview"
      style={{ backgroundImage: CHECKER_BG }}
      onClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      title={isChanged ? '点击恢复原始颜色' : '当前颜色'}
    >
      {isChanged ? (
        <>
          <div className="clip-item-color-picker-preview-half-left" style={{ backgroundColor: originalColor }} />
          <div className="clip-item-color-picker-preview-half-right" style={{ backgroundColor: currentColor }} />
          <div className="clip-item-color-picker-preview-reset-mask">
            <RotateCcw className="clip-item-color-picker-preview-reset-icon" />
          </div>
        </>
      ) : (
        <div className="clip-item-color-picker-preview-full" style={{ backgroundColor: currentColor }} />
      )}
    </div>
  );
}
