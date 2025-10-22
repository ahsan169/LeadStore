import { PricingCard } from "@/components/PricingCard";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Shield, Clock, Award, FileCheck } from "lucide-react";
import type { ProductTier } from "@shared/schema";

export default function PricingPage() {
  const [, setLocation] = useLocation();
  
  const { data: tiers = [], isLoading } = useQuery<ProductTier[]>({
    queryKey: ["/api/tiers"],
  });

  const handleSelectTier = (tier: string) => {
    if (tier === "elite") {
      // For Elite tier, could open a contact form or email
      window.location.href = "mailto:sales@example.com?subject=Elite Tier Inquiry";
    } else {
      setLocation(`/purchase/${tier}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-black text-foreground" data-testid="heading-pricing">
              Choose Your <span className="text-primary">Plan</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Access verified, high-quality MCA leads with transparent pricing and guaranteed delivery
            </p>
          </div>

          {/* Trust Badges */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-primary/10">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium">TCPA Compliant</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-primary/10">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Quality Guaranteed</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-primary/10">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Instant Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-primary/10">
                <FileCheck className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Verified Sources</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-lg text-muted-foreground">Loading pricing tiers...</div>
          </div>
        ) : tiers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-lg text-muted-foreground">No pricing tiers available at this time.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => (
              <PricingCard
                key={tier.tier}
                tier={tier.tier}
                name={tier.name}
                price={tier.price / 100}
                leadCount={tier.leadCount}
                minQuality={tier.minQuality}
                maxQuality={tier.maxQuality}
                features={tier.features}
                recommended={tier.recommended}
                onSelect={() => handleSelectTier(tier.tier)}
              />
            ))}
          </div>
        )}

        {/* Compliance Notice */}
        <div className="mt-16 max-w-4xl mx-auto bg-muted/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Compliance & Legal</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All leads are sourced in full compliance with TCPA and CAN-SPAM regulations. 
            Each lead has provided express written consent for contact regarding MCA offers. 
            By purchasing leads, you agree to our Terms of Service and acknowledge 
            responsibility for compliance with all applicable regulations in your jurisdiction.
          </p>
        </div>
      </div>
    </div>
  );
}
