import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, TrendingUp, DollarSign, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface QuickQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickQuoteModal({ isOpen, onClose }: QuickQuoteModalProps) {
  const { toast } = useToast();
  
  // Calculator states
  const [leadVolume, setLeadVolume] = useState([100]);
  const [leadQuality, setLeadQuality] = useState([70]);
  const [avgDealSize, setAvgDealSize] = useState([50000]);
  const [commissionRate, setCommissionRate] = useState([10]);
  
  // Calculate ROI
  const calculateROI = () => {
    const volume = leadVolume[0];
    const quality = leadQuality[0];
    const dealSize = avgDealSize[0];
    const commission = commissionRate[0];
    
    // Conversion rate based on quality (higher quality = better conversion)
    const conversionRate = quality >= 80 ? 0.12 : quality >= 70 ? 0.08 : 0.05;
    const deals = Math.round(volume * conversionRate);
    const totalRevenue = deals * dealSize * (commission / 100);
    
    // Cost calculation (based on quality tier)
    let costPerLead = quality >= 80 ? 80 : quality >= 70 ? 50 : 25;
    const totalCost = volume * costPerLead;
    
    const roi = totalRevenue - totalCost;
    const roiPercentage = totalCost > 0 ? ((roi / totalCost) * 100).toFixed(0) : 0;
    
    return {
      deals,
      totalRevenue,
      totalCost,
      roi,
      roiPercentage
    };
  };
  
  const results = calculateROI();
  
  const handleGetQuote = () => {
    toast({
      title: "Quote Generated!",
      description: `Your custom quote for ${leadVolume[0]} leads has been prepared. Check your email for details.`,
    });
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" data-testid="modal-quick-quote">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            <span className="text-gradient">MCA Lead ROI Calculator</span>
          </DialogTitle>
          <DialogDescription>
            Calculate your potential return on investment with our premium MCA leads
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          {/* Input Sliders */}
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="lead-volume" className="flex justify-between">
                <span>Lead Volume</span>
                <span className="text-primary font-semibold">{leadVolume[0]} leads</span>
              </Label>
              <Slider
                id="lead-volume"
                value={leadVolume}
                onValueChange={setLeadVolume}
                min={50}
                max={1000}
                step={50}
                className="w-full"
                data-testid="slider-lead-volume"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lead-quality" className="flex justify-between">
                <span>Lead Quality Score</span>
                <span className="text-primary font-semibold">{leadQuality[0]}/100</span>
              </Label>
              <Slider
                id="lead-quality"
                value={leadQuality}
                onValueChange={setLeadQuality}
                min={60}
                max={100}
                step={5}
                className="w-full"
                data-testid="slider-lead-quality"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Gold (60-69)</span>
                <span>Platinum (70-79)</span>
                <span>Diamond (80-100)</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deal-size" className="flex justify-between">
                <span>Average Deal Size</span>
                <span className="text-primary font-semibold">${(avgDealSize[0] / 1000).toFixed(0)}k</span>
              </Label>
              <Slider
                id="deal-size"
                value={avgDealSize}
                onValueChange={setAvgDealSize}
                min={10000}
                max={250000}
                step={10000}
                className="w-full"
                data-testid="slider-deal-size"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="commission" className="flex justify-between">
                <span>Commission Rate</span>
                <span className="text-primary font-semibold">{commissionRate[0]}%</span>
              </Label>
              <Slider
                id="commission"
                value={commissionRate}
                onValueChange={setCommissionRate}
                min={5}
                max={20}
                step={1}
                className="w-full"
                data-testid="slider-commission"
              />
            </div>
          </div>
          
          {/* Results Cards */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Projected Results</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Deals</p>
                      <p className="text-2xl font-bold">{results.deals}</p>
                    </div>
                    <Users className="w-8 h-8 text-primary/20" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold">${(results.totalRevenue / 1000).toFixed(0)}k</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-500/20" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card className={results.roi > 0 ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Investment Required</p>
                      <p className="text-lg font-semibold">${(results.totalCost / 1000).toFixed(1)}k</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Net ROI</p>
                      <p className={`text-2xl font-bold ${results.roi > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${(Math.abs(results.roi) / 1000).toFixed(1)}k
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <Badge className={`text-lg py-2 px-4 ${results.roi > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      {results.roiPercentage}% ROI
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              <p className="font-medium mb-1">Calculation Notes:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Conversion rates: Gold 5%, Platinum 8%, Diamond 12%</li>
                <li>Based on industry average MCA conversion metrics</li>
                <li>Actual results may vary based on your sales process</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} data-testid="button-quote-cancel">
            Cancel
          </Button>
          <Button onClick={handleGetQuote} data-testid="button-get-quote">
            Get Custom Quote
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}