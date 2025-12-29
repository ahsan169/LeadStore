import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { loadStripe } from '@stripe/stripe-js';
import { Package, Loader2, Check, Building, Clock, MessageSquare } from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface BulkPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quantity: number;
  priceCalculation?: {
    originalPrice: number;
    discountPercentage: number;
    discountAmount: number;
    finalPrice: number;
    pricePerLead: number;
    discountTier: string;
  };
}

export function BulkPurchaseDialog({
  open,
  onOpenChange,
  quantity,
  priceCalculation
}: BulkPurchaseDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [criteria, setCriteria] = useState({
    industries: [] as string[],
    states: [] as string[],
    minQualityScore: 70,
    isEnriched: false,
  });

  // For custom quote (5000+ leads)
  const [customQuoteData, setCustomQuoteData] = useState({
    companyName: '',
    contactPhone: '',
    timeline: '1-week',
    message: ''
  });

  const isCustomQuote = quantity >= 5000;

  // Create bulk order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (isCustomQuote) {
        return apiRequest('/api/bulk/custom-quote', {
          method: 'POST',
          body: JSON.stringify({
            quantity,
            criteria,
            ...customQuoteData
          })
        } as any);
      } else {
        return apiRequest('/api/bulk/create-order', {
          method: 'POST',
          body: JSON.stringify({
            quantity,
            criteria
          })
        } as any);
      }
    },
    onSuccess: async (response) => {
      const data = response as any;
      if (isCustomQuote) {
        toast({
          title: "Custom Quote Requested",
          description: "Our team will contact you within 24 hours with custom pricing.",
        });
        onOpenChange(false);
      } else {
        // Proceed to Stripe payment
        const stripe = await stripePromise;
        if (stripe && data.clientSecret) {
          const { error } = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: {
              card: {} as any
            }
          });

          if (!error) {
            // Complete the order
            await apiRequest(`/api/bulk/orders/${data.orderId}/complete`, {
              method: 'POST',
              body: JSON.stringify({
                paymentIntentId: data.paymentIntentId
              })
            } as any);

            toast({
              title: "Purchase Successful!",
              description: `Successfully purchased ${quantity} leads with ${priceCalculation?.discountPercentage}% discount.`,
            });

            queryClient.invalidateQueries({ queryKey: ['/api/bulk/orders'] });
            onOpenChange(false);
          } else {
            toast({
              title: "Payment Failed",
              description: error.message,
              variant: "destructive"
            });
          }
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Order Failed",
        description: error.message || "Failed to create bulk order",
        variant: "destructive"
      });
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const industries = [
    'Restaurant', 'Retail Store', 'Healthcare', 'Construction',
    'Manufacturing', 'Technology', 'Real Estate', 'Transportation'
  ];

  const states = [
    'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA'
  ];

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="font-medium mb-4">Select Lead Criteria (Optional)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Customize your bulk order by selecting specific criteria, or skip to get a diverse mix.
              </p>
              
              {/* Industries */}
              <div className="space-y-3">
                <Label>Industries</Label>
                <div className="grid grid-cols-2 gap-2">
                  {industries.map(industry => (
                    <div key={industry} className="flex items-center space-x-2">
                      <Checkbox
                        id={industry}
                        checked={criteria.industries.includes(industry)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCriteria(prev => ({
                              ...prev,
                              industries: [...prev.industries, industry]
                            }));
                          } else {
                            setCriteria(prev => ({
                              ...prev,
                              industries: prev.industries.filter(i => i !== industry)
                            }));
                          }
                        }}
                      />
                      <Label
                        htmlFor={industry}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {industry}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* States */}
              <div className="space-y-3 mt-4">
                <Label>States</Label>
                <div className="grid grid-cols-4 gap-2">
                  {states.map(state => (
                    <div key={state} className="flex items-center space-x-2">
                      <Checkbox
                        id={state}
                        checked={criteria.states.includes(state)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCriteria(prev => ({
                              ...prev,
                              states: [...prev.states, state]
                            }));
                          } else {
                            setCriteria(prev => ({
                              ...prev,
                              states: prev.states.filter(s => s !== state)
                            }));
                          }
                        }}
                      />
                      <Label
                        htmlFor={state}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {state}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Score */}
              <div className="space-y-3 mt-4">
                <Label>Minimum Quality Score</Label>
                <RadioGroup
                  value={criteria.minQualityScore.toString()}
                  onValueChange={(value) => setCriteria(prev => ({
                    ...prev,
                    minQualityScore: parseInt(value)
                  }))}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="60" id="q60" />
                    <Label htmlFor="q60">60+ (Gold)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="70" id="q70" />
                    <Label htmlFor="q70">70+ (Platinum)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="80" id="q80" />
                    <Label htmlFor="q80">80+ (Diamond)</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Enriched Data */}
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id="enriched"
                  checked={criteria.isEnriched}
                  onCheckedChange={(checked) => setCriteria(prev => ({
                    ...prev,
                    isEnriched: checked as boolean
                  }))}
                />
                <Label htmlFor="enriched" className="cursor-pointer">
                  Only include enriched leads (+30% premium data)
                </Label>
              </div>
            </div>
          </div>
        );

      case 2:
        if (isCustomQuote) {
          return (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-4">Request Custom Quote</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  For orders of 5000+ leads, we offer custom pricing. Please provide your details.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    placeholder="Your Company Name"
                    value={customQuoteData.companyName}
                    onChange={(e) => setCustomQuoteData(prev => ({
                      ...prev,
                      companyName: e.target.value
                    }))}
                    data-testid="input-company-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Contact Phone</Label>
                  <Input
                    id="phone"
                    placeholder="(555) 123-4567"
                    value={customQuoteData.contactPhone}
                    onChange={(e) => setCustomQuoteData(prev => ({
                      ...prev,
                      contactPhone: e.target.value
                    }))}
                    data-testid="input-contact-phone"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeline">Timeline</Label>
                  <RadioGroup
                    value={customQuoteData.timeline}
                    onValueChange={(value) => setCustomQuoteData(prev => ({
                      ...prev,
                      timeline: value
                    }))}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="immediate" id="immediate" />
                      <Label htmlFor="immediate">Immediate</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1-week" id="1week" />
                      <Label htmlFor="1week">Within 1 week</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1-month" id="1month" />
                      <Label htmlFor="1month">Within 1 month</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="flexible" id="flexible" />
                      <Label htmlFor="flexible">Flexible</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Additional Requirements</Label>
                  <Textarea
                    id="message"
                    placeholder="Tell us about your specific needs..."
                    rows={4}
                    value={customQuoteData.message}
                    onChange={(e) => setCustomQuoteData(prev => ({
                      ...prev,
                      message: e.target.value
                    }))}
                    data-testid="input-requirements"
                  />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <div>
              <h3 className="font-medium mb-4">Order Summary</h3>
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex justify-between text-sm">
                  <span>Quantity</span>
                  <span className="font-medium">{quantity} leads</span>
                </div>
                {criteria.industries.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Industries</span>
                    <span className="font-medium">{criteria.industries.length} selected</span>
                  </div>
                )}
                {criteria.states.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>States</span>
                    <span className="font-medium">{criteria.states.length} selected</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span>Min Quality</span>
                  <span className="font-medium">{criteria.minQualityScore}+</span>
                </div>
                {criteria.isEnriched && (
                  <div className="flex justify-between text-sm">
                    <span>Enriched Data</span>
                    <Badge variant="secondary">+30% Premium</Badge>
                  </div>
                )}
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between text-sm">
                    <span>Original Price</span>
                    <span className="line-through text-muted-foreground">
                      {formatCurrency(priceCalculation?.originalPrice || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({priceCalculation?.discountPercentage}%)</span>
                    <span>-{formatCurrency(priceCalculation?.discountAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg mt-2">
                    <span>Total</span>
                    <span>{formatCurrency(priceCalculation?.finalPrice || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isCustomQuote ? 'Request Custom Quote' : 'Bulk Purchase'}
          </DialogTitle>
          <DialogDescription>
            {isCustomQuote 
              ? `Request custom pricing for ${quantity} leads`
              : `Purchase ${quantity} leads with ${priceCalculation?.discountPercentage}% volume discount`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center gap-2">
              <div className={`rounded-full p-2 ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <Check className="h-4 w-4" />
              </div>
              <div className={`h-0.5 w-12 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
              <div className={`rounded-full p-2 ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {isCustomQuote ? <MessageSquare className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </div>
            </div>
          </div>

          {renderStep()}
        </div>

        <DialogFooter>
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={createOrderMutation.isPending}
            >
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} data-testid="button-next">
              Next
            </Button>
          ) : (
            <Button
              onClick={() => createOrderMutation.mutate()}
              disabled={createOrderMutation.isPending || 
                (isCustomQuote && !customQuoteData.message)}
              data-testid="button-submit-order"
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : isCustomQuote ? (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Submit Quote Request
                </>
              ) : (
                <>
                  <Package className="mr-2 h-4 w-4" />
                  Proceed to Payment
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}