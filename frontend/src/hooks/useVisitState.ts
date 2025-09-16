import { useCallback, useEffect, useState } from 'react';

/**
 * useVisitState
 * Lightweight client-only hook managing first-visit vs returning-user logic.
 * TODO(auth): Replace with real profile/bootstrap API once identity layer is added.
 */
export interface VisitState {
  isNewUser: boolean;
  acknowledge: () => void;
}

const STORAGE_KEY = 'tsa.hasVisited';

export function useVisitState(): VisitState {
  const [isNewUser, setIsNewUser] = useState(true);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        const flag = window.localStorage.getItem(STORAGE_KEY);
        if (flag === '1') setIsNewUser(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const acknowledge = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        window.localStorage.setItem(STORAGE_KEY, '1');
      }
    } catch {
      /* ignore */
    }
    setIsNewUser(false);
  }, []);

  return { isNewUser, acknowledge };
}
