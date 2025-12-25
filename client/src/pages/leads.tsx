import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Filter, Save, Download, ChevronDown, ChevronUp, X, Plus, Star,
  MapPin, Building, DollarSign, User, Phone, Mail, Calendar, TrendingUp,
  Clock, Shield, Globe, Hash, AlertCircle, CheckCircle2, XCircle,
  Database, FileText, Settings, Bookmark, BookmarkCheck, Share2, Sparkles,
  Brain, Target, TrendingDown, Info
} from "lucide-react";
import { LeadIntelligenceScore, IntelligenceScoreBadge } from "@/components/LeadIntelligenceScore";
import { EnrichmentBadge } from "@/components/EnrichmentBadge";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { UccLeadDetails } from "@/components/UccLeadDetails";
import { UccDataDisplay } from "@/components/UccDataDisplay";
import type { Lead, SavedSearch } from "@shared/schema";

// FreshnessInfo component defined inline
const FreshnessInfo = ({ uploadedAt, viewCount, lastViewedAt, freshnessScore }: {
  uploadedAt?: string;
  viewCount?: number;
  lastViewedAt?: string;
  freshnessScore?: number;
}) => {
  if (!uploadedAt && !freshnessScore) return null;
  
  const getTimeSince = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInMs = now.getTime() - past.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  const getFreshnessCategory = (score?: number) => {
    if (!score) return null;
    if (score >= 90) return { text: "HOT", color: "green" as const, pulse: true, icon: "sparkles" };
    if (score >= 70) return { text: "FRESH", color: "green" as const, pulse: false, icon: "leaf" };
    if (score >= 40) return { text: "AGING", color: "yellow" as const, pulse: false, icon: "clock" };
    return { text: "STALE", color: "red" as const, pulse: false, icon: "alert-triangle" };
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {uploadedAt && (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {getTimeSince(uploadedAt)}
        </span>
      )}
      {viewCount !== undefined && (
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {viewCount} views
        </span>
      )}
      {freshnessScore !== undefined && (
        <FreshnessBadge badge={getFreshnessCategory(freshnessScore)} className="ml-1" />
      )}
    </div>
  );
};

// Filter presets
const FILTER_PRESETS = [
  { 
    name: "High Quality", 
    icon: Star,
    filters: { minQualityScore: 80, maxQualityScore: 100 }
  },
  { 
    name: "New Today", 
    icon: Sparkles,
    filters: { freshnessCategory: "new", sold: false }
  },
  { 
    name: "Fresh Leads", 
    icon: Clock,
    filters: { minFreshnessScore: 60, sold: false }
  },
  { 
    name: "Last Chance", 
    icon: AlertCircle,
    filters: { freshnessCategory: "stale", sold: false }
  },
  { 
    name: "Enriched Only", 
    icon: CheckCircle2,
    filters: { isEnriched: true }
  },
  { 
    name: "Available Now", 
    icon: TrendingUp,
    filters: { sold: false, exclusivityStatus: ["non_exclusive"] }
  },
];

// Industry options
const INDUSTRIES = [
  "Restaurant", "Retail", "Construction", "Healthcare", "Transportation",
  "Manufacturing", "Services", "Wholesale", "Technology", "Real Estate",
  "Hospitality", "Education", "Finance", "Insurance", "Other"
];

// State codes
const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

// Employee count ranges
const EMPLOYEE_COUNTS = [
  "1-10", "11-50", "51-200", "201-500", "500+"
];

// MCA History options
const MCA_HISTORY_OPTIONS = [
  { value: "none", label: "No Previous MCA" },
  { value: "current", label: "Current MCA" },
  { value: "previous_paid", label: "Previous (Paid Off)" },
  { value: "multiple", label: "Multiple MCAs" }
];

// Urgency level options
const URGENCY_LEVELS = [
  { value: "immediate", label: "Immediate Need" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "exploring", label: "Just Exploring" }
];

// Exclusivity status options
const EXCLUSIVITY_OPTIONS = [
  { value: "exclusive", label: "Exclusive" },
  { value: "semi_exclusive", label: "Semi-Exclusive" },
  { value: "non_exclusive", label: "Non-Exclusive" }
];

