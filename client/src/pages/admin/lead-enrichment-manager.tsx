import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Play, 
  Pause, 
  RefreshCw, 
  Search, 
  Filter,
  Eye, 
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Database,
  Loader2,
  Plus,
  Mail,
  Phone,
  MapPin,
  Building,
  User,
  Calendar,
  BarChart3,
  Activity,
  Target,
  Sparkles
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Lead } from "@shared/schema";
import { cn } from "@/lib/utils";

// Type definitions for enrichment data
interface EnrichmentStats {
  totalLeads: number;
  incompleteLeads: number;
  queueSize: number;
  queueStatus: 'idle' | 'processing' | 'paused';
  completionDistribution: {
    '0-25': number;
    '25-50': number;
    '50-75': number;
    '75-100': number;
  };
  recentEnrichments: {
    success: number;
    failed: number;
    pending: number;
  };
}

interface LeadCompletionData extends Lead {
  completionPercentage: number;
  missingFields: string[];
  enrichmentHistory?: Array<{
    timestamp: string;
    sources: string[];
    fieldsUpdated: string[];
    success: boolean;
  }>;
}

interface QuickEnrichmentForm {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export default function LeadEnrichmentManager() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("dashboard");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadCompletionData | null>(null);
  const [completionFilter, setCompletionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [isEnrichingBatch, setIsEnrichingBatch] = useState(false);

  // Quick enrichment form state
  const [quickEnrichmentForm, setQuickEnrichmentForm] = useState<QuickEnrichmentForm>({});
  const [quickEnrichmentResult, setQuickEnrichmentResult] = useState<Lead | null>(null);

  // Query for enrichment statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EnrichmentStats>({
    queryKey: ['/api/admin/enrichment/queue/stats'],
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Query for leads with completion data
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useQuery<{
    leads: LeadCompletionData[];
    totalCount: number;
  }>({
    queryKey: ['/api/leads/enrichment-status', { completionFilter, statusFilter, searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (completionFilter !== 'all') params.append('completion', completionFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/leads/enrichment-status?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch leads');
      return response.json();
    },
  });

  // Mutation for enriching all incomplete leads
  const enrichAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/leads/enrich-all-incomplete");
    },
    onSuccess: () => {
      toast({
        title: "Enrichment Started",
        description: "All incomplete leads have been queued for enrichment",
      });
      refetchStats();
      refetchLeads();
    },
    onError: (error: any) => {
      toast({
        title: "Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for single lead enrichment
  const enrichSingleMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return apiRequest("POST", `/api/leads/enrich-single`, { leadId });
    },
    onSuccess: (data, leadId) => {
      toast({
        title: "Lead Enrichment Started",
        description: "The lead has been queued for enrichment",
      });
      refetchStats();
      refetchLeads();
    },
    onError: (error: any) => {
      toast({
        title: "Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for batch enrichment
  const enrichBatchMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      setIsEnrichingBatch(true);
      setEnrichmentProgress(0);
      
      // Simulate progress updates
      const interval = setInterval(() => {
        setEnrichmentProgress((prev) => Math.min(prev + 10, 90));
      }, 500);
      
      try {
        const result = await apiRequest("POST", "/api/leads/enrich-bulk", { leadIds });
        clearInterval(interval);
        setEnrichmentProgress(100);
        return result;
      } finally {
        setTimeout(() => {
          setIsEnrichingBatch(false);
          setEnrichmentProgress(0);
        }, 1000);
      }
    },
    onSuccess: () => {
      toast({
        title: "Batch Enrichment Complete",
        description: `${selectedLeads.size} leads have been enriched`,
      });
      setSelectedLeads(new Set());
      refetchStats();
      refetchLeads();
    },
    onError: (error: any) => {
      toast({
        title: "Batch Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for quick enrichment
  const quickEnrichMutation = useMutation({
    mutationFn: async (formData: QuickEnrichmentForm) => {
      const response = await apiRequest("POST", "/api/leads/quick-enrich", formData);
      return response;
    },
    onSuccess: (data) => {
      setQuickEnrichmentResult(data);
      toast({
        title: "Lead Enriched Successfully",
        description: "New lead has been added and enriched",
      });
      refetchStats();
      refetchLeads();
    },
    onError: (error: any) => {
      toast({
        title: "Quick Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for queue control
  const queueControlMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume') => {
      return apiRequest("POST", `/api/admin/enrichment/queue/${action}`);
    },
    onSuccess: (data, action) => {
      toast({
        title: action === 'pause' ? "Queue Paused" : "Queue Resumed",
        description: `Enrichment queue has been ${action}d`,
      });
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Queue Control Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate completion percentage for a lead
  const calculateCompletion = (lead: Lead): number => {
    const totalFields = [
      'businessName', 'ownerName', 'email', 'phone', 'industry',
      'annualRevenue', 'timeInBusiness', 'creditScore', 'fullAddress',
      'city', 'stateCode', 'websiteUrl', 'linkedinUrl', 'companySize',
      'yearFounded', 'businessDescription', 'employeeCount'
    ];
    
    const filledFields = totalFields.filter(field => lead[field as keyof Lead]);
    return Math.round((filledFields.length / totalFields.length) * 100);
  };

  // Get missing fields for a lead
  const getMissingFields = (lead: Lead): string[] => {
    const fieldLabels: Record<string, string> = {
      businessName: 'Business Name',
      ownerName: 'Owner Name',
      email: 'Email',
      phone: 'Phone',
      industry: 'Industry',
      annualRevenue: 'Annual Revenue',
      timeInBusiness: 'Time in Business',
      creditScore: 'Credit Score',
      fullAddress: 'Full Address',
      city: 'City',
      stateCode: 'State',
      websiteUrl: 'Website',
      linkedinUrl: 'LinkedIn',
      companySize: 'Company Size',
      yearFounded: 'Year Founded',
      businessDescription: 'Description',
      employeeCount: 'Employee Count'
    };
    
    return Object.entries(fieldLabels)
      .filter(([field]) => !lead[field as keyof Lead])
      .map(([_, label]) => label);
  };

  // Get completion color based on percentage
  const getCompletionColor = (percentage: number): string => {
    if (percentage < 25) return "text-red-500";
    if (percentage < 75) return "text-yellow-500";
    return "text-green-500";
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Pending</Badge>;
    }
  };

  // Handle lead selection
  const handleLeadSelection = (leadId: string) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    setSelectedLeads(newSelection);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedLeads.size === leadsData?.leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leadsData?.leads.map(l => l.id) || []));
    }
  };

  // View lead details
  const viewLeadDetails = (lead: LeadCompletionData) => {
    setSelectedLead(lead);
    setShowDetailModal(true);
  };

  // Render completion distribution chart
  const renderCompletionChart = () => {
    if (!stats?.completionDistribution) return null;
    
    const data = Object.entries(stats.completionDistribution);
    const maxValue = Math.max(...Object.values(stats.completionDistribution));
    
    return (
      <div className="space-y-4">
        {data.map(([range, count]) => (
          <div key={range} className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{range}% Complete</span>
              <span className="text-muted-foreground">{count} leads</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  range === '0-25' && "bg-red-500",
                  range === '25-50' && "bg-yellow-500",
                  range === '50-75' && "bg-blue-500",
                  range === '75-100' && "bg-green-500"
                )}
                style={{ width: `${(count / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8" />
            Lead Enrichment Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor lead data enrichment across your entire database
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">
            <Activity className="w-4 h-4 mr-2" />
            Enrichment Dashboard
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <BarChart3 className="w-4 h-4 mr-2" />
            Lead Analysis
          </TabsTrigger>
          <TabsTrigger value="quick">
            <Sparkles className="w-4 h-4 mr-2" />
            Quick Enrichment
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Enrichment Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalLeads || 0}</div>
                <p className="text-xs text-muted-foreground">In database</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Incomplete Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-500">
                  {stats?.incompleteLeads || 0}
                </div>
                <p className="text-xs text-muted-foreground">Need enrichment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Queue Size</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">
                  {stats?.queueSize || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.queueStatus === 'processing' ? 'Processing...' : 
                   stats?.queueStatus === 'paused' ? 'Paused' : 'Idle'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">
                  {stats?.recentEnrichments ? 
                    Math.round((stats.recentEnrichments.success / 
                      (stats.recentEnrichments.success + stats.recentEnrichments.failed)) * 100) || 0
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
          </div>

          {/* Completion Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Completion Distribution</CardTitle>
              <CardDescription>
                Lead data completeness across your database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderCompletionChart()}
            </CardContent>
          </Card>

          {/* Queue Status and Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Queue Status</CardTitle>
              <CardDescription>
                Real-time enrichment queue monitoring and controls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      stats?.queueStatus === 'processing' && "bg-green-500 animate-pulse",
                      stats?.queueStatus === 'paused' && "bg-yellow-500",
                      stats?.queueStatus === 'idle' && "bg-gray-500"
                    )} />
                    <span className="font-medium">
                      {stats?.queueStatus === 'processing' ? 'Processing' :
                       stats?.queueStatus === 'paused' ? 'Paused' : 'Idle'}
                    </span>
                  </div>
                  {stats?.recentEnrichments && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        {stats.recentEnrichments.success} Success
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-yellow-500" />
                        {stats.recentEnrichments.pending} Pending
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-4 h-4 text-red-500" />
                        {stats.recentEnrichments.failed} Failed
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => enrichAllMutation.mutate()}
                    disabled={enrichAllMutation.isPending || stats?.queueStatus === 'processing'}
                    data-testid="button-enrich-all"
                  >
                    {enrichAllMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2" />
                    )}
                    Enrich All Incomplete
                  </Button>
                  
                  {stats?.queueStatus === 'processing' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => queueControlMutation.mutate('pause')}
                      disabled={queueControlMutation.isPending}
                      data-testid="button-pause-queue"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pause Queue
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => queueControlMutation.mutate('resume')}
                      disabled={queueControlMutation.isPending || stats?.queueSize === 0}
                      data-testid="button-resume-queue"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Resume Queue
                    </Button>
                  )}
                </div>
              </div>

              {isEnrichingBatch && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Batch enrichment progress</span>
                    <span>{enrichmentProgress}%</span>
                  </div>
                  <Progress value={enrichmentProgress} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Lead Analysis */}
        <TabsContent value="analysis" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Business or owner name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                      data-testid="input-search-leads"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Completion Level</Label>
                  <Select value={completionFilter} onValueChange={setCompletionFilter}>
                    <SelectTrigger data-testid="select-completion-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="0-25">0-25% Complete</SelectItem>
                      <SelectItem value="25-50">25-50% Complete</SelectItem>
                      <SelectItem value="50-75">50-75% Complete</SelectItem>
                      <SelectItem value="75-100">75-100% Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Enrichment Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={() => refetchLeads()}
                    variant="outline"
                    className="w-full"
                    data-testid="button-refresh-leads"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leads Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lead Analysis</CardTitle>
                {selectedLeads.size > 0 && (
                  <Button
                    onClick={() => enrichBatchMutation.mutate(Array.from(selectedLeads))}
                    disabled={enrichBatchMutation.isPending}
                    data-testid="button-enrich-selected"
                  >
                    {enrichBatchMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2" />
                    )}
                    Enrich {selectedLeads.size} Selected
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedLeads.size === leadsData?.leads.length && leadsData?.leads.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Completion</TableHead>
                      <TableHead>Last Enriched</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : leadsData?.leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <div className="text-muted-foreground">No leads found</div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      leadsData?.leads.map((lead) => {
                        const completion = calculateCompletion(lead);
                        return (
                          <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedLeads.has(lead.id)}
                                onCheckedChange={() => handleLeadSelection(lead.id)}
                                data-testid={`checkbox-lead-${lead.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {lead.businessName || 'N/A'}
                            </TableCell>
                            <TableCell>{lead.ownerName || 'N/A'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={cn("font-medium", getCompletionColor(completion))}>
                                  {completion}%
                                </span>
                                <Progress value={completion} className="w-16 h-2" />
                              </div>
                            </TableCell>
                            <TableCell>
                              {lead.lastEnrichedAt 
                                ? formatDistanceToNow(new Date(lead.lastEnrichedAt), { addSuffix: true })
                                : 'Never'}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(lead.enrichmentStatus || 'pending')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => enrichSingleMutation.mutate(lead.id)}
                                  disabled={enrichSingleMutation.isPending}
                                  data-testid={`button-enrich-${lead.id}`}
                                >
                                  <Zap className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewLeadDetails({
                                    ...lead,
                                    completionPercentage: completion,
                                    missingFields: getMissingFields(lead)
                                  })}
                                  data-testid={`button-view-${lead.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Quick Enrichment */}
        <TabsContent value="quick" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Lead Enrichment</CardTitle>
              <CardDescription>
                Add a new lead with minimal information and enrich it instantly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Business Name (Optional)</Label>
                  <Input
                    id="business-name"
                    placeholder="Enter business name"
                    value={quickEnrichmentForm.businessName || ''}
                    onChange={(e) => setQuickEnrichmentForm({
                      ...quickEnrichmentForm,
                      businessName: e.target.value
                    })}
                    data-testid="input-quick-business"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner-name">Owner Name (Optional)</Label>
                  <Input
                    id="owner-name"
                    placeholder="Enter owner name"
                    value={quickEnrichmentForm.ownerName || ''}
                    onChange={(e) => setQuickEnrichmentForm({
                      ...quickEnrichmentForm,
                      ownerName: e.target.value
                    })}
                    data-testid="input-quick-owner"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <Input
                    id="phone"
                    placeholder="Enter phone number"
                    value={quickEnrichmentForm.phone || ''}
                    onChange={(e) => setQuickEnrichmentForm({
                      ...quickEnrichmentForm,
                      phone: e.target.value
                    })}
                    data-testid="input-quick-phone"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={quickEnrichmentForm.email || ''}
                    onChange={(e) => setQuickEnrichmentForm({
                      ...quickEnrichmentForm,
                      email: e.target.value
                    })}
                    data-testid="input-quick-email"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Business Address (Optional)</Label>
                  <Input
                    id="address"
                    placeholder="Enter business address"
                    value={quickEnrichmentForm.address || ''}
                    onChange={(e) => setQuickEnrichmentForm({
                      ...quickEnrichmentForm,
                      address: e.target.value
                    })}
                    data-testid="input-quick-address"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  onClick={() => quickEnrichMutation.mutate(quickEnrichmentForm)}
                  disabled={quickEnrichMutation.isPending || Object.values(quickEnrichmentForm).every(v => !v)}
                  data-testid="button-quick-enrich"
                >
                  {quickEnrichMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enriching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Enrich & Add
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setQuickEnrichmentForm({});
                    setQuickEnrichmentResult(null);
                  }}
                  data-testid="button-clear-form"
                >
                  Clear Form
                </Button>
              </div>

              {quickEnrichMutation.isPending && (
                <Alert>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <AlertDescription>
                    Searching multiple data sources to enrich your lead...
                  </AlertDescription>
                </Alert>
              )}

              {quickEnrichmentResult && (
                <Card className="border-green-500/20 bg-green-500/5">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      Enrichment Complete
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      {quickEnrichmentResult.businessName && (
                        <div>
                          <span className="text-muted-foreground">Business:</span>
                          <p className="font-medium">{quickEnrichmentResult.businessName}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.ownerName && (
                        <div>
                          <span className="text-muted-foreground">Owner:</span>
                          <p className="font-medium">{quickEnrichmentResult.ownerName}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.email && (
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <p className="font-medium">{quickEnrichmentResult.email}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.phone && (
                        <div>
                          <span className="text-muted-foreground">Phone:</span>
                          <p className="font-medium">{quickEnrichmentResult.phone}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.fullAddress && (
                        <div>
                          <span className="text-muted-foreground">Address:</span>
                          <p className="font-medium">{quickEnrichmentResult.fullAddress}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.industry && (
                        <div>
                          <span className="text-muted-foreground">Industry:</span>
                          <p className="font-medium">{quickEnrichmentResult.industry}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.websiteUrl && (
                        <div>
                          <span className="text-muted-foreground">Website:</span>
                          <p className="font-medium">{quickEnrichmentResult.websiteUrl}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.companySize && (
                        <div>
                          <span className="text-muted-foreground">Company Size:</span>
                          <p className="font-medium">{quickEnrichmentResult.companySize}</p>
                        </div>
                      )}
                      {quickEnrichmentResult.yearFounded && (
                        <div>
                          <span className="text-muted-foreground">Founded:</span>
                          <p className="font-medium">{quickEnrichmentResult.yearFounded}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details & Enrichment Analysis</DialogTitle>
            <DialogDescription>
              Complete information and enrichment history for this lead
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6">
              {/* Completion Overview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Data Completion</h3>
                  <Badge className={cn(
                    selectedLead.completionPercentage < 25 && "bg-red-500/10 text-red-500",
                    selectedLead.completionPercentage >= 25 && selectedLead.completionPercentage < 75 && "bg-yellow-500/10 text-yellow-500",
                    selectedLead.completionPercentage >= 75 && "bg-green-500/10 text-green-500"
                  )}>
                    {selectedLead.completionPercentage}% Complete
                  </Badge>
                </div>
                <Progress value={selectedLead.completionPercentage} />
                
                {selectedLead.missingFields.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-2">Missing Fields:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedLead.missingFields.map((field) => (
                          <Badge key={field} variant="outline">{field}</Badge>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Separator />

              {/* Current Lead Data */}
              <div className="space-y-4">
                <h3 className="font-semibold">Current Lead Data</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedLead.businessName && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building className="w-3 h-3" /> Business Name
                      </p>
                      <p className="font-medium">{selectedLead.businessName}</p>
                    </div>
                  )}
                  {selectedLead.ownerName && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" /> Owner Name
                      </p>
                      <p className="font-medium">{selectedLead.ownerName}</p>
                    </div>
                  )}
                  {selectedLead.email && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email
                      </p>
                      <p className="font-medium">{selectedLead.email}</p>
                    </div>
                  )}
                  {selectedLead.phone && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </p>
                      <p className="font-medium">{selectedLead.phone}</p>
                    </div>
                  )}
                  {selectedLead.fullAddress && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Address
                      </p>
                      <p className="font-medium">{selectedLead.fullAddress}</p>
                    </div>
                  )}
                  {selectedLead.industry && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Industry</p>
                      <p className="font-medium">{selectedLead.industry}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Funding Scoring Insights */}
              {(selectedLead.mcaScore || selectedLead.mcaInsights) && (
                <>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Funding Suitability Analysis</h3>
                    
                    {selectedLead.mcaScore !== undefined && (
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Funding Score</p>
                          <p className="text-2xl font-bold">{Number(selectedLead.mcaScore).toFixed(1)}</p>
                        </div>
                        {selectedLead.mcaQualityTier && (
                          <Badge className={cn(
                            selectedLead.mcaQualityTier === 'excellent' && "bg-green-500/10 text-green-500 border-green-500/20",
                            selectedLead.mcaQualityTier === 'good' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                            selectedLead.mcaQualityTier === 'fair' && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                            selectedLead.mcaQualityTier === 'poor' && "bg-red-500/10 text-red-500 border-red-500/20"
                          )}>
                            {selectedLead.mcaQualityTier.charAt(0).toUpperCase() + selectedLead.mcaQualityTier.slice(1)}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Funding Signals */}
                    <div className="grid grid-cols-2 gap-2">
                      {selectedLead.hasBank && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          🏦 Bank Relationship
                        </Badge>
                      )}
                      {selectedLead.hasEquipment && (
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                          🚜 Equipment Finance
                        </Badge>
                      )}
                      {selectedLead.hasIRS && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                          ⚠️ IRS Lien
                        </Badge>
                      )}
                      {selectedLead.hasSBA && (
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                          ⚠️ SBA Lien
                        </Badge>
                      )}
                    </div>

                    {selectedLead.mcaSector && (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Sector</p>
                        <p className="font-medium">{selectedLead.mcaSector}</p>
                      </div>
                    )}

                    {selectedLead.whyGoodForMCA && (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Why Good for Funding</p>
                        <p className="text-sm">{selectedLead.whyGoodForMCA}</p>
                      </div>
                    )}

                    {selectedLead.mcaInsights && Array.isArray(selectedLead.mcaInsights) && selectedLead.mcaInsights.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Insights</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedLead.mcaInsights.map((insight: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {insight}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />
                </>
              )}

              {/* Enrichment History */}
              <div className="space-y-4">
                <h3 className="font-semibold">Enrichment History</h3>
                {selectedLead.enrichmentSources ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        Confidence: {selectedLead.enrichmentConfidence}%
                      </Badge>
                      <Badge variant="outline">
                        Sources: {Array.isArray(selectedLead.enrichmentSources) 
                          ? selectedLead.enrichmentSources.length 
                          : 0}
                      </Badge>
                    </div>
                    {selectedLead.lastEnrichedAt && (
                      <p className="text-sm text-muted-foreground">
                        Last enriched: {format(new Date(selectedLead.lastEnrichedAt), 'PPpp')}
                      </p>
                    )}
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This lead has not been enriched yet
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailModal(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    enrichSingleMutation.mutate(selectedLead.id);
                    setShowDetailModal(false);
                  }}
                  disabled={enrichSingleMutation.isPending}
                  data-testid="button-reenrich"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-enrich Lead
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}