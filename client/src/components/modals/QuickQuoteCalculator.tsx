import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Calculator, TrendingUp, DollarSign, Users, Calendar, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

interface QuickQuoteCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickQuoteCalculator({ isOpen, onClose }: QuickQuoteCalculatorProps) {
  const [, setLocation] = useLocation();
  
  // Calculator states
  const [leadVolume, setLeadVolume] = useState(200);
  const [qualityTier, setQualityTier] = useState('platinum');
  const [conversionRate, setConversionRate] = useState(2.5);
  const [avgDealSize, setAvgDealSize] = useState(50000);
  const [commissionRate, setCommissionRate] = useState(10);
  
  // Pricing by tier
  const tierPricing = {
    gold: { pricePerLead: 10, minQuality: 60, maxQuality: 79 },
    platinum: { pricePerLead: 7.5, minQuality: 70, maxQuality: 89 },
    diamond: { pricePerLead: 6.67, minQuality: 80, maxQuality: 100 },
  };
  
  // Calculate ROI
  const selectedTier = tierPricing[qualityTier as keyof typeof tierPricing];
  const totalCost = leadVolume * selectedTier.pricePerLead;
  const expectedConversions = Math.round((leadVolume * conversionRate) / 100);
  const totalRevenue = expectedConversions * (avgDealSize * commissionRate / 100);
  const netProfit = totalRevenue - totalCost;
  const roi = ((netProfit / totalCost) * 100).toFixed(0);
  
  const handleGetStarted = () => {
    onClose();
    setLocation('/pricing');
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl" data-testid="modal-quick-quote">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Calculator className="w-6 h-6 text-primary" />
            Quick ROI Calculator
          </DialogTitle>
          <DialogDescription>
            Calculate your potential return on investment with our premium MCA leads
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Lead Volume */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="lead-volume" className="text-base font-medium">
                <Users className="w-4 h-4 inline mr-2" />
                Number of Leads
              </Label>
              <span className="font-bold text-lg">{leadVolume}</span>
            </div>
            <Slider
              id="lead-volume"
              value={[leadVolume]}
              onValueChange={(value) => setLeadVolume(value[0])}
              min={50}
              max={1000}
              step={50}
              className="w-full"
            />
          </div>
          
          {/* Quality Tier */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Quality Tier</Label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(tierPricing).map(([tier, config]) => (
                <Button
                  key={tier}
                  variant={qualityTier === tier ? 'default' : 'outline'}
                  onClick={() => setQualityTier(tier)}
                  className="capitalize"
                  data-testid={`button-tier-${tier}`}
                >
                  <div className="text-center">
                    <div className="font-bold">{tier}</div>
                    <div className="text-xs opacity-80">
                      {config.minQuality}-{config.maxQuality} score
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
          
          {/* Conversion Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="conversion-rate" className="text-base font-medium">
                <TrendingUp className="w-4 h-4 inline mr-2" />
                Expected Conversion Rate
              </Label>
              <span className="font-bold text-lg">{conversionRate}%</span>
            </div>
            <Slider
              id="conversion-rate"
              value={[conversionRate]}
              onValueChange={(value) => setConversionRate(value[0])}
              min={0.5}
              max={10}
              step={0.5}
              className="w-full"
            />
          </div>
          
          {/* Average Deal Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="deal-size" className="text-base font-medium">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Average Deal Size
              </Label>
              <span className="font-bold text-lg">${avgDealSize.toLocaleString()}</span>
            </div>
            <Slider
              id="deal-size"
              value={[avgDealSize]}
              onValueChange={(value) => setAvgDealSize(value[0])}
              min={10000}
              max={200000}
              step={5000}
              className="w-full"
            />
          </div>
          
          {/* Commission Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="commission" className="text-base font-medium">
                Commission Rate
              </Label>
              <span className="font-bold text-lg">{commissionRate}%</span>
            </div>
            <Slider
              id="commission"
              value={[commissionRate]}
              onValueChange={(value) => setCommissionRate(value[0])}
              min={5}
              max={20}
              step={1}
              className="w-full"
            />
          </div>
          
          {/* Results Card */}
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-secondary/10">
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Your Projected ROI</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Investment</p>
                  <p className="text-2xl font-bold text-destructive">
                    ${totalCost.toLocaleString()}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Expected Revenue</p>
                  <p className="text-2xl font-bold text-primary">
                    ${totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Profit</p>
                    <p className="text-3xl font-bold text-green-600">
                      ${netProfit.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">ROI</p>
                    <p className="text-3xl font-bold text-green-600">
                      {roi}%
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground pt-2 space-y-1">
                <p>• Based on {expectedConversions} successful conversions</p>
                <p>• Industry average conversion: 1-3% for quality leads</p>
                <p>• Our human-sourced leads typically outperform industry averages</p>
              </div>
            </div>
          </Card>
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-calculator-close">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Demo
          </Button>
          <Button onClick={handleGetStarted} data-testid="button-calculator-get-started">
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}