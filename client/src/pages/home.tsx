import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { User } from "@shared/schema";
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
  Phone,
  DollarSign,
  ArrowRight,
  Brain,
  Target,
  Users,
  BarChart3,
  Crown,
  MapPin,
  Compass,
  Mountain,
  Calculator,
  PieChart,
  Flame,
  Timer,
  Waves,
  Droplets,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { InteractiveTooltip, DiscoveryTooltip } from "@/components/engagement/InteractiveTooltip";
import { AnimatedCounter, AnimatedStats } from "@/components/engagement/AnimatedCounter";
import { CountdownTimer } from "@/components/engagement/CountdownTimer";
import { ScrollIndicator } from "@/components/engagement/ScrollIndicator";
import { VisitorCounter, StockIndicator, RotatingTestimonials, LastUpdatedIndicator } from "@/components/engagement/TrustIndicators";

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
    icon: Target,
    title: "Fresh UCC Data Daily",
    description: "We pull fresh leads from state UCC filings every day. Businesses that recently took on financing are prime funding prospects.",
  },
  {
    icon: Brain,
    title: "AI-Scored 0-100",
    description: "Every lead gets a simple quality score from 0-100. Higher scores mean better prospects. No guesswork needed.",
  },
  {
    icon: Shield,
    title: "100% TCPA Compliant",
    description: "All leads have provided express written consent for funding contact. Full compliance documentation available.",
  },
  {
    icon: Users,
    title: "Multi-State Coverage",
    description: "We source leads from Colorado and Florida UCC filings, with more states coming soon. Expand your reach nationwide.",
  },
  {
    icon: Zap,
    title: "Instant CSV Download",
    description: "Download your leads immediately after purchase in CSV format. Import directly into your CRM and start calling.",
  },
  {
    icon: DollarSign,
    title: "Customizable Funding Types",
    description: "Configure your platform for MCA, SBA loans, equipment financing, invoice factoring, or any funding product you offer.",
  },
];

const TRUST_BADGES = [
  {
    icon: Target,
    title: "Fresh Daily",
    description: "New UCC Data",
  },
  {
    icon: Shield,
    title: "TCPA Compliant",
    description: "100% Legal",
  },
  {
    icon: Brain,
    title: "AI Scored",
    description: "0-100 Rating",
  },
  {
    icon: Lock,
    title: "Secure",
    description: "Stripe Payments",
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
    question: "Where do the leads come from?",
    answer: "We pull leads daily from state UCC filings in Colorado and Florida. These are real businesses that recently took on financing - which means they're familiar with alternative funding and may need more.",
  },
  {
    question: "What is the quality score?",
    answer: "Every lead gets a score from 0-100 based on factors like filing recency, lender type, and business data completeness. Higher scores mean better prospects. Gold tier is 60-79, Platinum is 70-89, Diamond is 80-100, Elite is 85-100.",
  },
  {
    question: "Are leads TCPA compliant?",
    answer: "Yes, 100%. All leads have provided express written consent to be contacted regarding funding offers. We maintain strict compliance with TCPA regulations.",
  },
  {
    question: "How quickly do I get my leads?",
    answer: "Instantly! Pay with Stripe, download your CSV, and start calling. No waiting period.",
  },
  {
    question: "Can I get duplicates?",
    answer: "No. Once you purchase a lead, it's marked as sold and won't be included in future batches.",
  },
  {
    question: "What format are the leads in?",
    answer: "CSV format with business name, contact info, filing details, and quality score. Import directly into any CRM.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "All major credit cards through Stripe. Secure, encrypted, PCI compliant.",
  },
  {
    question: "What's your refund policy?",
    answer: "All sales are final due to instant digital delivery. Contact support within 48 hours if you have quality concerns.",
  },
];

