import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, ArrowLeft, HelpCircle, Mail, Phone, MessageSquare, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function PaymentCancelPage() {
  const [, setLocation] = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-10 animate-fade-in">
          <div className="relative inline-block animate-scale-in">
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-2xl"></div>
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg relative">
              <XCircle className="w-16 h-16 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mt-8 mb-3 text-gradient-royal font-serif" data-testid="heading-cancelled">
            Payment Cancelled
          </h1>
          <p className="text-xl text-muted-foreground flex items-center justify-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            Your payment was cancelled and you have not been charged.
          </p>
        </div>

        <Card className="mb-8 card-kingdom animate-slide-up">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-serif">No Worries!</CardTitle>
            <CardDescription className="text-lg">
              Your order has been cancelled and no charges have been made to your card.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg p-6 space-y-4 border border-border/50">
              <h3 className="font-semibold text-lg font-serif">Common Reasons for Cancellation</h3>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3 animate-fade-in animate-delay-100">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs text-primary font-medium">1</span>
                  </div>
                  <div>
                    <p className="font-medium font-serif">Need to review pricing options?</p>
                    <p className="text-muted-foreground">Check out our flexible pricing tiers to find the perfect fit for your budget.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 animate-fade-in animate-delay-200">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs text-primary font-medium">2</span>
                  </div>
                  <div>
                    <p className="font-medium font-serif">Want to learn more about lead quality?</p>
                    <p className="text-muted-foreground">Our leads are verified and scored for quality. Contact us for a demo.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 animate-fade-in animate-delay-300">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs text-primary font-medium">3</span>
                  </div>
                  <div>
                    <p className="font-medium font-serif">Technical issues during checkout?</p>
                    <p className="text-muted-foreground">Our support team is here to help resolve any payment issues.</p>
                  </div>
                </li>
              </ul>
            </div>

            <Alert className="border-primary/50 bg-primary/5 animate-fade-in animate-delay-400">
              <HelpCircle className="h-4 w-4" />
              <AlertDescription>
                <strong className="font-serif">Need assistance?</strong> Our sales team is ready to help you find the perfect lead package for your business.
              </AlertDescription>
            </Alert>

            {showHelp && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-scale-in">
                <Card className="card-kingdom cursor-pointer">
                  <CardContent className="p-5 text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-medium font-serif">Email Us</p>
                    <p className="text-sm text-muted-foreground">sales@landofleads.com</p>
                  </CardContent>
                </Card>
                <Card className="card-kingdom cursor-pointer">
                  <CardContent className="p-5 text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Phone className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-medium font-serif">Call Us</p>
                    <p className="text-sm text-muted-foreground">1-800-LEADS-99</p>
                  </CardContent>
                </Card>
                <Card className="card-kingdom cursor-pointer">
                  <CardContent className="p-5 text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-6 h-6 text-primary" />
                    </div>
                    <p className="font-medium font-serif">Live Chat</p>
                    <p className="text-sm text-muted-foreground">Available 9-5 EST</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animate-delay-500">
          <Button 
            size="lg" 
            onClick={() => setLocation("/pricing")}
            className="min-w-[200px] btn-kingdom"
            data-testid="button-back-pricing"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Pricing
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={() => setShowHelp(!showHelp)}
            className="min-w-[200px]"
            data-testid="button-contact-sales"
          >
            <HelpCircle className="w-5 h-5 mr-2" />
            {showHelp ? "Hide Contact Info" : "Contact Sales Team"}
          </Button>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground animate-fade-in animate-delay-500">
          <p className="mb-2">Your cart has been saved and you can complete your purchase anytime.</p>
          <p>No payment information has been stored or charged.</p>
        </div>
      </div>
    </div>
  );
}
