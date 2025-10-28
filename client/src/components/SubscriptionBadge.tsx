import { Badge } from "@/components/ui/badge";

interface SubscriptionBadgeProps {
  tier: string;
  className?: string;
}

export function SubscriptionBadge({ tier, className }: SubscriptionBadgeProps) {
  const tierConfig = {
    starter: { label: "Starter", className: "bg-green-500 text-white" },
    pro: { label: "Pro", className: "bg-gradient-to-r from-purple-500 to-indigo-600 text-white" },
  };

  const config = tierConfig[tier as keyof typeof tierConfig] || tierConfig.starter;

  return (
    <Badge className={`${config.className} ${className || ""}`} data-testid={`badge-tier-${tier}`}>
      {config.label}
    </Badge>
  );
}
