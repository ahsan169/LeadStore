import { useState } from 'react';
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Clock, Award, FileCheck, Check, X, ShieldCheck, Package, Calculator, ArrowRight, Zap, Users, Rocket, RefreshCw, Sparkles, Crown } from "lucide-react";
import type { ProductTier } from "@shared/schema";
import { ContactModal } from "@/components/modals/ContactModal";
import { BulkDiscountCalculator } from "@/components/BulkDiscountCalculator";
import { BulkPurchaseDialog } from "@/components/BulkPurchaseDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const [showContactModal, setShowContactModal] = useState(false);
  const [showBulkPurchase, setShowBulkPurchase] = useState(false);
  const [bulkQuantity, setBulkQuantity] = useState(500);
  const [bulkPriceCalculation, setBulkPriceCalculation] = useState<any>(null);
  const { toast } = useToast();
  
  const { data: tiers = [], isLoading } = useQuery<ProductTier[]>({
    queryKey: ["/api/tiers"],
  });

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
    },
  });

  const handleSelectTier = (tier: string) => {
    createCheckoutSession.mutate(tier);
  };

  const comparisonFeatures = [
    { 
      category: "Leads & Quality",
      features: [
        { name: "Monthly Lead Volume", starter: "100 leads", pro: "500 leads" },
        { name: "Intelligence Score", starter: "70+ score", pro: "80+ score" },
        { name: "Lead Freshness Guarantee", starter: true, pro: true },
        { name: "Verified & TCPA Compliant", starter: true, pro: true },
      ]
    },
    {
      category: "Lead Activation Hub",
      features: [
        { name: "Lead Enrichment", starter: true, pro: true },
        { name: "Email Campaign Tools", starter: true, pro: true },
        { name: "CRM Export", starter: "Basic", pro: "Advanced with custom mapping" },
        { name: "Smart Search", starter: "Basic filters", pro: "Advanced with saved searches" },
      ]
    },
    {
      category: "Automation & Integration",
      features: [
        { name: "API Access", starter: false, pro: true },
        { name: "Webhook Support", starter: false, pro: true },
        { name: "Bulk Operations", starter: false, pro: true },
        { name: "Custom Integrations", starter: false, pro: true },
      ]
    },
    {
      category: "Support & Guarantees",
      features: [
        { name: "Support Channel", starter: "Email", pro: "Priority + Dedicated Manager" },
        { name: "Response Time", starter: "24-48 hours", pro: "< 2 hours" },
        { name: "Lead Quality Guarantee", starter: "30-day report", pro: "Instant replacements" },
        { name: "Download Window", starter: "30 days", pro: "Unlimited" },
      ]
    },
    {
      category: "Advanced Features",
      features: [
        { name: "AI-Powered Insights", starter: "Basic", pro: "Full ML scoring & predictions" },
        { name: "Custom Industry Targeting", starter: false, pro: true },
        { name: "Volume Discounts", starter: false, pro: "Up to 25% off" },
        { name: "Real-time Lead Delivery", starter: false, pro: true },
      ]
    }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-hero-kingdom">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-lg text-muted-foreground font-serif">Loading pricing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hero-kingdom">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/50"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-2xl shadow-xl glow-crown bg-gradient-to-br from-[#2d6a4f] via-[#40916c] to-[#d4a574] flex items-center justify-center animate-scale-in">
                <Crown className="w-10 h-10 text-amber-200" />
              </div>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-serif font-bold animate-slide-up" data-testid="heading-pricing">
              Simple, Transparent <span className="text-gradient-royal">Pricing</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed animate-slide-up animate-delay-100">
              Choose the perfect plan for your team. Start small or go pro - upgrade anytime.
            </p>
            
            {/* 30-Day Guarantee Badge */}
            <div className="flex justify-center pt-4 animate-slide-up animate-delay-200">
              <div className="inline-flex items-center gap-3 px-6 py-3 card-kingdom rounded-full">
                <ShieldCheck className="w-6 h-6 text-[#2d6a4f] dark:text-emerald-400" />
                <div className="text-left">
                  <p className="font-serif font-bold text-[#2d6a4f] dark:text-emerald-400">30-Day Quality Guarantee</p>
                  <p className="text-xs text-muted-foreground">Report issues & get replacement leads</p>
                </div>
              </div>
            </div>
            
            {/* Elegant Divider */}
            <div className="flex items-center justify-center gap-4 pt-6 animate-slide-up animate-delay-300">
              <div className="divider-elegant w-24"></div>
              <Sparkles className="w-5 h-5 text-[#d4a574]" />
              <div className="divider-elegant w-24"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {tiers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-lg text-muted-foreground font-serif">No pricing tiers available at this time.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {tiers.map((tier, index) => (
              <Card 
                key={tier.tier} 
                className={`relative overflow-visible card-kingdom rounded-xl animate-slide-up ${
                  tier.recommended ? 'tier-highlight' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {tier.recommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <Badge className="badge-gold px-4 py-1.5 text-sm font-serif font-semibold shadow-lg">
                      <Crown className="w-4 h-4 mr-1.5" />
                      MOST POPULAR
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="space-y-4 pb-6 pt-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-serif font-bold">{tier.name}</h3>
                      <Badge className={tier.tier === 'starter' ? 'badge-emerald' : 'badge-gold'}>
                        {tier.tier === 'starter' ? 'Essential' : 'Premium'}
                      </Badge>
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground">
                    {tier.tier === 'starter' 
                      ? 'Perfect for small teams just starting with funding leads'
                      : 'Ideal for growing teams and enterprise customers'
                    }
                  </p>
                  
                  <div className="divider-elegant my-4"></div>
                  
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-serif font-black text-gradient-royal" data-testid={`text-price-${tier.tier}`}>
                        ${(tier.price / 100).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#2d6a4f] dark:text-emerald-400" />
                        <span className="font-semibold">{tier.leadCount} leads</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#d4a574]" />
                        <Badge variant="secondary" className="font-semibold">
                          {tier.minQuality}+ Score
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {tier.features.slice(0, 8).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3" data-testid={`feature-${tier.tier}-${idx}`}>
                        <div className="w-5 h-5 rounded-full bg-[#2d6a4f]/10 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-[#2d6a4f] dark:text-emerald-400" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
                
                <CardFooter className="pt-6">
                  <Button 
                    className={`w-full font-serif font-semibold ${tier.recommended ? 'btn-gold' : 'btn-kingdom'}`}
                    size="lg"
                    onClick={() => handleSelectTier(tier.tier)}
                    data-testid={`button-select-${tier.tier}`}
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Feature Comparison Table */}
        <div className="mt-20 animate-fade-in">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-serif font-bold mb-4">
              Compare <span className="text-gradient-royal">Plans</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              See which plan is right for your business
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <div className="divider-elegant w-16"></div>
              <Sparkles className="w-4 h-4 text-[#d4a574]" />
              <div className="divider-elegant w-16"></div>
            </div>
          </div>

          <Card className="overflow-hidden card-kingdom">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%] font-serif">Features</TableHead>
                  <TableHead className="text-center">
                    <div className="space-y-1">
                      <div className="font-serif font-semibold">Starter</div>
                      <div className="text-sm text-muted-foreground">$700/100 leads</div>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-[#2d6a4f]/5 dark:bg-emerald-500/10">
                    <div className="space-y-1">
                      <div className="font-serif font-semibold">Pro</div>
                      <Badge className="badge-gold text-xs">RECOMMENDED</Badge>
                      <div className="text-sm text-muted-foreground">$2,500/500 leads</div>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonFeatures.map((category) => (
                  <>
                    <TableRow key={category.category}>
                      <TableCell colSpan={3} className="bg-muted/50 font-serif font-semibold">
                        {category.category}
                      </TableCell>
                    </TableRow>
                    {category.features.map((feature) => (
                      <TableRow key={feature.name}>
                        <TableCell className="font-medium">{feature.name}</TableCell>
                        <TableCell className="text-center">
                          {typeof feature.starter === 'boolean' ? (
                            feature.starter ? (
                              <Check className="w-5 h-5 text-[#2d6a4f] dark:text-emerald-400 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-muted-foreground mx-auto" />
                            )
                          ) : (
                            <span className="text-sm">{feature.starter}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center bg-[#2d6a4f]/5 dark:bg-emerald-500/10">
                          {typeof feature.pro === 'boolean' ? (
                            feature.pro ? (
                              <Check className="w-5 h-5 text-[#2d6a4f] dark:text-emerald-400 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-muted-foreground mx-auto" />
                            )
                          ) : (
                            <span className="text-sm font-medium">{feature.pro}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Value Props Section */}
        <div className="mt-20 animate-fade-in">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-serif font-bold mb-4">
              Why Choose <span className="text-gradient-royal">Land of Leads</span>
            </h2>
            <div className="flex items-center justify-center gap-4 pt-2">
              <div className="divider-elegant w-16"></div>
              <Sparkles className="w-4 h-4 text-[#d4a574]" />
              <div className="divider-elegant w-16"></div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center card-kingdom animate-slide-up">
              <CardHeader>
                <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-br from-[#2d6a4f] to-[#40916c] flex items-center justify-center mb-2 shadow-lg">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="font-serif">100% Verified</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Every lead is verified for accuracy and TCPA compliance. We guarantee data quality.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center card-kingdom animate-slide-up animate-delay-100">
              <CardHeader>
                <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-br from-[#d4a574] to-[#c9956c] flex items-center justify-center mb-2 shadow-lg">
                  <Rocket className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="font-serif">Instant Access</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Start working leads immediately. Our Lead Activation Hub helps you connect faster.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center card-kingdom animate-slide-up animate-delay-200">
              <CardHeader>
                <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-br from-[#2d6a4f] to-[#d4a574] flex items-center justify-center mb-2 shadow-lg">
                  <RefreshCw className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="font-serif">Quality Guarantee</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  30-day quality guarantee with instant replacements for Pro customers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bulk Purchase Section */}
        <div className="mt-20 animate-fade-in">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-serif font-bold mb-4">
              Need More Leads? <span className="text-gradient-royal">Save with Bulk</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Pro customers get automatic volume discounts up to 25% off
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <div className="divider-elegant w-16"></div>
              <Sparkles className="w-4 h-4 text-[#d4a574]" />
              <div className="divider-elegant w-16"></div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <BulkDiscountCalculator
              onProceedToPurchase={(quantity) => {
                setBulkQuantity(quantity);
                setShowBulkPurchase(true);
              }}
            />

            <Card className="card-kingdom">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif">
                  <Package className="h-5 w-5 text-[#2d6a4f] dark:text-emerald-400" />
                  Bulk Purchase Benefits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Badge variant="outline" className="w-full justify-start p-3">
                    <span className="text-sm">
                      <span className="font-semibold">100-499 leads:</span> 5% discount
                    </span>
                  </Badge>
                  <Badge variant="outline" className="w-full justify-start p-3">
                    <span className="text-sm">
                      <span className="font-semibold">500-999 leads:</span> 10% discount
                    </span>
                  </Badge>
                  <Badge variant="outline" className="w-full justify-start p-3">
                    <span className="text-sm">
                      <span className="font-semibold">1,000-2,499 leads:</span> 15% discount
                    </span>
                  </Badge>
                  <Badge variant="outline" className="w-full justify-start p-3">
                    <span className="text-sm">
                      <span className="font-semibold">2,500-4,999 leads:</span> 20% discount
                    </span>
                  </Badge>
                  <Badge variant="outline" className="w-full justify-start p-3 border-[#2d6a4f] dark:border-emerald-500">
                    <span className="text-sm">
                      <span className="font-semibold">5,000+ leads:</span> 25% discount + custom pricing
                    </span>
                  </Badge>
                </div>

                <div className="divider-elegant my-4"></div>

                <Button 
                  className="w-full btn-kingdom font-serif"
                  size="lg"
                  onClick={() => {
                    setBulkQuantity(1000);
                    setShowBulkPurchase(true);
                  }}
                  data-testid="button-start-bulk"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  Calculate Bulk Savings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-16 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="flex flex-col items-center gap-2 text-center p-4 card-kingdom rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2d6a4f]/20 to-[#40916c]/20 dark:from-emerald-500/20 dark:to-emerald-600/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-[#2d6a4f] dark:text-emerald-400" />
              </div>
              <span className="text-sm font-serif font-semibold">TCPA Compliant</span>
              <span className="text-xs text-muted-foreground">100% Verified</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center p-4 card-kingdom rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4a574]/20 to-[#c9956c]/20 flex items-center justify-center">
                <Award className="w-6 h-6 text-[#d4a574]" />
              </div>
              <span className="text-sm font-serif font-semibold">Quality Guaranteed</span>
              <span className="text-xs text-muted-foreground">Hand-Selected</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center p-4 card-kingdom rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2d6a4f]/20 to-[#40916c]/20 dark:from-emerald-500/20 dark:to-emerald-600/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#2d6a4f] dark:text-emerald-400" />
              </div>
              <span className="text-sm font-serif font-semibold">Instant Delivery</span>
              <span className="text-xs text-muted-foreground">Download Now</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center p-4 card-kingdom rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4a574]/20 to-[#c9956c]/20 flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-[#d4a574]" />
              </div>
              <span className="text-sm font-serif font-semibold">Verified Sources</span>
              <span className="text-xs text-muted-foreground">Expert Team</span>
            </div>
          </div>
        </div>

        {/* Compliance Notice */}
        <div className="mt-16 max-w-4xl mx-auto card-kingdom rounded-xl p-6 animate-fade-in">
          <h3 className="text-lg font-serif font-semibold mb-3">Compliance & Legal</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All leads are sourced in full compliance with TCPA and CAN-SPAM regulations. 
            Each lead has provided express written consent for contact regarding funding offers. 
            By purchasing leads, you agree to our Terms of Service and acknowledge 
            responsibility for compliance with all applicable regulations in your jurisdiction.
          </p>
        </div>
      </div>
      
      <ContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
      
      <BulkPurchaseDialog
        open={showBulkPurchase}
        onOpenChange={setShowBulkPurchase}
        quantity={bulkQuantity}
        priceCalculation={bulkPriceCalculation}
      />
    </div>
  );
}
