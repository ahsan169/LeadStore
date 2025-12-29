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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Sparkles, 
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
  Upload,
  FileText,
  ChevronRight,
  Download,
  Shield,
  Globe,
  DollarSign,
  Brain,
  Link,
  Hash,
  Info,
  Award,
  Gauge,
  Users
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Lead } from "@shared/schema";
import { cn } from "@/lib/utils";

// Type definitions for intelligence data
interface IntelligenceStats {
  totalLeads: number;
  averageCompletion: number;
  activeProcesses: number;
  dataQualityScore: number;
  leadsEnrichedToday: number;
  successRate: number;
  apiHealth: {
    status: 'healthy' | 'degraded' | 'down';
    services: {
      name: string;
      status: 'up' | 'down' | 'limited';
      latency: number;
    }[];
  };
  enrichmentCosts: {
    today: number;
    month: number;
    remaining: number;
  };
}

interface EnrichedLead extends Lead {
  completionPercentage: number;
  missingFields: string[];
  enrichmentSystems: string[];
  dataAge: number;
  verificationStatus: any;
}

interface IntelligenceInspectorData {
  lead: EnrichedLead;
  dataLineage: Record<string, {
    source: string;
    timestamp: string;
    confidence: number;
  }>;
  enrichmentHistory: Array<{
    timestamp: string;
    source: string;
    fieldsUpdated: string[];
    success: boolean;
  }>;
}

