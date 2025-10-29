import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  DollarSign,
  RefreshCw,
  Layers
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UccInfluenceBadgeProps {
  percentageImpact?: number;
  multiplier?: number;
  factors?: {
    debtVelocity?: boolean;
    loanStacking?: boolean;
    refinancingOpportunity?: boolean;
    strongLenderRelationships?: boolean;
    recentFilings?: boolean;
  };
  explanation?: string;
  compact?: boolean;
  className?: string;
}

export default function UccInfluenceBadge({
  percentageImpact = 0,
  multiplier = 1,
  factors = {},
  explanation = "",
  compact = false,
  className,
}: UccInfluenceBadgeProps) {
  // Don't show badge if minimal impact (less than 5%)
  if (Math.abs(percentageImpact) < 5) {
    return null;
  }

  // Determine badge variant and icon based on impact
  const isPositive = multiplier > 1.1;
  const isNegative = multiplier < 0.9;
  const isSignificant = Math.abs(percentageImpact) > 20;

  const getIcon = () => {
    if (factors.loanStacking) return <Layers className="w-3 h-3" />;
    if (factors.refinancingOpportunity) return <RefreshCw className="w-3 h-3" />;
    if (factors.debtVelocity) return <AlertTriangle className="w-3 h-3" />;
    if (factors.strongLenderRelationships) return <DollarSign className="w-3 h-3" />;
    if (factors.recentFilings) return <FileText className="w-3 h-3" />;
    
    if (isPositive) return <TrendingUp className="w-3 h-3" />;
    if (isNegative) return <TrendingDown className="w-3 h-3" />;
    return <FileText className="w-3 h-3" />;
  };

  const getVariant = () => {
    if (isSignificant && isNegative) return "destructive";
    if (isNegative) return "secondary";
    if (isPositive) return "success";
    return "outline";
  };

  const getBadgeColor = () => {
    if (isSignificant && isNegative) return "border-red-500 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300";
    if (isNegative) return "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300";
    if (isPositive) return "border-green-500 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300";
    return "border-gray-500 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300";
  };

  const getTooltipContent = () => {
    const details = [];
    
    details.push(`UCC data ${isPositive ? 'boosted' : isNegative ? 'reduced' : 'influenced'} score by ${Math.abs(percentageImpact).toFixed(1)}%`);
    
    if (factors.loanStacking) {
      details.push("⚠️ Loan stacking pattern detected");
    }
    if (factors.debtVelocity) {
      details.push("⚠️ High debt velocity identified");
    }
    if (factors.refinancingOpportunity) {
      details.push("✅ Refinancing opportunity available");
    }
    if (factors.strongLenderRelationships) {
      details.push("✅ Strong lender relationship found");
    }
    if (factors.recentFilings) {
      details.push("📄 Recent UCC filings provide current insights");
    }

    if (explanation) {
      details.push(explanation);
    }

    return details;
  };

  const tooltipContent = getTooltipContent();
  const badgeContent = compact ? (
    <>
      {getIcon()}
      <span className="ml-1">{percentageImpact > 0 ? '+' : ''}{percentageImpact.toFixed(0)}%</span>
    </>
  ) : (
    <>
      {getIcon()}
      <span className="ml-1">UCC {percentageImpact > 0 ? '+' : ''}{percentageImpact.toFixed(0)}%</span>
    </>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={getVariant() as any}
            className={cn(
              getBadgeColor(),
              "cursor-help transition-all hover:scale-105",
              isSignificant && "animate-pulse",
              className
            )}
            data-testid="badge-ucc-influence"
          >
            {badgeContent}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold">UCC Intelligence Impact</div>
            {tooltipContent.map((detail, index) => (
              <div key={index} className="text-sm">
                {detail}
              </div>
            ))}
            <div className="text-xs text-muted-foreground mt-2">
              Impact Multiplier: {multiplier.toFixed(2)}x
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}