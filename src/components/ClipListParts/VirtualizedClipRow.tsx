import React, { useLayoutEffect, useState } from 'react';
import { ClipItem } from '../../types';
import { ClipItemComponent } from '../ClipItem';
import {
  ROW_MOVE_ANIMATION_DURATION_MS,
  ROW_MOVE_ANIMATION_EASING,
  ROW_POSITION_CACHE_MAX_ENTRIES,
  ROW_POSITION_CACHE_TTL_MS,
} from './constants';

interface RowPositionCacheEntry {
  start: number;
  lastSeenAt: number;
}

const previousRowStartMap = new Map<number, RowPositionCacheEntry>();

function pruneRowPositionCache(now: number): void {
  for (const [id, entry] of previousRowStartMap.entries()) {
    if (now - entry.lastSeenAt > ROW_POSITION_CACHE_TTL_MS) {
      previousRowStartMap.delete(id);
    }
  }

  while (previousRowStartMap.size > ROW_POSITION_CACHE_MAX_ENTRIES) {
    const oldestKey = previousRowStartMap.keys().next().value;
    if (oldestKey === undefined) break;
    previousRowStartMap.delete(oldestKey);
  }
}

function getCachedStart(id: number): number | undefined {
  const now = Date.now();
  pruneRowPositionCache(now);

  const entry = previousRowStartMap.get(id);
  if (!entry) return undefined;

  previousRowStartMap.delete(id);
  previousRowStartMap.set(id, { ...entry, lastSeenAt: now });
  return entry.start;
}

function setCachedStart(id: number, start: number): void {
  const now = Date.now();
  pruneRowPositionCache(now);

  if (previousRowStartMap.has(id)) {
    previousRowStartMap.delete(id);
  }

  previousRowStartMap.set(id, { start, lastSeenAt: now });
  pruneRowPositionCache(now);
}

interface VirtualizedClipRowProps {
  item: ClipItem;
  index: number;
  start: number;
  onMeasure: (element: HTMLDivElement | null) => void;
}

export const VirtualizedClipRow = React.memo(function VirtualizedClipRow({
  item,
  index,
  start,
  onMeasure,
}: VirtualizedClipRowProps) {
  const roundedStart = Math.round(start);
  const [animatedY, setAnimatedY] = useState<number>(() => {
    const previous = getCachedStart(item.id);
    return previous ?? roundedStart;
  });

  useLayoutEffect(() => {
    const previous = getCachedStart(item.id);

    if (previous === undefined || previous === roundedStart) {
      setAnimatedY(roundedStart);
      setCachedStart(item.id, roundedStart);
      return;
    }

    setAnimatedY(previous);
    const rafId = requestAnimationFrame(() => {
      setAnimatedY(roundedStart);
      setCachedStart(item.id, roundedStart);
    });

    return () => cancelAnimationFrame(rafId);
  }, [item.id, roundedStart]);

  return (
    <div
      ref={onMeasure}
      data-index={index}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${animatedY}px)`,
        transition: `transform ${ROW_MOVE_ANIMATION_DURATION_MS}ms ${ROW_MOVE_ANIMATION_EASING}`,
      }}
    >
      <ClipItemComponent item={item} index={index} />
    </div>
  );
});
