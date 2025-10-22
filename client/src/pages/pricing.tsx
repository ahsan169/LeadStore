import { PricingCard } from "@/components/PricingCard";
import { useLocation } from "wouter";
import { Shield, Clock, Award, FileCheck } from "lucide-react";

const PRICING_TIERS = [
  {
    tier: "gold",
    name: "Gold",
    price: 500,
    leadCount: 50,
    minQuality: 60,
    maxQuality: 79,
    features: [
      "50 verified MCA leads",
      "Quality scores 60-79",
      "Basic deduplication",
      "24-hour delivery",
      "Email support",
    ],
  },
  {
    tier: "platinum",
    name: "Platinum",
    price: 1500,
    leadCount: 200,
    minQuality: 70,
    maxQuality: 89,
    recommended: true,
    features: [
      "200 verified MCA leads",
      "Quality scores 70-89",
      "Advanced deduplication",
      "Instant delivery",
      "Priority support",
      "Industry segmentation",
    ],
  },
  {
    tier: "diamond",
    name: "Diamond",
    price: 4000,
    leadCount: 600,
    minQuality: 80,
    maxQuality: 100,
    features: [
      "600 premium MCA leads",
      "Quality scores 80-100",
      "Advanced deduplication",
      "Instant delivery",
      "Priority support",
      "AI insights included",
      "Replace guarantee",
    ],
  },
  {
    tier: "elite",
    name: "Elite",
    price: 0,
    leadCount: 0,
    minQuality: 85,
    maxQuality: 100,
    features: [
      "Custom lead volume",
      "Highest quality scores (85-100)",
      "Dedicated account manager",
      "Custom industry targeting",
      "API access",
      "White-label options",
      "Custom SLA",
    ],
  },
];

export default function PricingPage() {
  const [, setLocation] = useLocation();

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRICING_TIERS.map((tier) => (
            <PricingCard
              key={tier.tier}
              {...tier}
              onSelect={() => handleSelectTier(tier.tier)}
            />
          ))}
        </div>

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
