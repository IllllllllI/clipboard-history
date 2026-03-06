import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon } from 'lucide-react';
import { hexToRgba } from '../../../utils/color';
import { tagPillVariants } from '../../../utils/motionPresets';
import {
  TAG_LIST_ANIMATION_DURATION_MS,
  TAG_LIST_ANIMATION_EASING,
  TAG_LIST_MARGIN_TOP_PX,
  TAG_LIST_OPACITY_DURATION_MS,
  TAG_PILL_SPRING_DAMPING,
  TAG_PILL_SPRING_STIFFNESS,
} from '../../ClipListParts/constants';
import type { ClipItem } from '../../../types';

interface ClipItemTagListProps {
  itemTags: NonNullable<ClipItem['tags']>;
  isRich: boolean;
  imageFormat?: string | null;
  isImage: boolean;
  theme: string;
  darkMode: boolean;
}

/**
 * 标签列表组件——含高度动画与两种布局（图片行 / 非图片行）。
 * 从 ClipItemComponent 中提取，自身管理高度追踪。
 */
export const ClipItemTagList = React.memo(function ClipItemTagList({
  itemTags,
  isRich,
  imageFormat,
  isImage,
  theme,
  darkMode,
}: ClipItemTagListProps) {
  const tagListRef = useRef<HTMLDivElement>(null);
  const [tagListHeight, setTagListHeight] = useState(0);
  const displayTags = React.useMemo(() => {
    const tags = [...itemTags];
    if (isRich) {
      // 插入一个虚拟的「富文本」标签，放在最前面
      tags.unshift({
        id: -1,
        name: '富文本',
        color: '#a855f7', // 继承紫色的原有设定，由 getTagStyle 自动处理明暗度
      } as any);
    }
    if (imageFormat) {
      // 插入一个虚拟的「图片格式」标签
      tags.unshift({
        id: -2,
        name: imageFormat,
        color: '#3b82f6', // 蓝色，代表图片格式
      } as any);
    }
    return tags;
  }, [itemTags, isRich, imageFormat]);

  const hasTags = displayTags.length > 0;

  const getTagStyle = useCallback(
    (color?: string | null) =>
      color
        ? {
            backgroundColor: hexToRgba(color, darkMode ? 0.2 : 0.12),
            color,
            borderColor: hexToRgba(color, darkMode ? 0.4 : 0.28),
          }
        : {},
    [darkMode],
  );

  const renderTagPill = useCallback(
    (tag: NonNullable<ClipItem['tags']>[number]) => (
      <motion.span
        layout
        variants={tagPillVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          type: 'spring',
          stiffness: TAG_PILL_SPRING_STIFFNESS,
          damping: TAG_PILL_SPRING_DAMPING,
        }}
        key={tag.id}
        className="clip-item-tag-pill"
        data-default={!tag.color ? 'true' : 'false'}
        data-theme={theme}
        style={getTagStyle(tag.color)}
      >
        <TagIcon className="clip-item-tag-icon" strokeWidth={2.5} />
        {tag.name}
      </motion.span>
    ),
    [getTagStyle, theme],
  );

  useLayoutEffect(() => {
    if (isImage || !hasTags) {
      setTagListHeight(0);
      return;
    }

    const element = tagListRef.current;
    if (!element) return;

    const syncHeight = () => {
      setTagListHeight(element.scrollHeight);
    };

    const observer = new ResizeObserver(syncHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [isImage, hasTags, displayTags]);

  // 图片行：简单平铺
  if (isImage) {
    return (
      <div
        className="clip-item-tag-list"
        data-has-tags={hasTags ? 'true' : 'false'}
        data-image-slot="true"
      >
        <AnimatePresence>{displayTags.map(renderTagPill)}</AnimatePresence>
      </div>
    );
  }

  // 非图片行：带高度动画的展开/折叠
  return (
    <AnimatePresence initial={false}>
      {hasTags && (
        <motion.div
          key="clip-item-tag-list-shell"
          className="clip-item-tag-list-shell"
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{
            opacity: 1,
            height: tagListHeight,
            marginTop: TAG_LIST_MARGIN_TOP_PX,
          }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{
            opacity: {
              duration: TAG_LIST_OPACITY_DURATION_MS / 1000,
              ease: TAG_LIST_ANIMATION_EASING,
            },
            height: {
              duration: TAG_LIST_ANIMATION_DURATION_MS / 1000,
              ease: TAG_LIST_ANIMATION_EASING,
            },
            marginTop: {
              duration: TAG_LIST_ANIMATION_DURATION_MS / 1000,
              ease: TAG_LIST_ANIMATION_EASING,
            },
          }}
        >
          <div ref={tagListRef} className="clip-item-tag-list" data-has-tags="true">
            <AnimatePresence>{displayTags.map(renderTagPill)}</AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
