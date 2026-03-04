import { useEffect, useRef, useState } from 'react';

interface UseFavoriteVisualStateInput {
  isFavorite: boolean;
  durationMs: number;
}

export function useFavoriteVisualState({ isFavorite, durationMs }: UseFavoriteVisualStateInput) {
  const [showFavoriteBurst, setShowFavoriteBurst] = useState(false);
  const [showFavoriteIcon, setShowFavoriteIcon] = useState(isFavorite);
  const previousFavoriteRef = useRef(isFavorite);
  const favoriteBurstTimerRef = useRef<number | null>(null);

  const clearFavoriteBurstTimer = () => {
    if (favoriteBurstTimerRef.current === null) return;
    window.clearTimeout(favoriteBurstTimerRef.current);
    favoriteBurstTimerRef.current = null;
  };

  useEffect(() => {
    const wasFavorite = previousFavoriteRef.current;

    if (!wasFavorite && isFavorite) {
      setShowFavoriteIcon(false);
      setShowFavoriteBurst(true);

      clearFavoriteBurstTimer();

      favoriteBurstTimerRef.current = window.setTimeout(() => {
        setShowFavoriteBurst(false);
        setShowFavoriteIcon(true);
        favoriteBurstTimerRef.current = null;
      }, durationMs);

      previousFavoriteRef.current = isFavorite;
      return;
    }

    if (wasFavorite && !isFavorite) {
      clearFavoriteBurstTimer();

      setShowFavoriteBurst(false);
      setShowFavoriteIcon(false);
    }

    previousFavoriteRef.current = isFavorite;
  }, [durationMs, isFavorite]);

  useEffect(() => {
    return () => {
      clearFavoriteBurstTimer();
    };
  }, []);

  return {
    showFavoriteBurst,
    showFavoriteIcon,
  };
}
