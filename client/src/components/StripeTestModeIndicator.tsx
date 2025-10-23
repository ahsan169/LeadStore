import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StripeTestModeIndicator() {
  const [isTestMode, setIsTestMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if we're using Stripe test keys
    const publicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (publicKey && publicKey.startsWith("pk_test_")) {
      setIsTestMode(true);
      // Check if user has dismissed the indicator before
      const dismissed = localStorage.getItem("stripe-test-mode-dismissed");
      if (dismissed === "true") {
        setIsExpanded(false);
      }
    }
  }, []);

  if (!isTestMode || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("stripe-test-mode-dismissed", "true");
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  if (!isExpanded) {
    // Minimized floating indicator
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 cursor-pointer animate-fade-in"
        onClick={toggleExpanded}
      >
        <Badge 
          className="bg-yellow-500 text-yellow-950 hover:bg-yellow-400 shadow-lg px-3 py-2 flex items-center gap-2"
          data-testid="badge-test-mode-minimized"
        >
          <AlertTriangle className="w-4 h-4" />
          TEST MODE
        </Badge>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-slide-up" data-testid="alert-test-mode">
      <Alert className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                <span>Stripe Test Mode</span>
                <Badge className="bg-yellow-500 text-yellow-950 text-xs">SANDBOX</Badge>
              </h4>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={toggleExpanded}
                  data-testid="button-minimize"
                >
                  <Info className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={handleDismiss}
                  data-testid="button-dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <AlertDescription className="text-yellow-800 dark:text-yellow-200 space-y-3">
              <p className="text-sm">
                This application is running in test mode. No real payments will be processed.
              </p>
              
              <div className="bg-white dark:bg-gray-900 rounded-md p-3 border border-yellow-300 dark:border-yellow-700">
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Test Card Details:
                </p>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Card Number:</span>
                    <span className="font-semibold select-all">4242 4242 4242 4242</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Expiry:</span>
                    <span className="font-semibold">Any future date</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">CVC:</span>
                    <span className="font-semibold">Any 3 digits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">ZIP:</span>
                    <span className="font-semibold">Any 5 digits</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-yellow-700 dark:text-yellow-300 italic">
                Click the minimize button to hide details or dismiss to remove this notice.
              </p>
            </AlertDescription>
          </div>
        </div>
      </Alert>
    </div>
  );
}