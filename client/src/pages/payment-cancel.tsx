import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, ArrowLeft, HelpCircle, Mail, Phone, MessageSquare } from "lucide-react";
import { useState } from "react";

export default function PaymentCancelPage() {
  const [, setLocation] = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Cancel Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-yellow-500 rounded-full blur-xl opacity-20"></div>
            <XCircle className="w-24 h-24 text-yellow-500 relative" />
          </div>
          <h1 className="text-4xl font-bold mt-6 mb-2" data-testid="heading-cancelled">
            Payment Cancelled
          </h1>
          <p className="text-xl text-muted-foreground">
            Your payment was cancelled and you have not been charged.
          </p>
        </div>

        {/* Main Content Card */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">No Worries!</CardTitle>
            <CardDescription className="text-lg">
              Your order has been cancelled and no charges have been made to your card.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Reasons for cancellation */}
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg">Common Reasons for Cancellation</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <span className="text-xs text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Need to review pricing options?</p>
                    <p className="text-muted-foreground">Check out our flexible pricing tiers to find the perfect fit for your budget.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <span className="text-xs text-primary">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Want to learn more about lead quality?</p>
                    <p className="text-muted-foreground">Our leads are verified and scored for quality. Contact us for a demo.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <span className="text-xs text-primary">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Technical issues during checkout?</p>
                    <p className="text-muted-foreground">Our support team is here to help resolve any payment issues.</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Help Section */}
            <Alert className="border-primary/50 bg-primary/5">
              <HelpCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Need assistance?</strong> Our sales team is ready to help you find the perfect lead package for your business.
              </AlertDescription>
            </Alert>

            {/* Contact Options */}
            {showHelp && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                <Card className="hover-elevate cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Mail className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Email Us</p>
                    <p className="text-sm text-muted-foreground">sales@landofleads.com</p>
                  </CardContent>
                </Card>
                <Card className="hover-elevate cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Phone className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Call Us</p>
                    <p className="text-sm text-muted-foreground">1-800-LEADS-99</p>
                  </CardContent>
                </Card>
                <Card className="hover-elevate cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Live Chat</p>
                    <p className="text-sm text-muted-foreground">Available 9-5 EST</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            onClick={() => setLocation("/pricing")}
            className="min-w-[200px]"
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

        {/* Reassurance Message */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p className="mb-2">Your cart has been saved and you can complete your purchase anytime.</p>
          <p>No payment information has been stored or charged.</p>
        </div>
      </div>
    </div>
  );
}