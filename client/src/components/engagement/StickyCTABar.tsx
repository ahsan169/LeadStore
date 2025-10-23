import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Sparkles, Clock } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

export function StickyCTABar() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 200px
      if (window.scrollY > 200 && !isDismissed) {
        setIsVisible(true);
      } else if (window.scrollY <= 200) {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial position

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: -100 }}
          transition={{ type: "spring", damping: 20 }}
          className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary via-secondary to-accent p-[1px]"
        >
          <div className="bg-background/95 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  {/* Desktop content */}
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="relative">
                      <Sparkles className="w-5 h-5 text-accent animate-pulse" />
                      <div className="absolute inset-0 bg-accent/30 blur-xl" />
                    </div>
                    <span className="text-sm sm:text-base font-medium">
                      <span className="text-primary">Limited Time:</span>{' '}
                      <span className="text-gradient font-semibold">Get 20% Off</span>{' '}
                      Your First Purchase
                    </span>
                    <div className="flex items-center gap-1 text-xs bg-accent/10 text-accent px-2 py-1 rounded-full">
                      <Clock className="w-3 h-3" />
                      <span>Ends Soon</span>
                    </div>
                  </div>

                  {/* Mobile content */}
                  <div className="sm:hidden flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium">
                      <span className="text-gradient">20% Off</span> First Order
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setLocation('/pricing')}
                    className="whitespace-nowrap"
                    data-testid="button-sticky-cta"
                  >
                    <span className="hidden sm:inline">Claim Discount</span>
                    <span className="sm:hidden">Claim</span>
                  </Button>
                  <button
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-muted/50 rounded-md transition-colors"
                    data-testid="button-sticky-dismiss"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}