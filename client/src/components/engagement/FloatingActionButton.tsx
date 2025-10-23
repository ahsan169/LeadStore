import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Calculator, MessageSquare, Calendar, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickQuoteCalculator } from '@/components/modals/QuickQuoteCalculator';
import { ContactModal } from '@/components/modals/ContactModal';
import { ScheduleDemoModal } from '@/components/modals/ScheduleDemoModal';

interface FabOption {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  color?: string;
}

export function FloatingActionButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  
  // Modal states
  const [showCalculator, setShowCalculator] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    // Show FAB after a short delay
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    // Start pulsing animation every 10 seconds
    const pulseInterval = setInterval(() => {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 1000);
    }, 10000);

    return () => {
      clearTimeout(showTimer);
      clearInterval(pulseInterval);
    };
  }, []);

  const options: FabOption[] = [
    {
      icon: Calculator,
      label: 'Quick Quote',
      onClick: () => {
        setShowCalculator(true);
        setIsExpanded(false);
      },
      color: 'from-primary/20 to-primary/10',
    },
    {
      icon: MessageSquare,
      label: 'Contact Sales',
      onClick: () => {
        setShowContact(true);
        setIsExpanded(false);
      },
      color: 'from-secondary/20 to-secondary/10',
    },
    {
      icon: Calendar,
      label: 'Schedule Demo',
      onClick: () => {
        setShowDemo(true);
        setIsExpanded(false);
      },
      color: 'from-accent/20 to-accent/10',
    },
  ];

  return (
    <>
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-6 right-6 z-40"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.4 }}
        >
          {/* Expanded menu */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className="absolute bottom-16 right-0 space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ staggerChildren: 0.1 }}
              >
                {options.map((option, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-end gap-2"
                  >
                    <span className="text-sm font-medium bg-card/95 backdrop-blur-sm px-3 py-1 rounded-md shadow-lg whitespace-nowrap">
                      {option.label}
                    </span>
                    <Button
                      size="icon"
                      onClick={option.onClick}
                      className={cn(
                        "h-12 w-12 rounded-full shadow-lg hover-elevate",
                        "bg-gradient-to-br",
                        option.color
                      )}
                      data-testid={`fab-option-${index}`}
                    >
                      <option.icon className="w-5 h-5" />
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main FAB button */}
          <motion.div className="relative">
            {/* Pulse animation */}
            {isPulsing && (
              <motion.div
                className="absolute inset-0 bg-primary rounded-full"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 1 }}
              />
            )}
            
            <Button
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "h-14 w-14 rounded-full shadow-xl",
                "bg-gradient-to-br from-primary to-primary/80",
                "hover:from-primary/90 hover:to-primary/70",
                "transition-all duration-300",
                isExpanded && "rotate-45"
              )}
              data-testid="fab-main"
            >
              {isExpanded ? (
                <X className="w-6 h-6" />
              ) : (
                <>
                  <Zap className="w-6 h-6" />
                  {!isExpanded && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 bg-accent rounded-full animate-pulse" />
                  )}
                </>
              )}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    
    {/* Modals */}
    <QuickQuoteCalculator 
      isOpen={showCalculator} 
      onClose={() => setShowCalculator(false)} 
    />
    <ContactModal 
      isOpen={showContact} 
      onClose={() => setShowContact(false)} 
    />
    <ScheduleDemoModal 
      isOpen={showDemo} 
      onClose={() => setShowDemo(false)} 
    />
    </>
  );
}