import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  Shield,
  Zap,
  Download,
  CheckCircle2,
  Clock,
  TrendingUp,
  Award,
  Lock,
  FileCheck,
  Mail,
  DollarSign,
  ArrowRight,
  Brain,
  Target,
  Users,
  BarChart3,
} from "lucide-react";

const PRICING_TIERS = [
  {
    tier: "gold",
    name: "Gold",
    price: "$500",
    leadCount: "50 Leads",
    quality: "60-79",
    popular: false,
  },
  {
    tier: "platinum",
    name: "Platinum",
    price: "$1,500",
    leadCount: "200 Leads",
    quality: "70-89",
    popular: true,
  },
  {
    tier: "diamond",
    name: "Diamond",
    price: "$4,000",
    leadCount: "600 Leads",
    quality: "80-100",
    popular: false,
  },
  {
    tier: "elite",
    name: "Elite",
    price: "Custom",
    leadCount: "Custom Volume",
    quality: "85-100",
    popular: false,
  },
];

const FEATURES = [
  {
    icon: Brain,
    title: "AI Quality Scoring",
    description: "Every lead is scored 0-100 using our proprietary AI algorithm, ensuring you get the best conversion potential.",
  },
  {
    icon: Shield,
    title: "TCPA Compliant Leads",
    description: "100% compliant with TCPA regulations. All leads have provided express written consent for MCA contact.",
  },
  {
    icon: Download,
    title: "Instant CSV Delivery",
    description: "Download your leads immediately after purchase. No waiting, no delays - start calling right away.",
  },
  {
    icon: CheckCircle2,
    title: "No Duplicate Leads",
    description: "Advanced deduplication ensures you never pay for the same lead twice. Each lead is unique to you.",
  },
  {
    icon: Clock,
    title: "24-Hour Download Access",
    description: "Secure download links remain active for 24 hours, giving you flexibility to access your leads anytime.",
  },
  {
    icon: TrendingUp,
    title: "Tier-Based Pricing",
    description: "Choose the tier that matches your needs. Scale from 50 to 600+ leads with transparent pricing.",
  },
];

const TRUST_BADGES = [
  {
    icon: Shield,
    title: "TCPA Compliant",
    description: "100% Verified",
  },
  {
    icon: Mail,
    title: "CAN-SPAM Certified",
    description: "Fully Compliant",
  },
  {
    icon: Lock,
    title: "Secure Payments",
    description: "Powered by Stripe",
  },
  {
    icon: Brain,
    title: "AI-Powered Quality",
    description: "Smart Scoring",
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: Target,
    title: "Choose Your Tier",
    description: "Select from Gold, Platinum, Diamond, or Elite tiers based on your volume needs and quality requirements.",
  },
  {
    step: 2,
    icon: Lock,
    title: "Secure Payment via Stripe",
    description: "Complete your purchase through our secure Stripe checkout. We accept all major credit cards.",
  },
  {
    step: 3,
    icon: Download,
    title: "Instant Download - CSV Delivered",
    description: "Receive your leads immediately in CSV format. Start contacting prospects within minutes of purchase.",
  },
];

