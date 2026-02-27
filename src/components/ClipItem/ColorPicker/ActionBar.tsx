import { Check, Copy } from 'lucide-react';

interface ActionBarProps {
  hex: string;
  onConfirm: (color: string) => void;
  onCopy: (color: string) => void;
}

/** 底部操作栏：复制 & 确认 */
export function ActionBar({ hex, onConfirm, onCopy }: ActionBarProps) {
  return (
    <div className="px-3 py-2.5 flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hex);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-colors text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
        title="复制并新增条目"
      >
        <Copy className="w-3.5 h-3.5" /> 复制
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfirm(hex);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-sm shadow-indigo-500/20"
        title="确认并保存当前条目颜色"
      >
        <Check className="w-3.5 h-3.5" /> 确认
      </button>
    </div>
  );
}
