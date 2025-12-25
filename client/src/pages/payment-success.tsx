import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Download, FileText, Package, Loader2, Crown, Sparkles } from "lucide-react";
import type { User } from "@shared/schema";

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    setSessionId(sid);
    
    setTimeout(() => setIsLoading(false), 1500);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/5 to-background">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
            <Loader2 className="w-16 h-16 animate-spin mx-auto text-primary relative" />
          </div>
          <p className="text-lg text-muted-foreground font-serif">Processing your royal order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-10 animate-fade-in">
          <div className="relative inline-block animate-scale-in">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-2xl animate-pulse"></div>
            <div className="absolute -top-2 -right-2">
              <Sparkles className="w-8 h-8 text-amber-500 animate-pulse" />
            </div>
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg relative">
              <CheckCircle className="w-16 h-16 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mt-8 mb-3 text-gradient-royal font-serif" data-testid="heading-success">
            Payment Successful!
          </h1>
          <p className="text-xl text-muted-foreground flex items-center justify-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Thank you for your purchase, {user?.username || "valued customer"}!
          </p>
        </div>

        <Card className="mb-8 card-kingdom animate-slide-up">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-serif flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              Your Leads Are Being Prepared
            </CardTitle>
            <CardDescription className="text-lg">
              We're processing your order and preparing your high-quality MCA leads for download.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="relative">
                <div className="absolute left-8 top-8 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500 via-primary to-transparent"></div>
                
                <div className="space-y-8">
                  <div className="flex items-start gap-4 animate-fade-in">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg glow-success">
                        <CheckCircle className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg font-serif">Payment Confirmed</h3>
                      <p className="text-muted-foreground">Your payment has been successfully processed</p>
                      <Badge className="mt-2 badge-emerald">Complete</Badge>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 animate-fade-in animate-delay-200">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg animate-pulse glow-primary">
                        <Package className="w-8 h-8 text-primary-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg font-serif">Processing Your Leads</h3>
                      <p className="text-muted-foreground">We're selecting the best leads matching your criteria</p>
                      <Badge className="mt-2 badge-gold">In Progress</Badge>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 animate-fade-in animate-delay-400">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                        <Download className="w-8 h-8 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg text-muted-foreground font-serif">Ready for Download</h3>
                      <p className="text-muted-foreground">You'll receive an email with download instructions shortly</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg p-6 space-y-4 border border-border/50 animate-fade-in animate-delay-300">
                <h3 className="font-semibold text-lg flex items-center gap-2 font-serif">
                  <FileText className="w-5 h-5 text-primary" />
                  What Happens Next?
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-primary font-medium">1</span>
                    </span>
                    <span>You'll receive an email confirmation with your receipt</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-primary font-medium">2</span>
                    </span>
                    <span>Your leads will be available for download in your dashboard within 5 minutes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-primary font-medium">3</span>
                    </span>
                    <span>Download links expire after 7 days for security</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-primary font-medium">4</span>
                    </span>
                    <span>All leads include contact information and qualification scores</span>
                  </li>
                </ul>
              </div>

              {sessionId && (
                <div className="text-xs text-muted-foreground text-center pt-2">
                  Transaction ID: <span className="font-mono">{sessionId}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animate-delay-500">
          <Button 
            size="lg" 
            onClick={() => setLocation("/purchases")}
            className="min-w-[200px] btn-kingdom"
            data-testid="button-view-purchases"
          >
            <Package className="w-5 h-5 mr-2" />
            View My Purchases
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={() => setLocation("/dashboard")}
            className="min-w-[200px]"
            data-testid="button-dashboard"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
