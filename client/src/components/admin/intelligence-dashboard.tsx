import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  PieChart, Pie, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, Cell, Area, AreaChart 
} from "recharts";
import { 
  Zap, Activity, TrendingUp, AlertCircle, CheckCircle, 
  Clock, DollarSign, Brain, Gauge, Shield, Info,
  RefreshCw, Download, Filter, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
const TIER_COLORS = {
  'tier0': '#10b981', 
  'tier1': '#3b82f6',
  'tier2': '#f59e0b'
};

export default function IntelligenceDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Fetch intelligence overview
  const { data: overviewData, isLoading: isLoadingOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['/api/admin/intelligence/overview'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });
  const overview = overviewData as any;

  // Fetch pipeline metrics
  const { data: pipelineMetricsData } = useQuery({
    queryKey: ['/api/brain/metrics'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });
  const pipelineMetrics = pipelineMetricsData as any;

  // Fetch rule performance
  const { data: rulePerformanceData } = useQuery({
    queryKey: ['/api/rules/performance'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });
  const rulePerformance = rulePerformanceData as any;

  // Fetch recent processing explanations
  const { data: recentProcessingData } = useQuery({
    queryKey: ['/api/brain/recent'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });
  const recentProcessing = recentProcessingData as any;

  // Format tier usage data for pie chart
  const tierUsageData = overview?.tierUsage ? [
    { name: 'Tier 0 (AI)', value: overview.tierUsage.tier0 || 0, color: TIER_COLORS.tier0 },
    { name: 'Tier 1 (API)', value: overview.tierUsage.tier1 || 0, color: TIER_COLORS.tier1 },
    { name: 'Tier 2 (Fallback)', value: overview.tierUsage.tier2 || 0, color: TIER_COLORS.tier2 },
  ] : [];

  // Format cost breakdown data
  const costData = overview?.costBreakdown?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    aiCost: item.aiCost || 0,
    apiCost: item.apiCost || 0,
    storageCost: item.storageCost || 0,
    total: (item.aiCost || 0) + (item.apiCost || 0) + (item.storageCost || 0)
  })) || [];

  // Format processing speed metrics
  const speedMetrics = pipelineMetrics?.avgProcessingTime ? [
    { stage: 'Ingest', time: pipelineMetrics.stageMetrics?.ingest || 0 },
    { stage: 'Normalize', time: pipelineMetrics.stageMetrics?.normalize || 0 },
    { stage: 'Resolve', time: pipelineMetrics.stageMetrics?.resolve || 0 },
    { stage: 'Enrich', time: pipelineMetrics.stageMetrics?.enrich || 0 },
    { stage: 'Score', time: pipelineMetrics.stageMetrics?.score || 0 },
    { stage: 'Export', time: pipelineMetrics.stageMetrics?.export || 0 },
  ] : [];

  // Calculate success rate
  const successRate = pipelineMetrics?.totalProcessed > 0
    ? ((pipelineMetrics.successful / pipelineMetrics.totalProcessed) * 100).toFixed(1)
    : 0;

  const getStatusColor = (status: string) => {
    switch(status?.toLowerCase()) {
      case 'healthy': return 'text-green-500';
      case 'degraded': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status?.toLowerCase()) {
      case 'healthy': return <CheckCircle className="w-4 h-4" />;
      case 'degraded': return <AlertCircle className="w-4 h-4" />;
      case 'critical': return <AlertCircle className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-intelligence-dashboard">
            <Brain className="w-6 h-6" />
            Intelligence Dashboard
          </h2>
          <p className="text-muted-foreground">Real-time brain pipeline monitoring and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchOverview();
            }}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-export-metrics"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* System Status Alert */}
      {overview?.systemStatus && overview.systemStatus !== 'healthy' && (
        <Alert className={cn(
          "border-l-4",
          overview.systemStatus === 'critical' ? "border-l-red-500" : "border-l-yellow-500"
        )}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            System status: <strong className="capitalize">{overview.systemStatus}</strong>
            {overview.systemMessage && ` - ${overview.systemMessage}`}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Pipeline Status
              {getStatusIcon(overview?.pipelineStatus)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold capitalize", getStatusColor(overview?.pipelineStatus))}>
              {overview?.pipelineStatus || 'Unknown'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.activePipelines || 0} active pipelines
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <Progress value={Number(successRate)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {pipelineMetrics?.successful || 0} / {pipelineMetrics?.totalProcessed || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Avg Processing Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pipelineMetrics?.avgProcessingTime || 0}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Min: {pipelineMetrics?.minTime || 0}ms | Max: {pipelineMetrics?.maxTime || 0}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Today's Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${overview?.todaysCost?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              MTD: ${overview?.monthCost?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier Usage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Tier Usage Distribution</CardTitle>
            <CardDescription>Field resolution by intelligence tier</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tierUsageData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tierUsageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tierUsageData.map((tier) => (
                <div key={tier.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span>{tier.name}</span>
                  </div>
                  <span className="font-medium">{tier.value.toLocaleString()} fields</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cost Breakdown Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>Daily cost analysis by service</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                <Legend />
                <Area type="monotone" dataKey="aiCost" stackId="1" stroke="#8884d8" fill="#8884d8" name="AI Cost" />
                <Area type="monotone" dataKey="apiCost" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="API Cost" />
                <Area type="monotone" dataKey="storageCost" stackId="1" stroke="#ffc658" fill="#ffc658" name="Storage" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Processing Speed by Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Speed by Stage</CardTitle>
            <CardDescription>Average time per pipeline stage (ms)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={speedMetrics} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="stage" type="category" />
                <Tooltip formatter={(value: any) => `${value}ms`} />
                <Bar dataKey="time" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Performing Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Rules</CardTitle>
            <CardDescription>Rules with highest impact scores</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {rulePerformance?.topRules?.map((rule: any, index: number) => (
                  <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Executed {rule.executions} times
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={rule.successRate > 90 ? "default" : "secondary"}>
                        {rule.successRate}% success
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Impact: {rule.impactScore}
                      </p>
                    </div>
                  </div>
                )) || (
                  <p className="text-center text-muted-foreground py-8">No rule data available</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recent Processing Explanations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Processing Explanations</CardTitle>
          <CardDescription>Latest intelligence pipeline decisions</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {recentProcessing?.explanations?.map((item: any) => (
                <div key={item.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">Lead ID: {item.leadId}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={item.confidence > 80 ? "default" : item.confidence > 50 ? "secondary" : "outline"}>
                      {item.confidence}% confidence
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Pipeline Path:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.stages?.map((stage: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {stage}
                          </Badge>
                          {idx < item.stages.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </div>
                  {item.explanation && (
                    <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                      {item.explanation}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Duration: {item.duration}ms</span>
                    <span>Score: {item.score}</span>
                    <span>Tier Usage: {item.tierBreakdown}</span>
                  </div>
                </div>
              )) || (
                <p className="text-center text-muted-foreground py-8">No recent processing data</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}