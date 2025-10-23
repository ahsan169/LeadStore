import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Download, FileText, Package, Loader2, AlertTriangle } from "lucide-react";
import type { User } from "@shared/schema";

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    // Get session_id from URL params
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    setSessionId(sid);
    
    // Simulate loading for better UX
    setTimeout(() => setIsLoading(false), 1500);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/5 to-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-lg text-muted-foreground">Processing your purchase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Success Animation */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
            <CheckCircle className="w-24 h-24 text-green-500 relative" />
          </div>
          <h1 className="text-4xl font-bold mt-6 mb-2" data-testid="heading-success">
            Payment Successful!
          </h1>
          <p className="text-xl text-muted-foreground">
            Thank you for your purchase, {user?.username || "valued customer"}!
          </p>
        </div>

        {/* Purchase Details Card */}
        <Card className="mb-8 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Your Leads Are Being Prepared</CardTitle>
            <CardDescription className="text-lg">
              We're processing your order and preparing your high-quality MCA leads for download.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Timeline */}
              <div className="relative">
                <div className="absolute left-8 top-8 bottom-0 w-0.5 bg-gradient-to-b from-primary to-transparent"></div>
                
                <div className="space-y-8">
                  {/* Step 1: Payment Confirmed */}
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                        <CheckCircle className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg">Payment Confirmed</h3>
                      <p className="text-muted-foreground">Your payment has been successfully processed</p>
                    </div>
                  </div>

                  {/* Step 2: Processing Leads */}
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg animate-pulse">
                        <Package className="w-8 h-8 text-primary-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg">Processing Your Leads</h3>
                      <p className="text-muted-foreground">We're selecting the best leads matching your criteria</p>
                      <Badge className="mt-2">In Progress</Badge>
                    </div>
                  </div>

                  {/* Step 3: Ready for Download */}
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <Download className="w-8 h-8 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="font-semibold text-lg text-muted-foreground">Ready for Download</h3>
                      <p className="text-muted-foreground">You'll receive an email with download instructions shortly</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  What Happens Next?
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>You'll receive an email confirmation with your receipt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Your leads will be available for download in your dashboard within 5 minutes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Download links expire after 7 days for security</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>All leads include contact information and qualification scores</span>
                  </li>
                </ul>
              </div>

              {sessionId && (
                <div className="text-xs text-muted-foreground text-center">
                  Transaction ID: {sessionId}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            onClick={() => setLocation("/purchases")}
            className="min-w-[200px]"
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