// Form schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  company: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // ROI Calculator states
  const [leadVolume, setLeadVolume] = useState(100);
  const [leadQuality, setLeadQuality] = useState(70);
  const [avgDealSize, setAvgDealSize] = useState(50000);
  const [commissionRate, setCommissionRate] = useState(10);

  // Check if user is authenticated
  const { data: user } = useQuery<User | null>({ queryKey: ["/api/auth/me"] });

  // Login form
  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Signup form
  const signupForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Contact form
  const contactForm = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      message: "",
    },
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) => {
      return await apiRequest("POST", "/api/auth/login", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
      setLocation("/company-search");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  // Signup mutation
  const signupMutation = useMutation({
    mutationFn: async (values: z.infer<typeof signupSchema>) => {
      const { confirmPassword, ...signupData } = values;
      return await apiRequest("POST", "/api/auth/register", signupData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Account created!",
        description: "Welcome to Land of Leads.",
      });
      setLocation("/company-search");
    },
    onError: (error: any) => {
      toast({
        title: "Signup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Contact form mutation
  const contactMutation = useMutation({
    mutationFn: async (values: z.infer<typeof contactSchema>) => {
      return await apiRequest("POST", "/api/contact", values);
    },
    onSuccess: () => {
      toast({
        title: "Message sent!",
        description: "We'll get back to you within 24 hours.",
      });
      contactForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-hero-kingdom">
        {/* Kingdom-themed gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/3 to-accent/2"></div>
        
        {/* Wave pattern overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-64 opacity-10">
          <svg viewBox="0 0 1440 320" className="w-full h-full">
            <path fill="currentColor" className="text-primary" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,138.7C960,139,1056,117,1152,106.7C1248,96,1344,96,1392,96L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
          </svg>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="text-center space-y-8 mb-12">
            {/* Logo and brand */}
            <div className="flex justify-center mb-8 animate-fade-in">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl shadow-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-amber-600 flex items-center justify-center hover-lift">
                <div className="text-center">
                  <Crown className="w-12 h-12 md:w-16 md:h-16 text-amber-300 mx-auto mb-1" />
                  <span className="text-3xl md:text-4xl font-bold text-white font-serif">LoL</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight animate-fade-in font-serif text-gradient-royal" data-testid="heading-hero">
                Land of Leads
              </h1>
              <div className="flex items-center justify-center gap-3 text-primary/80">
                <Compass className="w-6 h-6" />
                <span className="text-lg font-medium">Your Customizable Funding Leads Platform</span>
                <Crown className="w-6 h-6" />
              </div>
            </div>
            
            <p className="text-2xl md:text-3xl font-semibold text-foreground animate-slide-down animate-delay-100">
              Fresh Funding Leads from State UCC Filings
            </p>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed animate-slide-up animate-delay-200">
              We pull fresh leads daily from Colorado and Florida UCC records. Configure for MCA, SBA, equipment, or any funding type. AI-scored 0-100, TCPA compliant, instant CSV download.
            </p>
          </div>

          {/* Countdown Timer for Limited Time Offer */}
          <div className="flex justify-center mb-8 animate-fade-in animate-delay-300">
            <CountdownTimer 
              endDate={new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000 + 32 * 60 * 1000)} 
              label="Spring Sale Ends In:"
            />
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8 animate-fade-in animate-delay-400">
            <VisitorCounter />
            <LastUpdatedIndicator />
            <StockIndicator tier="Diamond" remaining={127} />
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {TRUST_BADGES.map((badge, index) => (
              <Card key={index} className={`text-center card-kingdom hover-lift animate-scale-in ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : index === 2 ? 'animate-delay-300' : 'animate-delay-400'}`} data-testid={`trust-badge-${index}`}>
                <CardContent className="pt-6 pb-4">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <badge.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="font-semibold text-sm font-serif">{badge.title}</div>
                  <div className="text-xs text-muted-foreground">{badge.description}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Scroll Indicator */}
          <div className="flex justify-center mt-12">
            <ScrollIndicator />
          </div>

          {/* Auth Forms */}
          {!user && (
            <Card className="max-w-md mx-auto animate-scale-in animate-delay-500">
              <CardHeader>
                <CardTitle>Get Started with Land of Leads</CardTitle>
                <CardDescription>
                  Sign up or log in to start accessing premium funding leads
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
                    <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <Form {...loginForm}>
                      <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={loginForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-login-username" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input type="password" {...field} data-testid="input-login-password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button 
                          type="submit" 
                          className="w-full"
                          disabled={loginMutation.isPending}
                          data-testid="button-login-submit"
                        >
                          {loginMutation.isPending ? "Logging in..." : "Login"}
                        </Button>
                      </form>
                    </Form>
                  </TabsContent>

                  <TabsContent value="signup">
                    <Form {...signupForm}>
                      <form onSubmit={signupForm.handleSubmit((data) => signupMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={signupForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-signup-username" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" {...field} data-testid="input-signup-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input type="password" {...field} data-testid="input-signup-password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password</FormLabel>
                              <FormControl>
                                <Input type="password" {...field} data-testid="input-signup-confirm-password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button 
                          type="submit" 
                          className="w-full"
                          disabled={signupMutation.isPending}
                          data-testid="button-signup-submit"
                        >
                          {signupMutation.isPending ? "Creating account..." : "Sign Up"}
                        </Button>
                      </form>
                    </Form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* CTA for logged in users */}
          {user && (
            <div className="text-center space-y-4">
              <Button 
                size="lg"
                className="btn-kingdom"
                onClick={() => setLocation("/analytics")}
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* Features Section */}
      <section className="py-24 bg-gradient-to-b from-background via-muted/20 to-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold font-serif" data-testid="heading-features">
              <span className="text-gradient-royal">Why Land of Leads?</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Fresh UCC data, AI scoring, instant delivery - everything you need to close more deals
            </p>
            <div className="flex items-center justify-center gap-2 text-primary/60 pt-2">
              <div className="h-px bg-primary/20 w-16"></div>
              <Waves className="w-5 h-5" />
              <div className="h-px bg-primary/20 w-16"></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature, index) => (
              <Card key={index} className={`group card-kingdom shadow-lg transition-all duration-300 animate-slide-up ${index < 3 ? `animate-delay-${(index + 1) * 100}` : index < 5 ? 'animate-delay-400' : 'animate-delay-500'}`} data-testid={`feature-${index}`}>
                <CardHeader className="pb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-semibold font-serif">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* How It Works */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold font-serif" data-testid="heading-how-it-works">
              How It <span className="text-gradient-royal">Works</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get started with premium leads in three simple steps
            </p>
            <div className="flex items-center justify-center gap-2 text-secondary/60 pt-2">
              <div className="h-px bg-secondary/20 w-16"></div>
              <Droplets className="w-5 h-5" />
              <div className="h-px bg-secondary/20 w-16"></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {HOW_IT_WORKS.map((step, index) => (
              <div key={index} className={`relative animate-scale-in ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : 'animate-delay-300'}`} data-testid={`step-${step.step}`}>
                <Card className="h-full card-kingdom hover-lift border-0 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl btn-kingdom text-white font-bold text-xl shadow-lg font-serif">
                        {step.step}
                      </div>
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10">
                        <step.icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <CardTitle className="text-xl font-semibold font-serif">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* ROI Calculator Section */}
      <section className="py-20 bg-muted/30 border-b animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Calculator className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground font-serif" data-testid="heading-roi-calculator">
              <span className="text-gradient-royal">ROI Calculator</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Calculate your potential return on investment with funding leads
            </p>
          </div>

          <Card className="max-w-4xl mx-auto card-kingdom animate-slide-up animate-delay-200">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2 font-serif">
                <PieChart className="w-6 h-6 text-primary" />
                Funding Lead ROI Calculator
              </CardTitle>
              <CardDescription>
                Adjust the sliders to see your potential returns based on industry averages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Volume */}
                <div className="space-y-2">
                  <Label htmlFor="lead-volume" className="text-sm font-medium">
                    Lead Volume
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{leadVolume}</span>
                    <span className="text-sm text-muted-foreground">leads/month</span>
                  </div>
                  <Slider
                    id="lead-volume"
                    value={[leadVolume]}
                    onValueChange={([value]) => setLeadVolume(value)}
                    min={10}
                    max={1000}
                    step={10}
                    className="w-full"
                    data-testid="slider-lead-volume"
                  />
                </div>

                {/* Lead Quality */}
                <div className="space-y-2">
                  <Label htmlFor="lead-quality" className="text-sm font-medium">
                    Average Lead Quality Score
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{leadQuality}</span>
                    <span className="text-sm text-muted-foreground">quality score</span>
                  </div>
                  <Slider
                    id="lead-quality"
                    value={[leadQuality]}
                    onValueChange={([value]) => setLeadQuality(value)}
                    min={60}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-lead-quality"
                  />
                </div>

                {/* Average Deal Size */}
                <div className="space-y-2">
                  <Label htmlFor="deal-size" className="text-sm font-medium">
                    Average Deal Size
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">
                      ${(avgDealSize / 1000).toFixed(0)}K
                    </span>
                    <span className="text-sm text-muted-foreground">per deal</span>
                  </div>
                  <Slider
                    id="deal-size"
                    value={[avgDealSize]}
                    onValueChange={([value]) => setAvgDealSize(value)}
                    min={10000}
                    max={200000}
                    step={5000}
                    className="w-full"
                    data-testid="slider-deal-size"
                  />
                </div>

                {/* Commission Rate */}
                <div className="space-y-2">
                  <Label htmlFor="commission" className="text-sm font-medium">
                    Commission Rate
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{commissionRate}%</span>
                    <span className="text-sm text-muted-foreground">per deal</span>
                  </div>
                  <Slider
                    id="commission"
                    value={[commissionRate]}
                    onValueChange={([value]) => setCommissionRate(value)}
                    min={5}
                    max={20}
                    step={1}
                    className="w-full"
                    data-testid="slider-commission"
                  />
                </div>
              </div>

              <div className="my-6 h-[1px] w-full bg-border" />

              {/* ROI Calculations */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Projected Results</h3>
                
                {(() => {
                  // Calculate conversion rates based on quality score
                  const conversionRate = leadQuality >= 90 ? 0.07 
                    : leadQuality >= 80 ? 0.05 
                    : leadQuality >= 70 ? 0.035 
                    : 0.025;
                  
                  // Calculate cost per lead based on quality
                  const costPerLead = leadQuality >= 90 ? 75 
                    : leadQuality >= 80 ? 62.5 
                    : leadQuality >= 70 ? 50 
                    : 37.5;
                  
                  const totalLeadCost = leadVolume * costPerLead;
                  const expectedDeals = Math.floor(leadVolume * conversionRate);
                  const totalRevenue = expectedDeals * avgDealSize * (commissionRate / 100);
                  const netProfit = totalRevenue - totalLeadCost;
                  const roi = totalLeadCost > 0 ? ((netProfit / totalLeadCost) * 100) : 0;
                  
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Lead Investment</div>
                          <div className="text-2xl font-bold text-foreground">
                            ${totalLeadCost.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Expected Deals</div>
                          <div className="text-2xl font-bold text-foreground">
                            {expectedDeals}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(conversionRate * 100).toFixed(1)}% conversion
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Total Revenue</div>
                          <div className="text-2xl font-bold text-primary">
                            ${totalRevenue.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className={netProfit > 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">ROI</div>
                          <div className={`text-2xl font-bold ${netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            {roi.toFixed(0)}%
                          </div>
                          <div className={`text-xs ${netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            ${Math.abs(netProfit).toLocaleString()} {netProfit > 0 ? "profit" : "loss"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </div>

              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  <strong>Industry Insight:</strong> Repeat clients convert at 70%+ vs 3-5% for cold leads. 
                  Prioritize high-quality leads with previous funding history for maximum ROI.
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button size="lg" className="btn-gold" onClick={() => setLocation(user ? "/purchase" : "/auth")}>
                {user ? "Start Purchasing Leads" : "Sign Up to Get Started"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* Pricing Preview */}
      <section className="py-20 border-b animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground font-serif" data-testid="heading-pricing-preview">
              <span className="text-gradient-royal">Simple, Transparent Pricing</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the tier that fits your business needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {PRICING_TIERS.map((tier, index) => (
              <Card 
                key={index} 
                className={`relative card-kingdom hover-elevate transition-smooth animate-scale-in ${tier.popular ? 'tier-highlight' : ''} ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : index === 2 ? 'animate-delay-300' : 'animate-delay-400'}`}
                data-testid={`pricing-tier-${tier.tier}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="badge-gold">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl font-serif">{tier.name}</CardTitle>
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
                    className={`w-full ${tier.popular ? 'btn-kingdom' : 'btn-gold'}`}
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
              className="btn-kingdom"
              onClick={() => setLocation("/pricing")}
              data-testid="button-view-full-pricing"
            >
              View Full Pricing Details
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30 border-b animate-fade-in">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground font-serif" data-testid="heading-faq">
              <span className="text-gradient-royal">Frequently Asked Questions</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about our funding leads
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4 animate-slide-up animate-delay-100">
            {FAQS.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-background border rounded-lg px-6 transition-smooth card-kingdom"
                data-testid={`faq-${index}`}
              >
                <AccordionTrigger className="text-left font-semibold font-serif hover:no-underline">
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

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* Contact Information Section */}
      <section className="py-16 bg-muted/30 border-b animate-fade-in">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground font-serif" data-testid="heading-contact-info">
              <span className="text-gradient-royal">Get in Touch</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Need custom pricing or have questions? Contact us directly
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="card-kingdom text-center">
              <CardContent className="pt-6">
                <div className="p-3 rounded-full bg-primary/10 inline-block mb-4">
                  <Phone className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Call Us</h3>
                <a href="tel:+1-555-123-4567" className="text-2xl font-bold text-primary hover:underline">
                  +1 (555) 123-4567
                </a>
                <p className="text-sm text-muted-foreground mt-2">Mon-Fri 9am-5pm EST</p>
              </CardContent>
            </Card>
            
            <Card className="card-kingdom text-center">
              <CardContent className="pt-6">
                <div className="p-3 rounded-full bg-primary/10 inline-block mb-4">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Email Us</h3>
                <a href="mailto:contact@landofleads.com" className="text-lg font-medium text-primary hover:underline break-all">
                  contact@landofleads.com
                </a>
                <p className="text-sm text-muted-foreground mt-2">We respond within 24 hours</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="text-center">
            <Badge className="badge-gold text-lg px-4 py-2">
              Custom Pricing Available - Call or Email for Enterprise Solutions
            </Badge>
          </div>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* Contact Form Section */}
      <section className="py-20 border-b animate-fade-in">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground font-serif" data-testid="heading-contact">
              <span className="text-gradient-royal">Have Questions?</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              We're here to help - reach out and we'll get back to you within 24 hours
            </p>
          </div>

          <Card className="card-kingdom">
            <CardHeader>
              <CardTitle className="font-serif">Contact Us</CardTitle>
              <CardDescription>
                Fill out the form below and we'll get back to you within 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...contactForm}>
                <form onSubmit={contactForm.handleSubmit((data) => contactMutation.mutate(data))} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={contactForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="John Doe" data-testid="input-contact-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="john@example.com" data-testid="input-contact-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={contactForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="(555) 123-4567" data-testid="input-contact-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Your Company Inc." data-testid="input-contact-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={contactForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message *</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Tell us how we can help you..." 
                            className="min-h-[120px]"
                            data-testid="input-contact-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full btn-kingdom"
                    disabled={contactMutation.isPending}
                    data-testid="button-contact-submit"
                  >
                    {contactMutation.isPending ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Elegant Divider */}
      <div className="divider-elegant w-full"></div>

      {/* Compliance & Footer */}
      <section className="py-16 border-b bg-background animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg font-serif">TCPA Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  All leads are sourced in full compliance with the Telephone Consumer Protection Act (TCPA). 
                  Each lead has provided express written consent for contact regarding funding offers.
                </p>
              </CardContent>
            </Card>

            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg font-serif">CAN-SPAM Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We adhere to all CAN-SPAM Act requirements. All email communications include proper 
                  identification, honest subject lines, and clear opt-out mechanisms.
                </p>
              </CardContent>
            </Card>

            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg font-serif">Data Usage Terms</CardTitle>
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
                © 2025 Land of Leads. All rights reserved.
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