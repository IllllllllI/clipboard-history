import { useState, useCallback } from 'react';
import { ClipboardDB } from '../services/db';
import { AppStats } from '../types';

export function useStats() {
  const [stats, setStats] = useState<AppStats>({ total: 0, today: 0, pinned: 0, favorites: 0 });

  const updateStats = useCallback(async () => {
    const newStats = await ClipboardDB.getStats();
    setStats(newStats);
  }, []);

  return { stats, updateStats };
}
