import React from 'react';
import { Check } from 'lucide-react';
import { TAG_COLORS } from './constants';

interface ColorPickerProps {
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
  dark: boolean;
}

export const ColorPicker = React.memo(function ColorPicker({
  selectedColor,
  onSelect,
  dark,
}: ColorPickerProps) {
  return (
    <div className="grid grid-cols-10 gap-2 p-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center"
          title="默认颜色"
        >
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${dark ? 'bg-neutral-700 border-neutral-600' : 'bg-neutral-200 border-neutral-300'}`}>
            {selectedColor === null && <Check className="w-3 h-3 text-neutral-500" />}
          </div>
        </button>
        {selectedColor === null && (
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500" />
        )}
      </div>

      {TAG_COLORS.map((color) => (
        <div key={color} className="relative">
          <button
            type="button"
            onClick={() => onSelect(color)}
            className="relative z-10 w-7 h-7 flex items-center justify-center"
          >
            <div
              className="w-5 h-5 rounded-full shadow-sm flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              {selectedColor === color && <Check className="w-3 h-3 text-white drop-shadow-md" strokeWidth={3} />}
            </div>
          </button>
          {selectedColor === color && (
            <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: color }} />
          )}
        </div>
      ))}
    </div>
  );
});
