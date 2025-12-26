import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, HelpCircle, DollarSign, FileText, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuickQuestion {
  icon: React.ComponentType<{ className?: string }>;
  question: string;
  response: string;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuickQuestion | null>(null);

  useEffect(() => {
    // Pulse the green dot every 30 seconds
    const pulseInterval = setInterval(() => {
      if (!isOpen) {
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 2000);
      }
    }, 30000);

    return () => clearInterval(pulseInterval);
  }, [isOpen]);

  const quickQuestions: QuickQuestion[] = [
    {
      icon: DollarSign,
      question: "What's included in each tier?",
      response: "Each tier includes verified funding leads with different quality scores. Gold (60-79), Platinum (70-89), Diamond (80-100), and Elite (85-100) with custom volumes.",
    },
    {
      icon: FileText,
      question: "How are leads delivered?",
      response: "Leads are delivered instantly via secure download link in CSV format. The link remains active for 24 hours after purchase.",
    },
    {
      icon: HelpCircle,
      question: "Are leads TCPA compliant?",
      response: "Yes! All our leads have provided express written consent for funding contact. Full compliance documentation is available.",
    },
    {
      icon: Users,
      question: "Can I get a custom package?",
      response: "Absolutely! Our Elite tier offers custom volumes and quality scores. Contact our sales team for personalized solutions.",
    },
  ];

  return (
    <>
      {/* Chat bubble */}
      <motion.div
        className="fixed bottom-28 right-6 z-30"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 2, type: "spring" }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative p-4 rounded-full shadow-xl",
            "bg-gradient-to-br from-primary to-primary/80",
            "hover:from-primary/90 hover:to-primary/70",
            "transition-all duration-300"
          )}
          data-testid="button-chat-widget"
        >
          <MessageSquare className="w-6 h-6 text-white" />
          
          {/* Online indicator */}
          <div className="absolute top-0 right-0">
            <span className="relative flex h-3 w-3">
              {isPulsing && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              )}
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>

          {/* Status text */}
          {!isOpen && (
            <div className="absolute -left-28 top-1/2 -translate-y-1/2 bg-card/95 backdrop-blur-sm px-3 py-1 rounded-md shadow-lg whitespace-nowrap">
              <span className="text-xs font-medium">Sales Team Online</span>
            </div>
          )}
        </button>
      </motion.div>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="fixed bottom-48 right-6 z-40 w-96 max-w-[calc(100vw-3rem)]"
          >
            <div className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 p-[1px] rounded-lg shadow-2xl">
              <div className="bg-card/98 backdrop-blur-sm rounded-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-full">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Sales Team</h3>
                        <p className="text-xs opacity-90">Online now</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 hover:bg-white/20 rounded-md transition-colors"
                      data-testid="button-chat-close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 max-h-96 overflow-y-auto">
                  {!selectedQuestion ? (
                    <div className="space-y-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm">
                          👋 How can we help you today? Choose a topic below or contact our sales team directly.
                        </p>
                      </div>

                      <div className="space-y-2">
                        {quickQuestions.map((q, index) => (
                          <button
                            key={index}
                            onClick={() => setSelectedQuestion(q)}
                            className="w-full flex items-center gap-3 p-3 text-left rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                            data-testid={`chat-question-${index}`}
                          >
                            <div className="p-2 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full">
                              <q.icon className="w-4 h-4 text-primary" />
                            </div>
                            <span className="text-sm">{q.question}</span>
                          </button>
                        ))}
                      </div>

                      <div className="pt-3 border-t">
                        <Button 
                          className="w-full"
                          onClick={() => window.location.href = 'mailto:sales@landofleads.com'}
                          data-testid="button-chat-contact"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Contact Sales Team
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Selected question */}
                      <div className="bg-primary/10 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <selectedQuestion.icon className="w-4 h-4 text-primary mt-0.5" />
                          <p className="text-sm font-medium">{selectedQuestion.question}</p>
                        </div>
                      </div>

                      {/* Response */}
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm">{selectedQuestion.response}</p>
                      </div>

                      {/* Actions */}
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setSelectedQuestion(null)}
                          data-testid="button-chat-back"
                        >
                          Ask Another Question
                        </Button>
                        <Button
                          className="w-full"
                          onClick={() => window.location.href = 'mailto:sales@landofleads.com'}
                          data-testid="button-chat-email"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Get Personal Help
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}