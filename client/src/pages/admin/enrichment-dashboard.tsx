import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Activity, AlertCircle, CheckCircle2, Clock, DollarSign, Globe,
  PauseCircle, PlayCircle, RefreshCw, Search, Settings,
  TrendingUp, Users, Zap, XCircle, AlertTriangle, Database,
  Gauge, Award, Target, BarChart3, LineChart, PieChart,
  Brain, Shield, Layers, Eye, Download
} from "lucide-react";
import {
  LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, RadialBarChart, RadialBar
} from "recharts";

interface EnrichmentStats {
  queue: {
    size: number;
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
  };
  stats: {
    totalProcessed: number;
    successful: number;
    failed: number;
    pending: number;
    averageProcessingTime: number;
  };
  creditUsage: Record<string, number>;
  rateLimits: Record<string, {
    current: number;
    limit: number;
    resetIn: number;
  }>;
}

interface EnrichmentJob {
  id: string;
  leadId: string;
  businessName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: 'high' | 'medium' | 'low';
  source: string;
  createdAt: string;
  processedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  enrichmentScore?: number;
  servicesUsed?: string[];
  totalCost?: number;
}

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  successRate: number;
  averageResponseTime: number;
  lastChecked: string;
  errors?: string[];
}

export default function EnrichmentDashboard() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [isPaused, setIsPaused] = useState(false);

  // Fetch enrichment statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/enrichment/stats'],
    refetchInterval: isPaused ? false : refreshInterval,
  });

  // Fetch enrichment queue items
  const { data: queueItems, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['/api/enrichment/queue'],
    refetchInterval: isPaused ? false : refreshInterval,
  });

  // Fetch service health status
  const { data: serviceHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['/api/enrichment/health'],
    refetchInterval: isPaused ? false : 30000, // Check health every 30 seconds
  });

  // Fetch historical metrics
  const { data: historicalData, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/enrichment/metrics/history'],
    refetchInterval: isPaused ? false : 60000, // Update history every minute
  });

  // Pause/Resume queue processing
  const pauseQueueMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume') => {
      return apiRequest(`/api/enrichment/queue/${action}`, { method: 'POST' });
    },
    onSuccess: (_, action) => {
      toast({
        title: action === 'pause' ? "Queue Paused" : "Queue Resumed",
        description: `Enrichment queue has been ${action}d successfully.`,
      });
      refetchStats();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error instanceof Error ? error.message : "Failed to update queue status",
      });
    },
  });

  // Retry failed items
  const retryFailedMutation = useMutation({
    mutationFn: async (itemIds?: string[]) => {
      return apiRequest('/api/enrichment/retry', {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Retry Initiated",
        description: `${data.retried} items added back to the queue.`,
      });
      refetchQueue();
      refetchStats();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Retry Failed",
        description: error instanceof Error ? error.message : "Failed to retry items",
      });
    },
  });

  // Clear dead letter queue
  const clearDeadLetterMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/enrichment/dead-letter/clear', { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({
        title: "Dead Letter Queue Cleared",
        description: "All failed items have been removed.",
      });
      refetchStats();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Clear Failed",
        description: error instanceof Error ? error.message : "Failed to clear dead letter queue",
      });
    },
  });

  // Calculate derived metrics
  const calculateMetrics = () => {
    if (!stats) return null;

    const successRate = stats.stats.totalProcessed > 0
      ? ((stats.stats.successful / stats.stats.totalProcessed) * 100).toFixed(1)
      : 0;

    const totalCreditsUsed = Object.values(stats.creditUsage || {}).reduce((sum, val) => {
      const numVal = typeof val === 'number' ? val : 0;
      return sum + numVal;
    }, 0);
    
    const averageCostPerLead = stats.stats.successful > 0
      ? (totalCreditsUsed / stats.stats.successful).toFixed(3)
      : 0;

    return { successRate, totalCreditsUsed, averageCostPerLead };
  };

  const metrics = calculateMetrics();

  // Prepare chart data
  const prepareServiceUsageData = () => {
    if (!stats?.creditUsage) return [];
    
    return Object.entries(stats.creditUsage).map(([service, credits]) => ({
      name: service.charAt(0).toUpperCase() + service.slice(1),
      value: credits,
      percentage: ((credits / Object.values(stats.creditUsage).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
    }));
  };

  const prepareRateLimitData = () => {
    if (!stats?.rateLimits) return [];
    
    return Object.entries(stats.rateLimits).map(([api, limits]) => ({
      api,
      usage: (limits.current / limits.limit) * 100,
      current: limits.current,
      limit: limits.limit,
      resetIn: Math.ceil(limits.resetIn / 1000)
    }));
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Enrichment Intelligence Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring and control of lead enrichment pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsPaused(!isPaused)}
            data-testid="button-pause-resume"
          >
            {isPaused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              refetchStats();
              refetchQueue();
              refetchHealth();
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Size</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.queue.size || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.queue.pending || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {stats?.stats.successful || 0} / {stats?.stats.totalProcessed || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.queue.processing || 0}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {((stats?.stats.averageProcessingTime || 0) / 1000).toFixed(1)}s
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Used</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics ? metrics.totalCreditsUsed.toFixed(2) : 0}</div>
            <p className="text-xs text-muted-foreground">
              ${metrics?.averageCostPerLead || 0} per lead
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.queue.failed || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.queue.deadLetter || 0} in dead letter
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Eye className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <Layers className="h-4 w-4 mr-2" />
            Queue Monitor
          </TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services">
            <Globe className="h-4 w-4 mr-2" />
            Services
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="intelligence" data-testid="tab-intelligence">
            <Brain className="h-4 w-4 mr-2" />
            AI Intelligence
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Service Usage Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Service Usage Distribution</CardTitle>
                <CardDescription>Credits consumed by each enrichment service</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={prepareServiceUsageData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name}: ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {prepareServiceUsageData().map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Rate Limits Status */}
            <Card>
              <CardHeader>
                <CardTitle>API Rate Limits</CardTitle>
                <CardDescription>Current usage vs limits for each service</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {prepareRateLimitData().map((api) => (
                  <div key={api.api} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{api.api}</span>
                      <span className="text-muted-foreground">
                        {api.current}/{api.limit} (resets in {api.resetIn}s)
                      </span>
                    </div>
                    <Progress 
                      value={api.usage} 
                      className={api.usage > 80 ? "bg-destructive/20" : ""}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Service Health Status */}
          <Card>
            <CardHeader>
              <CardTitle>Service Health Status</CardTitle>
              <CardDescription>Real-time health monitoring of enrichment services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {serviceHealth?.services?.map((service: ServiceHealth) => (
                  <Card key={service.service} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{service.service}</span>
                      <Badge variant={
                        service.status === 'healthy' ? 'default' :
                        service.status === 'degraded' ? 'secondary' : 'destructive'
                      }>
                        {service.status}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Success Rate:</span>
                        <span className={service.successRate < 80 ? "text-destructive" : ""}>
                          {service.successRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Response:</span>
                        <span>{service.averageResponseTime}ms</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Monitor Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Queue Items</CardTitle>
              <CardDescription>Real-time view of items being processed</CardDescription>
              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={() => pauseQueueMutation.mutate(isPaused ? 'resume' : 'pause')}
                  variant={isPaused ? "default" : "outline"}
                  data-testid="button-pause-queue"
                >
                  {isPaused ? "Resume Processing" : "Pause Processing"}
                </Button>
                <Button 
                  onClick={() => retryFailedMutation.mutate()}
                  variant="outline"
                  disabled={!stats?.queue.failed && !stats?.queue.deadLetter}
                  data-testid="button-retry-failed"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Failed ({stats?.queue.failed || 0})
                </Button>
                <Button 
                  onClick={() => clearDeadLetterMutation.mutate()}
                  variant="outline"
                  disabled={!stats?.queue.deadLetter}
                  data-testid="button-clear-dead-letter"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Dead Letter ({stats?.queue.deadLetter || 0})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {queueItems?.items?.map((item: EnrichmentJob) => (
                    <Card key={item.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${
                            item.status === 'completed' ? 'bg-green-500' :
                            item.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                            item.status === 'failed' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`} />
                          <div>
                            <div className="font-medium">
                              {item.businessName || `Lead ${item.leadId}`}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ID: {item.id} • Priority: {item.priority}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            item.status === 'completed' ? 'default' :
                            item.status === 'failed' ? 'destructive' :
                            item.status === 'processing' ? 'secondary' :
                            'outline'
                          }>
                            {item.status}
                          </Badge>
                          {item.retryCount > 0 && (
                            <Badge variant="outline">
                              Retry {item.retryCount}
                            </Badge>
                          )}
                          {item.totalCost && (
                            <Badge variant="outline">
                              ${item.totalCost.toFixed(3)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {item.error && (
                        <Alert className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{item.error}</AlertDescription>
                        </Alert>
                      )}
                      {item.servicesUsed && item.servicesUsed.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {item.servicesUsed.map((service) => (
                            <Badge key={service} variant="secondary" className="text-xs">
                              {service}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Service Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Service Configuration</CardTitle>
                <CardDescription>Manage enrichment service settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {['Perplexity', 'Hunter.io', 'Numverify', 'Clearbit', 'OpenAI'].map((service) => (
                  <div key={service} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{service}</div>
                        <div className="text-xs text-muted-foreground">
                          Tier 2 • $0.02 per call
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Active
                      </Badge>
                      <Button size="sm" variant="ghost">
                        Configure
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Cost Optimization */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Optimization</CardTitle>
                <CardDescription>Strategies to reduce enrichment costs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Target className="h-4 w-4" />
                  <AlertTitle>Optimization Active</AlertTitle>
                  <AlertDescription>
                    Waterfall strategy is reducing costs by 35% on average
                  </AlertDescription>
                </Alert>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Use cached data first</span>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Skip low-value leads</span>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Batch API calls</span>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Smart rate limiting</span>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrichment Performance Over Time</CardTitle>
              <CardDescription>Historical trends and patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={historicalData?.hourly || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="successful" 
                    stackId="1" 
                    stroke="#00C49F" 
                    fill="#00C49F" 
                    fillOpacity={0.6}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="failed" 
                    stackId="1" 
                    stroke="#FF8042" 
                    fill="#FF8042" 
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Services</CardTitle>
                <CardDescription>Success rate by enrichment service</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={historicalData?.servicePerformance || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="service" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="successRate" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Trends</CardTitle>
                <CardDescription>Average cost per lead over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsLineChart data={historicalData?.costTrends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avgCost" 
                      stroke="#8884d8" 
                      name="Avg Cost"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="target" 
                      stroke="#82ca9d" 
                      strokeDasharray="5 5"
                      name="Target"
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Intelligence Tab */}
        <TabsContent value="intelligence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Decision Engine</CardTitle>
              <CardDescription>Intelligent enrichment strategy decisions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="font-medium">Decisions Made</span>
                  </div>
                  <div className="text-2xl font-bold">{stats?.intelligence?.totalDecisions || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Accuracy: {stats?.intelligence?.accuracy || 0}%
                  </p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <span className="font-medium">Credits Saved</span>
                  </div>
                  <div className="text-2xl font-bold">
                    ${stats?.intelligence?.creditsSaved?.toFixed(2) || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Via smart routing
                  </p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="font-medium">Optimization Rate</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {stats?.intelligence?.optimizationRate || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leads optimized
                  </p>
                </Card>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Recent AI Decisions</h3>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {stats?.intelligence?.recentDecisions?.map((decision: any, index: number) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={
                            decision.strategy === 'maximum' ? 'default' :
                            decision.strategy === 'comprehensive' ? 'secondary' :
                            decision.strategy === 'standard' ? 'outline' :
                            'secondary'
                          }>
                            {decision.strategy} strategy
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(decision.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm mb-2">{decision.reasoning}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Confidence: {decision.confidence}%</span>
                          <span>Est. Cost: ${decision.estimatedCost}</span>
                          <span>Priority: {decision.priority}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}