import { useState, useEffect, useCallback, useRef } from 'react';

// Core engagement hooks for managing user behavior and preferences

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStoredValue = useCallback((newValue: T) => {
    try {
      setValue(newValue);
      window.localStorage.setItem(key, JSON.stringify(newValue));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [value, setStoredValue];
}

export function useExitIntent(onExit: () => void, options: { delay?: number; disabled?: boolean } = {}) {
  const { delay = 30000, disabled = false } = options;
  const timeoutRef = useRef<NodeJS.Timeout>();
  const isEligibleRef = useRef(false);

  useEffect(() => {
    if (disabled) return;

    // Wait for delay before making exit intent eligible
    timeoutRef.current = setTimeout(() => {
      isEligibleRef.current = true;
    }, delay);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isEligibleRef.current) return;
      
      // Desktop: Detect when cursor moves toward top of viewport (address bar area)
      if (e.clientY <= 20) {
        onExit();
        isEligibleRef.current = false; // Only trigger once
      }
    };

    const handleMobileScroll = () => {
      if (!isEligibleRef.current) return;

      // Mobile: Detect quick upward scroll (suggesting exit intent)
      const scrollSpeed = window.scrollY;
      if (scrollSpeed < 0 && Math.abs(scrollSpeed) > 50) {
        onExit();
        isEligibleRef.current = false;
      }
    };

    // Desktop exit intent
    document.addEventListener('mousemove', handleMouseMove);
    // Mobile exit intent
    window.addEventListener('touchmove', handleMobileScroll);

    return () => {
      clearTimeout(timeoutRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleMobileScroll);
    };
  }, [onExit, delay, disabled]);
}

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [hasScrolledPast, setHasScrolledPast] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollProgress = (window.scrollY / scrollHeight) * 100;
      setProgress(Math.min(100, Math.max(0, scrollProgress)));

      // Track milestones
      const milestones = [20, 40, 60, 80, 100];
      milestones.forEach(milestone => {
        if (scrollProgress >= milestone && !hasScrolledPast[milestone]) {
          setHasScrolledPast(prev => ({ ...prev, [milestone]: true }));
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasScrolledPast]);

  return { progress, hasScrolledPast };
}

export function usePageVisibility() {
  const [timeOnPage, setTimeOnPage] = useState(0);
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track time on page
    intervalRef.current = setInterval(() => {
      if (!document.hidden) {
        setTimeOnPage(prev => prev + 1000);
      }
    }, 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalRef.current);
    };
  }, []);

  return { timeOnPage, isVisible };
}

export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
      if (entry.isIntersecting && !hasIntersected) {
        setHasIntersected(true);
      }
    }, options);

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref, options, hasIntersected]);

  return { isIntersecting, hasIntersected };
}

// Hook for managing timed pop-ups and notifications
export function useTimedPopup(
  interval: { min: number; max: number },
  enabled: boolean = true
) {
  const [shouldShow, setShouldShow] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const scheduleNext = useCallback(() => {
    if (!enabled) return;
    
    const delay = Math.random() * (interval.max - interval.min) + interval.min;
    timeoutRef.current = setTimeout(() => {
      setShouldShow(true);
      setTimeout(() => {
        setShouldShow(false);
        scheduleNext(); // Schedule next appearance
      }, 5000); // Show for 5 seconds
    }, delay);
  }, [interval.min, interval.max, enabled]);

  useEffect(() => {
    scheduleNext();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [scheduleNext]);

  return shouldShow;
}