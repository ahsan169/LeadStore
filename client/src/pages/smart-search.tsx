import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Filter,
  Save,
  Trash2,
  Bell,
  Zap,
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
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
  Sparkles,
  MessageSquare,
  X,
  Eye,
  BookmarkPlus,
  Lightbulb,
  Target,
  Brain,
  ChevronRight,
  Mail,
  RefreshCw
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Lead, SmartSearch, SearchHistory as SearchHistoryType, PopularSearch, SearchSuggestion } from "@shared/schema";
import { format } from "date-fns";

export default function SmartSearchPage() {
  const { toast } = useToast();
  const [searchMode, setSearchMode] = useState<"instant" | "alert">("instant");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<any>({});
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearch, setSelectedSearch] = useState<SmartSearch | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  // Fetch user's saved searches
  const { data: savedSearches, isLoading: savedSearchesLoading } = useQuery<SmartSearch[]>({
    queryKey: ["/api/smart-search/saved"],
  });

  // Fetch search history
  const { data: searchHistory, isLoading: historyLoading } = useQuery<SearchHistoryType[]>({
    queryKey: ["/api/smart-search/history"],
  });

  // Fetch popular searches
  const { data: popularSearches } = useQuery<PopularSearch[]>({
    queryKey: ["/api/smart-search/popular"],
  });

  // Fetch AI suggestions
  const { data: suggestions } = useQuery<SearchSuggestion[]>({
    queryKey: ["/api/smart-search/suggestions"],
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/smart-search", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (searchMode === "instant") {
        setSearchResults(data.leads || []);
        toast({ 
          title: "Search complete", 
          description: `Found ${data.leads?.length || 0} matching leads` 
        });
      } else {
        toast({ 
          title: "Alert created successfully",
          description: "You'll be notified when new leads match your criteria"
        });
        setShowSaveDialog(false);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/smart-search/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-search/saved"] });
    },
    onError: () => {
      toast({ 
        title: "Search failed", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });

  // Delete saved search mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/smart-search/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-search/saved"] });
      toast({ title: "Search deleted" });
    },
  });

  // Natural language processing
  const processNaturalLanguage = async (query: string) => {
    try {
      const response = await apiRequest("POST", "/api/smart-search/parse", { query });
      const data = await response.json();
      return data.filters;
    } catch (error) {
      console.error("Failed to parse natural language:", error);
      return {};
    }
  };

  // Handle search submission
  const handleSearch = async () => {
    setIsSearching(true);
    let searchFilters = filters;
    
    // Process natural language if query exists
    if (searchQuery.trim()) {
      const parsedFilters = await processNaturalLanguage(searchQuery);
      searchFilters = { ...filters, ...parsedFilters };
    }

    await searchMutation.mutateAsync({
      searchQuery,
      filters: searchFilters,
      searchMode,
      searchName: searchMode === "alert" ? searchName : undefined,
      emailNotifications: searchMode === "alert" ? emailNotifications : false,
    });
    
    setIsSearching(false);
  };

  // Load saved search
  const loadSavedSearch = (search: SmartSearch) => {
    setSelectedSearch(search);
    setSearchQuery(search.searchQuery || "");
    setFilters(search.filters || {});
    setSearchMode(search.searchMode as "instant" | "alert");
    toast({ title: `Loaded: ${search.searchName || 'Unnamed search'}` });
  };

  // Apply suggestion
  const applySuggestion = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.suggestionText);
    setFilters(suggestion.filters);
    toast({ title: "Applied suggestion" });
  };

  // Export results
  const exportResults = () => {
    if (searchResults.length === 0) {
      toast({ title: "No results to export", variant: "destructive" });
      return;
    }
    
    const csv = [
      Object.keys(searchResults[0]).join(","),
      ...searchResults.map(row => Object.values(row).join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart_search_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: `Exported ${searchResults.length} leads` });
  };

  // Filter options
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

  const urgencyLevels = [
    { value: "immediate", label: "Immediate Need" },
    { value: "within_week", label: "Within a Week" },
    { value: "within_month", label: "Within a Month" },
    { value: "flexible", label: "Just Exploring" }
  ];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-smart-search">
          Smart Search
        </h1>
        <p className="text-muted-foreground">
          Find leads instantly or set up alerts with natural language and advanced filters
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Main Search Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Search Bar and Mode Switcher */}
          <Card>
            <CardContent className="p-6">
              {/* Mode Switcher */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Label>Search Mode:</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={searchMode === "instant" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSearchMode("instant")}
                      data-testid="button-mode-instant"
                    >
                      <Zap className="w-4 h-4 mr-1" />
                      Search Now
                    </Button>
                    <Button
                      variant={searchMode === "alert" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSearchMode("alert")}
                      data-testid="button-mode-alert"
                    >
                      <Bell className="w-4 h-4 mr-1" />
                      Set Alert
                    </Button>
                  </div>
                </div>
                {searchMode === "instant" && searchResults.length > 0 && (
                  <Badge variant="secondary">
                    {searchResults.length} results
                  </Badge>
                )}
              </div>

              {/* Natural Language Search Bar */}
              <div className="space-y-2">
                <Label>Natural Language Search</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder='Try "restaurants in California with over 1M revenue" or "high quality tech leads needing funding immediately"'
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      className="pl-10"
                      data-testid="input-search-query"
                    />
                  </div>
                  <Button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    variant="outline"
                    data-testid="button-toggle-filters"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                    {showAdvancedFilters ? 
                      <ChevronUp className="w-4 h-4 ml-2" /> : 
                      <ChevronDown className="w-4 h-4 ml-2" />
                    }
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  AI-powered search understands natural language and converts it to filters
                </p>
              </div>

              {/* Advanced Filters */}
              <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <CollapsibleContent className="mt-4 space-y-4">
                  <Separator />
                  
                  {/* Basic Filters */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Industry */}
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
                          {industries.map(ind => (
                            <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* State */}
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
                          {states.map(state => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Financial Filters */}
                  <div className="space-y-2">
                    <Label>Annual Revenue Range</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="number"
                        placeholder="Min revenue"
                        value={filters.minRevenue || ""}
                        onChange={(e) => setFilters({ ...filters, minRevenue: e.target.value })}
                        className="w-32"
                        data-testid="input-min-revenue"
                      />
                      <span>to</span>
                      <Input
                        type="number"
                        placeholder="Max revenue"
                        value={filters.maxRevenue || ""}
                        onChange={(e) => setFilters({ ...filters, maxRevenue: e.target.value })}
                        className="w-32"
                        data-testid="input-max-revenue"
                      />
                    </div>
                  </div>

                  {/* Quality Score */}
                  <div className="space-y-2">
                    <Label>Quality Score Range: {filters.minQuality || 0} - {filters.maxQuality || 100}</Label>
                    <Slider
                      value={[filters.minQuality || 0, filters.maxQuality || 100]}
                      onValueChange={([min, max]) => setFilters({ ...filters, minQuality: min, maxQuality: max })}
                      max={100}
                      step={5}
                      className="w-full"
                      data-testid="slider-quality"
                    />
                  </div>

                  {/* Urgency Level */}
                  <div>
                    <Label>Urgency Level</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {urgencyLevels.map(level => (
                        <div key={level.value} className="flex items-center space-x-2">
                          <Checkbox
                            checked={filters.urgencyLevel?.includes(level.value)}
                            onCheckedChange={(checked) => {
                              const current = filters.urgencyLevel || [];
                              setFilters({
                                ...filters,
                                urgencyLevel: checked 
                                  ? [...current, level.value]
                                  : current.filter((u: string) => u !== level.value)
                              });
                            }}
                            data-testid={`checkbox-urgency-${level.value}`}
                          />
                          <Label className="text-sm font-normal cursor-pointer">
                            {level.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Additional Options */}
                  <div className="flex items-center gap-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={filters.isEnriched}
                        onCheckedChange={(checked) => setFilters({ ...filters, isEnriched: checked })}
                        data-testid="checkbox-enriched"
                      />
                      <Label className="text-sm font-normal">Only enriched leads</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={filters.hasWebsite}
                        onCheckedChange={(checked) => setFilters({ ...filters, hasWebsite: checked })}
                        data-testid="checkbox-website"
                      />
                      <Label className="text-sm font-normal">Has website</Label>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Action Buttons */}
              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <Button
                    onClick={handleSearch}
                    disabled={searchMutation.isPending}
                    data-testid="button-search"
                  >
                    {searchMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        {searchMode === "instant" ? "Search" : "Create Alert"}
                      </>
                    )}
                  </Button>
                  {searchMode === "instant" && searchResults.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={exportResults}
                      data-testid="button-export"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setFilters({});
                    setSearchResults([]);
                  }}
                  data-testid="button-clear"
                >
                  Clear all
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Alert Settings (for alert mode) */}
          {searchMode === "alert" && (
            <Card>
              <CardHeader>
                <CardTitle>Alert Settings</CardTitle>
                <CardDescription>
                  Configure how you want to be notified when new leads match
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Alert Name</Label>
                  <Input
                    placeholder="e.g., High-value California restaurants"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    data-testid="input-alert-name"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email alerts when new leads match
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    data-testid="switch-email-notifications"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search Results */}
          {searchMode === "instant" && searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  {searchResults.length} leads match your criteria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {searchResults.map((lead) => (
                      <Card key={lead.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div>
                                <h4 className="font-semibold">{lead.businessName}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {lead.ownerName} • {lead.industry}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="flex items-center">
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {lead.stateCode}
                                </span>
                                {lead.annualRevenue && (
                                  <span className="flex items-center">
                                    <DollarSign className="w-3 h-3 mr-1" />
                                    {lead.annualRevenue}
                                  </span>
                                )}
                                {lead.requestedAmount && (
                                  <span className="flex items-center">
                                    <CreditCard className="w-3 h-3 mr-1" />
                                    {lead.requestedAmount}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Badge variant="secondary">
                                  Quality: {lead.qualityScore}
                                </Badge>
                                {lead.isEnriched && (
                                  <Badge variant="secondary">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Enriched
                                  </Badge>
                                )}
                                {lead.urgencyLevel && (
                                  <Badge variant="outline">
                                    {lead.urgencyLevel.replace("_", " ")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" data-testid={`button-view-${lead.id}`}>
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Suggestions */}
          {suggestions && suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  AI Suggestions
                </CardTitle>
                <CardDescription>
                  Based on your search patterns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="p-3 rounded-lg border cursor-pointer hover-elevate"
                    onClick={() => applySuggestion(suggestion)}
                    data-testid={`suggestion-${suggestion.id}`}
                  >
                    <p className="text-sm font-medium">{suggestion.suggestionText}</p>
                    {suggestion.suggestionReason && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {suggestion.suggestionReason}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Saved Searches */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4" />
                Saved Searches
              </CardTitle>
            </CardHeader>
            <CardContent>
              {savedSearchesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : savedSearches && savedSearches.length > 0 ? (
                <div className="space-y-2">
                  {savedSearches.map((search) => (
                    <div
                      key={search.id}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => loadSavedSearch(search)}
                      >
                        <p className="text-sm font-medium">
                          {search.searchName || "Unnamed search"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {search.searchMode === "alert" ? 
                              <><Bell className="w-3 h-3 mr-1" />Alert</> : 
                              <><Zap className="w-3 h-3 mr-1" />Instant</>
                            }
                          </Badge>
                          {search.isActive && search.searchMode === "alert" && (
                            <Badge variant="secondary" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(search.id)}
                        data-testid={`button-delete-${search.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No saved searches yet</p>
              )}
            </CardContent>
          </Card>

          {/* Popular Searches */}
          {popularSearches && popularSearches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Popular Searches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {popularSearches.slice(0, 5).map((search) => (
                    <div
                      key={search.id}
                      className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover-elevate"
                      onClick={() => {
                        setSearchQuery(search.searchQuery);
                        setFilters(search.filters);
                      }}
                      data-testid={`popular-${search.id}`}
                    >
                      <p className="text-sm">{search.searchQuery}</p>
                      <Badge variant="secondary" className="text-xs">
                        {search.searchCount}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Searches */}
          {searchHistory && searchHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Recent Searches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {searchHistory.slice(0, 5).map((search) => (
                    <div
                      key={search.id}
                      className="p-2 rounded-lg border cursor-pointer hover-elevate"
                      onClick={() => {
                        setSearchQuery(search.searchQuery);
                        setFilters(search.filters);
                      }}
                      data-testid={`history-${search.id}`}
                    >
                      <p className="text-sm font-medium">{search.searchQuery}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(search.createdAt), "MMM d, h:mm a")}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {search.resultCount} results
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}