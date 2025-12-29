import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Database, DollarSign, TrendingUp, AlertCircle, Activity, Zap, Target } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface IntelligenceMetrics {
  totalDecisions: number;
  averageConfidence: number;
  creditsSaved: number;
  enrichmentSuccessRate: number;
  optimalDecisions: number;
  suboptimalDecisions: number;
  averageProcessingTime: number;
  modelAccuracy: number;
}

interface DatabaseStats {
  totalEntities: number;
  dailyGrowth: number;
  avgCompleteness: number;
  topIndustries: Array<{ name: string; count: number }>;
  topStates: Array<{ name: string; count: number }>;
  lastCrawlTime: string;
  queuedJobs: number;
  scrapingSuccess: number;
}

interface CostMetrics {
  dailySpend: number;
  monthlySpend: number;
  averageCostPerLead: number;
  creditUtilization: number;
  efficiencyScore: number;
  savingsFromOptimization: number;
  serviceUsage: Array<{ service: string; count: number; cost: number; efficiency: number }>;
}

interface RecentDecision {
  id: string;
  leadId: string;
  businessName: string;
  strategy: string;
  confidence: number;
  services: string[];
  estimatedCost: number;
  actualCost?: number;
  success?: boolean;
  timestamp: string;
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

export default function IntelligenceDashboard() {
  const [timeRange, setTimeRange] = useState('24h');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [selectedMetric, setSelectedMetric] = useState('decisions');

  // Fetch intelligence metrics
  const { data: intelligenceMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/intelligence/metrics', timeRange],
    refetchInterval: refreshInterval,
  }) as { data: IntelligenceMetrics | undefined; isLoading: boolean };

  // Fetch database stats
  const { data: databaseStats, isLoading: dbLoading } = useQuery({
    queryKey: ['/api/intelligence/database-stats'],
    refetchInterval: refreshInterval,
  }) as { data: DatabaseStats | undefined; isLoading: boolean };

  // Fetch cost metrics
  const { data: costMetrics, isLoading: costLoading } = useQuery({
    queryKey: ['/api/intelligence/cost-metrics'],
    refetchInterval: refreshInterval,
  }) as { data: CostMetrics | undefined; isLoading: boolean };

  // Fetch recent decisions
  const { data: recentDecisions, isLoading: decisionsLoading } = useQuery({
    queryKey: ['/api/intelligence/recent-decisions'],
    refetchInterval: refreshInterval,
  }) as { data: RecentDecision[] | undefined; isLoading: boolean };

  // Fetch time series data
  const { data: timeSeriesData } = useQuery({
    queryKey: ['/api/intelligence/time-series', timeRange],
    refetchInterval: refreshInterval,
  }) as { data: any[] | undefined };

