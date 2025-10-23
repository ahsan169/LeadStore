import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, TrendingUp, Star, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Recommendation {
  title: string;
  description: string;
  tier: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export function ContentRecommendations({ 
  title = "You might also like",
  recommendations,
  className 
}: {
  title?: string;
  recommendations: Recommendation[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {recommendations.map((rec, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="group hover-elevate h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="p-2 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full">
                    <rec.icon className="w-5 h-5 text-primary" />
                  </div>
                  {rec.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {rec.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base mt-3">{rec.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {rec.description}
                </p>
                <Button
                  onClick={rec.action}
                  variant="ghost"
                  size="sm"
                  className="group-hover:translate-x-1 transition-transform"
                  data-testid={`recommendation-action-${index}`}
                >
                  Learn More
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ExitIntentRecommendations({ 
  onClose,
  onSelect 
}: {
  onClose: () => void;
  onSelect: (tier: string) => void;
}) {
  const recommendations = [
    {
      icon: Star,
      title: "Diamond Tier - Premium Quality",
      description: "80-100 quality score leads, highest conversion rates",
      tier: "diamond",
      badge: "Best Value",
    },
    {
      icon: TrendingUp,
      title: "Platinum Tier - Most Popular",
      description: "70-89 quality score, perfect balance of quality and volume",
      tier: "platinum",
      badge: "Most Popular",
    },
    {
      icon: Users,
      title: "Gold Tier - Volume Buyer",
      description: "60-79 quality score, ideal for high-volume campaigns",
      tier: "gold",
      badge: "Budget Friendly",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">
          Before you go, check out these exclusive leads
        </h3>
        <p className="text-sm text-muted-foreground">
          Limited availability on these premium packages
        </p>
      </div>
      
      <div className="grid gap-3">
        {recommendations.map((rec, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
            onClick={() => onSelect(rec.tier)}
          >
            <div className="p-2 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full">
              <rec.icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm">{rec.title}</h4>
                {rec.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {rec.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {rec.description}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Maybe later
        </Button>
      </div>
    </div>
  );
}