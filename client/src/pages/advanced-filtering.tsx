import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Filter,
  Save,
  Trash2,
  RefreshCw,
  Download,
  Star,
  Clock,
  DollarSign,
  Building,
  MapPin,
  TrendingUp,
  Users,
  CreditCard,
  Calendar,
  AlertCircle
} from "lucide-react";

interface SavedSearch {
  id: string;
  name: string;
  filters: any;
  createdAt: string;
  lastUsedAt: string;
  resultCount: number;
}

export default function AdvancedFilteringPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<any>({});
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [searchName, setSearchName] = useState("");

  // Fetch saved searches
  const { data: savedSearches, isLoading: savedSearchesLoading } = useQuery({
    queryKey: ["/api/saved-searches"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/saved-searches");
      return response.json();
    },
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (searchFilters: any) => {
      const response = await apiRequest("POST", "/api/leads/search", searchFilters);
      return response.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.leads || []);
      toast({ title: `Found ${data.leads?.length || 0} matching leads` });
    },
    onError: () => {
      toast({ title: "Search failed", variant: "destructive" });
    },
  });

  // Save search mutation
  const saveSearchMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/saved-searches", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Search saved successfully" });
      setShowSaveDialog(false);
      setSearchName("");
    },
  });

  // Delete saved search mutation
  const deleteSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/saved-searches/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Saved search deleted" });
    },
  });

  const industries = [
    "Restaurant", "Retail", "Healthcare", "Construction",
    "Manufacturing", "Transportation", "Technology", "Professional Services",
    "Real Estate", "Education", "Entertainment", "Financial Services"
  ];

  const states = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  const handleSearch = () => {
    searchMutation.mutate(filters);
  };

  const handleLoadSavedSearch = (search: SavedSearch) => {
    setFilters(search.filters);
    toast({ title: `Loaded search: ${search.name}` });
  };

  const exportResults = () => {
    if (searchResults.length === 0) {
      toast({ title: "No results to export", variant: "destructive" });
      return;
    }
    
    // Convert results to CSV
    const csv = [
      Object.keys(searchResults[0]).join(","),
      ...searchResults.map(row => Object.values(row).join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: `Exported ${searchResults.length} leads` });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-advanced-filtering">
          Advanced Lead Filtering
        </h1>
        <p className="text-muted-foreground">
          Search and filter leads with 20+ criteria for precise targeting
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search Filters</CardTitle>
              <CardDescription>
                Configure multiple criteria to find your ideal leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Industry Filter */}
              <div>
                <Label>Industry</Label>
                <Select
                  value={filters.industry}
                  onValueChange={(value) => setFilters({ ...filters, industry: value })}
                  data-testid="select-industry"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {industries.map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* State Filter */}
              <div>
                <Label>State</Label>
                <Select
                  value={filters.stateCode}
                  onValueChange={(value) => setFilters({ ...filters, stateCode: value })}
                  data-testid="select-state"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {states.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quality Score Range */}
              <div>
                <Label>Quality Score Range</Label>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{filters.minQualityScore || 0}</span>
                    <span>{filters.maxQualityScore || 100}</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[filters.minQualityScore || 0, filters.maxQualityScore || 100]}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        minQualityScore: value[0],
                        maxQualityScore: value[1],
                      })
                    }
                    className="w-full"
                    data-testid="slider-quality"
                  />
                </div>
              </div>

              {/* Annual Revenue Range */}
              <div>
                <Label>Annual Revenue Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.minRevenue || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, minRevenue: parseInt(e.target.value) || undefined })
                    }
                    data-testid="input-min-revenue"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.maxRevenue || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, maxRevenue: parseInt(e.target.value) || undefined })
                    }
                    data-testid="input-max-revenue"
                  />
                </div>
              </div>

              {/* Credit Score Range */}
              <div>
                <Label>Credit Score Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min (300)"
                    value={filters.minCreditScore || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, minCreditScore: parseInt(e.target.value) || undefined })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max (850)"
                    value={filters.maxCreditScore || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, maxCreditScore: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
              </div>

              {/* Requested Amount Range */}
              <div>
                <Label>Requested Amount Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.minRequestedAmount || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, minRequestedAmount: parseInt(e.target.value) || undefined })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.maxRequestedAmount || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, maxRequestedAmount: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
              </div>

              {/* Time in Business */}
              <div>
                <Label>Minimum Time in Business (months)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 12"
                  value={filters.minTimeInBusiness || ""}
                  onChange={(e) =>
                    setFilters({ ...filters, minTimeInBusiness: parseInt(e.target.value) || undefined })
                  }
                />
              </div>

              {/* Additional Filters */}
              <div className="space-y-2">
                <Label>Additional Criteria</Label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={filters.dailyBankDeposits}
                      onCheckedChange={(checked) =>
                        setFilters({ ...filters, dailyBankDeposits: checked })
                      }
                    />
                    <span className="text-sm">Daily Bank Deposits</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={filters.unsold}
                      onCheckedChange={(checked) =>
                        setFilters({ ...filters, unsold: checked })
                      }
                    />
                    <span className="text-sm">Unsold Only</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={filters.exclusive}
                      onCheckedChange={(checked) =>
                        setFilters({ ...filters, exclusive: checked })
                      }
                    />
                    <span className="text-sm">Exclusive Leads</span>
                  </label>
                </div>
              </div>

              {/* Urgency Level */}
              <div>
                <Label>Urgency Level</Label>
                <Select
                  value={filters.urgencyLevel}
                  onValueChange={(value) => setFilters({ ...filters, urgencyLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Urgency</SelectItem>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="within_week">Within Week</SelectItem>
                    <SelectItem value="within_month">Within Month</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Lead Age */}
              <div>
                <Label>Maximum Lead Age (days)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 30"
                  value={filters.maxLeadAge || ""}
                  onChange={(e) =>
                    setFilters({ ...filters, maxLeadAge: parseInt(e.target.value) || undefined })
                  }
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={handleSearch}
                disabled={searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search Leads
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowSaveDialog(true)}
                disabled={Object.keys(filters).length === 0}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Search
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setFilters({});
                  setSearchResults([]);
                  toast({ title: "Filters cleared" });
                }}
              >
                Clear All Filters
              </Button>
            </CardFooter>
          </Card>

          {/* Saved Searches */}
          <Card>
            <CardHeader>
              <CardTitle>Saved Searches</CardTitle>
            </CardHeader>
            <CardContent>
              {savedSearchesLoading ? (
                <div className="text-center py-4 text-muted-foreground">Loading...</div>
              ) : savedSearches?.length === 0 ? (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    No saved searches yet. Save your current filter configuration for quick access later.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {savedSearches?.map((search: SavedSearch) => (
                    <div
                      key={search.id}
                      className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleLoadSavedSearch(search)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="font-medium text-sm">{search.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{search.resultCount} results</span>
                          <span>Used {new Date(search.lastUsedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSearchMutation.mutate(search.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Search Results</CardTitle>
                  <CardDescription>
                    {searchResults.length > 0
                      ? `Found ${searchResults.length} matching leads`
                      : "Configure filters and click search to find leads"}
                  </CardDescription>
                </div>
                {searchResults.length > 0 && (
                  <Button variant="outline" onClick={exportResults}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {searchResults.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No search results yet. Configure your filters and click search.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResults.map((lead: any) => (
                    <Card key={lead.id}>
                      <CardContent className="p-4">
                        <div className="grid gap-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold">{lead.businessName}</h4>
                              <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
                            </div>
                            <Badge variant={lead.qualityScore >= 80 ? "default" : "secondary"}>
                              Score: {lead.qualityScore}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4 text-muted-foreground" />
                              <span>{lead.industry}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <span>{lead.stateCode}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-muted-foreground" />
                              <span>${(lead.annualRevenue || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-muted-foreground" />
                              <span>Credit: {lead.creditScore}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {lead.dailyBankDeposits && (
                              <Badge variant="outline">Daily Deposits</Badge>
                            )}
                            {lead.exclusivityStatus === "exclusive" && (
                              <Badge variant="outline">Exclusive</Badge>
                            )}
                            {lead.urgencyLevel === "immediate" && (
                              <Badge variant="outline" className="text-orange-600">
                                Urgent
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Search Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Save Search</CardTitle>
              <CardDescription>
                Save your current filter configuration for quick access later
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="search-name">Search Name</Label>
              <Input
                id="search-name"
                placeholder="e.g., High-value restaurant leads in CA"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                onClick={() => {
                  saveSearchMutation.mutate({
                    name: searchName,
                    filters: filters,
                    resultCount: searchResults.length,
                  });
                }}
                disabled={!searchName || saveSearchMutation.isPending}
              >
                {saveSearchMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}