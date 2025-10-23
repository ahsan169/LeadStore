import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Shield, Clock, TrendingUp, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VisitorCounter({ className }: { className?: string }) {
  const [visitors, setVisitors] = useState(147);

  useEffect(() => {
    // Simulate visitor count changes
    const interval = setInterval(() => {
      setVisitors(prev => {
        const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
        return Math.max(100, Math.min(200, prev + change));
      });
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div className="relative">
        <Users className="w-4 h-4 text-primary" />
        <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      </div>
      <span className="text-sm">
        <AnimatePresence mode="wait">
          <motion.span
            key={visitors}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="font-semibold text-primary"
          >
            {visitors}
          </motion.span>
        </AnimatePresence>
        {' '}buyers viewing this page
      </span>
    </div>
  );
}

export function StockIndicator({ 
  tier, 
  remaining,
  className 
}: { 
  tier: string; 
  remaining: number;
  className?: string;
}) {
  const [stock, setStock] = useState(remaining);

  useEffect(() => {
    // Simulate stock depletion
    const interval = setInterval(() => {
      setStock(prev => Math.max(0, prev - Math.floor(Math.random() * 3)));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const urgencyLevel = stock < 50 ? 'high' : stock < 100 ? 'medium' : 'low';
  const urgencyColor = {
    high: 'text-destructive',
    medium: 'text-accent',
    low: 'text-primary',
  }[urgencyLevel];

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <TrendingUp className={cn("w-4 h-4", urgencyColor)} />
      <span className="text-sm">
        Only{' '}
        <span className={cn("font-bold", urgencyColor)}>
          {stock}
        </span>
        {' '}{tier} leads remaining this week
      </span>
    </div>
  );
}

const testimonials = [
  {
    name: "Michael R.",
    company: "Capital Funding Solutions",
    rating: 5,
    text: "Best quality MCA leads we've ever purchased. The AI scoring is incredibly accurate.",
  },
  {
    name: "Sarah K.",
    company: "Fast Business Finance",
    rating: 5,
    text: "Instant delivery and 100% TCPA compliant. Exactly what we needed.",
  },
  {
    name: "David L.",
    company: "Premier Merchant Services",
    rating: 5,
    text: "The human-sourced quality really shows. Conversion rates are through the roof!",
  },
  {
    name: "Jennifer M.",
    company: "Quick Capital Group",
    rating: 5,
    text: "Diamond tier leads are worth every penny. High-quality businesses ready to fund.",
  },
];

export function RotatingTestimonials({ className }: { className?: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn("relative h-32", className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-1 mb-2">
                {[...Array(testimonials[current].rating)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground italic mb-2">
                "{testimonials[current].text}"
              </p>
              <div className="text-xs">
                <span className="font-semibold">{testimonials[current].name}</span>
                {' - '}
                <span className="text-muted-foreground">{testimonials[current].company}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function LastUpdatedIndicator({ className }: { className?: string }) {
  const [minutesAgo, setMinutesAgo] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutesAgo(prev => (prev + 1) % 60);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const getTimeText = () => {
    if (minutesAgo === 0) return 'Just now';
    if (minutesAgo === 1) return '1 minute ago';
    if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
    return `${Math.floor(minutesAgo / 60)} hours ago`;
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Clock className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Fresh leads added{' '}
        <span className="font-medium text-foreground">{getTimeText()}</span>
      </span>
    </div>
  );
}