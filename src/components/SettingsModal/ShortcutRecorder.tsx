import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { ShortcutRecorderProps } from './types';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

function normalizeKeyName(key: string): string | null {
  if (!key || key === 'Dead' || key === 'Process') return null;
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();

  const lower = key.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'return') return 'Enter';
  if (lower === 'spacebar') return 'Space';
  if (lower === 'up') return 'ArrowUp';
  if (lower === 'down') return 'ArrowDown';
  if (lower === 'left') return 'ArrowLeft';
  if (lower === 'right') return 'ArrowRight';
  return key;
}

function normalizeCodeName(code: string): string | null {
  if (!code) return null;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backslash') return '\\';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Slash') return '/';
  if (code.startsWith('Numpad') && code.length > 6) return code;
  return null;
}

function formatShortcutFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const keyName = normalizeCodeName(e.code) ?? normalizeKeyName(e.key);
  if (!keyName) return null;
  parts.push(keyName);

  return parts.join('+');
}

export const ShortcutRecorder = React.memo(function ShortcutRecorder({
  dark,
  value,
  onChange,
  error,
  isRegistering,
  validateRegistration,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clearOnFocusRef = useRef(false);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CLEAR_DURATION_MS = 150;
  const shouldWaitValidation = !!validateRegistration;

  const cancelPendingClear = useCallback(() => {
    if (!clearTimeoutRef.current) return;
    clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = null;
    setIsClearing(false);
  }, []);

  const clearValueWithFade = useCallback(() => {
    cancelPendingClear();

    if (!value) {
      onChange('');
      setIsClearing(false);
      return;
    }

    setIsClearing(true);
    clearTimeoutRef.current = setTimeout(() => {
      onChange('');
      setIsClearing(false);
      clearTimeoutRef.current = null;
    }, CLEAR_DURATION_MS);
  }, [cancelPendingClear, onChange, value]);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingShortcut || !shouldWaitValidation) return;
    if (isRegistering) return;

    if (error) {
      setPendingShortcut(null);
      return;
    }

    if (value === pendingShortcut) {
      setPendingShortcut(null);
      setIsRecording(false);
      containerRef.current?.blur();
      return;
    }

    setPendingShortcut(null);
  }, [error, isRegistering, pendingShortcut, shouldWaitValidation, value]);

  const handleRecordingKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Tab') return;
    e.preventDefault();

    if (isClearing) {
      cancelPendingClear();
    }

    if (e.key === 'Escape') {
      setIsRecording(false);
      setRecordingHint(null);
      containerRef.current?.blur();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      clearValueWithFade();
      return;
    }

    const shortcut = formatShortcutFromEvent(e);
    if (!shortcut) {
      setRecordingHint('请按下“修饰键 + 其他键”的组合，例如 Alt+Z');
      return;
    }

    setRecordingHint(null);
    onChange(shortcut);
    if (shouldWaitValidation) {
      setPendingShortcut(shortcut);
      return;
    }

    setIsRecording(false);
    containerRef.current?.blur();
  }, [cancelPendingClear, clearValueWithFade, isClearing, onChange, shouldWaitValidation]);

  useEffect(() => {
    if (!isRecording) return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      handleRecordingKeyDown(e);
      e.stopPropagation();
    };

    window.addEventListener('keydown', onWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown, true);
    };
  }, [handleRecordingKeyDown, isRecording]);

  const keys = value ? value.split('+') : [];
  const recorderState = isRecording ? 'recording' : error ? 'error' : 'idle';

  return (
    <div className="sm-shortcut-recorder">
      <div
        ref={containerRef}
        data-sm-shortcut-recorder="true"
        tabIndex={0}
        onPointerDown={(e) => {
          clearOnFocusRef.current = true;
          e.currentTarget.focus();
        }}
        onFocus={() => {
          setIsRecording(true);
          setRecordingHint(null);
          if (clearOnFocusRef.current && value) clearValueWithFade();
          clearOnFocusRef.current = false;
        }}
        onBlur={() => {
          setIsRecording(false);
          setRecordingHint(null);
        }}
        className="sm-shortcut-recorder__box"
        data-state={recorderState}
        data-theme={dark ? 'dark' : 'light'}
      >
        <motion.div
          className="sm-shortcut-recorder__main"
          animate={isClearing ? { opacity: 0, y: -2, scale: 0.99 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: CLEAR_DURATION_MS / 1000, ease: 'easeOut' }}
        >
          {isRecording && !value ? (
            <span
              className="sm-shortcut-recorder__placeholder"
              data-state="recording"
              data-pulsing="true"
              data-theme={dark ? 'dark' : 'light'}
            >
              请按下组合键...
            </span>
          ) : keys.length > 0 ? (
            keys.map((k, i) => (
              <React.Fragment key={i}>
                <kbd
                  className="sm-shortcut-recorder__key"
                  data-theme={dark ? 'dark' : 'light'}
                  data-recording={isRecording ? 'true' : 'false'}
                >
                  {k}
                </kbd>
                {i < keys.length - 1 && <span className="sm-shortcut-recorder__plus">+</span>}
              </React.Fragment>
            ))
          ) : (
            <span className="sm-shortcut-recorder__placeholder" data-state="idle" data-theme={dark ? 'dark' : 'light'}>
              点击设置快捷键
            </span>
          )}
        </motion.div>

        <div className="sm-shortcut-recorder__side">
          {isRecording && (
            <span className="sm-shortcut-recorder__recording" title="正在录制">
              <span className="sm-shortcut-recorder__recording-ping" data-state={isRegistering ? 'registering' : 'ready'}></span>
              <span className="sm-shortcut-recorder__recording-dot" data-state={isRegistering ? 'registering' : 'ready'}></span>
            </span>
          )}
          {!isRecording && value && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearValueWithFade();
              }}
              className="sm-shortcut-recorder__clear-btn"
              data-theme={dark ? 'dark' : 'light'}
              title="清除快捷键"
            >
              <X className="sm-shortcut-recorder__clear-icon" />
            </button>
          )}
        </div>
      </div>
      <motion.p
        className="sm-shortcut-recorder__hint"
        data-state={error ? 'error' : isRecording ? 'recording' : 'idle'}
        animate={isClearing ? { opacity: 0, y: -2 } : { opacity: 1, y: 0 }}
        transition={{
          duration: CLEAR_DURATION_MS / 1000,
          ease: 'easeOut',
          delay: isClearing ? 0 : 0.1,
        }}
      >
        {error
          ? error
          : isRecording && isRegistering
            ? '正在验证按键可用性，请稍候...'
            : isRecording && recordingHint
              ? recordingHint
              : isRecording
                ? '正在录制：请直接按下目标组合键 (按 Esc 取消)'
                : '点击上方区域后按组合键，或点击右侧 × 清空'}
      </motion.p>
    </div>
  );
});
