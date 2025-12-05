import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Brain, Users, TrendingUp, DollarSign, Activity, 
  Settings, RefreshCcw, Zap, Target, Clock, AlertTriangle,
  CheckCircle2, XCircle, Phone, BarChart3
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  leads: { total: number; withFeedback: number };
  assignments: { total: number; funded: number; contacted: number; bad: number; noResponse: number };
  revenue: { total: number; purchaseCount: number };
  buyers: { active: number };
  rates: { fundRate: string; feedbackRate: string };
  recentActivities: number;
}

interface BuyerPerformance {
  buyerId: string;
  username: string;
  email: string;
  totalLeads: number;
  funded: number;
  contacted: number;
  bad: number;
  noResponse: number;
  fundRate: number;
  feedbackRate: number;
}

interface SourcePerformance {
  sourceType: string;
  totalLeads: number;
  fundedCount: number;
  contactedCount: number;
  badLeadCount: number;
  noResponseCount: number;
  conversionRate: number;
}

interface BrainConfig {
  id: string;
  recencyWeight: number;
  sourceWeight: number;
  attemptWeight: number;
  outcomeWeight: number;
  feedbackWeight: number;
  maxAttempts: number;
  recalcIntervalHours: number;
  isActive: boolean;
}

interface RecentActivity {
  id: string;
  leadId: string;
  buyerId: string;
  type: string;
  oldStatus: string;
  newStatus: string;
  note: string | null;
  dealAmount: string | null;
  createdAt: string;
  businessName: string;
  buyerName: string;
}

