import { ReactNode, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface InteractiveTooltipProps {
  content: string | ReactNode;
  children?: ReactNode;
  variant?: 'help' | 'info' | 'custom';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  iconClassName?: string;
  delay?: number;
}

export function InteractiveTooltip({ 
  content, 
  children,
  variant = 'help',
  side = 'top',
  className,
  iconClassName,
  delay = 200,
}: InteractiveTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const Icon = variant === 'help' ? HelpCircle : Info;

  return (
    <TooltipProvider delayDuration={delay}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          {children || (
            <motion.button
              className={cn(
                "inline-flex items-center justify-center rounded-full p-0.5",
                "hover:bg-muted/50 transition-colors",
                className
              )}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className={cn("w-4 h-4 text-muted-foreground", iconClassName)} />
            </motion.button>
          )}
        </TooltipTrigger>
        <TooltipContent 
          side={side}
          className="max-w-xs bg-card/95 backdrop-blur-sm border-primary/20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-sm"
          >
            {content}
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DiscoveryTooltipProps {
  title: string;
  description: string;
  children: ReactNode;
  badge?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function DiscoveryTooltip({ 
  title, 
  description, 
  children, 
  badge,
  side = 'top' 
}: DiscoveryTooltipProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side={side}
          className="p-0 bg-card/98 backdrop-blur-sm border-primary/20 overflow-hidden max-w-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4"
          >
            {badge && (
              <div className="mb-2">
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 text-primary">
                  {badge}
                </span>
              </div>
            )}
            <h4 className="font-semibold mb-1">{title}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}