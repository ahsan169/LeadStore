import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Sparkles, Clock, Gift } from 'lucide-react';
import { useExitIntent, useLocalStorage, usePageVisibility } from '@/hooks/use-engagement';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

const exitIntentSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export function ExitIntentPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasShownToday, setHasShownToday] = useLocalStorage('exitIntentShown', {
    date: '',
    shown: false,
  });
  const { timeOnPage } = usePageVisibility();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof exitIntentSchema>>({
    resolver: zodResolver(exitIntentSchema),
    defaultValues: {
      email: '',
    },
  });

  // Check if we should show the popup
  const shouldShowPopup = () => {
    const today = new Date().toDateString();
    if (hasShownToday.date === today && hasShownToday.shown) {
      return false; // Already shown today
    }
    if (timeOnPage < 30000) {
      return false; // User hasn't been on site long enough
    }
    return true;
  };

  useExitIntent(
    () => {
      if (shouldShowPopup()) {
        setIsOpen(true);
        const today = new Date().toDateString();
        setHasShownToday({ date: today, shown: true });
      }
    },
    { 
      delay: 30000, // Wait 30 seconds before enabling
      disabled: hasShownToday.shown && hasShownToday.date === new Date().toDateString()
    }
  );

  const handleSubmit = (values: z.infer<typeof exitIntentSchema>) => {
    toast({
      title: "Welcome to Lakefront Leadworks!",
      description: "Check your email for your 20% discount code and free lead samples.",
    });
    setIsOpen(false);
    // In a real app, you'd send this to your email service
    console.log('Exit intent email captured:', values.email);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-md glass-card border-2 border-primary/20 overflow-hidden">
            {/* Gradient border animation */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary via-secondary to-accent opacity-20 blur-xl animate-pulse" />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative"
            >
              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() => setIsOpen(false)}
                data-testid="button-exit-intent-close"
              >
                <X className="h-4 w-4" />
              </Button>

              <DialogHeader className="pb-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-full blur-lg opacity-50 animate-pulse" />
                    <div className="relative bg-gradient-to-br from-primary/10 to-secondary/10 p-4 rounded-full">
                      <Gift className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                </div>
                <DialogTitle className="text-2xl font-bold text-center">
                  <span className="text-gradient">Wait! Don't Leave Empty-Handed</span>
                </DialogTitle>
                <DialogDescription className="text-center mt-2">
                  Get your first lead package at <span className="font-semibold text-primary">20% OFF</span> plus 50 free sample leads!
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Benefit badges */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    <span>Exclusive Discount</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full">
                    <Clock className="w-3 h-3" />
                    <span>Limited Time</span>
                  </div>
                </div>

                {/* Email form */}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Enter your email to claim your discount:</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="email"
                              placeholder="your@email.com" 
                              className="bg-background/50"
                              data-testid="input-exit-intent-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter className="flex-col sm:flex-col gap-2">
                      <Button 
                        type="submit" 
                        className="w-full"
                        data-testid="button-exit-intent-submit"
                      >
                        <Gift className="w-4 h-4 mr-2" />
                        Claim My 20% Discount
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        className="w-full text-xs"
                        onClick={() => setIsOpen(false)}
                        data-testid="button-exit-intent-skip"
                      >
                        No thanks, I'll pay full price
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>

                {/* Trust text */}
                <p className="text-xs text-center text-muted-foreground">
                  No spam, unsubscribe anytime. Your discount code will be sent immediately.
                </p>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}