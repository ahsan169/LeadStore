import { useState } from 'react';
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Clock, Award, FileCheck, Check, X, Droplets, ShieldCheck, Package, Calculator, ArrowRight, Zap, Users, Rocket, HeadphonesIcon, SearchIcon, Database, Globe, ChartBarIcon, RefreshCw } from "lucide-react";
import type { ProductTier } from "@shared/schema";
import logoUrl from "@assets/generated_images/Lakefront_Leadworks_logo_9f434e28.png";
import { InteractiveTooltip, DiscoveryTooltip } from "@/components/engagement/InteractiveTooltip";
import { VisitorCounter, StockIndicator } from "@/components/engagement/TrustIndicators";
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
    createCheckoutSession.mutate(tier);
  };

  // Comparison table data
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
              Simple, Transparent <span className="text-gradient">Pricing</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Choose the perfect plan for your team. Start small or go pro - upgrade anytime.
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
        </div>
      </div>

      {/* Pricing Cards - 2 Tiers Only */}
      <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {tiers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-lg text-muted-foreground">No pricing tiers available at this time.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {tiers.map((tier) => (
              <Card 
                key={tier.tier} 
                className={`relative overflow-hidden transform transition-all duration-300 hover:scale-105 ${tier.recommended ? 'border-primary shadow-xl' : ''}`}
              >
                {tier.recommended && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}
                
                <CardHeader className="space-y-4 pb-6">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">{tier.name}</h3>
                    <p className="text-muted-foreground">
                      {tier.tier === 'starter' 
                        ? 'Perfect for small teams just starting with MCA leads'
                        : 'Ideal for growing teams and enterprise customers'
                      }
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black" data-testid={`text-price-${tier.tier}`}>
                        ${(tier.price / 100).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">{tier.leadCount} leads</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-muted-foreground" />
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
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
                
                <CardFooter className="pt-6">
                  <Button 
                    className="w-full" 
                    size="lg"
                    variant={tier.recommended ? "default" : "outline"}
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
        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-4">
              Compare <span className="text-gradient">Plans</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              See which plan is right for your business
            </p>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Features</TableHead>
                  <TableHead className="text-center">
                    <div className="space-y-1">
                      <div className="font-semibold">Starter</div>
                      <div className="text-sm text-muted-foreground">$700/100 leads</div>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-primary/5">
                    <div className="space-y-1">
                      <div className="font-semibold">Pro</div>
                      <Badge variant="secondary" className="text-xs">RECOMMENDED</Badge>
                      <div className="text-sm text-muted-foreground">$2,500/500 leads</div>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonFeatures.map((category) => (
                  <>
                    <TableRow key={category.category}>
                      <TableCell colSpan={3} className="bg-muted/50 font-semibold">
                        {category.category}
                      </TableCell>
                    </TableRow>
                    {category.features.map((feature) => (
                      <TableRow key={feature.name}>
                        <TableCell className="font-medium">{feature.name}</TableCell>
                        <TableCell className="text-center">
                          {typeof feature.starter === 'boolean' ? (
                            feature.starter ? (
                              <Check className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-muted-foreground mx-auto" />
                            )
                          ) : (
                            <span className="text-sm">{feature.starter}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center bg-primary/5">
                          {typeof feature.pro === 'boolean' ? (
                            feature.pro ? (
                              <Check className="w-5 h-5 text-green-500 mx-auto" />
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
        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-4">
              Why Choose <span className="text-gradient">Lakefront Leadworks</span>
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-2">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>100% Verified</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Every lead is verified for accuracy and TCPA compliance. We guarantee data quality.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-2">
                  <Rocket className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>Instant Access</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Start working leads immediately. Our Lead Activation Hub helps you connect faster.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-2">
                  <RefreshCw className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>Quality Guarantee</CardTitle>
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
        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-4">
              Need More Leads? <span className="text-gradient">Save with Bulk</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Pro customers get automatic volume discounts up to 25% off
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Bulk Discount Calculator */}
            <BulkDiscountCalculator
              onProceedToPurchase={(quantity) => {
                setBulkQuantity(quantity);
                setShowBulkPurchase(true);
              }}
            />

            {/* Benefits Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
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
                  <Badge variant="outline" className="w-full justify-start p-3 border-primary">
                    <span className="text-sm">
                      <span className="font-semibold">5,000+ leads:</span> 25% discount + custom pricing
                    </span>
                  </Badge>
                </div>

                <div className="pt-4 border-t">
                  <Button 
                    className="w-full" 
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
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <div className="flex flex-col items-center gap-2 text-center">
            <Shield className="w-8 h-8 text-primary" />
            <span className="text-sm font-semibold">TCPA Compliant</span>
            <span className="text-xs text-muted-foreground">100% Verified</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Award className="w-8 h-8 text-primary" />
            <span className="text-sm font-semibold">Quality Guaranteed</span>
            <span className="text-xs text-muted-foreground">Hand-Selected</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Clock className="w-8 h-8 text-primary" />
            <span className="text-sm font-semibold">Instant Delivery</span>
            <span className="text-xs text-muted-foreground">Download Now</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <FileCheck className="w-8 h-8 text-primary" />
            <span className="text-sm font-semibold">Verified Sources</span>
            <span className="text-xs text-muted-foreground">Expert Team</span>
          </div>
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
      
      {/* Contact Modal for custom pricing */}
      <ContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
      
      {/* Bulk Purchase Dialog */}
      <BulkPurchaseDialog
        open={showBulkPurchase}
        onOpenChange={setShowBulkPurchase}
        quantity={bulkQuantity}
        priceCalculation={bulkPriceCalculation}
      />
    </div>
  );
}