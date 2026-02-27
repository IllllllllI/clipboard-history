import { RotateCcw } from 'lucide-react';

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
      className="relative w-8 h-8 rounded-full shadow-sm border border-black/10 dark:border-white/10 overflow-hidden shrink-0 cursor-pointer group"
      style={{ backgroundImage: CHECKER_BG }}
      onClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      title={isChanged ? '点击恢复原始颜色' : '当前颜色'}
    >
      {isChanged ? (
        <>
          <div className="absolute inset-y-0 left-0 right-1/2" style={{ backgroundColor: originalColor }} />
          <div className="absolute inset-y-0 left-1/2 right-0" style={{ backgroundColor: currentColor }} />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-[1px]">
            <RotateCcw className="w-3.5 h-3.5 text-white drop-shadow-md" />
          </div>
        </>
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: currentColor }} />
      )}
    </div>
  );
}
