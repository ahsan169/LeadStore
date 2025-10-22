import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const TIER_DETAILS = {
  gold: { name: "Gold", price: 500, leads: 50 },
  platinum: { name: "Platinum", price: 1500, leads: 200 },
  diamond: { name: "Diamond", price: 4000, leads: 600 },
};

function CheckoutForm({ purchaseId, tier }: { purchaseId: string; tier: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/purchases`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
      setIsProcessing(false);
    } else {
      toast({
        title: "Payment successful!",
        description: "Your leads are being prepared for download",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      setLocation("/purchases");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLocation("/pricing")}
          className="flex-1"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pricing
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1"
          data-testid="button-pay"
        >
          {isProcessing ? "Processing..." : "Complete Purchase"}
        </Button>
      </div>
    </form>
  );
}

export default function PurchaseTierPage() {
  const { tier } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);

  const tierInfo = TIER_DETAILS[tier as keyof typeof TIER_DETAILS];

  const createPurchaseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/purchases", {
        tier,
        leadCount: tierInfo.leads,
      });
    },
    onSuccess: (data: any) => {
      setClientSecret(data.clientSecret);
      setPurchaseId(data.purchaseId);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create purchase",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (!tierInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Invalid Tier</h2>
          <Button onClick={() => setLocation("/pricing")} data-testid="button-back-pricing">
            Back to Pricing
          </Button>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold" data-testid="heading-purchase">
              Purchase {tierInfo.name} Package
            </h1>
            <p className="text-muted-foreground">Review your order details</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Package</span>
              <span className="font-medium">{tierInfo.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Number of Leads</span>
              <span className="font-medium">{tierInfo.leads}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Price per Lead</span>
              <span className="font-medium">${(tierInfo.price / tierInfo.leads).toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-3 text-lg font-bold">
              <span>Total</span>
              <span data-testid="text-total">${tierInfo.price}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => createPurchaseMutation.mutate()}
              disabled={createPurchaseMutation.isPending}
              className="w-full"
              data-testid="button-continue"
            >
              {createPurchaseMutation.isPending ? "Preparing..." : "Continue to Payment"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold">Complete Your Purchase</h1>
          <p className="text-muted-foreground">
            {tierInfo.leads} {tierInfo.name} leads for ${tierInfo.price}
          </p>
        </CardHeader>
        <CardContent>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm purchaseId={purchaseId!} tier={tier!} />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}
