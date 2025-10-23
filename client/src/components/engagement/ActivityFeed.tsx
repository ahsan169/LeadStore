import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimedPopup } from '@/hooks/use-engagement';
import { Package, Download, TrendingUp, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  message: string;
  time: string;
  type: 'purchase' | 'download' | 'batch' | 'user';
}

const mockActivities: Activity[] = [
  {
    id: '1',
    icon: Package,
    message: 'A buyer from New York just purchased 200 Platinum leads',
    time: '2 minutes ago',
    type: 'purchase',
  },
  {
    id: '2',
    icon: Download,
    message: 'Sarah M. downloaded her Diamond package',
    time: '5 minutes ago',
    type: 'download',
  },
  {
    id: '3',
    icon: TrendingUp,
    message: '3 new lead batches added today',
    time: '1 hour ago',
    type: 'batch',
  },
  {
    id: '4',
    icon: Users,
    message: 'Michael from Texas upgraded to Elite tier',
    time: '15 minutes ago',
    type: 'user',
  },
  {
    id: '5',
    icon: Package,
    message: 'Jennifer K. purchased 500 Diamond leads',
    time: '8 minutes ago',
    type: 'purchase',
  },
  {
    id: '6',
    icon: Download,
    message: 'Corporate buyer downloaded bulk Gold package',
    time: '12 minutes ago',
    type: 'download',
  },
  {
    id: '7',
    icon: TrendingUp,
    message: '127 Diamond leads remaining this week',
    time: 'Just now',
    type: 'batch',
  },
];

export function ActivityFeed() {
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);
  
  // Show activity every 45-90 seconds
  const shouldShow = useTimedPopup({ min: 45000, max: 90000 }, true);

  useEffect(() => {
    if (shouldShow) {
      const activity = mockActivities[activityIndex % mockActivities.length];
      setCurrentActivity(activity);
      setActivityIndex(prev => prev + 1);
      
      // Hide after 5 seconds
      setTimeout(() => {
        setCurrentActivity(null);
      }, 5000);
    }
  }, [shouldShow]);

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'purchase':
        return 'from-primary/90 to-primary/70';
      case 'download':
        return 'from-secondary/90 to-secondary/70';
      case 'batch':
        return 'from-accent/90 to-accent/70';
      case 'user':
        return 'from-primary/80 to-secondary/80';
      default:
        return 'from-muted to-muted/80';
    }
  };

  return (
    <AnimatePresence>
      {currentActivity && (
        <motion.div
          key={currentActivity.id}
          initial={{ x: -400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -400, opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="fixed bottom-6 left-6 z-30 max-w-sm"
        >
          <div className={cn(
            "bg-gradient-to-r p-[1px] rounded-lg shadow-xl",
            getActivityColor(currentActivity.type)
          )}>
            <div className="bg-card/95 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-full bg-gradient-to-br",
                  getActivityColor(currentActivity.type)
                )}>
                  <currentActivity.icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-tight">
                    {currentActivity.message}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{currentActivity.time}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}