export default function LeadsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["basic"]));
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [selectedSearch, setSelectedSearch] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [scoringModalOpen, setScoringModalOpen] = useState(false);
  const [selectedLeadForScoring, setSelectedLeadForScoring] = useState<Lead | null>(null);
  const [scoringDetails, setScoringDetails] = useState<any>(null);
  const [uccModalOpen, setUccModalOpen] = useState(false);
  const [selectedLeadForUcc, setSelectedLeadForUcc] = useState<Lead | null>(null);

  // Fetch leads with filters
  // Create a stable serialized version of filters for the query key to prevent unnecessary refetches
  const serializedFilters = JSON.stringify(filters);
  
  const { data: leadsData, isLoading: leadsLoading, isError, error, refetch: refetchLeads } = useQuery({
    queryKey: ["/api/leads", serializedFilters, page, pageSize, sortBy, sortOrder],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        
        // Add all filters to params
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            if (Array.isArray(value)) {
              params.append(key, value.join(","));
            } else {
              params.append(key, String(value));
            }
          }
        });
        
        // Add pagination and sorting
        params.append("limit", String(pageSize));
        params.append("offset", String(page * pageSize));
        params.append("sortBy", sortBy);
        params.append("sortOrder", sortOrder);
        
        if (selectedSearch) {
          params.append("searchId", selectedSearch);
        }
        
        const url = `/api/leads?${params.toString()}`;
        console.log("Fetching leads from:", url);
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("Failed to fetch leads. Response status:", response.status);
          throw new Error(`Failed to fetch leads: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Leads API response:", data);
        console.log("Leads count:", data?.leads?.length || 0);
        console.log("Total leads:", data?.total || 0);
        
        return data;
      } catch (err) {
        console.error("Error fetching leads:", err);
        throw err;
      }
    },
  });

  // Fetch saved searches
  const { data: savedSearches } = useQuery({
    queryKey: ["/api/saved-searches"],
  });

  // Save search mutation
  const saveSearchMutation = useMutation({
    mutationFn: (data: { searchName: string; filters: any; sortBy: string; sortOrder: string }) =>
      apiRequest("POST", "/api/saved-searches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      setSaveDialogOpen(false);
      setSearchName("");
      toast({
        title: "Search saved",
        description: "Your search has been saved successfully.",
      });
    },
  });

  // Delete search mutation
  const deleteSearchMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/saved-searches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      if (selectedSearch === deleteSearchMutation.variables) {
        setSelectedSearch(null);
      }
      toast({
        title: "Search deleted",
        description: "The saved search has been deleted.",
      });
    },
  });

  // Set default search mutation
  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/saved-searches/${id}/set-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({
        title: "Default search set",
        description: "This search is now your default.",
      });
    },
  });

  // Toggle section expansion
  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Apply preset filters
  const applyPreset = (preset: typeof FILTER_PRESETS[0]) => {
    setFilters(preset.filters);
    setPage(0);
  };

  // Load saved search
  const loadSearch = (search: SavedSearch) => {
    setFilters(search.filters as any);
    setSelectedSearch(search.id);
    if (search.sortBy) setSortBy(search.sortBy);
    if (search.sortOrder) setSortOrder(search.sortOrder as "asc" | "desc");
    setPage(0);
  };
  
  // Show ML scoring details
  const showScoringDetails = async (lead: Lead) => {
    setSelectedLeadForScoring(lead);
    setScoringModalOpen(true);
    
    try {
      const response = await fetch(`/api/scoring/factors/${lead.id}`);
      if (response.ok) {
        const data = await response.json();
        setScoringDetails(data);
      }
    } catch (error) {
      console.error("Failed to fetch scoring details:", error);
      toast({
        title: "Error",
        description: "Failed to load scoring details",
        variant: "destructive"
      });
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({});
    setSelectedSearch(null);
    setPage(0);
  };

  // Track lead view
  const trackLeadView = async (leadId: string) => {
    try {
      await apiRequest("POST", `/api/leads/${leadId}/viewed`, {});
    } catch (error) {
      console.error("Failed to track lead view:", error);
    }
  };

  // Handle filter changes
  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === "" || value === null ? undefined : value
    }));
    setPage(0);
  };

  // Handle multi-select changes
  const toggleMultiSelect = (key: string, value: string) => {
    setFilters(prev => {
      const current = prev[key] || [];
      const newValues = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value];
      return {
        ...prev,
        [key]: newValues.length > 0 ? newValues : undefined
      };
    });
    setPage(0);
  };

  // Debug data structure
  console.log("Component render - leadsData:", leadsData);
  console.log("Component render - isLoading:", leadsLoading);
  console.log("Component render - isError:", isError);
  
  const leads = leadsData?.leads || [];
  const totalLeads = leadsData?.total || 0;
  const totalPages = Math.ceil(totalLeads / pageSize);
  
  console.log("Component render - leads array:", leads);
  console.log("Component render - totalLeads:", totalLeads);

  return (
    <div className="flex h-screen overflow-hidden animate-fade-in">
      {/* Filter Sidebar */}
      <div className="w-80 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-serif font-semibold flex items-center gap-2 text-gradient-royal">
            <Filter className="w-5 h-5" />
            Advanced Filters
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalLeads} leads found
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Quick Presets */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                Quick Presets
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {FILTER_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <Button
                      key={preset.name}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                      className="justify-start"
                      data-testid={`button-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {preset.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="divider-elegant" />

            {/* Saved Searches */}
            {Array.isArray(savedSearches) && savedSearches.length > 0 && (
              <>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Saved Searches
                  </Label>
                  <Select value={selectedSearch || ""} onValueChange={(id) => {
                    const search = savedSearches.find((s: SavedSearch) => s.id === id);
                    if (search) loadSearch(search);
                  }}>
                    <SelectTrigger data-testid="select-saved-search">
                      <SelectValue placeholder="Load a saved search" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedSearches.map((search: SavedSearch) => (
                        <SelectItem key={search.id} value={search.id}>
                          <div className="flex items-center gap-2">
                            {search.isDefault && <Star className="w-3 h-3" />}
                            {search.searchName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="divider-elegant" />
              </>
            )}

            {/* Basic Filters */}
            <Collapsible open={expandedSections.has("basic")}>
              <CollapsibleTrigger
                onClick={() => toggleSection("basic")}
                className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2"
                data-testid="trigger-basic-filters"
              >
                <span className="font-serif font-medium">Basic Filters</span>
                {expandedSections.has("basic") ? 
                  <ChevronUp className="w-4 h-4" /> : 
                  <ChevronDown className="w-4 h-4" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* Search */}
                <div>
                  <Label className="text-sm">Search</Label>
                  <Input
                    placeholder="Owner name..."
                    value={filters.ownerName || ""}
                    onChange={(e) => updateFilter("ownerName", e.target.value)}
                    className="mt-1"
                    data-testid="input-owner-search"
                  />
                </div>

                {/* Quality Score Range */}
                <div>
                  <Label className="text-sm">
                    Quality Score: {filters.minQualityScore || 0} - {filters.maxQualityScore || 100}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[filters.minQualityScore || 0, filters.maxQualityScore || 100]}
                      onValueChange={(values) => {
                        updateFilter("minQualityScore", values[0]);
                        updateFilter("maxQualityScore", values[1]);
                      }}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Industries */}
                <div>
                  <Label className="text-sm">Industries</Label>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {INDUSTRIES.map((industry) => (
                      <div key={industry} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`industry-${industry}`}
                          checked={(filters.industry || []).includes(industry)}
                          onChange={() => toggleMultiSelect("industry", industry)}
                          className="mr-2"
                        />
                        <label htmlFor={`industry-${industry}`} className="text-sm cursor-pointer">
                          {industry}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* States */}
                <div>
                  <Label className="text-sm">States</Label>
                  <div className="mt-2 grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
                    {STATES.map((state) => (
                      <Badge
                        key={state}
                        variant={(filters.stateCode || []).includes(state) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleMultiSelect("stateCode", state)}
                      >
                        {state}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Financial Filters */}
            <Collapsible open={expandedSections.has("financial")}>
              <CollapsibleTrigger
                onClick={() => toggleSection("financial")}
                className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2"
                data-testid="trigger-financial-filters"
              >
                <span className="font-serif font-medium">Financial</span>
                {expandedSections.has("financial") ? 
                  <ChevronUp className="w-4 h-4" /> : 
                  <ChevronDown className="w-4 h-4" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* Revenue Range */}
                <div>
                  <Label className="text-sm">Annual Revenue</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minRevenue || ""}
                      onChange={(e) => updateFilter("minRevenue", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-min-revenue"
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxRevenue || ""}
                      onChange={(e) => updateFilter("maxRevenue", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-max-revenue"
                    />
                  </div>
                </div>

                {/* Credit Score Range */}
                <div>
                  <Label className="text-sm">Credit Score</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minCreditScore || ""}
                      onChange={(e) => updateFilter("minCreditScore", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-min-credit"
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxCreditScore || ""}
                      onChange={(e) => updateFilter("maxCreditScore", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-max-credit"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Business Filters */}
            <Collapsible open={expandedSections.has("business")}>
              <CollapsibleTrigger
                onClick={() => toggleSection("business")}
                className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2"
                data-testid="trigger-business-filters"
              >
                <span className="font-serif font-medium">Business</span>
                {expandedSections.has("business") ? 
                  <ChevronUp className="w-4 h-4" /> : 
                  <ChevronDown className="w-4 h-4" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* Time in Business */}
                <div>
                  <Label className="text-sm">Years in Business</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minTimeInBusiness || ""}
                      onChange={(e) => updateFilter("minTimeInBusiness", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-min-years"
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxTimeInBusiness || ""}
                      onChange={(e) => updateFilter("maxTimeInBusiness", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-max-years"
                    />
                  </div>
                </div>

                {/* Employee Count */}
                <div>
                  <Label className="text-sm">Employee Count</Label>
                  <div className="mt-2 space-y-1">
                    {EMPLOYEE_COUNTS.map((count) => (
                      <div key={count} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`employees-${count}`}
                          checked={(filters.employeeCount || []).includes(count)}
                          onChange={() => toggleMultiSelect("employeeCount", count)}
                          className="mr-2"
                        />
                        <label htmlFor={`employees-${count}`} className="text-sm cursor-pointer">
                          {count}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Status Filters */}
            <Collapsible open={expandedSections.has("status")}>
              <CollapsibleTrigger
                onClick={() => toggleSection("status")}
                className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2"
                data-testid="trigger-status-filters"
              >
                <span className="font-serif font-medium">Data Quality</span>
                {expandedSections.has("status") ? 
                  <ChevronUp className="w-4 h-4" /> : 
                  <ChevronDown className="w-4 h-4" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* Boolean Filters */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-email" className="text-sm">Has Email</Label>
                    <Switch
                      id="has-email"
                      checked={filters.hasEmail || false}
                      onCheckedChange={(checked) => updateFilter("hasEmail", checked || undefined)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-phone" className="text-sm">Has Phone</Label>
                    <Switch
                      id="has-phone"
                      checked={filters.hasPhone || false}
                      onCheckedChange={(checked) => updateFilter("hasPhone", checked || undefined)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is-enriched" className="text-sm">Is Enriched</Label>
                    <Switch
                      id="is-enriched"
                      checked={filters.isEnriched || false}
                      onCheckedChange={(checked) => updateFilter("isEnriched", checked || undefined)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is-sold" className="text-sm">Show Sold</Label>
                    <Switch
                      id="is-sold"
                      checked={filters.sold || false}
                      onCheckedChange={(checked) => updateFilter("sold", checked || undefined)}
                    />
                  </div>
                </div>

                {/* MCA History */}
                <div>
                  <Label className="text-sm">MCA History</Label>
                  <div className="mt-2 space-y-1">
                    {MCA_HISTORY_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`mca-${option.value}`}
                          checked={(filters.previousMCAHistory || []).includes(option.value)}
                          onChange={() => toggleMultiSelect("previousMCAHistory", option.value)}
                          className="mr-2"
                        />
                        <label htmlFor={`mca-${option.value}`} className="text-sm cursor-pointer">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Urgency Level */}
                <div>
                  <Label className="text-sm">Urgency Level</Label>
                  <div className="mt-2 space-y-1">
                    {URGENCY_LEVELS.map((level) => (
                      <div key={level.value} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`urgency-${level.value}`}
                          checked={(filters.urgencyLevel || []).includes(level.value)}
                          onChange={() => toggleMultiSelect("urgencyLevel", level.value)}
                          className="mr-2"
                        />
                        <label htmlFor={`urgency-${level.value}`} className="text-sm cursor-pointer">
                          {level.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exclusivity Status */}
                <div>
                  <Label className="text-sm">Exclusivity</Label>
                  <div className="mt-2 space-y-1">
                    {EXCLUSIVITY_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`exclusivity-${option.value}`}
                          checked={(filters.exclusivityStatus || []).includes(option.value)}
                          onChange={() => toggleMultiSelect("exclusivityStatus", option.value)}
                          className="mr-2"
                        />
                        <label htmlFor={`exclusivity-${option.value}`} className="text-sm cursor-pointer">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Freshness Category */}
                <div>
                  <Label className="text-sm">Freshness Category</Label>
                  <div className="mt-2 space-y-1">
                    {[
                      { value: "new", label: "HOT (0-3 days)" },
                      { value: "fresh", label: "FRESH (4-7 days)" },
                      { value: "aging", label: "AGING (8-14 days)" },
                      { value: "stale", label: "STALE (15+ days)" }
                    ].map((option) => (
                      <div key={option.value} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`freshness-${option.value}`}
                          checked={(filters.freshnessCategory || []).includes(option.value)}
                          onChange={() => toggleMultiSelect("freshnessCategory", option.value)}
                          className="mr-2"
                        />
                        <label htmlFor={`freshness-${option.value}`} className="text-sm cursor-pointer">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Freshness Score */}
                <div>
                  <Label className="text-sm">
                    Freshness Score: {filters.minFreshnessScore || 0} - {filters.maxFreshnessScore || 100}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Slider
                      value={[filters.minFreshnessScore || 0]}
                      onValueChange={(value) => updateFilter("minFreshnessScore", value[0])}
                      min={0}
                      max={100}
                      step={10}
                      className="flex-1"
                    />
                    <Slider
                      value={[filters.maxFreshnessScore || 100]}
                      onValueChange={(value) => updateFilter("maxFreshnessScore", value[0])}
                      min={0}
                      max={100}
                      step={10}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Lead Age */}
                <div>
                  <Label className="text-sm">Lead Age (days)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.leadAgeMin || ""}
                      onChange={(e) => updateFilter("leadAgeMin", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-min-age"
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.leadAgeMax || ""}
                      onChange={(e) => updateFilter("leadAgeMax", e.target.value ? Number(e.target.value) : undefined)}
                      className="flex-1"
                      data-testid="input-max-age"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Advanced Filters */}
            <Collapsible open={expandedSections.has("advanced")}>
              <CollapsibleTrigger
                onClick={() => toggleSection("advanced")}
                className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2"
                data-testid="trigger-advanced-filters"
              >
                <span className="font-serif font-medium">Advanced</span>
                {expandedSections.has("advanced") ? 
                  <ChevronUp className="w-4 h-4" /> : 
                  <ChevronDown className="w-4 h-4" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="daily-deposits" className="text-sm">Daily Bank Deposits</Label>
                    <Switch
                      id="daily-deposits"
                      checked={filters.dailyBankDeposits || false}
                      onCheckedChange={(checked) => updateFilter("dailyBankDeposits", checked || undefined)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-website" className="text-sm">Has Website</Label>
                    <Switch
                      id="has-website"
                      checked={filters.hasWebsite || false}
                      onCheckedChange={(checked) => updateFilter("hasWebsite", checked || undefined)}
                    />
                  </div>
                </div>

                {/* NAICS Code */}
                <div>
                  <Label className="text-sm">NAICS Code</Label>
                  <Input
                    placeholder="Enter codes separated by commas"
                    value={(filters.naicsCode || []).join(",")}
                    onChange={(e) => updateFilter("naicsCode", e.target.value ? e.target.value.split(",").map(s => s.trim()) : undefined)}
                    className="mt-1"
                    data-testid="input-naics-code"
                  />
                </div>

                {/* Logic Operator */}
                <div>
                  <Label className="text-sm">Filter Logic</Label>
                  <Select 
                    value={filters.logicOperator || "AND"}
                    onValueChange={(value) => updateFilter("logicOperator", value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">Match All (AND)</SelectItem>
                      <SelectItem value="OR">Match Any (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        <div className="divider-elegant" />
        <div className="p-4 space-y-2">
          <div className="flex gap-2">
            <Button
              onClick={() => setSaveDialogOpen(true)}
              disabled={Object.keys(filters).length === 0}
              className="flex-1 btn-kingdom"
              data-testid="button-save-search"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Search
            </Button>
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={Object.keys(filters).length === 0}
              className="flex-1"
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-background animate-slide-down">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-serif font-bold flex items-center gap-2 text-gradient-royal">
                <Database className="w-6 h-6" />
                Lead Discovery
              </h1>
              <p className="text-muted-foreground">
                {totalLeads} leads matching your criteria
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="freshnessScore">Freshness Score</SelectItem>
                  <SelectItem value="qualityScore">Quality Score</SelectItem>
                  <SelectItem value="annualRevenue">Revenue</SelectItem>
                  <SelectItem value="creditScore">Credit Score</SelectItem>
                  <SelectItem value="leadAge">Lead Age</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                data-testid="button-sort-order"
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </Button>
              <Button variant="outline" onClick={() => refetchLeads()} data-testid="button-refresh-leads">
                <TrendingUp className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button className="btn-kingdom" data-testid="button-export-leads">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Leads Grid */}
        <ScrollArea className="flex-1 p-4">
          {isError ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <XCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium">Failed to load leads</h3>
              <p className="text-muted-foreground mt-2">
                {error instanceof Error ? error.message : "An error occurred while fetching leads"}
              </p>
              <Button
                variant="outline"
                onClick={() => refetchLeads()}
                className="mt-4"
                data-testid="button-retry-fetch"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : leadsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="card-kingdom animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                  <CardHeader>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No leads found</h3>
              <p className="text-muted-foreground mt-2">
                Try adjusting your filters or clearing them to see more results.
              </p>
              <Button
                variant="outline"
                onClick={clearFilters}
                className="mt-4"
                data-testid="button-clear-filters-empty"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up" data-testid="leads-list">
              {leads.map((lead: any, index: number) => (
                <Card key={lead.id} className="card-kingdom hover-lift relative overflow-visible" data-testid={`card-lead-${lead.id}`} style={{ animationDelay: `${index * 50}ms` }}>
                  {lead.intelligenceScore > 0 && (
                    <div className="absolute top-2 left-2 z-10">
                      <IntelligenceScoreBadge score={lead.intelligenceScore} />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">
                          {lead.businessName}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {lead.ownerName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {/* Intelligence Score Display */}
                        {(lead.intelligenceScore || lead.qualityScore) && (
                          <IntelligenceScoreBadge 
                            score={lead.intelligenceScore || lead.qualityScore} 
                          />
                        )}
                      </div>
                    </div>
                    
                    {/* Urgency is now part of the Intelligence Score */}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{lead.stateCode}</span>
                        {lead.industry && (
                          <>
                            <Building className="w-4 h-4 text-muted-foreground ml-2" />
                            <span>{lead.industry}</span>
                          </>
                        )}
                      </div>
                      
                      {lead.annualRevenue && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span>${parseInt(lead.annualRevenue).toLocaleString()}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-sm">
                        {lead.email && <Mail className="w-4 h-4 text-muted-foreground" />}
                        {lead.phone && <Phone className="w-4 h-4 text-muted-foreground" />}
                        {lead.timeInBusiness && (
                          <>
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span>{lead.timeInBusiness} months</span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge className="badge-royal text-xs">
                          {lead.exclusivityStatus}
                        </Badge>
                        {lead.previousMCAHistory !== "none" && (
                          <Badge className="badge-gold text-xs">
                            MCA History
                          </Badge>
                        )}
                        {lead.urgencyLevel === "immediate" && (
                          <Badge className="badge-emerald text-xs animate-pulse">
                            Urgent
                          </Badge>
                        )}
                        {lead.isEnriched && <EnrichmentBadge isEnriched={lead.isEnriched} />}
                      </div>
                      
                      <Separator className="my-2" />
                      
                      {/* UCC Data Display */}
                      {(lead.totalUccDebt || lead.activeUccCount) ? (
                        <div className="mb-2">
                          <UccDataDisplay 
                            totalDebt={lead.totalUccDebt ? parseFloat(lead.totalUccDebt) : 0}
                            activeUccCount={lead.activeUccCount || 0}
                            lastFilingDate={lead.lastUccFilingDate}
                            riskLevel={lead.uccRiskLevel || 'unknown'}
                            compact={true}
                          />
                        </div>
                      ) : null}
                      
                      {/* ML Scoring Information */}
                      {(lead.conversionProbability || lead.expectedDealSize) && (
                        <>
                          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-2 space-y-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                                ML Predictions
                              </span>
                              {lead.mlQualityScore && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    showScoringDetails(lead);
                                  }}
                                  data-testid={`button-ml-details-${lead.id}`}
                                >
                                  <Info className="w-3 h-3 mr-1" />
                                  Details
                                </Button>
                              )}
                            </div>
                            {lead.conversionProbability && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <Target className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                  <span className="text-muted-foreground">Conversion:</span>
                                </span>
                                <span className="font-semibold text-purple-600 dark:text-purple-400">
                                  {(parseFloat(lead.conversionProbability) * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {lead.expectedDealSize && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                  <span className="text-muted-foreground">Est. Deal:</span>
                                </span>
                                <span className="font-semibold text-purple-600 dark:text-purple-400">
                                  ${parseInt(lead.expectedDealSize).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                          <Separator className="my-2" />
                        </>
                      )}
                      
                      <FreshnessInfo
                        uploadedAt={lead.uploadedAt}
                        viewCount={lead.viewCount}
                        lastViewedAt={lead.lastViewedAt}
                        freshnessScore={lead.freshnessScore}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <div className="flex gap-2 w-full">
                      <Button
                        className="flex-1 btn-kingdom"
                        size="sm"
                        disabled={lead.sold}
                        data-testid={`button-view-lead-${lead.id}`}
                        onClick={() => trackLeadView(lead.id)}
                      >
                        {lead.sold ? "Sold" : "View Details"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLeadForUcc(lead);
                          setUccModalOpen(true);
                        }}
                        data-testid={`button-ucc-intelligence-${lead.id}`}
                      >
                        <Shield className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalLeads)} of {totalLeads} leads
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  data-testid="button-first-page"
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(0, Math.min(page - 2 + i, totalPages - 1));
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className="w-8"
                      >
                        {pageNum + 1}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages - 1}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  data-testid="button-last-page"
                >
                  Last
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Search Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="animate-scale-in">
          <DialogHeader>
            <DialogTitle className="font-serif text-gradient-royal">Save Current Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="search-name">Search Name</Label>
              <Input
                id="search-name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g., High Quality Restaurant Leads"
                className="mt-1"
                data-testid="input-search-name"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Current filters:</p>
              <ul className="space-y-1">
                {Object.entries(filters).map(([key, value]) => (
                  <li key={key} className="flex">
                    <span className="font-mono text-xs">{key}:</span>
                    <span className="ml-2 text-xs">{JSON.stringify(value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (searchName) {
                  saveSearchMutation.mutate({
                    searchName,
                    filters,
                    sortBy,
                    sortOrder,
                  });
                }
              }}
              disabled={!searchName || saveSearchMutation.isPending}
              className="btn-kingdom"
              data-testid="button-confirm-save"
            >
              Save Search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ML Scoring Breakdown Modal */}
      <Dialog open={scoringModalOpen} onOpenChange={setScoringModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto animate-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-gradient-royal">
              <Brain className="w-5 h-5 text-purple-600" />
              ML Scoring Analysis
            </DialogTitle>
          </DialogHeader>
          
          {selectedLeadForScoring && (
            <div className="space-y-4">
              {/* Lead Overview */}
              <div className="bg-muted rounded-lg p-3">
                <h3 className="font-semibold">{selectedLeadForScoring.businessName}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedLeadForScoring.ownerName} • {selectedLeadForScoring.stateCode}
                </p>
              </div>

              {/* Scoring Summary */}
              {scoringDetails ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="card-kingdom p-4 hover-lift">
                      <div className="flex flex-col items-center">
                        <Brain className="w-8 h-8 text-purple-500 mb-2" />
                        <p className="text-xs text-muted-foreground">ML Score</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {scoringDetails.mlQualityScore || "N/A"}
                        </p>
                      </div>
                    </Card>
                    <Card className="card-kingdom p-4 hover-lift">
                      <div className="flex flex-col items-center">
                        <Target className="w-8 h-8 text-green-500 mb-2" />
                        <p className="text-xs text-muted-foreground">Conversion</p>
                        <p className="text-2xl font-bold text-green-600">
                          {scoringDetails.conversionProbability 
                            ? `${(parseFloat(scoringDetails.conversionProbability) * 100).toFixed(1)}%`
                            : "N/A"}
                        </p>
                      </div>
                    </Card>
                    <Card className="card-kingdom p-4 hover-lift">
                      <div className="flex flex-col items-center">
                        <DollarSign className="w-8 h-8 text-blue-500 mb-2" />
                        <p className="text-xs text-muted-foreground">Expected Deal</p>
                        <p className="text-xl font-bold text-blue-600">
                          {scoringDetails.expectedDealSize 
                            ? `$${parseInt(scoringDetails.expectedDealSize).toLocaleString()}`
                            : "N/A"}
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/* Scoring Factors Breakdown */}
                  {scoringDetails.scoringFactors && (
                    <Card className="card-kingdom p-4">
                      <h4 className="font-serif font-semibold mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Scoring Factors Breakdown
                      </h4>
                      <div className="space-y-3">
                        {/* Quality Factors */}
                        {scoringDetails.scoringFactors.qualityFactors && (
                          <div>
                            <p className="text-sm font-medium mb-2">Quality Factors</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(scoringDetails.scoringFactors.qualityFactors).map(([key, value]: any) => (
                                <div key={key} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}:
                                  </span>
                                  <span className="font-medium">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Business Factors */}
                        {scoringDetails.scoringFactors.businessFactors && (
                          <div>
                            <p className="text-sm font-medium mb-2">Business Factors</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(scoringDetails.scoringFactors.businessFactors).map(([key, value]: any) => (
                                <div key={key} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}:
                                  </span>
                                  <span className="font-medium">
                                    {typeof value === "boolean" ? (value ? "Yes" : "No") : value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Scoring Reasoning */}
                        {scoringDetails.scoringFactors.reasoning && (
                          <div>
                            <p className="text-sm font-medium mb-2">AI Reasoning</p>
                            <div className="bg-muted rounded-md p-3 space-y-2">
                              {scoringDetails.scoringFactors.reasoning.map((reason: string, idx: number) => (
                                <p key={idx} className="text-xs flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{reason}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Similar Leads Comparison */}
                  {scoringDetails.scoringFactors?.marketComparison && (
                    <Card className="card-kingdom p-4">
                      <h4 className="font-serif font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Market Comparison
                      </h4>
                      <div className="text-sm text-muted-foreground">
                        <p>
                          This lead ranks in the <span className="font-semibold text-purple-600">
                            top {scoringDetails.scoringFactors.marketComparison.percentile}%
                          </span> of similar leads in the market.
                        </p>
                        <div className="mt-2 text-xs">
                          <p>Average conversion for similar leads: {scoringDetails.scoringFactors.marketComparison.avgConversion}%</p>
                          <p>Average deal size: ${scoringDetails.scoringFactors.marketComparison.avgDealSize?.toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setScoringModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UCC Intelligence Modal */}
      <Dialog open={uccModalOpen} onOpenChange={setUccModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto animate-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-gradient-royal">
              <Shield className="w-5 h-5 text-primary" />
              UCC Intelligence Analysis
            </DialogTitle>
          </DialogHeader>
          
          {selectedLeadForUcc && (
            <UccLeadDetails 
              lead={selectedLeadForUcc}
              onClose={() => setUccModalOpen(false)}
              onMonitorLead={(leadId) => {
                toast({
                  title: "Monitoring enabled",
                  description: "You'll receive alerts for this lead's UCC activity."
                });
              }}
              onViewRelated={(leadId) => {
                // Navigate to UCC Intelligence page with this lead selected
                window.location.href = `/ucc-intelligence?leadId=${leadId}`;
              }}
            />
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUccModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}