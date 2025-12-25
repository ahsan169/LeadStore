import { useState, useEffect, useRef } from 'react';
import { motion, useInView, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatNumber?: (value: number) => string;
  delay?: number;
}

export function AnimatedCounter({
  value,
  duration = 2,
  prefix = '',
  suffix = '',
  className,
  formatNumber = (val) => val.toLocaleString(),
  delay = 0,
}: AnimatedCounterProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [hasAnimated, setHasAnimated] = useState(false);
  
  const spring = useSpring(0, {
    damping: 30,
    stiffness: 100,
  });
  
  const display = useTransform(spring, (current) =>
    formatNumber(Math.round(current))
  );

  useEffect(() => {
    if (isInView && !hasAnimated) {
      const timer = setTimeout(() => {
        spring.set(value);
        setHasAnimated(true);
      }, delay * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isInView, value, spring, hasAnimated, delay]);

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}

interface AnimatedStatsProps {
  stats: Array<{
    label: string;
    value: number;
    prefix?: string;
    suffix?: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  className?: string;
}

export function AnimatedStats({ stats, className }: AnimatedStatsProps) {
  return (
    <div className="text-[#cc9027]">
      {stats.map((stat, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.1 }}
          className="text-center"
        >
          {stat.icon && (
            <div className="mb-2 flex justify-center">
              <div className="p-2 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </div>
          )}
          <div className="text-3xl font-bold text-gradient">
            <AnimatedCounter
              value={stat.value}
              prefix={stat.prefix}
              suffix={stat.suffix}
              delay={index * 0.1}
            />
          </div>
          <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
}