import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
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
  Waves,
  Droplets,
  Fish,
  Anchor,
  Calculator,
  PieChart,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

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
    icon: Waves,
    title: "Crystal Clear Quality Scoring",
    description: "Every lead flows through our proprietary AI algorithm for transparent 0-100 quality scoring.",
  },
  {
    icon: Shield,
    title: "TCPA Compliant Lead Stream",
    description: "100% compliant with TCPA regulations. All leads have provided express written consent for MCA contact.",
  },
  {
    icon: Droplets,
    title: "Instant Lead Delivery",
    description: "Your leads flow to you immediately after purchase. No waiting, start making waves right away.",
  },
  {
    icon: Fish,
    title: "Pure, Filtered Leads",
    description: "Advanced deduplication ensures each lead is fresh and unique - never pay for the same lead twice.",
  },
  {
    icon: Clock,
    title: "24-Hour Download Harbor",
    description: "Secure download links remain anchored for 24 hours, giving you flexibility to access your leads.",
  },
  {
    icon: Anchor,
    title: "Deep Data Lake",
    description: "Choose from our tiered depths - from 50 to 600+ leads with transparent, tide-like pricing.",
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
    question: "How are leads distributed?",
    answer: "Leads are allocated based on tier and quality score. Gold tier gets 60-79 scores, Platinum 70-89, Diamond 80-100, and Elite gets premium 85-100 scores. Each tier ensures you get the quality level you're paying for.",
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
  const { data: user } = useQuery({ queryKey: ["/api/auth/me"] });

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
      return await apiRequest("/api/auth/login", {
        method: "POST",
        body: values,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
      setLocation("/dashboard");
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
      return await apiRequest("/api/auth/register", {
        method: "POST",
        body: signupData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Account created!",
        description: "Welcome to Lakefront Leadworks.",
      });
      setLocation("/dashboard");
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
      return await apiRequest("/api/contact", {
        method: "POST",
        body: values,
      });
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
      <section className="relative bg-gradient-to-b from-primary/10 via-accent/5 to-background border-b">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center space-y-8 mb-12">
            <div className="flex justify-center mb-6 animate-fade-in">
              <Waves className="w-20 h-20 text-primary" />
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-foreground tracking-tight animate-slide-down" data-testid="heading-hero">
              Lakefront Leadworks
            </h1>
            <p className="text-2xl md:text-3xl text-primary font-semibold animate-slide-down animate-delay-100">
              Where Quality MCA Leads Flow to You
            </p>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto animate-slide-up animate-delay-200">
              Dive into our crystal-clear pool of AI-scored Merchant Cash Advance leads. 
              TCPA compliant, instant delivery, and waves of conversion opportunities.
            </p>
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {TRUST_BADGES.map((badge, index) => (
              <Card key={index} className={`text-center animate-scale-in ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : index === 2 ? 'animate-delay-300' : 'animate-delay-400'}`} data-testid={`trust-badge-${index}`}>
                <CardContent className="pt-6 pb-4">
                  <badge.icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <div className="font-semibold text-sm">{badge.title}</div>
                  <div className="text-xs text-muted-foreground">{badge.description}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Auth Forms */}
          {!user && (
            <Card className="max-w-md mx-auto animate-scale-in animate-delay-500">
              <CardHeader>
                <CardTitle>Get Started with Lakefront Leadworks</CardTitle>
                <CardDescription>
                  Sign up or log in to start accessing premium MCA leads
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
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-features">
              Navigate the Lead Ocean with Confidence
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Industry-leading features designed to maximize your conversion rates
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => (
              <Card key={index} className={`hover-elevate transition-smooth animate-slide-up ${index < 3 ? `animate-delay-${(index + 1) * 100}` : index < 5 ? 'animate-delay-400' : 'animate-delay-500'}`} data-testid={`feature-${index}`}>
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
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-how-it-works">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {HOW_IT_WORKS.map((step, index) => (
              <div key={index} className={`relative animate-scale-in ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : 'animate-delay-300'}`} data-testid={`step-${step.step}`}>
                <Card className="h-full transition-smooth hover-elevate">
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

      {/* ROI Calculator Section */}
      <section className="py-20 bg-muted/30 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Calculator className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-roi-calculator">
              ROI Calculator
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Calculate your potential return on investment with MCA leads
            </p>
          </div>

          <Card className="max-w-4xl mx-auto animate-slide-up animate-delay-200">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <PieChart className="w-6 h-6 text-primary" />
                MCA Lead ROI Calculator
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
                    Average MCA Deal Size
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

              <Separator className="my-6" />

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
                  <strong>Industry Insight:</strong> MCA renewals (previous clients) convert at 70%+ vs 3-5% for cold leads. 
                  Prioritize high-quality leads with previous MCA history for maximum ROI.
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button size="lg" onClick={() => setLocation(user ? "/purchase" : "/auth")}>
                {user ? "Start Purchasing Leads" : "Sign Up to Get Started"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16 animate-fade-in">
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
                className={`relative hover-elevate transition-smooth animate-scale-in ${tier.popular ? 'border-primary' : ''} ${index === 0 ? 'animate-delay-100' : index === 1 ? 'animate-delay-200' : index === 2 ? 'animate-delay-300' : 'animate-delay-400'}`}
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
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-faq">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about our MCA leads
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4 animate-slide-up animate-delay-100">
            {FAQS.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-background border rounded-lg px-6 transition-smooth hover-elevate"
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

      {/* Contact Form Section */}
      <section className="py-20 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground" data-testid="heading-contact">
              Get in Touch with Lakefront Leadworks
            </h2>
            <p className="text-xl text-muted-foreground">
              Have questions? We're here to help you navigate the waters
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contact Us</CardTitle>
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
                    className="w-full"
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
                © 2025 Lakefront Leadworks. All rights reserved.
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