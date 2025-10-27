import { useState } from 'react';
import { PricingCard } from "@/components/PricingCard";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Clock, Award, FileCheck, Waves, Droplets, CheckCircle2, ShieldCheck } from "lucide-react";
import type { ProductTier } from "@shared/schema";
import logoUrl from "@assets/generated_images/Lakefront_Leadworks_logo_9f434e28.png";
import { InteractiveTooltip, DiscoveryTooltip } from "@/components/engagement/InteractiveTooltip";
import { VisitorCounter, StockIndicator } from "@/components/engagement/TrustIndicators";
import { ContactModal } from "@/components/modals/ContactModal";

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const [showContactModal, setShowContactModal] = useState(false);
  const { toast } = useToast();
  
  const { data: tiers = [], isLoading } = useQuery<ProductTier[]>({
    queryKey: ["/api/tiers"],
  });

  // Create checkout session mutation
  const createCheckoutSession = useMutation({
    mutationFn: async (tier: string) => {
      return apiRequest("POST", "/api/create-checkout-session", { tier });
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSelectTier = (tier: string) => {
    if (tier === "elite") {
      // For Elite tier, open contact sales modal
      setShowContactModal(true);
    } else {
      // Create checkout session for other tiers
      createCheckoutSession.mutate(tier);
    }
  };

  // Show loading state while fetching tiers
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/5 to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-lg text-muted-foreground">Loading pricing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/5">
        <div className="absolute inset-0 gradient-hero"></div>
        
        {/* Wave pattern */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-10">
          <svg viewBox="0 0 1440 320" className="w-full h-full">
            <path fill="currentColor" className="text-primary" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,138.7C960,139,1056,117,1152,106.7C1248,96,1344,96,1392,96L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
          </svg>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex justify-center mb-6">
              <img 
                src={logoUrl} 
                alt="Lakefront Leadworks"
                className="w-16 h-16 rounded-xl shadow-xl"
              />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold" data-testid="heading-pricing">
              Choose Your <span className="text-gradient">Plan</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Access verified, high-quality MCA leads with transparent pricing and guaranteed delivery
            </p>
            
            {/* 30-Day Guarantee Badge */}
            <div className="flex justify-center pt-4">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-2 border-green-500/20 rounded-full shadow-lg">
                <ShieldCheck className="w-6 h-6 text-green-500" />
                <div className="text-left">
                  <p className="font-bold text-green-600">30-Day Quality Guarantee</p>
                  <p className="text-xs text-muted-foreground">Report issues & get replacement leads</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-primary/60 pt-2">
              <div className="h-px bg-primary/20 w-16"></div>
              <Droplets className="w-5 h-5" />
              <div className="h-px bg-primary/20 w-16"></div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto animate-slide-up animate-delay-100">
            <div className="flex flex-col items-center gap-2 text-center glass p-4 rounded-xl">
              <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-semibold">TCPA Compliant</span>
              <span className="text-xs text-muted-foreground">100% Verified</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center glass p-4 rounded-xl">
              <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-semibold">Quality Guaranteed</span>
              <span className="text-xs text-muted-foreground">Hand-Selected</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center glass p-4 rounded-xl">
              <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-semibold">Instant Delivery</span>
              <span className="text-xs text-muted-foreground">Download Now</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center glass p-4 rounded-xl">
              <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                <FileCheck className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-semibold">Verified Sources</span>
              <span className="text-xs text-muted-foreground">Expert Team</span>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8 animate-fade-in animate-delay-200">
            <VisitorCounter />
            <StockIndicator tier="Diamond" remaining={89} />
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
      
      {/* Contact Modal for Elite tier */}
      <ContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </div>
  );
}
