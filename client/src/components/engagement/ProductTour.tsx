import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, ChevronLeft, ChevronRight, Gift } from 'lucide-react';
import { useLocalStorage } from '@/hooks/use-engagement';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TourStep {
  target: string; // CSS selector or element ID
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const tourSteps: TourStep[] = [
  {
    target: '[data-testid="heading-hero"]',
    title: "Welcome to Land of Leads",
    content: "Your premier source for high-quality, human-sourced MCA leads enhanced with AI intelligence",
    position: 'bottom',
  },
  {
    target: '[data-testid="fab-main"]',
    title: "Quick Access Tools",
    content: "Use our floating action button for instant access to calculators, chat, and demo scheduling",
    position: 'left',
  },
  {
    target: '[data-testid="button-get-started"]',
    title: "Get Started Quickly",
    content: "Click here to view our pricing and choose the perfect lead package for your needs",
    position: 'bottom',
  },
  {
    target: '[data-testid="input-newsletter-email"]',
    title: "Free Lead Samples",
    content: "Subscribe to our newsletter to receive 50 free lead samples and weekly MCA market reports",
    position: 'top',
  },
  {
    target: '[data-testid="link-pricing"]',
    title: "Transparent Pricing",
    content: "View our four-tier pricing system with quality scores from 60-100",
    position: 'bottom',
  },
  {
    target: '[data-testid="link-login"]',
    title: "Your Dashboard",
    content: "Login to access your purchased leads, analytics, and download history",
    position: 'bottom',
  },
];

export function ProductTour({ autoStart = false }: { autoStart?: boolean }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompletedTour, setHasCompletedTour] = useLocalStorage('tourCompleted', false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Auto-start for first-time visitors
    if (autoStart && !hasCompletedTour) {
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [autoStart, hasCompletedTour]);

  useEffect(() => {
    if (isActive && tourSteps[currentStep]) {
      const element = document.querySelector(tourSteps[currentStep].target) as HTMLElement;
      setTargetElement(element);
      
      if (element) {
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add highlight class
        element.classList.add('tour-highlight');
        
        return () => {
          element.classList.remove('tour-highlight');
        };
      }
    }
  }, [isActive, currentStep]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setIsActive(false);
    setCurrentStep(0);
  };

  const completeTour = () => {
    setIsActive(false);
    setCurrentStep(0);
    setHasCompletedTour(true);
    
    toast({
      title: "🎉 Tour completed!",
      description: "Use code WELCOME10 for 10% off your first purchase",
      action: (
        <Button size="sm" variant="outline">
          Copy Code
        </Button>
      ),
    });
  };

  const startTour = () => {
    setIsActive(true);
    setCurrentStep(0);
  };

  const getTooltipPosition = () => {
    if (!targetElement) return { top: '50%', left: '50%' };
    
    const rect = targetElement.getBoundingClientRect();
    const step = tourSteps[currentStep];
    
    switch (step.position) {
      case 'top':
        return {
          top: `${rect.top - 120}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      case 'bottom':
        return {
          top: `${rect.bottom + 20}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      case 'left':
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.left - 320}px`,
          transform: 'translateY(-50%)',
        };
      case 'right':
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.right + 20}px`,
          transform: 'translateY(-50%)',
        };
      default:
        return {
          top: `${rect.bottom + 20}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
    }
  };

  return (
    <>
      {/* Tour trigger button */}
      {!isActive && (
        <Button
          onClick={startTour}
          variant="outline"
          size="sm"
          className="fixed top-20 right-6 z-20"
          data-testid="button-start-tour"
        >
          <Gift className="w-4 h-4 mr-2" />
          Take a Tour
        </Button>
      )}

      {/* Tour overlay and tooltip */}
      <AnimatePresence>
        {isActive && (
          <>
            {/* Overlay with spotlight */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 pointer-events-none"
            >
              <div className="absolute inset-0 bg-black/60" />
              {/* Spotlight disabled due to CSP restrictions */}
            </motion.div>

            {/* Tour tooltip */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-50 w-80 pointer-events-auto"
              style={getTooltipPosition()}
            >
              <div className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 p-[1px] rounded-lg shadow-2xl">
                <div className="bg-card/98 backdrop-blur-sm rounded-lg p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Step {currentStep + 1} of {tourSteps.length}
                    </span>
                    <button
                      onClick={handleSkip}
                      className="p-1 hover:bg-muted/50 rounded-md transition-colors"
                      data-testid="button-tour-skip"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Content */}
                  <h3 className="font-semibold mb-2">{tourSteps[currentStep].title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {tourSteps[currentStep].content}
                  </p>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <Progress value={((currentStep + 1) / tourSteps.length) * 100} className="h-1" />
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePrevious}
                      disabled={currentStep === 0}
                      data-testid="button-tour-previous"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleNext}
                      data-testid="button-tour-next"
                    >
                      {currentStep === tourSteps.length - 1 ? (
                        <>
                          Complete
                          <Gift className="w-4 h-4 ml-1" />
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}