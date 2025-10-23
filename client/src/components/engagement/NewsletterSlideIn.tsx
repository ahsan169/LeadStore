import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Mail, Gift } from 'lucide-react';
import { useScrollProgress, useLocalStorage, usePageVisibility } from '@/hooks/use-engagement';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

export function NewsletterSlideIn() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const { progress } = useScrollProgress();
  const { timeOnPage } = usePageVisibility();
  const [location] = useLocation();
  const { toast } = useToast();
  
  const [dismissedUntil, setDismissedUntil] = useLocalStorage('newsletterDismissedUntil', 0);
  const [hasSubscribed, setHasSubscribed] = useLocalStorage('newsletterSubscribed', false);

  useEffect(() => {
    // Don't show if already subscribed or recently dismissed
    if (hasSubscribed) return;
    if (Date.now() < dismissedUntil) return;

    // Check conditions to show newsletter
    const shouldShow = () => {
      // On homepage: show after 60% scroll
      if (location === '/' && progress >= 60) {
        return true;
      }
      // On pricing page: show after 20 seconds
      if (location === '/pricing' && timeOnPage >= 20000) {
        return true;
      }
      return false;
    };

    if (shouldShow()) {
      setIsOpen(true);
    }
  }, [progress, timeOnPage, location, dismissedUntil, hasSubscribed]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    toast({
      title: "Welcome to our newsletter!",
      description: "Check your email for weekly MCA reports and 50 free lead samples.",
    });
    
    setHasSubscribed(true);
    setIsOpen(false);
    console.log('Newsletter subscription:', email);
  };

  const handleDismiss = () => {
    // Don't show again for 7 days
    const sevenDaysFromNow = Date.now() + (7 * 24 * 60 * 60 * 1000);
    setDismissedUntil(sevenDaysFromNow);
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="fixed right-6 bottom-24 z-30 w-80"
        >
          <div className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 p-[1px] rounded-lg shadow-2xl">
            <div className="bg-card/95 backdrop-blur-sm rounded-lg p-6 relative">
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute right-2 top-2 p-1 rounded-md hover:bg-muted/50 transition-colors"
                data-testid="button-newsletter-close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gradient">Weekly MCA Reports</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Industry insights + 50 free lead samples
                    </p>
                  </div>
                </div>

                {/* Benefits */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Gift className="w-3 h-3 text-primary" />
                    <span>50 verified lead samples instantly</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="w-3 h-3 text-secondary" />
                    <span>Weekly industry analysis & trends</span>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                    required
                    data-testid="input-newsletter-email"
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    data-testid="button-newsletter-subscribe"
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    Get Free Samples
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground text-center">
                  No spam, unsubscribe anytime
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}