const FAQS = [
  {
    question: "What is the quality score?",
    answer: "Our AI quality score ranges from 0-100 and evaluates each lead based on multiple factors including business age, revenue indicators, credit signals, and engagement history. Higher scores indicate leads with better conversion potential.",
  },
  {
    question: "Are leads TCPA compliant?",
    answer: "Yes, 100%. All our leads have provided express written consent to be contacted regarding Merchant Cash Advance offers. We maintain strict compliance with TCPA regulations and keep detailed consent records.",
  },
  {
    question: "How quickly do I get my leads?",
    answer: "Instantly! As soon as your payment is processed, you'll receive a secure download link to access your leads in CSV format. There's no waiting period - you can start calling immediately.",
  },
  {
    question: "Can I get duplicates?",
    answer: "No. Our advanced deduplication system ensures that each lead is unique to you. Once you purchase a lead, it's marked as sold and won't be included in future batches for any customer.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express, Discover) through our secure Stripe payment processing system. All transactions are encrypted and PCI compliant.",
  },
  {
    question: "How long is the download link valid?",
    answer: "Your secure download link remains active for 24 hours from the time of purchase. This gives you flexibility to download your leads at your convenience while maintaining security.",
  },
  {
    question: "What's your refund policy?",
    answer: "Due to the digital nature of our product and instant delivery, all sales are final. However, if you encounter any technical issues or quality concerns, please contact our support team within 48 hours and we'll work to resolve the issue.",
  },
  {
    question: "Do you offer custom packages?",
    answer: "Yes! Our Elite tier offers fully customized solutions including custom lead volumes, dedicated account management, API access, and white-label options. Contact our sales team to discuss your specific needs.",
  },
  {
    question: "What information is included in each lead?",
    answer: "Each lead includes business name, contact person, phone number, email, business address, industry classification, estimated revenue, years in business, and our proprietary AI quality score.",
  },
  {
    question: "How fresh are the leads?",
    answer: "All leads are verified within 30 days of delivery. We continuously update our database and remove outdated information to ensure you receive the most current and accurate data available.",
  },
];

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-foreground tracking-tight" data-testid="heading-hero">
                Premium MCA Leads <br />
                <span className="text-primary">That Convert</span>
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                Access quality-scored Merchant Cash Advance leads powered by AI insights. 
                TCPA compliant, instantly delivered, guaranteed unique.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button 
                size="lg" 
                className="text-lg px-8"
                onClick={() => setLocation("/pricing")}
                data-testid="button-view-pricing"
              >
                View Pricing
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 bg-background/50 backdrop-blur-sm"
                onClick={() => setLocation("/auth")}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {TRUST_BADGES.map((badge, index) => (
              <div 
                key={index}
                className="flex flex-col items-center gap-3 text-center p-4"
                data-testid={`badge-${badge.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="p-4 rounded-full bg-primary/10">
                  <badge.icon className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{badge.title}</div>
                  <div className="text-sm text-muted-foreground">{badge.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-features">
              Why Choose Our Leads?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Industry-leading features designed to maximize your conversion rates
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`feature-${index}`}>
                <CardHeader>
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-2">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-muted/30 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-how-it-works">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {HOW_IT_WORKS.map((step, index) => (
              <div key={index} className="relative" data-testid={`step-${step.step}`}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl">
                        {step.step}
                      </div>
                      <div className="p-3 rounded-lg bg-primary/10">
                        <step.icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ArrowRight className="w-8 h-8 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-pricing-preview">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the tier that fits your business needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {PRICING_TIERS.map((tier, index) => (
              <Card 
                key={index} 
                className={`relative hover-elevate ${tier.popular ? 'border-primary' : ''}`}
                data-testid={`pricing-tier-${tier.tier}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <CardDescription>{tier.leadCount}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-bold text-foreground">{tier.price}</div>
                  <div className="text-sm text-muted-foreground">
                    Quality Score: <span className="font-semibold text-foreground">{tier.quality}</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full"
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => setLocation(tier.tier === "elite" ? "/pricing" : `/purchase/${tier.tier}`)}
                    data-testid={`button-select-${tier.tier}`}
                  >
                    {tier.tier === "elite" ? "Contact Sales" : "Select Plan"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="text-center">
            <Button 
              size="lg"
              variant="outline"
              onClick={() => setLocation("/pricing")}
              data-testid="button-view-full-pricing"
            >
              View Full Pricing Details
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-faq">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about our MCA leads
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {FAQS.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-background border rounded-lg px-6"
                data-testid={`faq-${index}`}
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Compliance & Footer */}
      <section className="py-16 border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">TCPA Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  All leads are sourced in full compliance with the Telephone Consumer Protection Act (TCPA). 
                  Each lead has provided express written consent for contact regarding MCA offers.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">CAN-SPAM Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We adhere to all CAN-SPAM Act requirements. All email communications include proper 
                  identification, honest subject lines, and clear opt-out mechanisms.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">Data Usage Terms</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  By purchasing leads, you agree to use the data responsibly and in compliance with all 
                  applicable federal and state regulations. Data is for your business use only.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="border-t pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-muted-foreground">
                © 2025 MCA Lead Marketplace. All rights reserved.
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  Compliance
                </a>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
