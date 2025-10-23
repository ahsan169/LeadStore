import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  endDate: Date;
  className?: string;
  label?: string;
}

export function CountdownTimer({ endDate, className, label = "Spring Sale Ends In:" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +endDate - +new Date();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    const timer = setInterval(calculateTimeLeft, 1000);
    calculateTimeLeft(); // Initial calculation

    return () => clearInterval(timer);
  }, [endDate]);

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Clock className="w-4 h-4 text-primary" />
        <span>{label}</span>
      </div>
      
      <div className="flex items-center gap-1">
        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 px-2 py-1 rounded">
          <span className="text-lg font-bold text-gradient">{formatNumber(timeLeft.days)}</span>
          <span className="text-xs text-muted-foreground ml-0.5">d</span>
        </div>
        <span className="text-muted-foreground">:</span>
        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 px-2 py-1 rounded">
          <span className="text-lg font-bold text-gradient">{formatNumber(timeLeft.hours)}</span>
          <span className="text-xs text-muted-foreground ml-0.5">h</span>
        </div>
        <span className="text-muted-foreground">:</span>
        <div className="bg-gradient-to-br from-secondary/10 to-accent/10 px-2 py-1 rounded">
          <span className="text-lg font-bold text-gradient">{formatNumber(timeLeft.minutes)}</span>
          <span className="text-xs text-muted-foreground ml-0.5">m</span>
        </div>
        <span className="text-muted-foreground hidden sm:inline">:</span>
        <div className="bg-gradient-to-br from-accent/10 to-primary/10 px-2 py-1 rounded hidden sm:block">
          <span className="text-lg font-bold text-gradient">{formatNumber(timeLeft.seconds)}</span>
          <span className="text-xs text-muted-foreground ml-0.5">s</span>
        </div>
      </div>
    </div>
  );
}