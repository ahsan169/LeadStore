import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, CheckCircle, Award, TrendingUp, Users, Building2 } from "lucide-react";
import { Crown } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({ 
    username: "", 
    email: "", 
    password: "",
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      return apiRequest("POST", "/api/auth/login", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in to your account.",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Authentication Failed",
        description: "Please check your credentials and try again.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/auth/register", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome to Land of Leads!",
        description: "Your account has been created successfully.",
      });
      setLocation("/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please ensure all fields are filled correctly.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerData);
  };

  const trustIndicators = [
    { icon: Shield, text: "Bank-Level Security", subtext: "256-bit SSL encryption" },
    { icon: CheckCircle, text: "TCPA Compliant", subtext: "Verified lead sources" },
    { icon: Users, text: "10,000+ Clients", subtext: "Trusted nationwide" },
    { icon: Award, text: "Industry Leader", subtext: "Since 2020" },
  ];

  return (
    <div className="min-h-screen bg-hero-kingdom">
      <div className="w-full bg-card/80 dark:bg-card/90 border-b border-border/50 backdrop-blur-sm animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="w-4 h-4 text-primary" />
              <span>Secure Connection</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-4 h-4 text-primary" />
              <span>TCPA Compliant</span>
            </div>
          </div>
          <Badge className="badge-emerald">
            <CheckCircle className="w-3 h-3 mr-1" />
            Verified Business
          </Badge>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-52px)]">
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2d6a4f] via-[#1b4332] to-[#081c15] dark:from-[#1b4332] dark:via-[#081c15] dark:to-[#040d0a] relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4a574\' fill-opacity=\'0.2\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4a574] rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#40916c] rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
          
          <div className="relative z-10 flex flex-col justify-center px-12 lg:px-16 text-white animate-slide-up">
            <div className="mb-12">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-24 h-24 rounded-2xl shadow-2xl ring-4 ring-[#d4a574]/30 bg-gradient-to-br from-[#2d6a4f] via-[#40916c] to-[#d4a574] flex items-center justify-center glow-crown">
                  <Crown className="w-12 h-12 text-[#d4a574]" />
                </div>
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight font-serif">
                <span className="text-[#74c69d]">Land</span>
                <span className="text-white/60 mx-2">of</span>
                <span className="block text-[#d4a574]">Leads</span>
              </h1>
              <p className="text-xl text-[#95d5b2] mb-8">
                Your Kingdom of Premium MCA Leads
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start gap-4 animate-fade-in animate-delay-100">
                <div className="w-12 h-12 rounded-lg bg-[#d4a574]/20 border border-[#d4a574]/30 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-[#d4a574]" />
                </div>
                <div>
                  <h3 className="font-serif font-semibold text-lg mb-1 text-[#d4a574]">AI-Verified Leads</h3>
                  <p className="text-[#95d5b2]/80">Advanced AI scoring ensures only the highest quality MCA leads</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 animate-fade-in animate-delay-200">
                <div className="w-12 h-12 rounded-lg bg-[#d4a574]/20 border border-[#d4a574]/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-[#d4a574]" />
                </div>
                <div>
                  <h3 className="font-serif font-semibold text-lg mb-1 text-[#d4a574]">Enterprise-Grade Platform</h3>
                  <p className="text-[#95d5b2]/80">Secure, scalable infrastructure trusted by leading brokers</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 animate-fade-in animate-delay-300">
                <div className="w-12 h-12 rounded-lg bg-[#d4a574]/20 border border-[#d4a574]/30 flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-[#d4a574]" />
                </div>
                <div>
                  <h3 className="font-serif font-semibold text-lg mb-1 text-[#d4a574]">Exclusive Network</h3>
                  <p className="text-[#95d5b2]/80">Access to pre-qualified merchant leads nationwide</p>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-[#d4a574]/30">
              <p className="text-sm text-[#95d5b2]/70 mb-3">Trusted by industry leaders</p>
              <div className="flex items-center gap-4 flex-wrap">
                <Badge className="bg-[#d4a574]/20 border-[#d4a574]/40 text-[#d4a574]">
                  ISO 27001 Certified
                </Badge>
                <Badge className="bg-[#d4a574]/20 border-[#d4a574]/40 text-[#d4a574]">
                  SOC 2 Type II
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 animate-fade-in">
          <div className="w-full max-w-md">
            <div className="lg:hidden text-center mb-8 animate-slide-up">
              <div className="w-20 h-20 mx-auto mb-4 rounded-xl shadow-lg bg-gradient-to-br from-[#2d6a4f] via-[#40916c] to-[#d4a574] flex items-center justify-center glow-crown">
                <Crown className="w-10 h-10 text-[#d4a574]" />
              </div>
              <h2 className="text-3xl font-bold font-serif text-gradient-royal">
                Land of Leads
              </h2>
              <p className="text-muted-foreground mt-2">
                Your Kingdom of Premium MCA Leads
              </p>
            </div>

            <Card className="card-kingdom rounded-xl animate-slide-up animate-delay-100">
              <Tabs defaultValue="login" className="w-full">
                <CardHeader className="pb-4">
                  <h3 className="text-xl font-serif font-semibold text-center text-gradient-royal mb-4">
                    Welcome to Your Kingdom
                  </h3>
                  <TabsList className="grid w-full grid-cols-2 h-12 bg-muted/50">
                    <TabsTrigger value="login" className="text-base font-medium" data-testid="tab-login">
                      Sign In
                    </TabsTrigger>
                    <TabsTrigger value="register" className="text-base font-medium" data-testid="tab-register">
                      Create Account
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <TabsContent value="login">
                  <form onSubmit={handleLogin}>
                    <CardContent className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="login-username" className="text-base font-medium font-serif">
                          Username
                        </Label>
                        <Input
                          id="login-username"
                          placeholder="Enter your username"
                          value={loginData.username}
                          onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                          required
                          className="h-12 text-base input-elegant"
                          data-testid="input-login-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-base font-medium font-serif">
                          Password
                        </Label>
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="Enter your password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          required
                          className="h-12 text-base input-elegant"
                          data-testid="input-login-password"
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded border-primary/50 text-primary focus:ring-primary/30" />
                          <span className="text-muted-foreground">Remember me</span>
                        </label>
                        <a href="#" className="text-primary hover:text-primary/80 transition-colors">
                          Forgot password?
                        </a>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                      <div className="divider-elegant w-full my-2" />
                      <Button 
                        type="submit" 
                        className="w-full h-12 text-base font-semibold btn-kingdom"
                        disabled={loginMutation.isPending}
                        data-testid="button-login"
                      >
                        {loginMutation.isPending ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Signing in...
                          </span>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 mr-2" />
                            Enter Your Kingdom
                          </>
                        )}
                      </Button>
                      
                      <div className="text-center text-sm text-muted-foreground">
                        By signing in, you agree to our{" "}
                        <a href="#" className="text-primary hover:text-primary/80 transition-colors">Terms of Service</a>
                        {" "}and{" "}
                        <a href="#" className="text-primary hover:text-primary/80 transition-colors">Privacy Policy</a>
                      </div>
                    </CardFooter>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister}>
                    <CardContent className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="register-username" className="text-base font-medium font-serif">
                          Username
                        </Label>
                        <Input
                          id="register-username"
                          placeholder="Choose a username"
                          value={registerData.username}
                          onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                          required
                          className="h-12 text-base input-elegant"
                          data-testid="input-register-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-email" className="text-base font-medium font-serif">
                          Business Email
                        </Label>
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="your@company.com"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                          required
                          className="h-12 text-base input-elegant"
                          data-testid="input-register-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className="text-base font-medium font-serif">
                          Password
                        </Label>
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="Create a strong password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                          required
                          className="h-12 text-base input-elegant"
                          data-testid="input-register-password"
                        />
                        <p className="text-xs text-muted-foreground">
                          Must be at least 8 characters with a mix of letters and numbers
                        </p>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                      <div className="divider-elegant w-full my-2" />
                      <Button 
                        type="submit" 
                        className="w-full h-12 text-base font-semibold btn-gold"
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Creating account...
                          </span>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 mr-2" />
                            Claim Your Crown
                          </>
                        )}
                      </Button>
                      
                      <div className="text-center text-sm text-muted-foreground">
                        By creating an account, you agree to our{" "}
                        <a href="#" className="text-primary hover:text-primary/80 transition-colors">Terms of Service</a>
                        {" "}and{" "}
                        <a href="#" className="text-primary hover:text-primary/80 transition-colors">Privacy Policy</a>
                      </div>
                    </CardFooter>
                  </form>
                </TabsContent>
              </Tabs>
            </Card>

            <div className="mt-8 animate-slide-up animate-delay-200">
              <div className="divider-elegant mb-6" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {trustIndicators.map((indicator, index) => (
                  <div key={index} className="text-center group animate-fade-in" style={{ animationDelay: `${(index + 3) * 100}ms` }}>
                    <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:bg-primary/20 dark:group-hover:bg-primary/30 transition-colors">
                      <indicator.icon className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground font-serif">{indicator.text}</p>
                    <p className="text-xs text-muted-foreground">{indicator.subtext}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
