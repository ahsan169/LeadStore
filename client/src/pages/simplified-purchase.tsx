import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, Package, Shield, Zap, Clock } from "lucide-react";
import type { User } from "@shared/schema";

const PRICING_TIERS = [
  {
    tier: "gold",
    name: "Gold Package",
    price: 500,
    displayPrice: "$500",
    leadCount: 50,
    pricePerLead: "$10",
    quality: "60-79",
    features: [
      "50 Premium MCA Leads",
      "60-79 Quality Score",
      "CSV Download",
      "24/7 Access",
    ],
    popular: false,
    color: "border-yellow-500/30 bg-yellow-50/5",
  },
  {
    tier: "platinum",
    name: "Platinum Package",
    price: 1500,
    displayPrice: "$1,500",
    leadCount: 200,
    pricePerLead: "$7.50",
    quality: "70-89",
    features: [
      "200 Premium MCA Leads",
      "70-89 Quality Score",
      "CSV Download",
      "24/7 Access",
      "Best Value per Lead",
    ],
    popular: true,
    color: "border-blue-500/30 bg-blue-50/5",
  },
  {
    tier: "diamond",
    name: "Diamond Package",
    price: 4000,
    displayPrice: "$4,000",
    leadCount: 600,
    pricePerLead: "$6.67",
    quality: "80-100",
    features: [
      "600 Premium MCA Leads",
      "80-100 Quality Score",
      "CSV Download",
      "24/7 Access",
      "Lowest Price per Lead",
      "Highest Quality Guarantee",
    ],
    popular: false,
    color: "border-purple-500/30 bg-purple-50/5",
  },
];

export default function SimplifiedPurchasePage() {
  const { toast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  // Create checkout session mutation
  const createCheckoutSession = useMutation({
    mutationFn: async (tier: string) => {
      return apiRequest("POST", "/api/create-checkout-session", { tier });
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
      setSelectedTier(null);
    },
  });

  const handlePurchase = (tier: string) => {
    setSelectedTier(tier);
    setIsProcessing(true);
    createCheckoutSession.mutate(tier);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" data-testid="heading-purchase">
            Choose Your Lead Package
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            High-quality MCA leads with verified business information. 
            All packages include instant CSV download and 24-hour support.
          </p>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap justify-center gap-8 mb-12">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Secure Payment</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Instant Delivery</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">24/7 Access</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {PRICING_TIERS.map((tier) => (
            <Card 
              key={tier.tier}
              className={`relative ${tier.popular ? 'scale-105 shadow-xl' : ''} ${tier.color}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl mb-2">{tier.name}</CardTitle>
                <div className="space-y-2">
                  <p className="text-4xl font-bold">{tier.displayPrice}</p>
                  <p className="text-sm text-muted-foreground">
                    {tier.pricePerLead} per lead
                  </p>
                </div>
                <Badge variant="secondary" className="mt-4">
                  Quality Score: {tier.quality}
                </Badge>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="text-center pb-4 border-b">
                  <p className="text-3xl font-bold text-primary">{tier.leadCount}</p>
                  <p className="text-sm text-muted-foreground">Premium Leads</p>
                </div>
                
                <ul className="space-y-3">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                <Button
                  className="w-full"
                  size="lg"
                  variant={tier.popular ? "default" : "outline"}
                  onClick={() => handlePurchase(tier.tier)}
                  disabled={isProcessing}
                  data-testid={`button-purchase-${tier.tier}`}
                >
                  {isProcessing && selectedTier === tier.tier ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Package className="w-4 h-4 mr-2" />
                      Purchase Now
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">What's included in each package?</h3>
              <p className="text-sm text-muted-foreground">
                Each package includes verified business leads with complete contact information, 
                quality scores, and instant CSV download access.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How quickly will I receive my leads?</h3>
              <p className="text-sm text-muted-foreground">
                Leads are delivered instantly after payment confirmation. You'll receive a download 
                link via email and can also access them from your dashboard.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
              <p className="text-sm text-muted-foreground">
                We accept all major credit cards, debit cards, and ACH payments through our secure 
                Stripe payment processor.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Is there a refund policy?</h3>
              <p className="text-sm text-muted-foreground">
                Due to the nature of digital products, all sales are final. However, we guarantee 
                the quality and accuracy of our leads.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}