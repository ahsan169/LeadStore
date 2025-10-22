import { Badge } from "@/components/ui/badge";

interface SubscriptionBadgeProps {
  tier: string;
  className?: string;
}

export function SubscriptionBadge({ tier, className }: SubscriptionBadgeProps) {
  const tierConfig = {
    gold: { label: "Gold", className: "bg-yellow-500 text-white" },
    platinum: { label: "Platinum", className: "bg-slate-400 text-white" },
    diamond: { label: "Diamond", className: "bg-blue-500 text-white" },
    elite: { label: "Elite", className: "bg-purple-600 text-white" },
  };

  const config = tierConfig[tier as keyof typeof tierConfig] || tierConfig.gold;

  return (
    <Badge className={`${config.className} ${className || ""}`} data-testid={`badge-tier-${tier}`}>
      {config.label}
    </Badge>
  );
}
