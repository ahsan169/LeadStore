import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface LeadStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
}

export function LeadStatsCard({ title, value, icon: Icon, description, trend }: LeadStatsCardProps) {
  return (
    <Card className="card-kingdom" data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2 space-y-0 pb-2">
          <h3 className="text-sm font-serif font-medium text-muted-foreground">{title}</h3>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <div className="text-3xl font-bold font-serif" data-testid={`text-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className={`text-xs font-medium ${trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
