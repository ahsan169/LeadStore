import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Database,
  Zap,
} from 'lucide-react';

export default function CostMonitoringDashboard() {
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  
  // Fetch dashboard data
  const { data: dashboardData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/cost-monitoring/dashboard'],
    refetchInterval: refreshInterval,
  });
  
  useEffect(() => {
    // Set up auto-refresh
    const interval = setInterval(() => {
      refetch();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [refreshInterval, refetch]);
  
  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard data. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const {
    costMetrics,
    vendorUsage,
    queueMetrics,
    dataFreshness,
    errorMetrics,
    efficiency,
    recommendations,
  } = dashboardData || {};
  
  // Prepare chart data
  const costTrendData = costMetrics?.costTrend || [];
  const vendorCostData = costMetrics?.costBySource || [];
  const errorTrendData = errorMetrics?.errorTrend || [];
  
  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  };
  
  // Format percentage
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Cost Monitoring Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            Live
          </Badge>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-3 py-1 border rounded-md text-sm"
            data-testid="select-refresh-interval"
          >
            <option value="10000">10s</option>
            <option value="30000">30s</option>
            <option value="60000">1m</option>
            <option value="300000">5m</option>
          </select>
        </div>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-cost">
              {formatCurrency(costMetrics?.totalCost || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg per lead: {formatCurrency(costMetrics?.avgCostPerLead || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-cost">
              {formatCurrency(costMetrics?.costToday || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This week: {formatCurrency(costMetrics?.costThisWeek || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <span data-testid="text-success-rate">
                {formatPercentage(
                  efficiency?.totalLeadsProcessed > 0
                    ? efficiency.successfulEnrichments / efficiency.totalLeadsProcessed
                    : 0
                )}
              </span>
              {efficiency?.successfulEnrichments > efficiency?.failedEnrichments ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {efficiency?.successfulEnrichments || 0} successful, {efficiency?.failedEnrichments || 0} failed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Queue Depth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-queue-depth">
              {queueMetrics?.reduce((sum: number, q: any) => sum + q.depth, 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Processing: {queueMetrics?.reduce((sum: number, q: any) => sum + q.processing, 0) || 0}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Vendor Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Vendor Usage & Quotas</CardTitle>
          <CardDescription>API usage across all vendors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vendorUsage?.map((vendor: any) => (
              <div key={vendor.vendor} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{vendor.vendor}</span>
                    <Badge variant={
                      vendor.tier === 'free' ? 'secondary' :
                      vendor.tier === 'cheap' ? 'default' : 'destructive'
                    }>
                      {vendor.tier}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {vendor.used} / {vendor.limit} ({vendor.percentage.toFixed(0)}%)
                  </div>
                </div>
                <Progress 
                  value={vendor.percentage} 
                  className={vendor.percentage > 80 ? 'bg-red-100' : ''}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Cost: {formatCurrency(vendor.totalCost)}</span>
                  <span>Success: {vendor.successRate.toFixed(0)}%</span>
                  <span>Reset: {new Date(vendor.resetAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Cost Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cost Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={costTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="#8884d8" 
                  name="Daily Cost"
                />
                <Line 
                  type="monotone" 
                  dataKey="avgCost" 
                  stroke="#82ca9d" 
                  name="Avg per Lead"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Cost by Source */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={vendorCostData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.source}: ${entry.percentage.toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {vendorCostData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* Queue Status */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Status</CardTitle>
          <CardDescription>Real-time queue metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queueMetrics?.map((queue: any) => (
              <div key={queue.queueName} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{queue.queueName}</h4>
                  <Badge variant={
                    queue.status === 'healthy' ? 'default' :
                    queue.status === 'degraded' ? 'secondary' : 'destructive'
                  }>
                    {queue.status}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending:</span>
                    <span className="font-medium">{queue.depth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing:</span>
                    <span className="font-medium">{queue.processing}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Throughput:</span>
                    <span className="font-medium">{queue.throughput.toFixed(1)}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Error Rate:</span>
                    <span className="font-medium">{formatPercentage(queue.errorRate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Data Freshness */}
      <Card>
        <CardHeader>
          <CardTitle>Data Freshness</CardTitle>
          <CardDescription>Lead data age distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {dataFreshness?.freshLeads || 0}
              </div>
              <p className="text-xs text-muted-foreground">Fresh (&lt;7 days)</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {dataFreshness?.staleLeads || 0}
              </div>
              <p className="text-xs text-muted-foreground">Stale (7-30 days)</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {dataFreshness?.veryStaleLeads || 0}
              </div>
              <p className="text-xs text-muted-foreground">Very Stale (&gt;30 days)</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {dataFreshness?.neverEnriched || 0}
              </div>
              <p className="text-xs text-muted-foreground">Never Enriched</p>
            </div>
          </div>
          <div className="pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg Freshness Score:</span>
              <span className="font-medium">{dataFreshness?.avgFreshnessScore?.toFixed(1) || 0}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Last Update:</span>
              <span className="font-medium">
                {dataFreshness?.lastUpdateRun 
                  ? new Date(dataFreshness.lastUpdateRun).toLocaleString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Next Scheduled:</span>
              <span className="font-medium">
                {dataFreshness?.nextScheduledRun 
                  ? new Date(dataFreshness.nextScheduledRun).toLocaleString()
                  : 'Not scheduled'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Error Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle>Error Monitoring</CardTitle>
          <CardDescription>Recent errors and failures</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Error Summary</h4>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Errors:</span>
                <span className="font-medium">{errorMetrics?.totalErrors || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Errors Today:</span>
                <span className="font-medium text-red-600">{errorMetrics?.errorsToday || 0}</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Top Error Types</h4>
              {errorMetrics?.errorsByType?.slice(0, 3).map((error: any) => (
                <div key={error.type} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[200px]">
                    {error.type}
                  </span>
                  <Badge variant="outline">{error.count}</Badge>
                </div>
              ))}
            </div>
          </div>
          
          {/* Error Trend */}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={errorTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="errors" 
                stroke="#ef4444" 
                name="Errors"
              />
              <Line 
                type="monotone" 
                dataKey="successRate" 
                stroke="#10b981" 
                name="Success Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>Actionable insights to optimize costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((recommendation: string, index: number) => (
                <Alert key={index}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{recommendation}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Efficiency Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Enrichment Efficiency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-lg font-bold">
                {efficiency?.totalLeadsProcessed || 0}
              </div>
              <p className="text-xs text-muted-foreground">Total Processed</p>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600">
                {efficiency?.successfulEnrichments || 0}
              </div>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
            <div>
              <div className="text-lg font-bold">
                {formatCurrency(efficiency?.costPerSuccessfulEnrichment || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Cost per Success</p>
            </div>
            <div>
              <div className="text-lg font-bold">
                {efficiency?.averageConfidenceScore?.toFixed(2) || 0}
              </div>
              <p className="text-xs text-muted-foreground">Avg Confidence</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}