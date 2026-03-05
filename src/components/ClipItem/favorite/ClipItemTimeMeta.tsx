import React, { useCallback } from 'react';
import { motion } from 'motion/react';
import { Pin, Star } from 'lucide-react';
import type { DateParts } from '../../../utils/formatDate';
import { FavoriteBurstEffect } from './FavoriteBurstEffect';

const ICON_ACTIVE_ANIMATION = { opacity: 1, scale: 1, y: 0 };
const ICON_INACTIVE_ANIMATION = { opacity: 0, scale: 0.82, y: 1 };
const ICON_TRANSITION = { duration: 0.18, ease: 'easeOut' as const };
const TIME_HINT_TITLE = '点击收藏，Alt+点击置顶（星标=已收藏，图钉=已置顶）';
const TIME_HINT_ARIA_LABEL = '点击收藏，Alt+点击置顶（星标表示已收藏，图钉表示已置顶）';

interface ClipItemTimeMetaProps extends DateParts {
  isPinned: boolean;
  isSelected: boolean;
  showFavoriteIcon: boolean;
  showFavoriteBurst: boolean;
  onTimeClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onTimeKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  favoriteBurstDurationSec: string;
}

export const ClipItemTimeMeta = React.memo(function ClipItemTimeMeta({
  isPinned,
  isSelected,
  showFavoriteIcon,
  showFavoriteBurst,
  dateLine,
  timeLine,
  onTimeClick,
  onTimeKeyDown,
  favoriteBurstDurationSec,
}: ClipItemTimeMetaProps) {
  const stopDoubleClickPropagation = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <div className="clip-item-time-wrap">
      <span className="clip-item-time-pin-slot" aria-hidden="true">
        <motion.span
          className="clip-item-time-pin"
          data-active={isPinned ? 'true' : 'false'}
          initial={false}
          animate={isPinned ? ICON_ACTIVE_ANIMATION : ICON_INACTIVE_ANIMATION}
          transition={ICON_TRANSITION}
        >
          <Pin className="clip-item-time-pin-icon" />
        </motion.span>
      </span>

      <span className="clip-item-time-favorite-slot" aria-hidden="true">
        <motion.span
          className="clip-item-time-favorite"
          data-active={showFavoriteIcon ? 'true' : 'false'}
          initial={false}
          animate={showFavoriteIcon ? ICON_ACTIVE_ANIMATION : ICON_INACTIVE_ANIMATION}
          transition={ICON_TRANSITION}
        >
          <Star className="clip-item-time-favorite-icon" />
        </motion.span>

        {showFavoriteBurst && (
          <FavoriteBurstEffect durationSec={favoriteBurstDurationSec} />
        )}
      </span>

      <button
        type="button"
        className="clip-item-time"
        data-selected={isSelected ? 'true' : 'false'}
        title={TIME_HINT_TITLE}
        aria-label={TIME_HINT_ARIA_LABEL}
        onClick={onTimeClick}
        onKeyDown={onTimeKeyDown}
        onDoubleClick={stopDoubleClickPropagation}
      >
        <span className="clip-item-time-date">{dateLine}</span>
        <span className="clip-item-time-clock">{timeLine}</span>
      </button>
    </div>
  );
});
