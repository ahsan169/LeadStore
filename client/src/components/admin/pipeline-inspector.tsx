import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, Filter, Download, GitBranch, Clock, 
  ChevronDown, ChevronRight, Activity, Layers, 
  FileJson, Eye, Terminal, Zap, AlertCircle, 
  CheckCircle, XCircle, Info, ArrowRight, 
  Database, Brain, Shield 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  confidence: number;
  timestamp: Date;
  duration?: number;
  decision?: string;
  transformations?: any[];
  errors?: string[];
}

interface ProcessingHistory {
  id: string;
  leadId: string;
  sessionId: string;
  timestamp: Date;
  duration: number;
  stages: ProcessingStage[];
  confidence: number;
  score: number;
  tierUsage: {
    tier0: number;
    tier1: number;
    tier2: number;
  };
  rulesExecuted: string[];
  transformations: any[];
  lineage: any[];
  flags: string[];
  errors: any[];
}

export default function PipelineInspector() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  // Fetch processing history
  const { data: processingHistory, isLoading } = useQuery<ProcessingHistory[]>({
    queryKey: ['/api/brain/history', searchTerm, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      params.append('limit', '50');
      
      const response = await fetch(`/api/brain/history?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch processing history');
      return response.json();
    },
  });

  // Fetch detailed history for selected lead
  const { data: leadHistory } = useQuery({
    queryKey: ['/api/brain/history', selectedLead],
    queryFn: async () => {
      if (!selectedLead) return null;
      const response = await fetch(`/api/brain/history/${selectedLead}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch lead history');
      return response.json();
    },
    enabled: !!selectedLead,
  });

  const getStageIcon = (stage: string) => {
    const icons: Record<string, any> = {
      ingest: Database,
      normalize: Layers,
      resolve: GitBranch,
      enrich: Zap,
      ucc_aggregate: Shield,
      rules: Terminal,
      score: Brain,
      export: FileJson
    };
    const Icon = icons[stage.toLowerCase()] || Activity;
    return <Icon className="w-4 h-4" />;
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'skipped': return <ArrowRight className="w-4 h-4 text-gray-400" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'failed': return 'bg-red-100 text-red-800 border-red-300';
      case 'running': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'skipped': return 'bg-gray-100 text-gray-600 border-gray-300';
      default: return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-blue-600';
    if (confidence >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const toggleStageExpanded = (stageId: string) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const exportProcessingLogs = (leadId?: string) => {
    const dataToExport = leadId 
      ? leadHistory 
      : processingHistory;
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-logs-${leadId || 'all'}-${Date.now()}.json`;
    a.click();
    
    toast({
      title: "Logs Exported",
      description: "Processing logs have been downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-pipeline-inspector">
            <GitBranch className="w-6 h-6" />
            Pipeline Inspector
          </h2>
          <p className="text-muted-foreground">View and analyze lead processing history</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportProcessingLogs()}
          data-testid="button-export-all-logs"
        >
          <Download className="w-4 h-4 mr-2" />
          Export All
        </Button>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Leads</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search by lead ID, business name, or session ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-leads"
                />
              </div>
            </div>
            <div className="w-48">
              <Label htmlFor="filter">Filter by Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filter" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Processing History List */}
        <div className="lg:col-span-1">
          <Card className="h-[700px]">
            <CardHeader>
              <CardTitle>Processing History</CardTitle>
              <CardDescription>Select a lead to view details</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[580px]">
                <div className="space-y-2">
                  {processingHistory?.map((record) => (
                    <div
                      key={record.id}
                      className={cn(
                        "p-3 border rounded-lg cursor-pointer transition-colors",
                        selectedLead === record.leadId 
                          ? "bg-primary/10 border-primary" 
                          : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedLead(record.leadId)}
                      data-testid={`card-history-${record.leadId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">Lead #{record.leadId?.slice(-8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(record.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs", getConfidenceColor(record.confidence))}
                        >
                          {record.confidence}%
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {record.stages?.map((stage, idx) => (
                            <div key={idx} title={stage.name}>
                              {getStatusIcon(stage.status)}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {record.duration}ms
                        </span>
                      </div>
                    </div>
                  )) || (
                    <p className="text-center text-muted-foreground py-8">
                      {isLoading ? "Loading..." : "No processing history found"}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Processing View */}
        <div className="lg:col-span-2">
          {selectedLead && leadHistory ? (
            <Card className="h-[700px]">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Processing Details</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportProcessingLogs(selectedLead)}
                    data-testid="button-export-lead-log"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </CardTitle>
                <CardDescription>
                  Lead #{selectedLead.slice(-8)} • Session: {leadHistory.sessionId?.slice(-8)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="timeline" className="h-[550px]">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="transformations">Transformations</TabsTrigger>
                    <TabsTrigger value="lineage">Lineage</TabsTrigger>
                    <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  </TabsList>

                  <TabsContent value="timeline" className="mt-4">
                    <ScrollArea className="h-[480px]">
                      <div className="space-y-3">
                        {leadHistory.stages?.map((stage, idx) => (
                          <Collapsible key={idx}>
                            <div className={cn(
                              "border rounded-lg p-4",
                              getStatusColor(stage.status)
                            )}>
                              <CollapsibleTrigger
                                className="w-full"
                                onClick={() => toggleStageExpanded(`${idx}`)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {getStageIcon(stage.name)}
                                    <div className="text-left">
                                      <p className="font-medium capitalize">{stage.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(stage.timestamp).toLocaleTimeString()}
                                        {stage.duration && ` • ${stage.duration}ms`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      {stage.confidence}% confidence
                                    </Badge>
                                    {expandedStages.has(`${idx}`) 
                                      ? <ChevronDown className="w-4 h-4" />
                                      : <ChevronRight className="w-4 h-4" />
                                    }
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-3 pt-3 border-t space-y-2">
                                  {stage.decision && (
                                    <div>
                                      <p className="text-xs font-medium">Decision:</p>
                                      <p className="text-xs text-muted-foreground">{stage.decision}</p>
                                    </div>
                                  )}
                                  {stage.transformations && stage.transformations.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium">Transformations:</p>
                                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                                        {stage.transformations.map((t: any, i: number) => (
                                          <li key={i}>{JSON.stringify(t)}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {stage.errors && stage.errors.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-red-600">Errors:</p>
                                      <ul className="text-xs text-red-600 list-disc list-inside">
                                        {stage.errors.map((e, i) => (
                                          <li key={i}>{e}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="transformations" className="mt-4">
                    <ScrollArea className="h-[480px]">
                      <div className="space-y-3">
                        {leadHistory.transformations?.map((transform: any, idx: number) => (
                          <Card key={idx}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">
                                {transform.field || `Transformation ${idx + 1}`}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="font-medium">Before:</p>
                                    <p className="text-muted-foreground font-mono text-xs bg-muted p-1 rounded">
                                      {JSON.stringify(transform.before) || 'null'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium">After:</p>
                                    <p className="text-muted-foreground font-mono text-xs bg-muted p-1 rounded">
                                      {JSON.stringify(transform.after) || 'null'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {transform.stage}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {transform.rule || 'System'}
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="lineage" className="mt-4">
                    <ScrollArea className="h-[480px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Stage</TableHead>
                            <TableHead>Input Fields</TableHead>
                            <TableHead>Output Fields</TableHead>
                            <TableHead>Source</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leadHistory.lineage?.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{item.stage}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {item.inputFields?.map((field: string) => (
                                    <Badge key={field} variant="outline" className="text-xs">
                                      {field}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {item.outputFields?.map((field: string) => (
                                    <Badge key={field} variant="outline" className="text-xs">
                                      {field}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>{item.source || 'System'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="metrics" className="mt-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Overall Metrics</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm">Total Duration:</span>
                              <span className="font-medium">{leadHistory.duration}ms</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Final Score:</span>
                              <span className="font-medium">{leadHistory.score}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Confidence:</span>
                              <span className={cn("font-medium", getConfidenceColor(leadHistory.confidence))}>
                                {leadHistory.confidence}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Rules Executed:</span>
                              <span className="font-medium">{leadHistory.rulesExecuted?.length || 0}</span>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Tier Usage</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm">Tier 0 (AI):</span>
                              <span className="font-medium">{leadHistory.tierUsage?.tier0 || 0} fields</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Tier 1 (API):</span>
                              <span className="font-medium">{leadHistory.tierUsage?.tier1 || 0} fields</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Tier 2 (Fallback):</span>
                              <span className="font-medium">{leadHistory.tierUsage?.tier2 || 0} fields</span>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {leadHistory.flags && leadHistory.flags.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              Flags & Warnings
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-1">
                              {leadHistory.flags.map((flag, idx) => (
                                <Badge key={idx} variant="outline" className="mr-2">
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {leadHistory.errors && leadHistory.errors.length > 0 && (
                        <Card className="border-red-200">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                              <XCircle className="w-4 h-4" />
                              Errors
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {leadHistory.errors.map((error: any, idx: number) => (
                                <div key={idx} className="text-sm">
                                  <p className="font-medium text-red-600">{error.stage}:</p>
                                  <p className="text-muted-foreground">{error.message}</p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[700px] flex items-center justify-center">
              <CardContent>
                <div className="text-center text-muted-foreground">
                  <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a lead from the list to view processing details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}