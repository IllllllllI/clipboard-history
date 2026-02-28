import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Globe, HardDrive, FileCode2, Images, ExternalLink, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipItem, ImageType } from '../../types';
import { decodeFileList, findDateTimesInText, normalizeFilePath } from '../../utils';
import { expandHex } from '../../utils/colorConvert';
import { TauriService } from '../../services/tauri';
import { ImageDisplay } from '../ImageDisplay';
import { FileListDisplay } from '../FileListDisplay';
import { ImagePreview } from './ImagePreview';
import { HighlightText } from './HighlightText';
import { HighlightDateTimeText } from './DateTimeChip';
import { ColorPickerPopover } from './ColorPicker';

/** 标准化 hex 用于比较：展开短 hex、小写、去除不透明 alpha（ff） */
function normalizeHex(hex: string): string {
  const expanded = expandHex(hex).toLowerCase();
  // 去除完全不透明的 alpha 后缀 ff
  if (expanded.length === 9 && expanded.endsWith('ff')) {
    return expanded.slice(0, 7);
  }
  return expanded;
}

interface ClipItemContentProps {
  item: ClipItem;
  type: string;
  isImage: boolean;
  imageType: ImageType;
  imageUrls: string[];
  searchQuery: string;
  showImagePreview: boolean;
  setPreviewImageUrl: (url: string) => void;
  isSelected: boolean;
  darkMode: boolean;
  onUpdatePickedColor: (id: number, color: string | null) => Promise<void>;
  onCopyAsNewColor: (color: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
}

/** 根据内容类型渲染剪贴板条目的正文区域 */
export const ClipItemContent = React.memo(function ClipItemContent({
  item,
  type,
  isImage,
  imageType,
  imageUrls,
  searchQuery,
  showImagePreview,
  setPreviewImageUrl,
  isSelected,
  darkMode,
  onUpdatePickedColor,
  onCopyAsNewColor,
  copyText,
}: ClipItemContentProps) {
  // ⚠ 所有 Hooks 必须在条件分支前调用，确保 React Hooks 调用规则
  // pickedColor 使用数据库持久化的 item.picked_color
  // localPickedColor 仅在调色板打开期间作为临时 draft
  const [localPickedColor, setLocalPickedColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const colorBtnRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const showCopiedFeedback = useCallback((value: string) => {
    setCopiedColor(value);
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedColor(null);
      copyFeedbackTimerRef.current = null;
    }, 2000);
  }, []);

  const handleColorConfirm = useCallback(async (color: string) => {
    setShowColorPicker(false);
    // 不在此处清 localPickedColor，保持显示新色直到 DB 刷新完成

    // 标准化比较：处理短 hex (#f00 vs #ff0000)、大小写、不透明 alpha
    const nextPicked = normalizeHex(color) === normalizeHex(item.text) ? null : color;
    await onUpdatePickedColor(item.id, nextPicked);
    // DB 已更新 + loadHistory 完成，item.picked_color 已是最新值
    setLocalPickedColor(null);
  }, [item.id, item.text, onUpdatePickedColor]);

  const handleColorCopy = useCallback(async (color: string) => {
    await onCopyAsNewColor(color);
  }, [onCopyAsNewColor]);

  const handleColorClose = useCallback(() => {
    setShowColorPicker(false);
    setLocalPickedColor(null);
  }, []);

  const trimmedText = useMemo(() => item.text.trim(), [item.text]);
  const displayText = useMemo(() => item.text.replace(/\n/g, ' ↵ '), [item.text]);
  const dtMatches = useMemo(() => findDateTimesInText(displayText), [displayText]);
  const hasDateTime = dtMatches.length > 0;
  const isUrl = useMemo(() => /^https?:\/\/\S+$/i.test(trimmedText), [trimmedText]);
  const files = useMemo(() => (type === 'files' ? decodeFileList(item.text) : []), [type, item.text]);

  const handleOpenUrl = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const value = trimmedText;

    if (imageType === ImageType.LocalFile) {
      void TauriService.openFile(normalizeFilePath(value));
      return;
    }

    void TauriService.openPath(value);
  }, [imageType, trimmedText]);

  const handleCopyColor = useCallback((e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    void copyText(value).then(() => {
      showCopiedFeedback(value);
    });
  }, [copyText, showCopiedFeedback]);

  // --- 文件列表 ---
  if (type === 'files') {
    return <FileListDisplay files={files} isSelected={isSelected} />;
  }

  // --- 颜色值 ---
  if (type === 'color') {
    // 优先级: 调色板临时 draft > 数据库持久化 > 原始 text
    const displayColor = localPickedColor || item.picked_color || item.text;
    // ColorPickerPopover 使用的 pickedColor：打开期间用 localDraft，关闭后用持久化值
    const pickerColor = showColorPicker ? localPickedColor : item.picked_color;
    // 是否存在不同于原始色的自定义颜色
    const hasPickedDiff = !!(item.picked_color && normalizeHex(item.picked_color) !== normalizeHex(item.text));

    const openPicker = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!showColorPicker) {
        setLocalPickedColor(item.picked_color);
      }
      setShowColorPicker(!showColorPicker);
    };

    return (
      <div className="flex items-center gap-2 mt-1">
        {hasPickedDiff ? (
          <>
            {/* 原始颜色色块 */}
            <div
              className="relative w-5 h-5 rounded-md overflow-hidden border border-black/20 dark:border-white/20 shadow-sm shrink-0"
              title={`原始: ${item.text}`}
            >
              <div className="w-full h-full pointer-events-none" style={{ backgroundColor: item.text }} />
            </div>
            <span className="text-neutral-400 dark:text-neutral-500 text-xs select-none">→</span>
            {/* 调色后色块（可点击打开调色板） */}
            <div
              ref={colorBtnRef}
              className="relative w-5 h-5 rounded-xl overflow-hidden border-2 border-indigo-400/60 dark:border-indigo-500/60 shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform duration-150"
              title="点击修改颜色"
              onClick={openPicker}
            >
              <div className="w-full h-full pointer-events-none" style={{ backgroundColor: displayColor }} />
            </div>
          </>
        ) : (
          /* 仅原始色块（可点击打开调色板） */
          <div
            ref={colorBtnRef}
            className="relative w-5 h-5 rounded-md overflow-hidden border border-black/20 dark:border-white/20 shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform duration-150"
            title="点击调出颜色板"
            onClick={openPicker}
          >
            <div className="w-full h-full pointer-events-none" style={{ backgroundColor: item.text }} />
          </div>
        )}

        {/* 文字：原始色值 + 调色后色值 */}
        <div 
          className="flex items-center gap-1 cursor-pointer group"
          onClick={(e) => handleCopyColor(e, item.text)}
          title="点击复制原始颜色"
        >
          <p className="text-sm truncate font-medium font-mono group-hover:text-indigo-500 transition-colors">
            {item.text}
          </p>
          <AnimatePresence>
            {copiedColor === item.text && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <Check className="w-3.5 h-3.5 text-green-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {hasPickedDiff && (
          <div 
            className="flex items-center gap-1 cursor-pointer group"
            onClick={(e) => {
              if (item.picked_color) {
                handleCopyColor(e, item.picked_color);
              }
            }}
            title="点击复制新颜色"
          >
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono truncate group-hover:text-indigo-500 transition-colors">
              → {item.picked_color}
            </span>
            <AnimatePresence>
              {copiedColor === item.picked_color && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <Check className="w-3 h-3 text-green-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <ColorPickerPopover
          originalColor={item.text}
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
  }

  // --- 图片（预览开启） ---
  if (showImagePreview && isImage) {
    if (type === 'multi-image') {
      return (
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-full">
            {imageUrls.map((url, i) => (
              <ImagePreview key={i} url={url} onClick={() => setPreviewImageUrl(url)} />
            ))}
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <Images className="w-3 h-3" />
            <span>包含 {imageUrls.length} 张图片</span>
          </div>
        </div>
      );
    }

    // 单张图片
    return (
      <div className="w-full flex flex-col gap-1.5">
        <div className="w-full rounded-md hover:border-indigo-500/50 transition-colors">
          <ImageDisplay
            item={item}
            darkMode={darkMode}
            centered
            showLinkInfo={false}
            onClick={(text) => setPreviewImageUrl(text)}
          />
        </div>
        {imageType !== ImageType.Base64 && (
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 truncate">
            {imageType === ImageType.HttpUrl ? (
              <Globe className="w-3 h-3 shrink-0" />
            ) : (
              <HardDrive className="w-3 h-3 shrink-0" />
            )}
            <span
              className="truncate cursor-pointer hover:text-indigo-500 hover:underline transition-colors"
              title={(imageType === ImageType.HttpUrl ? "\u6253\u5f00\u94fe\u63a5: " : "\u6253\u5f00\u6587\u4ef6: ") + item.text}
              onClick={handleOpenUrl}
            >
              {item.text}
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- 图片（无预览模式） ---
  if (isImage) {
    return (
      <p className="text-sm truncate font-medium mt-1 leading-relaxed">
        <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          {imageType === ImageType.HttpUrl ? (
            <Globe className="w-3.5 h-3.5" />
          ) : imageType === ImageType.LocalFile ? (
            <HardDrive className="w-3.5 h-3.5" />
          ) : (
            <FileCode2 className="w-3.5 h-3.5" />
          )}
          {imageType === ImageType.Base64 ? (
            <span className="truncate">[Base64 \u56fe\u7247\u6570\u636e]</span>
          ) : (
            <span
              className="truncate cursor-pointer hover:text-indigo-500 hover:underline transition-colors"
              title={(imageType === ImageType.HttpUrl ? "\u6253\u5f00\u94fe\u63a5: " : "\u6253\u5f00\u6587\u4ef6: ") + item.text}
              onClick={handleOpenUrl}
            >
              {item.text}
            </span>
          )}
        </span>
      </p>
    );
  }

  if (type === 'multi-image') {
    return (
      <p className="text-sm truncate font-medium mt-1 leading-relaxed">
        {`[${imageUrls.length} 张图片]`}
      </p>
    );
  }

  // --- URL 链接 ---
  if (isUrl) {
    return (
      <p className="text-sm truncate font-medium mt-1 leading-relaxed">
        <span
          className="cursor-pointer text-indigo-500 dark:text-indigo-400 hover:underline transition-colors inline-flex items-center gap-1.5"
          title={"打开链接: " + trimmedText}
          onClick={handleOpenUrl}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            <HighlightText text={trimmedText} highlight={searchQuery} />
          </span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
        </span>
      </p>
    );
  }

  // --- 文本（含日期时间检测） ---
  if (hasDateTime) {
    return (
      <p className="text-sm font-medium mt-1 leading-relaxed overflow-visible">
        <HighlightDateTimeText
          text={displayText}
          matches={dtMatches}
          searchQuery={searchQuery}
          isSelected={isSelected}
          darkMode={darkMode}
          copyText={copyText}
        />
      </p>
    );
  }

  // --- 普通文本 ---
  return (
    <p className="text-sm truncate font-medium mt-1 leading-relaxed">
      <HighlightText text={displayText} highlight={searchQuery} />
    </p>
  );
});
