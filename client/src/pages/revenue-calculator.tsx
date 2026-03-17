import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, PieChart, TrendingUp, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export default function RevenueCalculatorPage() {
  const [, setLocation] = useLocation();
  
  // ROI Calculator states
  const [leadVolume, setLeadVolume] = useState(100);
  const [leadQuality, setLeadQuality] = useState(70);
  const [avgDealSize, setAvgDealSize] = useState(50000);
  const [commissionRate, setCommissionRate] = useState(10);

  // Check if user is authenticated
  const { data: user } = useQuery<User | null>({ queryKey: ["/api/auth/me"] });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-8 animate-fade-in">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Calculator className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground font-serif">
              <span className="text-gradient-royal">Revenue Calculator</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Calculate your potential return on investment with funding leads
            </p>
          </div>

          <Card className="card-kingdom animate-slide-up">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2 font-serif">
                <PieChart className="w-6 h-6 text-primary" />
                Funding Lead ROI Calculator
              </CardTitle>
              <CardDescription>
                Adjust the sliders to see your potential returns based on industry averages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Volume */}
                <div className="space-y-2">
                  <Label htmlFor="lead-volume" className="text-sm font-medium">
                    Lead Volume
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{leadVolume}</span>
                    <span className="text-sm text-muted-foreground">leads/month</span>
                  </div>
                  <Slider
                    id="lead-volume"
                    value={[leadVolume]}
                    onValueChange={([value]) => setLeadVolume(value)}
                    min={10}
                    max={1000}
                    step={10}
                    className="w-full"
                  />
                </div>

                {/* Lead Quality */}
                <div className="space-y-2">
                  <Label htmlFor="lead-quality" className="text-sm font-medium">
                    Average Lead Quality Score
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{leadQuality}</span>
                    <span className="text-sm text-muted-foreground">quality score</span>
                  </div>
                  <Slider
                    id="lead-quality"
                    value={[leadQuality]}
                    onValueChange={([value]) => setLeadQuality(value)}
                    min={60}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                {/* Average Deal Size */}
                <div className="space-y-2">
                  <Label htmlFor="deal-size" className="text-sm font-medium">
                    Average Deal Size
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">
                      ${(avgDealSize / 1000).toFixed(0)}K
                    </span>
                    <span className="text-sm text-muted-foreground">per deal</span>
                  </div>
                  <Slider
                    id="deal-size"
                    value={[avgDealSize]}
                    onValueChange={([value]) => setAvgDealSize(value)}
                    min={10000}
                    max={200000}
                    step={5000}
                    className="w-full"
                  />
                </div>

                {/* Commission Rate */}
                <div className="space-y-2">
                  <Label htmlFor="commission" className="text-sm font-medium">
                    Commission Rate
                  </Label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">{commissionRate}%</span>
                    <span className="text-sm text-muted-foreground">per deal</span>
                  </div>
                  <Slider
                    id="commission"
                    value={[commissionRate]}
                    onValueChange={([value]) => setCommissionRate(value)}
                    min={5}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="my-6 h-[1px] w-full bg-border" />

              {/* ROI Calculations */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Projected Results</h3>
                
                {(() => {
                  // Calculate conversion rates based on quality score
                  const conversionRate = leadQuality >= 90 ? 0.07 
                    : leadQuality >= 80 ? 0.05 
                    : leadQuality >= 70 ? 0.035 
                    : 0.025;
                  
                  // Calculate cost per lead based on quality
                  const costPerLead = leadQuality >= 90 ? 75 
                    : leadQuality >= 80 ? 62.5 
                    : leadQuality >= 70 ? 50 
                    : 37.5;
                  
                  const totalLeadCost = leadVolume * costPerLead;
                  const expectedDeals = Math.floor(leadVolume * conversionRate);
                  const totalRevenue = expectedDeals * avgDealSize * (commissionRate / 100);
                  const netProfit = totalRevenue - totalLeadCost;
                  const roi = totalLeadCost > 0 ? ((netProfit / totalLeadCost) * 100) : 0;
                  
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Lead Investment</div>
                          <div className="text-2xl font-bold text-foreground">
                            ${totalLeadCost.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Expected Deals</div>
                          <div className="text-2xl font-bold text-foreground">
                            {expectedDeals}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(conversionRate * 100).toFixed(1)}% conversion
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">Total Revenue</div>
                          <div className="text-2xl font-bold text-primary">
                            ${totalRevenue.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className={netProfit > 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}>
                        <CardContent className="pt-6">
                          <div className="text-sm text-muted-foreground">ROI</div>
                          <div className={`text-2xl font-bold ${netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            {roi.toFixed(0)}%
                          </div>
                          <div className={`text-xs ${netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            ${Math.abs(netProfit).toLocaleString()} {netProfit > 0 ? "profit" : "loss"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </div>

              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  <strong>Industry Insight:</strong> Repeat clients convert at 70%+ vs 3-5% for cold leads. 
                  Prioritize high-quality leads with previous funding history for maximum ROI.
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button 
                size="lg" 
                className="btn-kingdom" 
                onClick={() => setLocation(user ? "/company-search" : "/auth")}
              >
                {user ? "Start Finding Leads" : "Sign Up to Get Started"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}