export default function IntelligenceCenter() {
  const { toast } = useToast();
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<IntelligenceInspectorData | null>(null);
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [missingDataFilter, setMissingDataFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [uploadDropdownOpen, setUploadDropdownOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddData, setQuickAddData] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    address: ""
  });
  const [wsConnected, setWsConnected] = useState(false);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      // Use the same WebSocket endpoint as the Command Center
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${window.location.host}/ws`;
      
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        console.log('Intelligence Center WebSocket connected');
        
        // Subscribe to enrichment updates
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channel: 'enrichment_updates'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'enrichment_started':
              toast({
                title: "Enrichment Started",
                description: `Enriching ${data.leadName || 'lead'} with ${data.source}`,
              });
              refetchStats();
              refetchLeads();
              break;
              
            case 'enrichment_completed':
              toast({
                title: "Enrichment Complete",
                description: `${data.leadName || 'Lead'} enriched successfully`,
              });
              refetchStats();
              refetchLeads();
              break;
              
            case 'enrichment_failed':
              toast({
                title: "Enrichment Failed",
                description: data.error || "Failed to enrich lead",
                variant: "destructive",
              });
              refetchStats();
              break;
              
            case 'queue_update':
              refetchStats();
              break;
              
            case 'batch_progress':
              // Update batch progress in real-time
              if (data.progress && data.total) {
                const percentage = Math.round((data.progress / data.total) * 100);
                toast({
                  title: "Batch Progress",
                  description: `Processing: ${data.progress} of ${data.total} (${percentage}%)`,
                });
              }
              break;
          }
        } catch (error) {
          console.error('WebSocket message parsing error:', error);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('Intelligence Center WebSocket disconnected');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          if (ws?.readyState === WebSocket.CLOSED) {
            connectWebSocket();
          }
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('Intelligence Center WebSocket error:', error);
        setWsConnected(false);
      };
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [toast]);

  // Query for intelligence statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<IntelligenceStats>({
    queryKey: ['/api/master/analytics'],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  });

  // Query for enriched leads with intelligence data
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useQuery<{
    leads: EnrichedLead[];
    totalCount: number;
  }>({
    queryKey: ['/api/leads/intelligence', { qualityFilter, missingDataFilter, sourceFilter, searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (qualityFilter !== 'all') params.append('quality', qualityFilter);
      if (missingDataFilter !== 'all') params.append('missing', missingDataFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/leads?${params.toString()}&includeIntelligence=true`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      
      // Transform leads to include intelligence data
      const enrichedLeads = data.leads.map((lead: Lead) => ({
        ...lead,
        completionPercentage: calculateCompletion(lead),
        missingFields: getMissingFields(lead),
        enrichmentSystems: getEnrichmentSystems(lead),
        dataAge: calculateDataAge(lead),
        verificationStatus: getVerificationStatus(lead)
      }));
      
      return { leads: enrichedLeads, totalCount: data.totalCount || enrichedLeads.length };
    },
  });

  // Query for system status
  const { data: systemStatus } = useQuery({
    queryKey: ['/api/master/status'],
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Master enrich all mutation
  const masterEnrichAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/master/enrich", {
        action: "enrich_all_incomplete"
      });
    },
    onSuccess: () => {
      toast({
        title: "Master Enrichment Started",
        description: "All incomplete leads are being enriched with all available systems",
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

  // Single lead enrichment mutation
  const enrichSingleMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return apiRequest("POST", "/api/master/enrich", {
        action: "enrich_single",
        leadId
      });
    },
    onSuccess: () => {
      toast({
        title: "Lead Enrichment Started",
        description: "The lead is being enriched with all available intelligence sources",
      });
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

  // Batch enrichment mutation
  const enrichBatchMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      return apiRequest("POST", "/api/master/enrich", {
        action: "enrich_batch",
        leadIds
      });
    },
    onSuccess: () => {
      toast({
        title: "Batch Enrichment Started",
        description: `${selectedLeads.size} leads are being enriched`,
      });
      setSelectedLeads(new Set());
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

  // Quick add and enrich mutation
  const quickAddMutation = useMutation({
    mutationFn: async (data: typeof quickAddData) => {
      return apiRequest("POST", "/api/leads/quick-add-enrich", data);
    },
    onSuccess: () => {
      toast({
        title: "Lead Added & Enriched",
        description: "New lead has been added and is being enriched",
      });
      setQuickAddOpen(false);
      setQuickAddData({
        businessName: "",
        ownerName: "",
        email: "",
        phone: "",
        address: ""
      });
      refetchLeads();
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pause/Resume enrichment queue
  const toggleQueueMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume') => {
      return apiRequest("POST", `/api/admin/enrichment/queue/${action}`);
    },
    onSuccess: (data, action) => {
      setIsPaused(action === 'pause');
      toast({
        title: action === 'pause' ? "Enrichment Paused" : "Enrichment Resumed",
        description: `All enrichment processes have been ${action}d`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Queue Control Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const calculateCompletion = (lead: Lead): number => {
    const criticalFields = [
      'businessName', 'ownerName', 'email', 'phone', 'industry',
      'annualRevenue', 'timeInBusiness', 'creditScore', 'fullAddress',
      'city', 'stateCode', 'websiteUrl', 'linkedinUrl', 'companySize',
      'yearFounded', 'businessDescription', 'employeeCount', 'uccNumber'
    ];
    
    const filledFields = criticalFields.filter(field => lead[field as keyof Lead]);
    return Math.round((filledFields.length / criticalFields.length) * 100);
  };

  const getMissingFields = (lead: Lead): string[] => {
    const fields: Record<string, string> = {
      ownerName: 'Owner Name',
      email: 'Email',
      phone: 'Phone',
      industry: 'Industry',
      annualRevenue: 'Annual Revenue',
      websiteUrl: 'Website',
      linkedinUrl: 'LinkedIn',
      fullAddress: 'Address'
    };
    
    return Object.entries(fields)
      .filter(([field]) => !lead[field as keyof Lead])
      .map(([, label]) => label);
  };

  const getEnrichmentSystems = (lead: Lead): string[] => {
    const systems = [];
    if (lead.uccNumber) systems.push('UCC');
    if (lead.websiteUrl || lead.linkedinUrl) systems.push('Web');
    if (lead.mlQualityScore && lead.mlQualityScore > 0) systems.push('AI');
    if (lead.enrichmentSources) {
      const sources = lead.enrichmentSources as any;
      if (sources.clearbit) systems.push('Clearbit');
      if (sources.hunter) systems.push('Hunter');
      if (sources.fullcontact) systems.push('FullContact');
    }
    return systems;
  };

  const calculateDataAge = (lead: Lead): number => {
    const lastUpdate = lead.lastEnrichedAt || lead.createdAt;
    const now = new Date();
    const updateDate = new Date(lastUpdate);
    return Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24)); // Days
  };

  const getVerificationStatus = (lead: Lead) => {
    // This would normally come from verification APIs
    return {
      email: lead.email ? 'unverified' as const : 'invalid' as const,
      phone: lead.phone ? 'unverified' as const : 'invalid' as const,
      address: lead.fullAddress ? 'unverified' as const : 'invalid' as const
    };
  };

  const getQualityColor = (score: number) => {
    if (score >= 90) return "text-green-600 bg-green-100 dark:bg-green-950";
    if (score >= 70) return "text-blue-600 bg-blue-100 dark:bg-blue-950";
    if (score >= 40) return "text-yellow-600 bg-yellow-100 dark:bg-yellow-950";
    return "text-red-600 bg-red-100 dark:bg-red-950";
  };

  const getQualityLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 40) return "Fair";
    return "Poor";
  };

  const handleViewIntelligence = async (leadId: string) => {
    // Fetch detailed intelligence data for the lead
    try {
      const response = await apiRequest("GET", `/api/leads/${leadId}/intelligence`);
      setSelectedLead(response as any as IntelligenceInspectorData);
      setInspectorOpen(true);
    } catch (error) {
      toast({
        title: "Failed to Load Intelligence",
        description: "Could not fetch detailed intelligence data",
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = () => {
    if (!leadsData) return;
    
    if (selectedLeads.size === leadsData.leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leadsData.leads.map(lead => lead.id)));
    }
  };

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Intelligence Center</h1>
            <p className="text-muted-foreground mt-1">
              Unified enrichment, verification, and intelligence hub
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant={wsConnected ? "outline" : "destructive"} 
            className="flex items-center gap-1"
          >
            <Activity className={cn("w-3 h-3", wsConnected && "animate-pulse")} />
            {wsConnected ? 'Live Updates' : 'Connecting...'}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {(systemStatus as any)?.status || 'Online'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchStats();
              refetchLeads();
            }}
            data-testid="button-refresh-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Section 1: Intelligence Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            {/* Total Leads with Enrichment Gauge */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                <Database className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalLeads || 0}</div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Enrichment</span>
                    <span className="font-medium">{stats?.averageCompletion || 0}%</span>
                  </div>
                  <Progress value={stats?.averageCompletion || 0} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Active Enrichment Processes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Processes</CardTitle>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {stats?.activeProcesses || 0}
                  {stats?.activeProcesses && stats.activeProcesses > 0 && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {stats?.activeProcesses === 0 ? "All processes idle" : "Enriching leads..."}
                </p>
              </CardContent>
            </Card>

            {/* Data Quality Score */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
                <Award className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", getQualityColor(stats?.dataQualityScore || 0).split(' ')[0])}>
                  {stats?.dataQualityScore || 0}%
                </div>
                <Badge 
                  variant="secondary" 
                  className={cn("mt-2 text-xs", getQualityColor(stats?.dataQualityScore || 0))}
                >
                  {getQualityLabel(stats?.dataQualityScore || 0)}
                </Badge>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Activity</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Enriched</span>
                  <span className="font-medium">{stats?.leadsEnrichedToday || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">{stats?.successRate || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">API Health</span>
                  <Badge 
                    variant={stats?.apiHealth.status === 'healthy' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {stats?.apiHealth.status || 'Unknown'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Section 2: Quick Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Master Enrich All Button */}
            <Button
              onClick={() => masterEnrichAllMutation.mutate()}
              disabled={masterEnrichAllMutation.isPending}
              className="font-medium"
              data-testid="button-master-enrich-all"
            >
              {masterEnrichAllMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enriching All...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Master Enrich All
                </>
              )}
            </Button>

            {/* Upload & Enrich Dropdown */}
            <DropdownMenu open={uploadDropdownOpen} onOpenChange={setUploadDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-upload-dropdown">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Enrich
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Import Options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => window.location.href = '/admin/upload'}
                  data-testid="menu-upload-csv"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Leads CSV
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => window.location.href = '/admin/ucc-manager'}
                  data-testid="menu-upload-ucc"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Upload UCC File
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setQuickAddOpen(true)}
                  data-testid="menu-add-single"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Single Lead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pause/Resume Toggle */}
            <Button
              variant={isPaused ? "destructive" : "outline"}
              onClick={() => toggleQueueMutation.mutate(isPaused ? 'resume' : 'pause')}
              disabled={toggleQueueMutation.isPending}
              data-testid="button-pause-resume"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Resume All
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause All
                </>
              )}
            </Button>

            <Separator orientation="vertical" className="h-6" />

            {/* Bulk Actions */}
            {selectedLeads.size > 0 && (
              <>
                <Button
                  variant="default"
                  onClick={() => enrichBatchMutation.mutate(Array.from(selectedLeads))}
                  disabled={enrichBatchMutation.isPending}
                  data-testid="button-enrich-selected"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Enrich Selected ({selectedLeads.size})
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedLeads(new Set())}
                  data-testid="button-clear-selection"
                >
                  Clear Selection
                </Button>
              </>
            )}

            {/* Cost Tracker */}
            {stats?.enrichmentCosts && (
              <div className="ml-auto flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Today:</span>
                  <span className="font-medium">${stats.enrichmentCosts.today.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Remaining:</span>
                  <span className="font-medium text-green-600">
                    ${stats.enrichmentCosts.remaining.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Intelligent Lead Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Intelligent Lead Table</CardTitle>
              <CardDescription>
                Complete view of all leads with enrichment status and intelligence scores
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                  data-testid="input-search-leads"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={qualityFilter} onValueChange={setQualityFilter}>
              <SelectTrigger className="w-48" data-testid="select-quality-filter">
                <SelectValue placeholder="Quality Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quality Levels</SelectItem>
                <SelectItem value="excellent">Excellent (90%+)</SelectItem>
                <SelectItem value="good">Good (70-90%)</SelectItem>
                <SelectItem value="fair">Fair (40-70%)</SelectItem>
                <SelectItem value="poor">Poor (&lt;40%)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={missingDataFilter} onValueChange={setMissingDataFilter}>
              <SelectTrigger className="w-48" data-testid="select-missing-filter">
                <SelectValue placeholder="Missing Data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leads</SelectItem>
                <SelectItem value="no_owner">No Owner</SelectItem>
                <SelectItem value="no_phone">No Phone</SelectItem>
                <SelectItem value="no_email">No Email</SelectItem>
                <SelectItem value="no_address">No Address</SelectItem>
                <SelectItem value="no_revenue">No Revenue</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-48" data-testid="select-source-filter">
                <SelectValue placeholder="Enrichment Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="ucc">Has UCC Data</SelectItem>
                <SelectItem value="web">Has Web Data</SelectItem>
                <SelectItem value="ai">Has AI Analysis</SelectItem>
                <SelectItem value="verified">Verified Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={(leadsData?.leads?.length ?? 0) > 0 && selectedLeads.size === (leadsData?.leads?.length ?? 0)}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Owner Name</TableHead>
                  <TableHead>Master Score</TableHead>
                  <TableHead>Enrichment Systems</TableHead>
                  <TableHead>Data Age</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : leadsData?.leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No leads found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  leadsData?.leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => handleSelectLead(lead.id)}
                          data-testid={`checkbox-lead-${lead.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{lead.businessName}</span>
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getQualityColor(lead.completionPercentage))}
                          >
                            {lead.completionPercentage}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{lead.ownerName || '-'}</span>
                          {lead.ownerName && (
                            lead.verificationStatus?.email === 'verified' ? (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-yellow-500" />
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Gauge className="w-4 h-4 text-muted-foreground" />
                            <span className={cn("font-bold", 
                              (lead.masterEnrichmentScore ?? 0) >= 80 ? "text-green-600" :
                              (lead.masterEnrichmentScore ?? 0) >= 60 ? "text-blue-600" :
                              (lead.masterEnrichmentScore ?? 0) >= 40 ? "text-yellow-600" :
                              "text-red-600"
                            )}>
                              {lead.masterEnrichmentScore || 0}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {lead.enrichmentSystems.map((system) => (
                            <Badge key={system} variant="secondary" className="text-xs">
                              {system}
                            </Badge>
                          ))}
                          {lead.enrichmentSystems.length === 0 && (
                            <span className="text-muted-foreground text-xs">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {lead.dataAge === 0 ? 'Today' : 
                           lead.dataAge === 1 ? 'Yesterday' :
                           `${lead.dataAge} days ago`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => enrichSingleMutation.mutate(lead.id)}
                            disabled={enrichSingleMutation.isPending}
                            data-testid={`button-enrich-${lead.id}`}
                          >
                            <Zap className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewIntelligence(lead.id)}
                            data-testid={`button-view-${lead.id}`}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Intelligence Inspector Modal */}
      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Intelligence Inspector
            </DialogTitle>
            <DialogDescription>
              Complete intelligence profile from all enrichment sources
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <Tabs defaultValue="core" className="mt-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="core">Core Data</TabsTrigger>
                <TabsTrigger value="ucc">UCC Intel</TabsTrigger>
                <TabsTrigger value="web">Web Intel</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
                <TabsTrigger value="verification">Verification</TabsTrigger>
              </TabsList>

              <TabsContent value="core" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Information</Label>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.businessName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.ownerName || 'Not available'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.fullAddress || selectedLead.lead.city || 'Not available'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Information</Label>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.email || 'Not available'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.phone || 'Not available'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedLead.lead.websiteUrl || 'Not available'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Lineage */}
                <div className="space-y-2">
                  <Label>Data Lineage</Label>
                  <div className="rounded-md border p-3 space-y-2">
                    {Object.entries(selectedLead.dataLineage || {}).map(([field, info]) => (
                      <div key={field} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{field}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{info.source}</Badge>
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(info.timestamp), { addSuffix: true })}
                          </span>
                          <Badge variant={info.confidence > 80 ? 'default' : 'secondary'}>
                            {info.confidence}% confidence
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ucc" className="space-y-4">
                <div className="grid gap-4">
                  {selectedLead.lead.uccNumber ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label>UCC Number</Label>
                          <div className="flex items-center gap-1">
                            <Hash className="w-4 h-4 text-muted-foreground" />
                            <span className="font-mono">{selectedLead.lead.uccNumber}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Filing Count</Label>
                          <span className="text-lg font-semibold">{selectedLead.lead.filingCount || 0}</span>
                        </div>
                        <div className="space-y-1">
                          <Label>Stacking Risk</Label>
                          <Badge variant={selectedLead.lead.stackingRisk === 'high' ? 'destructive' : 'default'}>
                            {selectedLead.lead.stackingRisk || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Secured Parties</Label>
                        <p className="text-sm">{selectedLead.lead.securedParties || 'Not available'}</p>
                      </div>
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No UCC data available for this lead
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="web" className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Online Presence</Label>
                    <div className="space-y-2">
                      {selectedLead.lead.websiteUrl && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <a href={selectedLead.lead.websiteUrl} target="_blank" rel="noopener noreferrer" 
                             className="text-primary hover:underline">
                            {selectedLead.lead.websiteUrl}
                          </a>
                        </div>
                      )}
                      {selectedLead.lead.linkedinUrl && (
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-muted-foreground" />
                          <a href={selectedLead.lead.linkedinUrl} target="_blank" rel="noopener noreferrer"
                             className="text-primary hover:underline">
                            LinkedIn Profile
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedLead.lead.businessDescription && (
                    <div className="space-y-2">
                      <Label>Business Description</Label>
                      <p className="text-sm">{selectedLead.lead.businessDescription}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Annual Revenue</Label>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {selectedLead.lead.annualRevenue || 'Not available'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Employee Count</Label>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {selectedLead.lead.employeeCount || 'Not available'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Years in Business</Label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {selectedLead.lead.yearsInBusiness || 
                         (selectedLead.lead.yearFounded ? new Date().getFullYear() - selectedLead.lead.yearFounded : 'Not available')}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Credit Score</Label>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {selectedLead.lead.creditScore || 'Not available'}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="verification" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>Email Verification</span>
                    </div>
                    <Badge variant={selectedLead.lead.verificationStatus?.email === 'verified' ? 'default' : 'secondary'}>
                      {selectedLead.lead.verificationStatus?.email || 'Unverified'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>Phone Verification</span>
                    </div>
                    <Badge variant={selectedLead.lead.verificationStatus?.phone === 'verified' ? 'default' : 'secondary'}>
                      {selectedLead.lead.verificationStatus?.phone || 'Unverified'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>Address Verification</span>
                    </div>
                    <Badge variant={selectedLead.lead.verificationStatus?.address === 'verified' ? 'default' : 'secondary'}>
                      {selectedLead.lead.verificationStatus?.address || 'Unverified'}
                    </Badge>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setInspectorOpen(false)}
              data-testid="button-close-inspector"
            >
              Close
            </Button>
            {selectedLead && (
              <Button
                onClick={() => {
                  enrichSingleMutation.mutate(selectedLead.lead.id);
                  setInspectorOpen(false);
                }}
                data-testid="button-reenrich"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Re-enrich with All Systems
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Lead Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add & Enrich Lead</DialogTitle>
            <DialogDescription>
              Add a new lead and automatically enrich it with all available intelligence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={quickAddData.businessName}
                onChange={(e) => setQuickAddData({...quickAddData, businessName: e.target.value})}
                placeholder="Acme Corporation"
                data-testid="input-business-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner Name</Label>
              <Input
                id="ownerName"
                value={quickAddData.ownerName}
                onChange={(e) => setQuickAddData({...quickAddData, ownerName: e.target.value})}
                placeholder="John Doe"
                data-testid="input-owner-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={quickAddData.email}
                onChange={(e) => setQuickAddData({...quickAddData, email: e.target.value})}
                placeholder="john@acme.com"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={quickAddData.phone}
                onChange={(e) => setQuickAddData({...quickAddData, phone: e.target.value})}
                placeholder="(555) 123-4567"
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={quickAddData.address}
                onChange={(e) => setQuickAddData({...quickAddData, address: e.target.value})}
                placeholder="123 Main St, City, ST 12345"
                data-testid="input-address"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setQuickAddOpen(false)}
              data-testid="button-cancel-quick-add"
            >
              Cancel
            </Button>
            <Button
              onClick={() => quickAddMutation.mutate(quickAddData)}
              disabled={!quickAddData.businessName || quickAddMutation.isPending}
              data-testid="button-submit-quick-add"
            >
              {quickAddMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add & Enrich
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}