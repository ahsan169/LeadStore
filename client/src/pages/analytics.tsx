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
import { TrendingUp, TrendingDown, Activity, DollarSign, Users, Target, ArrowUp, ArrowDown, RefreshCw, Edit2, CheckCircle, XCircle, Clock, Phone, Filter } from "lucide-react";
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

// Color palette for charts
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
  timestamp: string;
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue,
  description 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  description?: string;
}) {
  const getTrendIcon = () => {
    if (trend === "up") return <ArrowUp className="w-4 h-4" />;
    if (trend === "down") return <ArrowDown className="w-4 h-4" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <Card className="hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
        {(trend || description) && (
          <div className="flex items-center gap-2 mt-2">
            {trend && trendValue && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
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
  const getStatusColor = () => {
    switch (status) {
      case 'new':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100';
      case 'contacted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'qualified':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100';
      case 'proposal':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100';
      case 'closed_won':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'closed_lost':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
    }
  };

  const getStatusLabel = () => {
    return status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor()}`}>
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
        <Button variant="ghost" size="sm" data-testid={`button-update-status-${leadId}`}>
          <Edit2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Lead Status</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
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
                    <FormLabel>Deal Amount ($)</FormLabel>
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
                  <FormLabel>Notes</FormLabel>
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

  // Fetch analytics data
  const { data: analyticsData, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/dashboard"],
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  // Fetch purchases for lead performance table
  const { data: purchases } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
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

  // Prepare data for ROI trend chart (mock data for demo)
  const roiTrendData = [
    { month: 'Jan', roi: 120 },
    { month: 'Feb', roi: 135 },
    { month: 'Mar', roi: 145 },
    { month: 'Apr', roi: 155 },
    { month: 'May', roi: 180 },
    { month: 'Jun', roi: stats.roi },
  ];

  // Filter ROI by tier data
  const filteredRoiData = selectedTier === "all" 
    ? roiByTier 
    : roiByTier.filter(item => item.tier === selectedTier);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-analytics">
              Lead Performance Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Track ROI, conversion rates, and lead quality metrics
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total ROI"
            value={`${stats.roi.toFixed(1)}%`}
            icon={TrendingUp}
            trend={stats.roi > 0 ? "up" : "down"}
            trendValue={`${Math.abs(stats.roi)}%`}
            description="Return on investment"
          />
          <MetricCard
            title="Conversion Rate"
            value={`${stats.averageConversionRate.toFixed(1)}%`}
            icon={Target}
            trend={stats.averageConversionRate > 10 ? "up" : "down"}
            trendValue="vs industry avg"
          />
          <MetricCard
            title="Best Performing Tier"
            value={bestPerformingTier.charAt(0).toUpperCase() + bestPerformingTier.slice(1)}
            icon={Activity}
            description="Highest ROI tier"
          />
          <MetricCard
            title="Lead Velocity"
            value={`${leadVelocity > 0 ? '+' : ''}${leadVelocity.toFixed(0)}%`}
            icon={Users}
            trend={leadVelocity > 0 ? "up" : "down"}
            trendValue="30-day growth"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ROI Trend Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>ROI Trend Over Time</CardTitle>
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
                  <CartesianGrid strokeDasharray="3 3" />
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

          {/* Conversion Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Lead progression through stages</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={conversionFunnel}
                  layout="horizontal"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="stage" type="category" />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.info}>
                    <LabelList dataKey="conversionRate" position="right" formatter={(value: any) => `${value.toFixed(0)}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Performance by Tier */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Performance by Tier</CardTitle>
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tier" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="roi" fill={COLORS.success} name="ROI %" />
                  <Bar dataKey="leadCount" fill={COLORS.info} name="Lead Count" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Lead Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Lead Status Distribution</CardTitle>
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

        {/* Lead Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Performance Details</CardTitle>
            <CardDescription>Track and update individual lead status</CardDescription>
          </CardHeader>
          <CardContent>
            {purchases && purchases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Purchase ID</th>
                      <th className="text-left p-2">Tier</th>
                      <th className="text-left p-2">Lead Count</th>
                      <th className="text-left p-2">Contacted</th>
                      <th className="text-left p-2">Qualified</th>
                      <th className="text-left p-2">Closed</th>
                      <th className="text-left p-2">Revenue</th>
                      <th className="text-left p-2">ROI</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.slice(0, 10).map((purchase: any) => (
                      <tr 
                        key={purchase.id} 
                        className="border-b hover-elevate"
                        data-testid={`row-purchase-${purchase.id}`}
                      >
                        <td className="p-2 font-mono text-sm">
                          {purchase.id.slice(0, 8)}...
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="capitalize">
                            {purchase.tier}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">{purchase.leadCount}</td>
                        <td className="p-2 text-center">{purchase.totalContacted || 0}</td>
                        <td className="p-2 text-center">{purchase.totalQualified || 0}</td>
                        <td className="p-2 text-center">{purchase.totalClosed || 0}</td>
                        <td className="p-2">${purchase.totalRevenue || '0.00'}</td>
                        <td className="p-2">
                          <span className={`font-medium ${
                            Number(purchase.roi || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {purchase.roi || '0'}%
                          </span>
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
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
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No purchases to track yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}