export default function GodModePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/god-mode/dashboard"],
  });

  const { data: buyersData } = useQuery<{ buyers: BuyerPerformance[] }>({
    queryKey: ["/api/god-mode/buyers"],
  });

  const { data: sourcesData } = useQuery<{ sources: SourcePerformance[] }>({
    queryKey: ["/api/god-mode/sources"],
  });

  const { data: brainData } = useQuery<{ config: BrainConfig }>({
    queryKey: ["/api/god-mode/brain"],
  });

  const { data: activitiesData } = useQuery<{ activities: RecentActivity[] }>({
    queryKey: ["/api/god-mode/activities"],
  });

  const updateBrainMutation = useMutation({
    mutationFn: async (config: Partial<BrainConfig>) => {
      return apiRequest("PUT", "/api/god-mode/brain", config);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Brain configuration updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/god-mode/brain"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/god-mode/brain/recalculate");
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/god-mode/dashboard"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "funded":
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case "contacted":
        return <Phone className="h-4 w-4 text-blue-500" />;
      case "bad_lead":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "no_response":
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case "funded":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Funded</Badge>;
      case "contacted":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Contacted</Badge>;
      case "bad_lead":
        return <Badge variant="destructive">Bad Lead</Badge>;
      case "no_response":
        return <Badge variant="secondary">No Response</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Brain className="h-8 w-8 text-primary" />
            God Mode
          </h1>
          <p className="text-muted-foreground">AI Brain control center and buyer feedback analytics</p>
        </div>
        <Button
          onClick={() => recalculateMutation.mutate()}
          disabled={recalculateMutation.isPending}
          className="gap-2"
          data-testid="button-recalculate"
        >
          <RefreshCcw className={`h-4 w-4 ${recalculateMutation.isPending ? "animate-spin" : ""}`} />
          {recalculateMutation.isPending ? "Recalculating..." : "Recalculate Scores"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5" data-testid="tabs-god-mode">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="buyers" data-testid="tab-buyers">
            <Users className="h-4 w-4 mr-2" />
            Buyers
          </TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">
            <Target className="h-4 w-4 mr-2" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="brain" data-testid="tab-brain">
            <Brain className="h-4 w-4 mr-2" />
            Brain Settings
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            <Activity className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-stat-leads">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.leads.total || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.leads.withFeedback || 0} with feedback
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-funded">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fund Rate</CardTitle>
                <DollarSign className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {dashboardData?.rates.fundRate || "0.00"}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.assignments.funded || 0} funded leads
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-revenue">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(dashboardData?.revenue.total || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.revenue.purchaseCount || 0} purchases
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-buyers">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Buyers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.buyers.active || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.rates.feedbackRate || "0.00"}% feedback rate
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Assignment Breakdown</CardTitle>
                <CardDescription>Lead status distribution from buyer feedback</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Funded</span>
                  </div>
                  <span className="font-bold">{dashboardData?.assignments.funded || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-500" />
                    <span>Contacted</span>
                  </div>
                  <span className="font-bold">{dashboardData?.assignments.contacted || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>No Response</span>
                  </div>
                  <span className="font-bold">{dashboardData?.assignments.noResponse || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>Bad Lead</span>
                  </div>
                  <span className="font-bold">{dashboardData?.assignments.bad || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>{dashboardData?.recentActivities || 0} activities in the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  {activitiesData?.activities.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      {getActivityIcon(activity.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.businessName}</p>
                        <p className="text-xs text-muted-foreground">by {activity.buyerName}</p>
                      </div>
                      {getActivityBadge(activity.type)}
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="buyers">
          <Card>
            <CardHeader>
              <CardTitle>Buyer Performance Leaderboard</CardTitle>
              <CardDescription>Track buyer feedback and conversion rates</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead className="text-center">Total Leads</TableHead>
                    <TableHead className="text-center">Funded</TableHead>
                    <TableHead className="text-center">Contacted</TableHead>
                    <TableHead className="text-center">Bad</TableHead>
                    <TableHead className="text-center">Fund Rate</TableHead>
                    <TableHead className="text-center">Feedback Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyersData?.buyers.map((buyer) => (
                    <TableRow key={buyer.buyerId} data-testid={`row-buyer-${buyer.buyerId}`}>
                      <TableCell>
                        <div className="font-medium">{buyer.username}</div>
                        <div className="text-xs text-muted-foreground">{buyer.email}</div>
                      </TableCell>
                      <TableCell className="text-center">{buyer.totalLeads}</TableCell>
                      <TableCell className="text-center text-green-600 dark:text-green-400 font-medium">
                        {buyer.funded}
                      </TableCell>
                      <TableCell className="text-center text-blue-600 dark:text-blue-400">
                        {buyer.contacted}
                      </TableCell>
                      <TableCell className="text-center text-red-600 dark:text-red-400">
                        {buyer.bad}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          buyer.fundRate >= 10 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                            : buyer.fundRate >= 5 
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : ""
                        }>
                          {buyer.fundRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Progress value={buyer.feedbackRate} className="w-16" />
                        <span className="text-xs text-muted-foreground">{buyer.feedbackRate.toFixed(0)}%</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!buyersData?.buyers || buyersData.buyers.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No buyer data available yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Lead Source Performance</CardTitle>
              <CardDescription>Conversion rates by lead source (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Funded</TableHead>
                    <TableHead className="text-center">Contacted</TableHead>
                    <TableHead className="text-center">Bad</TableHead>
                    <TableHead className="text-center">No Response</TableHead>
                    <TableHead className="text-center">Conversion Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourcesData?.sources.map((source) => (
                    <TableRow key={source.sourceType} data-testid={`row-source-${source.sourceType}`}>
                      <TableCell className="font-medium capitalize">{source.sourceType}</TableCell>
                      <TableCell className="text-center">{source.totalLeads}</TableCell>
                      <TableCell className="text-center text-green-600 dark:text-green-400">{source.fundedCount}</TableCell>
                      <TableCell className="text-center text-blue-600 dark:text-blue-400">{source.contactedCount}</TableCell>
                      <TableCell className="text-center text-red-600 dark:text-red-400">{source.badLeadCount}</TableCell>
                      <TableCell className="text-center text-gray-600 dark:text-gray-400">{source.noResponseCount}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          source.conversionRate >= 15 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                            : source.conversionRate >= 5 
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : ""
                        }>
                          {source.conversionRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!sourcesData?.sources || sourcesData.sources.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No source data available yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brain">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Brain Configuration
              </CardTitle>
              <CardDescription>
                Adjust the weights and parameters used for lead scoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Recency Weight ({((brainData?.config.recencyWeight || 0.3) * 100).toFixed(0)}%)</Label>
                    <p className="text-xs text-muted-foreground mb-2">How much recent activity affects score</p>
                    <Slider
                      value={[(brainData?.config.recencyWeight || 0.3) * 100]}
                      onValueChange={(v) => updateBrainMutation.mutate({ recencyWeight: v[0] / 100 })}
                      max={50}
                      step={5}
                      data-testid="slider-recency"
                    />
                  </div>

                  <div>
                    <Label>Source Weight ({((brainData?.config.sourceWeight || 0.2) * 100).toFixed(0)}%)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Impact of lead source quality</p>
                    <Slider
                      value={[(brainData?.config.sourceWeight || 0.2) * 100]}
                      onValueChange={(v) => updateBrainMutation.mutate({ sourceWeight: v[0] / 100 })}
                      max={50}
                      step={5}
                      data-testid="slider-source"
                    />
                  </div>

                  <div>
                    <Label>Attempt Weight ({((brainData?.config.attemptWeight || 0.2) * 100).toFixed(0)}%)</Label>
                    <p className="text-xs text-muted-foreground mb-2">How attempt count affects priority</p>
                    <Slider
                      value={[(brainData?.config.attemptWeight || 0.2) * 100]}
                      onValueChange={(v) => updateBrainMutation.mutate({ attemptWeight: v[0] / 100 })}
                      max={50}
                      step={5}
                      data-testid="slider-attempt"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Outcome Weight ({((brainData?.config.outcomeWeight || 0.3) * 100).toFixed(0)}%)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Impact of call outcomes on score</p>
                    <Slider
                      value={[(brainData?.config.outcomeWeight || 0.3) * 100]}
                      onValueChange={(v) => updateBrainMutation.mutate({ outcomeWeight: v[0] / 100 })}
                      max={50}
                      step={5}
                      data-testid="slider-outcome"
                    />
                  </div>

                  <div>
                    <Label>Feedback Weight ({((brainData?.config.feedbackWeight || 0.2) * 100).toFixed(0)}%)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Buyer feedback influence on AI score</p>
                    <Slider
                      value={[(brainData?.config.feedbackWeight || 0.2) * 100]}
                      onValueChange={(v) => updateBrainMutation.mutate({ feedbackWeight: v[0] / 100 })}
                      max={50}
                      step={5}
                      data-testid="slider-feedback"
                    />
                  </div>

                  <div>
                    <Label>Max Attempts</Label>
                    <p className="text-xs text-muted-foreground mb-2">Maximum contact attempts before deprioritizing</p>
                    <Input
                      type="number"
                      value={brainData?.config.maxAttempts || 10}
                      onChange={(e) => updateBrainMutation.mutate({ maxAttempts: parseInt(e.target.value) })}
                      min={1}
                      max={50}
                      data-testid="input-max-attempts"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={brainData?.config.isActive ?? true}
                    onCheckedChange={(checked) => updateBrainMutation.mutate({ isActive: checked })}
                    data-testid="switch-active"
                  />
                  <Label>AI Brain Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Recalc Interval (hours):</Label>
                  <Input
                    type="number"
                    value={brainData?.config.recalcIntervalHours || 24}
                    onChange={(e) => updateBrainMutation.mutate({ recalcIntervalHours: parseInt(e.target.value) })}
                    min={1}
                    max={168}
                    className="w-20"
                    data-testid="input-recalc-interval"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Note: Weights should sum to approximately 100% for optimal scoring. Current sum: {
                  (
                    ((brainData?.config.recencyWeight || 0.3) +
                    (brainData?.config.sourceWeight || 0.2) +
                    (brainData?.config.attemptWeight || 0.2) +
                    (brainData?.config.outcomeWeight || 0.3) +
                    (brainData?.config.feedbackWeight || 0.2)) * 100
                  ).toFixed(0)
                }%
              </p>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Buyer Activities</CardTitle>
              <CardDescription>Live feed of buyer feedback and status changes</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Deal Amount</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activitiesData?.activities.map((activity) => (
                      <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(activity.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">{activity.buyerName}</TableCell>
                        <TableCell>{activity.businessName}</TableCell>
                        <TableCell>{getActivityBadge(activity.type)}</TableCell>
                        <TableCell>
                          {activity.dealAmount ? formatCurrency(parseFloat(activity.dealAmount)) : "-"}
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                          {activity.note || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!activitiesData?.activities || activitiesData.activities.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No activities recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
