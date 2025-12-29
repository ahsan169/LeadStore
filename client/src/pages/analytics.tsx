import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Activity, DollarSign, Users, Target, ArrowUp, ArrowDown, RefreshCw, Edit2, CheckCircle, XCircle, Clock, Phone, Filter, Brain, Sparkles, AlertTriangle, BarChart2, Crown } from "lucide-react";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line,
  FunnelChart,
  Funnel,
  LabelList,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const updateLeadStatusSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "proposal", "closed_won", "closed_lost"]),
  dealAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  notes: z.string().optional(),
});

type UpdateLeadStatusData = z.infer<typeof updateLeadStatusSchema>;

const COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
};

const TIER_COLORS = {
  gold: "#fbbf24",
  platinum: "#cbd5e1",
  diamond: "#60a5fa",
  elite: "#a78bfa",
};

interface AnalyticsData {
  stats: {
    totalLeads: number;
    contacted: number;
    qualified: number;
    closedWon: number;
    closedLost: number;
    totalRevenue: number;
    averageConversionRate: number;
    roi: number;
  };
  conversionFunnel: Array<{
    stage: string;
    count: number;
    conversionRate: number;
  }>;
  roiByTier: Array<{
    tier: string;
    totalSpent: number;
    totalRevenue: number;
    roi: number;
    leadCount: number;
  }>;
  leadVelocity: number;
  bestPerformingTier: string;
  enrichmentStats?: {
    totalEnriched: number;
    averageConfidence: number;
    sourceBreakdown: Record<string, number>;
  };
  timestamp: string;
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue,
  description,
  badgeVariant = "gold"
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  description?: string;
  badgeVariant?: "gold" | "emerald" | "royal";
}) {
  const getTrendIcon = () => {
    if (trend === "up") return <ArrowUp className="w-4 h-4" />;
    if (trend === "down") return <ArrowDown className="w-4 h-4" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-emerald-600 dark:text-emerald-400";
    if (trend === "down") return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getBadgeClass = () => {
    switch (badgeVariant) {
      case "emerald": return "badge-emerald";
      case "royal": return "badge-royal";
      default: return "badge-gold";
    }
  };

  return (
    <Card className="card-kingdom hover-lift animate-fade-in" data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium font-serif">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-full ${getBadgeClass()}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-serif" data-testid={`metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
        {(trend || description) && (
          <div className="flex items-center gap-2 mt-2">
            {trend && trendValue && (
              <div className={`flex items-center gap-1 text-xs font-medium ${getTrendColor()}`}>
                {getTrendIcon()}
                <span>{trendValue}</span>
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadStatusBadge({ status }: { status: string }) {
  const getStatusClass = () => {
    switch (status) {
      case 'new':
        return 'badge-royal';
      case 'contacted':
        return 'badge-royal';
      case 'qualified':
        return 'badge-emerald';
      case 'proposal':
        return 'badge-gold';
      case 'closed_won':
        return 'badge-emerald';
      case 'closed_lost':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'badge-royal';
    }
  };

  const getStatusLabel = () => {
    return status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass()}`}>
      {getStatusLabel()}
    </span>
  );
}

function UpdateLeadStatusDialog({ 
  leadId, 
  purchaseId,
  currentStatus,
  onSuccess
}: { 
  leadId: string; 
  purchaseId: string;
  currentStatus: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  
  const form = useForm<UpdateLeadStatusData>({
    resolver: zodResolver(updateLeadStatusSchema),
    defaultValues: {
      status: currentStatus as any,
      dealAmount: "",
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: UpdateLeadStatusData) => 
      apiRequest("POST", "/api/analytics/update-lead-status", {
        leadId,
        purchaseId,
        ...data,
      }),
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "Lead status has been updated successfully",
      });
      setOpen(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead status",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UpdateLeadStatusData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="btn-kingdom" data-testid={`button-update-status-${leadId}`}>
          <Edit2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="animate-scale-in">
        <DialogHeader>
          <DialogTitle className="font-serif text-gradient-royal">Update Lead Status</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="closed_won">Closed Won</SelectItem>
                      <SelectItem value="closed_lost">Closed Lost</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {(form.watch("status") === "closed_won") && (
              <FormField
                control={form.control}
                name="dealAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Deal Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="0.00"
                        data-testid="input-deal-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add any notes about this lead..."
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="btn-kingdom"
                data-testid="button-save"
              >
                {mutation.isPending ? "Updating..." : "Update Status"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("all");

  const { data: analyticsData, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/dashboard"],
    refetchInterval: 60000,
  });

  const { data: purchases } = useQuery({
    queryKey: ["/api/purchases"],
  }) as { data: any };
  
  const { data: mlModelData } = useQuery({
    queryKey: ["/api/scoring/model"],
  }) as { data: any };
  
  const { data: mlInsights } = useQuery({
    queryKey: ["/api/scoring/insights"],
  }) as { data: any };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="card-kingdom">
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = analyticsData?.stats || {
    totalLeads: 0,
    contacted: 0,
    qualified: 0,
    closedWon: 0,
    closedLost: 0,
    totalRevenue: 0,
    averageConversionRate: 0,
    roi: 0,
  };

  const conversionFunnel = analyticsData?.conversionFunnel || [];
  const roiByTier = analyticsData?.roiByTier || [];
  const leadVelocity = analyticsData?.leadVelocity || 0;
  const bestPerformingTier = analyticsData?.bestPerformingTier || "none";

  const roiTrendData = [
    { month: 'Jan', roi: 120 },
    { month: 'Feb', roi: 135 },
    { month: 'Mar', roi: 145 },
    { month: 'Apr', roi: 155 },
    { month: 'May', roi: 180 },
    { month: 'Jun', roi: stats.roi },
  ];

  const filteredRoiData = selectedTier === "all" 
    ? roiByTier 
    : roiByTier.filter(item => item.tier === selectedTier);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full badge-gold">
                <Crown className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold font-serif text-gradient-royal" data-testid="heading-analytics">
                Lead Performance Analytics
              </h1>
            </div>
            <p className="text-muted-foreground">
              Track ROI, conversion rates, and lead quality metrics
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-kingdom"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        <div className="divider-elegant" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          <MetricCard
            title="Total ROI"
            value={`${stats.roi.toFixed(1)}%`}
            icon={TrendingUp}
            trend={stats.roi > 0 ? "up" : "down"}
            trendValue={`${Math.abs(stats.roi)}%`}
            description="Return on investment"
            badgeVariant="gold"
          />
          <MetricCard
            title="Conversion Rate"
            value={`${stats.averageConversionRate.toFixed(1)}%`}
            icon={Target}
            trend={stats.averageConversionRate > 10 ? "up" : "down"}
            trendValue="vs industry avg"
            badgeVariant="emerald"
          />
          <MetricCard
            title="Best Performing Tier"
            value={bestPerformingTier.charAt(0).toUpperCase() + bestPerformingTier.slice(1)}
            icon={Activity}
            description="Highest ROI tier"
            badgeVariant="royal"
          />
          <MetricCard
            title="Lead Velocity"
            value={`${leadVelocity > 0 ? '+' : ''}${leadVelocity.toFixed(0)}%`}
            icon={Users}
            trend={leadVelocity > 0 ? "up" : "down"}
            trendValue="30-day growth"
            badgeVariant="gold"
          />
        </div>

        <div className="divider-elegant" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-100" data-testid="card-roi-trend">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                ROI Trend Over Time
              </CardTitle>
              <CardDescription>Monthly return on investment percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={roiTrendData}>
                  <defs>
                    <linearGradient id="colorRoi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="roi" 
                    stroke={COLORS.primary} 
                    fillOpacity={1} 
                    fill="url(#colorRoi)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-200" data-testid="card-conversion-funnel">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Filter className="w-5 h-5 text-primary" />
                Conversion Funnel
              </CardTitle>
              <CardDescription>Lead progression through stages</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={conversionFunnel}
                  layout="horizontal"
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" />
                  <YAxis dataKey="stage" type="category" />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.info} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="conversionRate" position="right" formatter={(value: any) => `${value.toFixed(0)}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-300" data-testid="card-tier-performance">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="font-serif flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-primary" />
                  Performance by Tier
                </CardTitle>
                <CardDescription>ROI breakdown by pricing tier</CardDescription>
              </div>
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger className="w-32" data-testid="select-tier-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="diamond">Diamond</SelectItem>
                  <SelectItem value="elite">Elite</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredRoiData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="tier" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="roi" fill={COLORS.success} name="ROI %" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="leadCount" fill={COLORS.info} name="Lead Count" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-400" data-testid="card-status-distribution">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Lead Status Distribution
              </CardTitle>
              <CardDescription>Current status of all leads</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'New', value: stats.totalLeads - stats.contacted },
                      { name: 'Contacted', value: stats.contacted - stats.qualified },
                      { name: 'Qualified', value: stats.qualified - (stats.closedWon + stats.closedLost) },
                      { name: 'Closed Won', value: stats.closedWon },
                      { name: 'Closed Lost', value: stats.closedLost },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill={COLORS.secondary} />
                    <Cell fill={COLORS.info} />
                    <Cell fill={COLORS.purple} />
                    <Cell fill={COLORS.success} />
                    <Cell fill={COLORS.danger} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {analyticsData?.enrichmentStats && (
          <>
            <div className="divider-elegant" />
            <Card className="card-kingdom animate-fade-in" data-testid="card-enrichment-stats">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  Lead Enrichment Statistics
                </CardTitle>
                <CardDescription>Data enrichment metrics and source breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm font-medium">Total Enriched Leads</span>
                      <Badge className="badge-gold">{analyticsData.enrichmentStats.totalEnriched}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm font-medium">Average Confidence</span>
                      <Badge className="badge-emerald">{analyticsData.enrichmentStats.averageConfidence.toFixed(1)}%</Badge>
                    </div>
                    <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border border-emerald-200/50 dark:border-emerald-800/30">
                      <div className="text-xs text-muted-foreground mb-1">Premium Value Added</div>
                      <div className="text-2xl font-bold font-serif text-emerald-600 dark:text-emerald-400">
                        +30% per lead
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-span-2">
                    <div className="text-sm font-medium font-serif mb-3">Enrichment Sources</div>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.enrichmentStats.sourceBreakdown).map(([source, count]) => (
                        <div key={source} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover-lift transition-all duration-200">
                          <span className="text-sm capitalize font-medium">{source}</span>
                          <Badge className="badge-royal">{count as number} leads</Badge>
                        </div>
                      ))}
                      {Object.keys(analyticsData.enrichmentStats.sourceBreakdown).length === 0 && (
                        <div className="text-sm text-muted-foreground p-4 text-center">No enriched leads yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {mlModelData && (
          <>
            <div className="divider-elegant" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
              <Card className="lg:col-span-2 card-kingdom hover-lift" data-testid="card-ml-performance">
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-600" />
                    ML Model Performance
                  </CardTitle>
                  <CardDescription>
                    {mlModelData.usingDefault 
                      ? "Using default heuristics - no trained model yet"
                      : `Model: ${mlModelData.name} v${mlModelData.version}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {mlModelData.usingDefault ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="p-4 rounded-full badge-royal inline-block mb-4">
                        <Brain className="w-12 h-12 opacity-50" />
                      </div>
                      <p className="font-medium">No ML model trained yet</p>
                      <p className="text-sm mt-2">Models are trained automatically as more lead performance data becomes available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200/50 dark:border-green-800/30">
                          <p className="text-xs text-muted-foreground mb-1">Accuracy</p>
                          <p className="text-2xl font-bold font-serif text-green-600 dark:text-green-400">
                            {(mlModelData.accuracy * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200/50 dark:border-blue-800/30">
                          <p className="text-xs text-muted-foreground mb-1">Precision</p>
                          <p className="text-2xl font-bold font-serif text-blue-600 dark:text-blue-400">
                            {(mlModelData.precision * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200/50 dark:border-purple-800/30">
                          <p className="text-xs text-muted-foreground mb-1">Recall</p>
                          <p className="text-2xl font-bold font-serif text-purple-600 dark:text-purple-400">
                            {(mlModelData.recall * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200/50 dark:border-orange-800/30">
                          <p className="text-xs text-muted-foreground mb-1">F1 Score</p>
                          <p className="text-2xl font-bold font-serif text-orange-600 dark:text-orange-400">
                            {(mlModelData.f1Score * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      
                      <Separator className="my-4" />
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm p-2 rounded-lg bg-muted/30">
                          <span className="text-muted-foreground">Training Data Size</span>
                          <span className="font-medium">{mlModelData.trainingDataSize?.toLocaleString() || "N/A"} leads</span>
                        </div>
                        <div className="flex justify-between text-sm p-2 rounded-lg bg-muted/30">
                          <span className="text-muted-foreground">Last Trained</span>
                          <span className="font-medium">
                            {mlModelData.trainedAt ? new Date(mlModelData.trainedAt).toLocaleDateString() : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm p-2 rounded-lg bg-muted/30">
                          <span className="text-muted-foreground">Features Used</span>
                          <span className="font-medium">{mlModelData.features?.length || 0} features</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="card-kingdom hover-lift" data-testid="card-ml-insights">
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                    ML Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mlInsights ? (
                    <div className="space-y-3">
                      {mlInsights.trends && mlInsights.trends.length > 0 ? (
                        mlInsights.trends.slice(0, 5).map((trend: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 text-sm p-3 rounded-lg bg-muted/30 hover-lift transition-all duration-200">
                            {trend.direction === "up" ? (
                              <TrendingUp className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                            )}
                            <p className="text-xs">{trend.insight}</p>
                          </div>
                        ))
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/30 dark:border-amber-800/30">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs">High-value leads typically have 85%+ quality scores</p>
                          </div>
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/30 dark:border-emerald-800/30">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs">Best conversion rates seen in Restaurant and Retail industries</p>
                          </div>
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/30 dark:border-blue-800/30">
                            <Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs">Leads with urgency 'immediate' convert 3x faster</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Loading insights...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <div className="divider-elegant" />

        <Card className="card-kingdom animate-fade-in" data-testid="card-lead-performance">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Lead Performance Details
            </CardTitle>
            <CardDescription>Track and update individual lead status</CardDescription>
          </CardHeader>
          <CardContent>
            {purchases && purchases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Purchase ID</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Tier</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Lead Count</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Contacted</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Qualified</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Closed</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Revenue</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">ROI</th>
                      <th className="text-left p-3 font-serif font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.slice(0, 10).map((purchase: any, index: number) => (
                      <tr 
                        key={purchase.id} 
                        className={`border-b border-border/30 hover-lift transition-all duration-200 ${
                          index % 2 === 0 ? 'bg-muted/20' : ''
                        }`}
                        data-testid={`row-purchase-${purchase.id}`}
                      >
                        <td className="p-3 font-mono text-sm">
                          {purchase.id.slice(0, 8)}...
                        </td>
                        <td className="p-3">
                          <Badge className={
                            purchase.tier === 'gold' ? 'badge-gold' :
                            purchase.tier === 'elite' || purchase.tier === 'diamond' ? 'badge-royal' :
                            'badge-emerald'
                          }>
                            {purchase.tier}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-medium">{purchase.leadCount}</td>
                        <td className="p-3 text-center">{purchase.totalContacted || 0}</td>
                        <td className="p-3 text-center">{purchase.totalQualified || 0}</td>
                        <td className="p-3 text-center">{purchase.totalClosed || 0}</td>
                        <td className="p-3 font-medium">${purchase.totalRevenue || '0.00'}</td>
                        <td className="p-3">
                          <span className={`font-bold ${
                            Number(purchase.roi || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {purchase.roi || '0'}%
                          </span>
                        </td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="btn-kingdom"
                            data-testid={`button-view-details-${purchase.id}`}
                          >
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <div className="p-4 rounded-full badge-royal inline-block mb-4">
                  <Users className="w-12 h-12 opacity-50" />
                </div>
                <p className="font-medium">No purchases to track yet</p>
                <p className="text-sm mt-2">Start acquiring leads to see performance analytics</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
