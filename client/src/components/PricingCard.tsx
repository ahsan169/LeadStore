import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

interface PricingCardProps {
  tier: string;
  name: string;
  price: number;
  leadCount: number;
  minQuality: number;
  maxQuality: number;
  features: string[];
  recommended?: boolean;
  onSelect: () => void;
}

export function PricingCard({
  tier,
  name,
  price,
  leadCount,
  minQuality,
  maxQuality,
  features,
  recommended,
  onSelect,
}: PricingCardProps) {
  const isElite = tier === "elite";

  return (
    <Card className={`relative flex flex-col ${recommended ? "border-primary border-2" : ""}`} data-testid={`card-pricing-${tier}`}>
      {recommended && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground" data-testid="badge-recommended">
            Most Popular
          </Badge>
        </div>
      )}
      
      <CardHeader className="space-y-1 pb-4">
        <h3 className="text-2xl font-bold" data-testid={`text-tier-${tier}`}>{name}</h3>
        <div className="flex items-baseline gap-2">
          {isElite ? (
            <span className="text-2xl font-bold" data-testid="text-contact-sales">Contact Sales</span>
          ) : (
            <>
              <span className="text-4xl font-black" data-testid={`text-price-${tier}`}>${price.toLocaleString()}</span>
              <span className="text-muted-foreground">/purchase</span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Leads per purchase</div>
          <div className="text-2xl font-bold" data-testid={`text-leads-${tier}`}>
            {isElite ? "Custom" : leadCount.toLocaleString()}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Quality Score Range</div>
          <Badge variant="outline" className="text-sm" data-testid={`badge-quality-range-${tier}`}>
            {minQuality}-{maxQuality}
          </Badge>
        </div>

        <div className="space-y-3 pt-4">
          {features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-2" data-testid={`feature-${tier}-${idx}`}>
              <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        <Button 
          className="w-full" 
          variant={recommended ? "default" : "outline"}
          onClick={onSelect}
          data-testid={`button-select-${tier}`}
        >
          {isElite ? "Contact Us" : "Get Started"}
        </Button>
      </CardFooter>
    </Card>
  );
}
