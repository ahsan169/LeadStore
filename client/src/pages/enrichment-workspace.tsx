import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Brain, Upload, Zap, TrendingUp, CheckCircle, AlertCircle, Loader2, Search, ChevronRight, Activity, Database, Clock, DollarSign } from "lucide-react";
import { LeadDetailModal } from "@/components/LeadDetailModal";
import type { Lead } from "@/../../shared/schema";

export default function EnrichmentWorkspace() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch leads that need enrichment
  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/leads/enrichment-queue"],
  });

  // Fetch enrichment stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/enrichment/analytics/stats"],
  });

  // Fetch recent enrichment jobs
  const { data: recentJobs } = useQuery({
    queryKey: ["/api/enrichment/queue/jobs"],
  });

  // Start enrichment mutation
  const enrichMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await apiRequest("POST", `/api/enrichment/analyze/${leadId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Enrichment Started",
        description: "Lead has been queued for enrichment",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/enrichment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrichment/queue/jobs"] });
    },
    onError: () => {
      toast({
        title: "Enrichment Failed",
        description: "Failed to start enrichment process",
        variant: "destructive",
      });
    },
  });

  // Bulk enrich mutation
  const bulkEnrichMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/enrichment/bulk-enrich`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Enrichment Started",
        description: `${data.queued} leads queued for enrichment`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/enrichment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enrichment/queue/jobs"] });
    },
  });

  const filteredLeads = leads?.filter((lead: Lead) => 
    !searchQuery || 
    lead.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "outline";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed": return "bg-green-500";
      case "processing": return "bg-blue-500";
      case "failed": return "bg-red-500";
      case "pending": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-enrichment">
          Enrichment Workspace
        </h1>
        <p className="text-muted-foreground">
          AI-powered lead enrichment system that automatically analyzes and enhances your leads
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Enriched</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEnriched || 0}</div>
            <p className="text-xs text-muted-foreground">Leads completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Queue</CardTitle>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inQueue || 0}</div>
            <p className="text-xs text-muted-foreground">Being processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">Enrichment success</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cost Saved</CardTitle>
              <DollarSign className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats?.costSaved?.toFixed(2) || "0.00"}</div>
            <p className="text-xs text-muted-foreground">Via smart caching</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="queue">Enrichment Queue</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leads Awaiting Enrichment</CardTitle>
                  <CardDescription>AI has identified these leads for enrichment based on value and data gaps</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => bulkEnrichMutation.mutate()}
                    disabled={bulkEnrichMutation.isPending || !filteredLeads?.length}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Enrich All High Priority
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Leads List */}
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLeads?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No leads pending enrichment</p>
                  <p className="text-sm mt-2">Upload new leads to begin enrichment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads?.map((lead: any) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowDetailModal(true);
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div>
                            <h4 className="font-medium">{lead.businessName}</h4>
                            <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
                          </div>
                          <Badge variant={getPriorityColor(lead.enrichmentPriority)}>
                            {lead.enrichmentPriority || "Medium"} Priority
                          </Badge>
                          {lead.qualityScore && (
                            <Badge variant="outline">Score: {lead.qualityScore}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{lead.industry}</span>
                          <span>{lead.city}, {lead.state}</span>
                          {lead.revenue && <span>${(lead.revenue / 1000000).toFixed(1)}M revenue</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            enrichMutation.mutate(lead.id);
                          }}
                          disabled={enrichMutation.isPending}
                        >
                          <Zap className="w-4 h-4 mr-1" />
                          Enrich Now
                        </Button>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Currently Processing</CardTitle>
              <CardDescription>Real-time view of enrichment operations</CardDescription>
            </CardHeader>
            <CardContent>
              {recentJobs?.filter((job: any) => job.status === "processing")?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No active enrichment jobs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentJobs?.filter((job: any) => job.status === "processing").map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(job.status)}`} />
                        <div>
                          <p className="font-medium">{job.leadName || "Lead #" + job.leadId}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.currentStep || "Processing"}...
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{job.attemptNumber}/3 attempts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrichment History</CardTitle>
              <CardDescription>Recently completed enrichment jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {recentJobs?.filter((job: any) => job.status === "completed" || job.status === "failed")?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No enrichment history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentJobs?.filter((job: any) => job.status === "completed" || job.status === "failed").map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(job.status)}`} />
                        <div>
                          <p className="font-medium">{job.leadName || "Lead #" + job.leadId}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.status === "completed" ? "Successfully enriched" : "Enrichment failed"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {job.enrichmentResults && (
                          <span className="text-green-600">
                            +{Object.keys(job.enrichmentResults).length} fields added
                          </span>
                        )}
                        <span>{new Date(job.completedAt || job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedLead(null);
        }}
        onEnrich={async (lead) => {
          enrichMutation.mutate(lead.id);
        }}
        onExport={async (lead, format) => {
          toast({
            title: "Export Started",
            description: `Exporting lead as ${format}`,
          });
        }}
      />
    </div>
  );
}