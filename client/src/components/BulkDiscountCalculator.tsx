import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calculator, TrendingUp, Package, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface BulkPriceCalculation {
  quantity: number;
  basePrice: number;
  originalPrice: number;
  discountPercentage: number;
  discountAmount: number;
  finalPrice: number;
  pricePerLead: number;
  discountTier: string;
  savings: number;
}

interface BulkDiscountCalculatorProps {
  onProceedToPurchase?: (quantity: number) => void;
}

export function BulkDiscountCalculator({ onProceedToPurchase }: BulkDiscountCalculatorProps) {
  const [quantity, setQuantity] = useState(500);
  const [priceCalculation, setPriceCalculation] = useState<BulkPriceCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Fetch discount tiers
  const { data: discountTiers } = useQuery<any[]>({
    queryKey: ['/api/bulk/discounts']
  });

  // Calculate price when quantity changes
  useEffect(() => {
    const calculatePrice = async () => {
      setIsCalculating(true);
      try {
        const response = await apiRequest('POST', '/api/bulk/calculate-discount', { quantity });
        setPriceCalculation(response as any);
      } catch (error) {
        console.error('Failed to calculate price:', error);
      } finally {
        setIsCalculating(false);
      }
    };

    const debounceTimer = setTimeout(calculatePrice, 300);
    return () => clearTimeout(debounceTimer);
  }, [quantity]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Volume Discount Calculator
        </CardTitle>
        <CardDescription>
          Calculate your savings with bulk purchases
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quantity Selector */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Number of Leads</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {formatNumber(quantity)}
              </Badge>
              {quantity >= 5000 && (
                <Badge variant="default" className="bg-gradient-to-r from-purple-500 to-pink-500">
                  <Zap className="h-3 w-3 mr-1" />
                  Custom Pricing
                </Badge>
              )}
            </div>
          </div>
          
          <Slider
            value={[quantity]}
            onValueChange={(value) => setQuantity(value[0])}
            min={100}
            max={10000}
            step={100}
            className="w-full"
            data-testid="slider-quantity"
          />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>100</span>
            <span>2,500</span>
            <span>5,000</span>
            <span>10,000+</span>
          </div>
        </div>

        {/* Discount Tiers */}
        {discountTiers && (
          <div className="space-y-2">
            <div className="text-sm font-medium mb-2">Volume Discount Tiers</div>
            <div className="grid grid-cols-2 gap-2">
              {discountTiers.map((tier: any) => {
                const isActive = quantity >= tier.minQuantity && 
                  (tier.maxQuantity === null || quantity <= tier.maxQuantity);
                return (
                  <div
                    key={tier.tierName}
                    className={`p-2 rounded-lg border transition-all ${
                      isActive 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="font-medium text-xs">
                      {tier.tierName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tier.minQuantity}{tier.maxQuantity ? `-${tier.maxQuantity}` : '+'} leads
                    </div>
                    <Badge 
                      variant={isActive ? "default" : "secondary"}
                      className="mt-1"
                    >
                      {tier.discountPercentage}% OFF
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Price Calculation */}
        {priceCalculation && !isCalculating && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Original Price</span>
                <span className="text-sm line-through text-muted-foreground">
                  {formatCurrency(priceCalculation.originalPrice)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Discount ({priceCalculation.discountPercentage}%)
                </span>
                <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200">
                  -{formatCurrency(priceCalculation.discountAmount)}
                </Badge>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">Total Price</span>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {formatCurrency(priceCalculation.finalPrice)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(priceCalculation.pricePerLead)} per lead
                  </div>
                </div>
              </div>
            </div>

            {/* Savings Highlight */}
            {priceCalculation.savings > 0 && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    You save {formatCurrency(priceCalculation.savings)} with bulk pricing!
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {quantity >= 5000 ? (
                <Button 
                  className="w-full"
                  size="lg"
                  onClick={() => onProceedToPurchase?.(quantity)}
                  data-testid="button-request-quote"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Request Custom Quote
                </Button>
              ) : (
                <Button 
                  className="w-full"
                  size="lg"
                  onClick={() => onProceedToPurchase?.(quantity)}
                  data-testid="button-proceed-purchase"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Proceed to Purchase
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isCalculating && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}