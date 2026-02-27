import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  expandHex,
  hexToRGBA,
  hexToHSLA,
  rgbaToHex,
  hslaToHex,
  type RGBA,
  type HSLA,
} from '../../../utils/colorConvert';

export type ColorMode = 'HEX' | 'RGB' | 'HSL';

export interface ColorState {
  /** 标准化 hex（始终是 source of truth） */
  hex: string;
  /** 当前显示的原始颜色文本（可能是短 hex） */
  displayColor: string;
  rgba: RGBA;
  hsla: HSLA;
  /** HSL 输入的本地 draft（保证滑动不丢精度） */
  hslDraft: HSLA;
  mode: ColorMode;
  isChanged: boolean;

  setMode: (mode: ColorMode) => void;
  cycleMode: () => void;
  setHex: (hex: string) => void;
  setHexFromInput: (raw: string) => void;
  setRgbaChannel: (ch: 'r' | 'g' | 'b' | 'a', value: number) => void;
  setHslaChannel: (ch: 'h' | 's' | 'l' | 'a', value: number) => void;
  /** 拖动取色器时调用（同步 hslDraft） */
  setFromPicker: (color: string) => void;
  /** 点击恢复原色 */
  resetColor: () => void;
}

/**
 * 颜色状态管理 Hook
 *
 * 以 HSLA 作为内部主状态，避免 hex ↔ hsl 往返时的精度丢失。
 * 所有修改最终通过 onColorChange 回调通知父组件。
 */
export function useColorState(
  originalColor: string,
  pickedColor: string | null,
  onColorChange: (color: string) => void,
): ColorState {
  const [mode, setMode] = useState<ColorMode>('HEX');
  const pickerFrameRef = useRef<number | null>(null);
  const pendingPickerColorRef = useRef<string | null>(null);

  const displayColor = pickedColor || originalColor;
  const hex = useMemo(() => expandHex(displayColor), [displayColor]);
  const rgba = useMemo(() => hexToRGBA(hex), [hex]);
  const hsla = useMemo(() => hexToHSLA(hex), [hex]);

  // HSL 本地 draft 状态 + 编辑标记
  const [hslDraft, setHslDraft] = useState<HSLA>(() => hsla);
  const hslEditingRef = useRef(false);

  // 当非 HSL 编辑导致颜色变化时，同步 hslDraft
  useEffect(() => {
    if (hslEditingRef.current) {
      hslEditingRef.current = false;
      return;
    }
    setHslDraft(hsla);
  }, [hsla]);

  useEffect(() => {
    return () => {
      if (pickerFrameRef.current !== null) {
        cancelAnimationFrame(pickerFrameRef.current);
      }
    };
  }, []);

  const isChanged = pickedColor !== null && pickedColor !== originalColor;

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      if (prev === 'HEX') return 'RGB';
      if (prev === 'RGB') return 'HSL';
      return 'HEX';
    });
  }, []);

  const setHexValue = useCallback(
    (newHex: string) => {
      hslEditingRef.current = false;
      onColorChange(newHex);
    },
    [onColorChange],
  );

  const setHexFromInput = useCallback(
    (raw: string) => {
      const hexOnly = raw.replace(/[^0-9A-Fa-f]/g, '').slice(0, 8);
      hslEditingRef.current = false;
      onColorChange(`#${hexOnly}`);
    },
    [onColorChange],
  );

  const setRgbaChannel = useCallback(
    (ch: 'r' | 'g' | 'b' | 'a', value: number) => {
      const newRgba = { ...rgba, [ch]: value };
      hslEditingRef.current = false;
      onColorChange(rgbaToHex(newRgba.r, newRgba.g, newRgba.b, newRgba.a));
    },
    [rgba, onColorChange],
  );

  const setHslaChannel = useCallback(
    (ch: 'h' | 's' | 'l' | 'a', value: number) => {
      hslEditingRef.current = true;
      setHslDraft((prev) => {
        const next: HSLA = { ...prev, [ch]: value };
        // 立即同步到父组件
        const newHex = hslaToHex(next.h, next.s, next.l, next.a);
        onColorChange(newHex);
        return next;
      });
    },
    [onColorChange],
  );

  const setFromPicker = useCallback(
    (color: string) => {
      hslEditingRef.current = false;
      pendingPickerColorRef.current = color;

      if (pickerFrameRef.current !== null) return;

      pickerFrameRef.current = requestAnimationFrame(() => {
        const nextColor = pendingPickerColorRef.current;
        pickerFrameRef.current = null;
        if (!nextColor) return;

        onColorChange(nextColor);
        setHslDraft(hexToHSLA(expandHex(nextColor)));
      });
    },
    [onColorChange],
  );

  const resetColor = useCallback(() => {
    if (isChanged) onColorChange(originalColor);
  }, [isChanged, originalColor, onColorChange]);

  return {
    hex,
    displayColor,
    rgba,
    hsla,
    hslDraft,
    mode,
    isChanged,
    setMode,
    cycleMode,
    setHex: setHexValue,
    setHexFromInput,
    setRgbaChannel,
    setHslaChannel,
    setFromPicker,
    resetColor,
  };
}