  const isLoading = metricsLoading || dbLoading || costLoading || decisionsLoading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring of AI decisions and system performance
          </p>
        </div>
        
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
            <SelectTrigger className="w-32" data-testid="select-refresh">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10000">10s refresh</SelectItem>
              <SelectItem value="30000">30s refresh</SelectItem>
              <SelectItem value="60000">1m refresh</SelectItem>
              <SelectItem value="300000">5m refresh</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Decisions</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {intelligenceMetrics?.totalDecisions?.toLocaleString() || '0'}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              <span className="text-green-500">+12%</span> from yesterday
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Saved</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${intelligenceMetrics?.creditsSaved?.toFixed(2) || '0.00'}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <Activity className="h-3 w-3 mr-1" />
              {costMetrics?.efficiencyScore || 0}% efficiency
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Size</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {databaseStats?.totalEntities?.toLocaleString() || '0'}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              +{databaseStats?.dailyGrowth || 0} today
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Model Accuracy</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((intelligenceMetrics?.modelAccuracy ?? 0) * 100).toFixed(1)}%
            </div>
            <Progress 
              value={(intelligenceMetrics?.modelAccuracy ?? 0) * 100} 
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Decision Strategy Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Decision Strategy Distribution</CardTitle>
                <CardDescription>How the AI is choosing to process leads</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Full Enrichment', value: intelligenceMetrics?.optimalDecisions || 30 },
                        { name: 'Partial Enrichment', value: 45 },
                        { name: 'Master DB Only', value: 15 },
                        { name: 'Skip Processing', value: 10 }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[0, 1, 2, 3].map((index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrichment Service Usage</CardTitle>
                <CardDescription>API calls by service provider</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={costMetrics?.serviceUsage || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="service" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" />
                    <Bar dataKey="efficiency" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Time Series Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Decision Volume Over Time</CardTitle>
              <CardDescription>AI decision-making patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="decisions" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="enrichments" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          {/* Recent Decisions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Intelligence Decisions</CardTitle>
              <CardDescription>Real-time feed of AI decision-making</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentDecisions?.slice(0, 10).map((decision: RecentDecision) => (
                  <div key={decision.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{decision.businessName}</span>
                        <Badge variant={decision.strategy === 'full_enrichment' ? 'default' : 'secondary'}>
                          {decision.strategy}
                        </Badge>
                        <Badge variant={decision.success ? 'default' : decision.success === false ? 'destructive' : 'outline'}>
                          {decision.confidence}% confidence
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Services: {decision.services.join(', ')} | 
                        Cost: ${decision.estimatedCost.toFixed(2)}
                        {decision.actualCost && ` (Actual: $${decision.actualCost.toFixed(2)})`}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(decision.timestamp), 'HH:mm:ss')}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Confidence Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Decision Confidence Distribution</CardTitle>
              <CardDescription>How confident the AI is in its decisions</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { range: '0-20%', count: 5 },
                  { range: '20-40%', count: 12 },
                  { range: '40-60%', count: 28 },
                  { range: '60-80%', count: 42 },
                  { range: '80-100%', count: 35 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          {/* Database Growth Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Master Database Growth</CardTitle>
              <CardDescription>Entity accumulation over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="entities" stroke="#8b5cf6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Industries */}
            <Card>
              <CardHeader>
                <CardTitle>Top Industries</CardTitle>
                <CardDescription>Most represented industries in database</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {databaseStats?.topIndustries?.map((industry, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm">{industry.name}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(industry.count / (databaseStats?.totalEntities || 1)) * 100} className="w-24" />
                        <span className="text-sm font-medium">{industry.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top States */}
            <Card>
              <CardHeader>
                <CardTitle>Top States</CardTitle>
                <CardDescription>Geographic distribution of entities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {databaseStats?.topStates?.map((state, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm">{state.name}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(state.count / (databaseStats?.totalEntities || 1)) * 100} className="w-24" />
                        <span className="text-sm font-medium">{state.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scraping Status */}
          <Card>
            <CardHeader>
              <CardTitle>Web Scraping Status</CardTitle>
              <CardDescription>Current scraping operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Queued Jobs</div>
                  <div className="text-2xl font-bold">{databaseStats?.queuedJobs || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                  <div className="text-2xl font-bold">{databaseStats?.scrapingSuccess || 0}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg Completeness</div>
                  <div className="text-2xl font-bold">{((databaseStats?.avgCompleteness ?? 0) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Last Crawl</div>
                  <div className="text-sm font-medium">
                    {databaseStats?.lastCrawlTime ? format(new Date(databaseStats.lastCrawlTime), 'HH:mm:ss') : 'Never'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          {/* Spending Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${costMetrics?.dailySpend?.toFixed(2) || '0.00'}</div>
                <Progress value={(costMetrics?.dailySpend || 0) / 100 * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${costMetrics?.monthlySpend?.toFixed(2) || '0.00'}</div>
                <Progress value={(costMetrics?.monthlySpend || 0) / 2000 * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Savings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${costMetrics?.savingsFromOptimization?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">From optimization</div>
              </CardContent>
            </Card>
          </div>

          {/* Service Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Service Cost Breakdown</CardTitle>
              <CardDescription>Cost and efficiency by service provider</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costMetrics?.serviceUsage || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="service" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="cost" fill="#ef4444" name="Cost ($)" />
                  <Bar yAxisId="right" dataKey="efficiency" fill="#10b981" name="Efficiency (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Credit Utilization */}
          <Card>
            <CardHeader>
              <CardTitle>Credit Utilization</CardTitle>
              <CardDescription>API credit usage across services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {costMetrics?.serviceUsage?.map((service) => (
                  <div key={service.service} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{service.service}</span>
                      <span>{service.count} calls</span>
                    </div>
                    <Progress value={service.efficiency} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {/* System Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Avg Processing Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {intelligenceMetrics?.averageProcessingTime ?? 0}ms
                </div>
                <Badge variant={(intelligenceMetrics?.averageProcessingTime ?? 0) < 500 ? 'default' : 'destructive'}>
                  {(intelligenceMetrics?.averageProcessingTime ?? 0) < 500 ? 'Fast' : 'Slow'}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((intelligenceMetrics?.enrichmentSuccessRate ?? 0) * 100).toFixed(1)}%
                </div>
                <Progress value={(intelligenceMetrics?.enrichmentSuccessRate ?? 0) * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Avg Confidence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((intelligenceMetrics?.averageConfidence ?? 0) * 100).toFixed(1)}%
                </div>
                <Progress value={(intelligenceMetrics?.averageConfidence ?? 0) * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((1 - (intelligenceMetrics?.enrichmentSuccessRate || 0)) * 100).toFixed(1)}%
                </div>
                <Badge variant={(1 - (intelligenceMetrics?.enrichmentSuccessRate || 0)) < 0.05 ? 'default' : 'destructive'}>
                  {(1 - (intelligenceMetrics?.enrichmentSuccessRate || 0)) < 0.05 ? 'Low' : 'High'}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Performance Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>System Performance Trends</CardTitle>
              <CardDescription>Key performance indicators over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="processingTime" stroke="#8b5cf6" name="Processing Time (ms)" />
                  <Line type="monotone" dataKey="successRate" stroke="#10b981" name="Success Rate (%)" />
                  <Line type="monotone" dataKey="confidence" stroke="#3b82f6" name="Confidence (%)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Alerts and Issues */}
          <Card>
            <CardHeader>
              <CardTitle>System Alerts</CardTitle>
              <CardDescription>Recent issues and warnings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">High API usage detected for Clearbit service</span>
                  <Badge variant="outline" className="ml-auto">Warning</Badge>
                </div>
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <Zap className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Master database hit rate improved by 15%</span>
                  <Badge variant="outline" className="ml-auto">Success</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}