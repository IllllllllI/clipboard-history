import React, { useCallback, useMemo, useRef } from 'react';
import { ClipItem } from '../../types';
import { ClipItemComponent } from '../ClipItem';
import {
  ROW_MOVE_ANIMATION_DURATION_MS,
  ROW_MOVE_ANIMATION_EASING,
  ROW_POSITION_CACHE_MAX_ENTRIES,
  ROW_POSITION_CACHE_TTL_MS,
} from './constants';

// ─── 位置缓存（独立于 React，零渲染开销） ──────────────────────────────────

interface RowEntry {
  start: number;
  lastSeenAt: number;
}

/**
 * LRU 式行位置缓存。
 *
 * 改进（相比原散落式 Map）：
 * - 更新 `lastSeenAt` 直接修改 entry 对象，不重建
 * - 淘汰逻辑集中在 `prune()` 内，throttle + 批量删除
 * - 封装为 class，模块顶层无散落变量
 */
class RowPositionCache {
  private map = new Map<number, RowEntry>();
  private lastPruneAt = 0;
  private static PRUNE_THROTTLE_MS = 2000;

  get(id: number): number | undefined {
    const entry = this.map.get(id);
    if (!entry) return undefined;
    entry.lastSeenAt = Date.now();
    // 重新插入保持 LRU 顺序
    this.map.delete(id);
    this.map.set(id, entry);
    return entry.start;
  }

  set(id: number, start: number): void {
    const existing = this.map.get(id);
    if (existing) {
      existing.start = start;
      existing.lastSeenAt = Date.now();
      // 刷新插入顺序
      this.map.delete(id);
      this.map.set(id, existing);
    } else {
      this.map.set(id, { start, lastSeenAt: Date.now() });
    }
    this.prune();
  }

  private prune(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < RowPositionCache.PRUNE_THROTTLE_MS) return;
    this.lastPruneAt = now;

    // TTL 淘汰
    for (const [id, entry] of this.map) {
      if (now - entry.lastSeenAt > ROW_POSITION_CACHE_TTL_MS) {
        this.map.delete(id);
      }
    }
    // 容量淘汰（删除最旧的超限条目）
    if (this.map.size > ROW_POSITION_CACHE_MAX_ENTRIES) {
      const excess = this.map.size - ROW_POSITION_CACHE_MAX_ENTRIES;
      const iter = this.map.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key !== undefined) this.map.delete(key);
      }
    }
  }
}

const positionCache = new RowPositionCache();

// ─── 组件 ────────────────────────────────────────────────────────────────────

interface VirtualizedClipRowProps {
  item: ClipItem;
  index: number;
  start: number;
  /** 是否为当前选中项 */
  isSelected: boolean;
  /** 是否为最近复制项 */
  isCopied: boolean;
  /** 当前搜索关键词 */
  searchQuery: string;
  onMeasure: (element: HTMLDivElement | null) => void;
}

/**
 * 虚拟列表单行定位壳。
 *
 * 改进（相比原 useState + useLayoutEffect 方案）：
 * - **零额外渲染**：FLIP 动画通过 DOM 直写实现，不触发 setState
 * - **style 稳定**：useMemo 缓存 style 对象，roundedStart 不变时引用不变
 * - **ref 合并**：单个 callback ref 同时完成 DOM 测量 + 动画驱动
 */
export const VirtualizedClipRow = React.memo(function VirtualizedClipRow({
  item,
  index,
  start,
  isSelected,
  isCopied,
  searchQuery,
  onMeasure,
}: VirtualizedClipRowProps) {
  const roundedStart = Math.round(start);
  const elRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  // 合并 ref：测量 + FLIP 动画 ─────────────────────────────────────────────
  const callbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      elRef.current = node;
      onMeasure(node);

      if (!node) {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
        return;
      }

      // 首次挂载：尝试 FLIP（从缓存旧位 → 当前位）
      const prev = positionCache.get(item.id);
      if (prev !== undefined && prev !== roundedStart) {
        node.style.transform = `translateY(${prev}px)`;
        rafRef.current = requestAnimationFrame(() => {
          node.style.transform = `translateY(${roundedStart}px)`;
          rafRef.current = 0;
        });
      } else {
        node.style.transform = `translateY(${roundedStart}px)`;
      }
      positionCache.set(item.id, roundedStart);
    },
    // item.id + roundedStart 变化时重新执行
    [item.id, roundedStart, onMeasure],
  );

  // style 对象缓存 ─────────────────────────────────────────────────────────
  const rowStyle = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    // transform 由 callbackRef / 后续 effect 直写，此处提供初值
    transform: `translateY(${roundedStart}px)`,
    transition: `transform ${ROW_MOVE_ANIMATION_DURATION_MS}ms ${ROW_MOVE_ANIMATION_EASING}`,
  }), [roundedStart]);

  return (
    <div ref={callbackRef} data-index={index} style={rowStyle}>
      <ClipItemComponent
        item={item}
        index={index}
        isSelected={isSelected}
        isCopied={isCopied}
        searchQuery={searchQuery}
      />
    </div>
  );
});
