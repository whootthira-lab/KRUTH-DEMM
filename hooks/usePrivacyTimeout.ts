import { useEffect, useRef } from 'react';

interface UsePrivacyTimeoutProps {
  onTimeout: () => void;
  isActive: boolean;
}

export function usePrivacyTimeout({ onTimeout, isActive }: UsePrivacyTimeoutProps) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes inactivity limit

  const resetTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (isActive) {
      timeoutRef.current = setTimeout(() => {
        onTimeout();
      }, INACTIVITY_LIMIT);
    }
  };

  useEffect(() => {
    if (!isActive) return;

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    // Reset timer on user activity
    resetTimer();
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Detect tab visibility change (tab switching or browser minimizing)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Lock immediately if user switches tab or hides browser window
        onTimeout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, onTimeout]);
}
