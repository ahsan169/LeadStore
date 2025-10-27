import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Star, 
  Leaf, 
  Clock, 
  Hourglass, 
  AlertTriangle,
  TrendingDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FreshnessBadgeProps {
  badge: {
    text: string;
    color: "green" | "yellow" | "orange" | "red";
    pulse: boolean;
    icon?: string;
  } | null;
  className?: string;
}

export function FreshnessBadge({ badge, className }: FreshnessBadgeProps) {
  if (!badge) return null;

  const getIcon = () => {
    switch (badge.icon) {
      case "sparkles":
        return <Sparkles className="w-3 h-3 mr-1" />;
      case "star":
        return <Star className="w-3 h-3 mr-1" />;
      case "leaf":
        return <Leaf className="w-3 h-3 mr-1" />;
      case "clock":
        return <Clock className="w-3 h-3 mr-1" />;
      case "hourglass":
        return <Hourglass className="w-3 h-3 mr-1" />;
      case "alert-triangle":
        return <AlertTriangle className="w-3 h-3 mr-1" />;
      default:
        return null;
    }
  };

  const getVariant = () => {
    switch (badge.color) {
      case "green":
        return "success";
      case "yellow":
        return "warning";
      case "orange":
        return "warning";
      case "red":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getColorClasses = () => {
    switch (badge.color) {
      case "green":
        return "bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400";
      case "yellow":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:bg-yellow-500/20 dark:text-yellow-400";
      case "orange":
        return "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400";
      case "red":
        return "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400";
      default:
        return "";
    }
  };

  const pulseClasses = badge.pulse
    ? "animate-pulse-slow shadow-sm"
    : "";

  return (
    <Badge
      className={cn(
        "flex items-center font-semibold text-xs",
        getColorClasses(),
        pulseClasses,
        className
      )}
      variant="outline"
      data-testid="badge-freshness"
    >
      {getIcon()}
      {badge.text}
    </Badge>
  );
}

interface UrgencyIndicatorProps {
  urgency: {
    level: "critical" | "high" | "medium" | "low";
    message: string;
    discount?: number;
  };
  className?: string;
}

export function UrgencyIndicator({ urgency, className }: UrgencyIndicatorProps) {
  const getColorClasses = () => {
    switch (urgency.level) {
      case "critical":
        return "text-red-600 dark:text-red-400";
      case "high":
        return "text-orange-600 dark:text-orange-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-green-600 dark:text-green-400";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span 
        className={cn("text-sm font-medium", getColorClasses())}
        data-testid="text-urgency-message"
      >
        {urgency.message}
      </span>
      {urgency.discount && (
        <Badge 
          variant="destructive" 
          className="text-xs px-1.5 py-0.5"
          data-testid="badge-discount"
        >
          <TrendingDown className="w-3 h-3 mr-0.5" />
          {urgency.discount}% OFF
        </Badge>
      )}
    </div>
  );
}

interface FreshnessInfoProps {
  uploadedAt: Date | string;
  viewCount?: number;
  lastViewedAt?: Date | string | null;
  freshnessScore?: number;
  className?: string;
}

export function FreshnessInfo({ 
  uploadedAt, 
  viewCount = 0, 
  lastViewedAt,
  freshnessScore,
  className 
}: FreshnessInfoProps) {
  const getTimeAgo = (date: Date | string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-4 text-xs text-muted-foreground", className)}>
      <span className="flex items-center gap-1" data-testid="text-uploaded-time">
        <Clock className="w-3 h-3" />
        Uploaded {getTimeAgo(uploadedAt)}
      </span>
      
      {viewCount > 0 && (
        <span className="flex items-center gap-1" data-testid="text-view-count">
          <span className="font-medium">{viewCount}</span> view{viewCount !== 1 ? 's' : ''}
        </span>
      )}
      
      {lastViewedAt && (
        <span className="flex items-center gap-1" data-testid="text-last-viewed">
          Last viewed {getTimeAgo(lastViewedAt)}
        </span>
      )}
      
      {freshnessScore !== undefined && (
        <span 
          className={cn(
            "flex items-center gap-1",
            freshnessScore >= 80 ? "text-green-600 dark:text-green-400" :
            freshnessScore >= 50 ? "text-yellow-600 dark:text-yellow-400" :
            "text-red-600 dark:text-red-400"
          )}
          data-testid="text-freshness-score"
        >
          <span className="font-medium">{freshnessScore}%</span> fresh
        </span>
      )}
    </div>
  );
}