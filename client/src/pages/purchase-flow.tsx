import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Building2, 
  DollarSign, 
  Calendar, 
  CreditCard, 
  MapPin, 
  TrendingUp,
  Filter,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  Lock,
  Users
} from "lucide-react";
import type { Lead } from "@shared/schema";

export default function PurchaseFlowPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Filter states
  const [filters, setFilters] = useState({
    industry: "all",
    minRevenue: 0,
    maxRevenue: 10000000,
    stateCode: "all",
    minTimeInBusiness: 0,
    minCreditScore: 500,
    maxCreditScore: 850,
    exclusivityStatus: "all",
    previousMCAHistory: "all",
    urgencyLevel: "all",
    leadAge: "all",
    minQualityScore: 60,
    maxQualityScore: 100,
  });
  
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [purchaseType, setPurchaseType] = useState<"individual" | "package">("package");
  const [packageSize, setPackageSize] = useState(50);
  
  // Fetch filtered leads
  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads/filtered", filters],
    enabled: true,
  });
  
  // Fetch pricing info
  const { data: pricingInfo } = useQuery({
    queryKey: ["/api/pricing/calculate", { 
      leadIds: Array.from(selectedLeads),
      packageSize,
      filters 
    }],
    enabled: selectedLeads.size > 0 || purchaseType === "package",
  });
  
  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/purchases/create', 'POST', data);
    },
    onSuccess: (response) => {
      toast({
        title: "Purchase Successful!",
        description: `You've successfully purchased ${(response as any).leadCount} leads.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      setLocation('/purchases');
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to complete purchase",
        variant: "destructive",
      });
    },
  });
  
  const handleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((l: Lead) => l.id)));
    }
  };
  
  const handleLeadToggle = (leadId: string) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    setSelectedLeads(newSelection);
  };
  
  const handlePurchase = () => {
    const purchaseData = purchaseType === "individual" 
      ? { leadIds: Array.from(selectedLeads), type: "individual" }
      : { packageSize, filters, type: "package" };
      
    purchaseMutation.mutate(purchaseData);
  };
  
  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2" data-testid="heading-purchase">
          Purchase Funding Leads
        </h1>
        <p className="text-lg text-muted-foreground">
          Filter and select high-quality leads tailored to your needs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Industry Filter */}
              <div>
                <Label>Industry</Label>
                <Select value={filters.industry} onValueChange={(v) => setFilters({...filters, industry: v})}>
                  <SelectTrigger data-testid="select-industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="trucking">Trucking</SelectItem>
                    <SelectItem value="construction">Construction</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="hospitality">Hospitality</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Revenue Range */}
              <div>
                <Label>Annual Revenue</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span>{formatCurrency(filters.minRevenue)}</span>
                    <span>{formatCurrency(filters.maxRevenue)}</span>
                  </div>
                  <Slider
                    value={[filters.minRevenue, filters.maxRevenue]}
                    onValueChange={([min, max]) => setFilters({...filters, minRevenue: min, maxRevenue: max})}
                    max={10000000}
                    step={50000}
                    className="w-full"
                    data-testid="slider-revenue"
                  />
                </div>
              </div>
              
              {/* State Filter */}
              <div>
                <Label>State</Label>
                <Select value={filters.stateCode} onValueChange={(v) => setFilters({...filters, stateCode: v})}>
                  <SelectTrigger data-testid="select-state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    <SelectItem value="CA">California</SelectItem>
                    <SelectItem value="NY">New York</SelectItem>
                    <SelectItem value="TX">Texas</SelectItem>
                    <SelectItem value="FL">Florida</SelectItem>
                    <SelectItem value="PA">Pennsylvania</SelectItem>
                    <SelectItem value="IL">Illinois</SelectItem>
                    <SelectItem value="OH">Ohio</SelectItem>
                    <SelectItem value="GA">Georgia</SelectItem>
                    <SelectItem value="NC">North Carolina</SelectItem>
                    <SelectItem value="MI">Michigan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Credit Score Range */}
              <div>
                <Label>Credit Score Range</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span>{filters.minCreditScore}</span>
                    <span>{filters.maxCreditScore}</span>
                  </div>
                  <Slider
                    value={[filters.minCreditScore, filters.maxCreditScore]}
                    onValueChange={([min, max]) => setFilters({...filters, minCreditScore: min, maxCreditScore: max})}
                    min={300}
                    max={850}
                    step={10}
                    className="w-full"
                    data-testid="slider-credit"
                  />
                </div>
              </div>
              
              {/* Previous Funding History */}
              <div>
                <Label>Previous Funding History</Label>
                <Select value={filters.previousMCAHistory} onValueChange={(v) => setFilters({...filters, previousMCAHistory: v})}>
                  <SelectTrigger data-testid="select-mca-history">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="none">No Previous Funding</SelectItem>
                    <SelectItem value="previous_paid">Previous Paid Off</SelectItem>
                    <SelectItem value="current">Current Funding</SelectItem>
                    <SelectItem value="multiple">Multiple Fundings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Urgency Level */}
              <div>
                <Label>Funding Urgency</Label>
                <Select value={filters.urgencyLevel} onValueChange={(v) => setFilters({...filters, urgencyLevel: v})}>
                  <SelectTrigger data-testid="select-urgency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="exploring">Exploring Options</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Exclusivity */}
              <div>
                <Label>Exclusivity</Label>
                <Select value={filters.exclusivityStatus} onValueChange={(v) => setFilters({...filters, exclusivityStatus: v})}>
                  <SelectTrigger data-testid="select-exclusivity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="exclusive">Exclusive (Single Buyer)</SelectItem>
                    <SelectItem value="semi_exclusive">Semi-Exclusive (3 Buyers Max)</SelectItem>
                    <SelectItem value="non_exclusive">Non-Exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Lead Age */}
              <div>
                <Label>Lead Age</Label>
                <Select value={filters.leadAge} onValueChange={(v) => setFilters({...filters, leadAge: v})}>
                  <SelectTrigger data-testid="select-lead-age">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    <SelectItem value="fresh">Fresh (0-7 days)</SelectItem>
                    <SelectItem value="recent">Recent (8-30 days)</SelectItem>
                    <SelectItem value="aged">Aged (31-60 days)</SelectItem>
                    <SelectItem value="old">Old (60+ days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Separator />
              
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setFilters({
                  industry: "all",
                  minRevenue: 0,
                  maxRevenue: 10000000,
                  stateCode: "all",
                  minTimeInBusiness: 0,
                  minCreditScore: 500,
                  maxCreditScore: 850,
                  exclusivityStatus: "all",
                  previousMCAHistory: "all",
                  urgencyLevel: "all",
                  leadAge: "all",
                  minQualityScore: 60,
                  maxQualityScore: 100,
                })}
                data-testid="button-reset-filters"
              >
                Reset Filters
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content */}
        <div className="lg:col-span-3">
          <Tabs value={purchaseType} onValueChange={(v: any) => setPurchaseType(v)}>
            <TabsList className="mb-4">
              <TabsTrigger value="package" data-testid="tab-package">Package Purchase</TabsTrigger>
              <TabsTrigger value="individual" data-testid="tab-individual">Individual Selection</TabsTrigger>
            </TabsList>
            
            <TabsContent value="package">
              <Card>
                <CardHeader>
                  <CardTitle>Select Package Size</CardTitle>
                  <CardDescription>
                    Purchase a package of leads matching your filters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card 
                      className={`cursor-pointer transition-all ${packageSize === 50 ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setPackageSize(50)}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">Starter</CardTitle>
                        <CardDescription>50 Leads</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{formatCurrency(50 * 25)}</p>
                        <p className="text-sm text-muted-foreground">$25 per lead</p>
                      </CardContent>
                    </Card>
                    
                    <Card 
                      className={`cursor-pointer transition-all ${packageSize === 200 ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setPackageSize(200)}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">Professional</CardTitle>
                        <CardDescription>200 Leads</CardDescription>
                        <Badge className="w-fit">10% Discount</Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{formatCurrency(200 * 22.5)}</p>
                        <p className="text-sm text-muted-foreground">$22.50 per lead</p>
                      </CardContent>
                    </Card>
                    
                    <Card 
                      className={`cursor-pointer transition-all ${packageSize === 500 ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setPackageSize(500)}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">Enterprise</CardTitle>
                        <CardDescription>500 Leads</CardDescription>
                        <Badge className="w-fit">20% Discount</Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{formatCurrency(500 * 20)}</p>
                        <p className="text-sm text-muted-foreground">$20 per lead</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Package leads are selected based on your filters and sorted by quality score.
                      You'll receive the top {packageSize} leads matching your criteria.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="individual">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Select Individual Leads</CardTitle>
                      <CardDescription>
                        Choose specific leads from the filtered results
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSelectAll}
                        data-testid="button-select-all"
                      >
                        {selectedLeads.size === leads.length ? "Deselect All" : "Select All"}
                      </Button>
                      <Badge variant="secondary">
                        {selectedLeads.size} selected
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {leadsLoading ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Loading leads...</p>
                    </div>
                  ) : leads.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No leads match your filters</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leads.map((lead: Lead) => (
                        <Card 
                          key={lead.id}
                          className={`cursor-pointer transition-all ${selectedLeads.has(lead.id) ? 'ring-2 ring-primary' : ''}`}
                          onClick={() => handleLeadToggle(lead.id)}
                          data-testid={`lead-card-${lead.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="font-semibold">{lead.businessName}</h3>
                                  <Badge className={getQualityColor(lead.qualityScore)}>
                                    Score: {lead.qualityScore}
                                  </Badge>
                                  {lead.exclusivityStatus === 'exclusive' && (
                                    <Badge variant="secondary">
                                      <Lock className="w-3 h-3 mr-1" />
                                      Exclusive
                                    </Badge>
                                  )}
                                  {lead.previousMCAHistory === 'previous_paid' && (
                                    <Badge className="bg-green-100 text-green-800">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Renewal
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3 text-muted-foreground" />
                                    <span>{lead.industry || 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                                    <span>{lead.annualRevenue ? formatCurrency(parseInt(lead.annualRevenue)) : 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-muted-foreground" />
                                    <span>{lead.stateCode || 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <CreditCard className="w-3 h-3 text-muted-foreground" />
                                    <span>Credit: {lead.creditScore || 'N/A'}</span>
                                  </div>
                                </div>
                                
                                <div className="mt-2 text-sm text-muted-foreground">
                                  Owner: {lead.ownerName} • {lead.timeInBusiness ? `${lead.timeInBusiness} months in business` : 'Time unknown'}
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <p className="text-lg font-semibold">
                                  {formatCurrency(calculateLeadPrice(lead, lead.exclusivityStatus || 'non_exclusive', 1))}
                                </p>
                                <p className="text-xs text-muted-foreground">per lead</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* Purchase Summary */}
          <Card className="mt-6 sticky bottom-4">
            <CardHeader>
              <CardTitle>Purchase Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Lead Count:</span>
                  <span className="font-semibold">
                    {purchaseType === 'package' ? packageSize : selectedLeads.size}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Price per Lead:</span>
                  <span className="font-semibold">
                    {purchaseType === 'package' 
                      ? formatCurrency(packageSize === 50 ? 25 : packageSize === 200 ? 22.5 : 20)
                      : formatCurrency(25)
                    }
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>
                    {purchaseType === 'package'
                      ? formatCurrency(packageSize * (packageSize === 50 ? 25 : packageSize === 200 ? 22.5 : 20))
                      : formatCurrency(selectedLeads.size * 25)
                    }
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handlePurchase}
                disabled={purchaseType === 'individual' && selectedLeads.size === 0}
                data-testid="button-purchase"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Complete Purchase
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper function - should match server implementation
function calculateLeadPrice(lead: any, exclusivity: string = 'non_exclusive', volume: number = 1): number {
  let basePrice = 25;
  
  const qualityScore = lead.qualityScore || 0;
  if (qualityScore >= 90) basePrice *= 3;
  else if (qualityScore >= 80) basePrice *= 2.5;
  else if (qualityScore >= 70) basePrice *= 2;
  else if (qualityScore >= 60) basePrice *= 1.5;
  else if (qualityScore >= 50) basePrice *= 1.2;
  
  const premiumIndustries = ['restaurant', 'healthcare', 'trucking'];
  const industryLower = lead.industry?.toLowerCase() || '';
  if (premiumIndustries.some((ind: string) => industryLower.includes(ind))) {
    basePrice *= 1.3;
  }
  
  if (lead.previousMCAHistory === 'previous_paid') basePrice *= 1.5;
  else if (lead.previousMCAHistory === 'current') basePrice *= 1.3;
  else if (lead.previousMCAHistory === 'multiple') basePrice *= 1.4;
  
  const premiumStates = ['CA', 'NY', 'TX', 'FL'];
  if (premiumStates.includes(lead.stateCode)) {
    basePrice *= 1.2;
  }
  
  if (exclusivity === 'exclusive') basePrice *= 2.5;
  else if (exclusivity === 'semi_exclusive') basePrice *= 1.5;
  
  if (volume >= 1000) basePrice *= 0.7;
  else if (volume >= 500) basePrice *= 0.8;
  else if (volume >= 200) basePrice *= 0.9;
  else if (volume >= 100) basePrice *= 0.95;
  
  const ageInDays = lead.leadAge || 0;
  if (ageInDays > 90) basePrice *= 0.3;
  else if (ageInDays > 60) basePrice *= 0.5;
  else if (ageInDays > 30) basePrice *= 0.7;
  else if (ageInDays > 14) basePrice *= 0.85;
  else if (ageInDays > 7) basePrice *= 0.95;
  
  if (lead.urgencyLevel === 'immediate') basePrice *= 1.2;
  else if (lead.urgencyLevel === 'this_week') basePrice *= 1.1;
  
  if (lead.dailyBankDeposits) basePrice *= 1.15;
  
  return Math.round(basePrice);
}