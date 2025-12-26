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
import { Separator } from "@/components/ui/separator";
import { 
  Brain, Users, TrendingUp, DollarSign, Activity, 
  Settings, RefreshCcw, Zap, Target, Clock, AlertTriangle,
  CheckCircle2, XCircle, Phone, BarChart3, Sparkles, Crown,
  Trophy, Medal, Award, Flame, ArrowUpRight, Gauge, Package,
  Plus, Pencil, Trash2
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

interface FundingProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  isDefault: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function GodModePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [editingProduct, setEditingProduct] = useState<FundingProduct | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productFormData, setProductFormData] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "",
    color: "#2d6a4f",
    isActive: true,
    isDefault: false,
    displayOrder: 0,
  });

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

  const { data: productsData, isLoading: productsLoading } = useQuery<{ products: FundingProduct[] }>({
    queryKey: ["/api/god-mode/funding-products"],
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof productFormData) => {
      return apiRequest("POST", "/api/god-mode/funding-products", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Funding product created" });
      queryClient.invalidateQueries({ queryKey: ["/api/god-mode/funding-products"] });
      resetProductForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof productFormData> }) => {
      return apiRequest("PUT", `/api/god-mode/funding-products/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Funding product updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/god-mode/funding-products"] });
      resetProductForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/god-mode/funding-products/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Funding product deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/god-mode/funding-products"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetProductForm = () => {
    setShowProductForm(false);
    setEditingProduct(null);
    setProductFormData({
      name: "",
      slug: "",
      description: "",
      icon: "",
      color: "#2d6a4f",
      isActive: true,
      isDefault: false,
      displayOrder: 0,
    });
  };

  const handleEditProduct = (product: FundingProduct) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name,
      slug: product.slug,
      description: product.description || "",
      icon: product.icon || "",
      color: product.color || "#2d6a4f",
      isActive: product.isActive,
      isDefault: product.isDefault,
      displayOrder: product.displayOrder,
    });
    setShowProductForm(true);
  };

  const handleSubmitProduct = () => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productFormData });
    } else {
      createProductMutation.mutate(productFormData);
    }
  };

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
        return <DollarSign className="h-4 w-4" />;
      case "contacted":
        return <Phone className="h-4 w-4" />;
      case "bad_lead":
        return <XCircle className="h-4 w-4" />;
      case "no_response":
        return <Clock className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case "funded": return "Funded";
      case "contacted": return "Contacted";
      case "bad_lead": return "Bad Lead";
      case "no_response": return "No Response";
      default: return type;
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm text-muted-foreground font-medium w-5 text-center">{index + 1}</span>;
  };

  const totalWeight = (
    (brainData?.config.recencyWeight || 0.3) +
    (brainData?.config.sourceWeight || 0.2) +
    (brainData?.config.attemptWeight || 0.2) +
    (brainData?.config.outcomeWeight || 0.3) +
    (brainData?.config.feedbackWeight || 0.2)
  ) * 100;

  return (
    <div className="min-h-screen bg-mesh">
      <div className="relative z-10 p-6 space-y-6">
        {/* Royal Kingdom Page Header */}
        <div className="page-header-gradient animate-fade-in">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="icon-container icon-container-gold w-14 h-14">
                <Brain className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-serif font-bold flex items-center gap-2 text-gradient-royal" data-testid="text-page-title">
                  God Mode
                  <Sparkles className="h-6 w-6 text-yellow-300 animate-pulse" />
                </h1>
                <p className="text-white/80 mt-1 font-serif">AI Brain control center & buyer feedback analytics</p>
              </div>
            </div>
            <Button
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
              className="btn-kingdom gap-2"
              data-testid="button-recalculate"
            >
              <RefreshCcw className={`h-4 w-4 ${recalculateMutation.isPending ? "animate-spin" : ""}`} />
              {recalculateMutation.isPending ? "Recalculating..." : "Recalculate Scores"}
            </Button>
          </div>
        </div>

        <div className="divider-elegant my-4" />

        {/* Royal Kingdom Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-slide-up">
          <TabsList className="tabs-premium grid w-full grid-cols-6" data-testid="tabs-god-mode">
            <TabsTrigger value="dashboard" className="tab-trigger-premium gap-2" data-testid="tab-dashboard">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="buyers" className="tab-trigger-premium gap-2" data-testid="tab-buyers">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Buyers</span>
            </TabsTrigger>
            <TabsTrigger value="sources" className="tab-trigger-premium gap-2" data-testid="tab-sources">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Sources</span>
            </TabsTrigger>
            <TabsTrigger value="brain" className="tab-trigger-premium gap-2" data-testid="tab-brain">
              <Gauge className="h-4 w-4" />
              <span className="hidden sm:inline">Brain</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="tab-trigger-premium gap-2" data-testid="tab-activity">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="tab-trigger-premium gap-2" data-testid="tab-products">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Products</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6 mt-6 animate-fade-in">
            {/* Royal Kingdom Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="card-kingdom stat-card-blue overflow-visible hover-lift animate-slide-up" data-testid="card-stat-leads">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Total Leads</p>
                      <div className="text-3xl font-bold counter-animate">{dashboardData?.leads.total || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {dashboardData?.leads.withFeedback || 0} with feedback
                      </p>
                    </div>
                    <div className="icon-container icon-container-blue w-12 h-12">
                      <Target className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-kingdom stat-card-green overflow-visible glow-success hover-lift animate-slide-up animate-delay-100" data-testid="card-stat-funded">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Fund Rate</p>
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400 counter-animate">
                        {dashboardData?.rates.fundRate || "0.00"}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {dashboardData?.assignments.funded || 0} funded leads
                      </p>
                    </div>
                    <div className="icon-container icon-container-green w-12 h-12">
                      <DollarSign className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-kingdom stat-card-gold overflow-visible hover-lift animate-slide-up animate-delay-200" data-testid="card-stat-revenue">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Revenue</p>
                      <div className="text-3xl font-bold text-amber-600 dark:text-amber-400 counter-animate">
                        {formatCurrency(dashboardData?.revenue.total || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3 text-amber-500" />
                        {dashboardData?.revenue.purchaseCount || 0} purchases
                      </p>
                    </div>
                    <div className="icon-container icon-container-gold w-12 h-12">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-kingdom stat-card-purple overflow-visible hover-lift animate-slide-up animate-delay-300" data-testid="card-stat-buyers">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Active Buyers</p>
                      <div className="text-3xl font-bold counter-animate">{dashboardData?.buyers.active || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Flame className="h-3 w-3 text-purple-500" />
                        {dashboardData?.rates.feedbackRate || "0.00"}% feedback rate
                      </p>
                    </div>
                    <div className="icon-container icon-container-purple w-12 h-12">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="divider-elegant my-8" />

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="card-kingdom hover-lift animate-slide-up animate-delay-400">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="icon-container icon-container-blue w-10 h-10">
                      <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="font-serif">Assignment Breakdown</CardTitle>
                      <CardDescription>Lead status distribution from buyer feedback</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-800/50 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="font-medium">Funded</span>
                      </div>
                      <span className="text-xl font-bold text-green-600 dark:text-green-400">{dashboardData?.assignments.funded || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800/50 flex items-center justify-center">
                          <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-medium">Contacted</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{dashboardData?.assignments.contacted || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <span className="font-medium">No Response</span>
                      </div>
                      <span className="text-xl font-bold text-gray-600 dark:text-gray-400">{dashboardData?.assignments.noResponse || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-800/50 flex items-center justify-center">
                          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <span className="font-medium">Bad Lead</span>
                      </div>
                      <span className="text-xl font-bold text-red-600 dark:text-red-400">{dashboardData?.assignments.bad || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-kingdom hover-lift animate-slide-up animate-delay-500">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="icon-container icon-container-purple w-10 h-10">
                      <Activity className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="font-serif">Recent Activity</CardTitle>
                      <CardDescription>{dashboardData?.recentActivities || 0} activities in the last 7 days</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px] pr-4">
                    <div className="space-y-1">
                      {activitiesData?.activities.slice(0, 8).map((activity, index) => (
                        <div key={activity.id} className="activity-item py-3" data-testid={`activity-preview-${activity.id}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              activity.type === "funded" ? "bg-green-100 dark:bg-green-800/50 text-green-600 dark:text-green-400" :
                              activity.type === "contacted" ? "bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400" :
                              activity.type === "bad_lead" ? "bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-400" :
                              "bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400"
                            }`}>
                              {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{activity.businessName}</p>
                              <p className="text-xs text-muted-foreground">by {activity.buyerName}</p>
                            </div>
                            <Badge className={
                              activity.type === "funded" ? "badge-emerald" :
                              activity.type === "contacted" ? "badge-royal" :
                              activity.type === "bad_lead" ? "badge-gold" :
                              "badge-royal"
                            }>
                              {getActivityLabel(activity.type)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {(!activitiesData?.activities || activitiesData.activities.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p className="font-serif">No activities recorded yet</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="buyers" className="mt-6 animate-fade-in">
            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="icon-container icon-container-gold w-10 h-10">
                    <Trophy className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-gradient-royal">Buyer Performance Leaderboard</CardTitle>
                    <CardDescription>Track buyer feedback and conversion rates</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {buyersData?.buyers.map((buyer, index) => (
                    <div 
                      key={buyer.buyerId} 
                      className={`leaderboard-row flex items-center gap-4 p-4 rounded-lg border transition-all hover-lift animate-slide-up ${
                        index === 0 ? "bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/30" :
                        index === 1 ? "bg-gray-50/50 dark:bg-gray-800/20 border-gray-200 dark:border-gray-700/30" :
                        index === 2 ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30" :
                        "bg-card border-border"
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                      data-testid={`row-buyer-${buyer.buyerId}`}
                    >
                      <div className="flex items-center justify-center w-8">
                        {getRankIcon(index)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{buyer.username}</div>
                        <div className="text-xs text-muted-foreground truncate">{buyer.email}</div>
                      </div>
                      <div className="hidden md:flex items-center gap-6 text-center">
                        <div>
                          <div className="text-lg font-bold">{buyer.totalLeads}</div>
                          <div className="text-xs text-muted-foreground">Leads</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-600 dark:text-green-400">{buyer.funded}</div>
                          <div className="text-xs text-muted-foreground">Funded</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{buyer.contacted}</div>
                          <div className="text-xs text-muted-foreground">Contacted</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={
                          buyer.fundRate >= 10 ? "badge-emerald" :
                          buyer.fundRate >= 5 ? "badge-gold" :
                          "badge-royal"
                        } data-testid={`badge-fund-rate-${buyer.buyerId}`}>
                          {buyer.fundRate.toFixed(1)}%
                        </Badge>
                        <div className="w-20 hidden sm:block">
                          <div className="text-xs text-muted-foreground mb-1 text-center">Feedback</div>
                          <div className="progress-premium">
                            <div 
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
                              style={{ width: `${Math.min(buyer.feedbackRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!buyersData?.buyers || buyersData.buyers.length === 0) && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p className="text-lg font-serif font-medium">No buyer data available</p>
                      <p className="text-sm">Buyer performance will appear here once purchases are made</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="mt-6 animate-fade-in">
            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="icon-container icon-container-blue w-10 h-10">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-gradient-royal">Lead Source Performance</CardTitle>
                    <CardDescription>Conversion rates by lead source (last 30 days)</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sourcesData?.sources.map((source, index) => (
                    <div 
                      key={source.sourceType} 
                      className="gradient-border p-4 rounded-lg hover-lift animate-slide-up"
                      style={{ animationDelay: `${index * 100}ms` }}
                      data-testid={`row-source-${source.sourceType}`}
                    >
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-serif font-semibold capitalize text-lg">{source.sourceType}</h4>
                          <Badge className={
                            source.conversionRate >= 15 ? "badge-emerald" :
                            source.conversionRate >= 5 ? "badge-gold" :
                            "badge-royal"
                          }>
                            {source.conversionRate.toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-2 rounded bg-muted/50">
                            <div className="text-xl font-bold">{source.totalLeads}</div>
                            <div className="text-xs text-muted-foreground">Total</div>
                          </div>
                          <div className="text-center p-2 rounded bg-green-50 dark:bg-green-900/20">
                            <div className="text-xl font-bold text-green-600 dark:text-green-400">{source.fundedCount}</div>
                            <div className="text-xs text-muted-foreground">Funded</div>
                          </div>
                          <div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{source.contactedCount}</div>
                            <div className="text-xs text-muted-foreground">Contacted</div>
                          </div>
                          <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/20">
                            <div className="text-xl font-bold text-red-600 dark:text-red-400">{source.badLeadCount}</div>
                            <div className="text-xs text-muted-foreground">Bad</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!sourcesData?.sources || sourcesData.sources.length === 0) && (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p className="text-lg font-serif font-medium">No source data available</p>
                      <p className="text-sm">Source performance will appear once leads are tracked</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="brain" className="mt-6 animate-fade-in">
            <Card className="card-kingdom gradient-border-animated">
              <CardHeader>
                <div className="relative z-10 flex items-center gap-3">
                  <div className="icon-container icon-container-purple w-10 h-10">
                    <Brain className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-gradient-royal flex items-center gap-2">
                      AI Brain Configuration
                      {brainData?.config.isActive && (
                        <Badge className="badge-emerald">
                          <Zap className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Adjust the weights and parameters used for lead scoring
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative z-10 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Recency Weight</Label>
                        <span className="text-lg font-bold text-primary">{((brainData?.config.recencyWeight || 0.3) * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">How much recent activity affects score</p>
                      <Slider
                        value={[(brainData?.config.recencyWeight || 0.3) * 100]}
                        onValueChange={(v) => updateBrainMutation.mutate({ recencyWeight: v[0] / 100 })}
                        max={50}
                        step={5}
                        className="accent-primary"
                        data-testid="slider-recency"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Source Weight</Label>
                        <span className="text-lg font-bold text-primary">{((brainData?.config.sourceWeight || 0.2) * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">Impact of lead source quality</p>
                      <Slider
                        value={[(brainData?.config.sourceWeight || 0.2) * 100]}
                        onValueChange={(v) => updateBrainMutation.mutate({ sourceWeight: v[0] / 100 })}
                        max={50}
                        step={5}
                        data-testid="slider-source"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Attempt Weight</Label>
                        <span className="text-lg font-bold text-primary">{((brainData?.config.attemptWeight || 0.2) * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">How attempt count affects priority</p>
                      <Slider
                        value={[(brainData?.config.attemptWeight || 0.2) * 100]}
                        onValueChange={(v) => updateBrainMutation.mutate({ attemptWeight: v[0] / 100 })}
                        max={50}
                        step={5}
                        data-testid="slider-attempt"
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Outcome Weight</Label>
                        <span className="text-lg font-bold text-primary">{((brainData?.config.outcomeWeight || 0.3) * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">Impact of call outcomes on score</p>
                      <Slider
                        value={[(brainData?.config.outcomeWeight || 0.3) * 100]}
                        onValueChange={(v) => updateBrainMutation.mutate({ outcomeWeight: v[0] / 100 })}
                        max={50}
                        step={5}
                        data-testid="slider-outcome"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Feedback Weight</Label>
                        <span className="text-lg font-bold text-primary">{((brainData?.config.feedbackWeight || 0.2) * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">Buyer feedback influence on AI score</p>
                      <Slider
                        value={[(brainData?.config.feedbackWeight || 0.2) * 100]}
                        onValueChange={(v) => updateBrainMutation.mutate({ feedbackWeight: v[0] / 100 })}
                        max={50}
                        step={5}
                        data-testid="slider-feedback"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-base font-semibold">Max Attempts</Label>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">Maximum contact attempts before deprioritizing</p>
                      <Input
                        type="number"
                        value={brainData?.config.maxAttempts || 10}
                        onChange={(e) => updateBrainMutation.mutate({ maxAttempts: parseInt(e.target.value) })}
                        min={1}
                        max={50}
                        className="bg-background"
                        data-testid="input-max-attempts"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={brainData?.config.isActive ?? true}
                      onCheckedChange={(checked) => updateBrainMutation.mutate({ isActive: checked })}
                      data-testid="switch-active"
                    />
                    <div>
                      <Label className="font-semibold">AI Brain Active</Label>
                      <p className="text-xs text-muted-foreground">Toggle automatic score calculations</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm">Recalc Interval:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={brainData?.config.recalcIntervalHours || 24}
                        onChange={(e) => updateBrainMutation.mutate({ recalcIntervalHours: parseInt(e.target.value) })}
                        min={1}
                        max={168}
                        className="w-20 bg-background"
                        data-testid="input-recalc-interval"
                      />
                      <span className="text-sm text-muted-foreground">hours</span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="relative z-10 border-t pt-4">
                <div className="flex items-center gap-2 w-full">
                  <Badge className={
                    totalWeight >= 95 && totalWeight <= 105 ? "badge-emerald" :
                    totalWeight >= 80 && totalWeight <= 120 ? "badge-gold" :
                    "badge-royal"
                  } data-testid="badge-weight-sum">
                    Weight Sum: {totalWeight.toFixed(0)}%
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Weights should sum to approximately 100% for optimal scoring
                  </p>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-6 animate-fade-in">
            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="icon-container icon-container-green w-10 h-10">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-serif text-gradient-royal">Recent Buyer Activities</CardTitle>
                    <CardDescription>Live feed of buyer feedback and status changes</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {activitiesData?.activities.map((activity, index) => (
                      <div 
                        key={activity.id} 
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card hover-lift transition-all animate-slide-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                        data-testid={`row-activity-${activity.id}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          activity.type === "funded" ? "bg-green-100 dark:bg-green-800/50 text-green-600 dark:text-green-400" :
                          activity.type === "contacted" ? "bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400" :
                          activity.type === "bad_lead" ? "bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-400" :
                          "bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400"
                        }`}>
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold">{activity.buyerName}</span>
                            <span className="text-muted-foreground">marked</span>
                            <span className="font-medium">{activity.businessName}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{formatDate(activity.createdAt)}</span>
                            {activity.note && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-xs">{activity.note}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {activity.dealAmount && (
                            <Badge className="badge-gold" data-testid={`badge-amount-${activity.id}`}>
                              {formatCurrency(parseFloat(activity.dealAmount))}
                            </Badge>
                          )}
                          <Badge className={
                            activity.type === "funded" ? "badge-emerald" :
                            activity.type === "contacted" ? "badge-royal" :
                            activity.type === "bad_lead" ? "badge-gold" :
                            "badge-royal"
                          }>
                            {getActivityLabel(activity.type)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {(!activitiesData?.activities || activitiesData.activities.length === 0) && (
                      <div className="text-center py-16 text-muted-foreground">
                        <Activity className="h-16 w-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-serif font-medium">No activities recorded yet</p>
                        <p className="text-sm">Buyer feedback and status changes will appear here</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-6 animate-fade-in">
            <Card className="card-kingdom">
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="icon-container icon-container-gold w-10 h-10">
                      <Package className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-gradient-royal">Funding Products</CardTitle>
                      <CardDescription>Manage funding product types (MCA, SBA, Equipment, etc.)</CardDescription>
                    </div>
                  </div>
                  <Button 
                    onClick={() => { resetProductForm(); setShowProductForm(true); }}
                    className="btn-kingdom gap-2"
                    data-testid="button-add-funding-product"
                  >
                    <Plus className="h-4 w-4" />
                    Add Funding Product
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {showProductForm && (
                  <Card className="mb-6 border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {editingProduct ? "Edit Funding Product" : "New Funding Product"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="product-name">Name</Label>
                          <Input
                            id="product-name"
                            placeholder="Merchant Cash Advance"
                            value={productFormData.name}
                            onChange={(e) => setProductFormData(prev => ({ ...prev, name: e.target.value }))}
                            data-testid="input-product-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="product-slug">Slug</Label>
                          <Input
                            id="product-slug"
                            placeholder="mca"
                            value={productFormData.slug}
                            onChange={(e) => setProductFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                            data-testid="input-product-slug"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-description">Description</Label>
                        <Input
                          id="product-description"
                          placeholder="Short-term business financing..."
                          value={productFormData.description}
                          onChange={(e) => setProductFormData(prev => ({ ...prev, description: e.target.value }))}
                          data-testid="input-product-description"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="product-icon">Icon Name</Label>
                          <Input
                            id="product-icon"
                            placeholder="dollar-sign"
                            value={productFormData.icon}
                            onChange={(e) => setProductFormData(prev => ({ ...prev, icon: e.target.value }))}
                            data-testid="input-product-icon"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="product-color">Color</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="product-color"
                              type="color"
                              value={productFormData.color}
                              onChange={(e) => setProductFormData(prev => ({ ...prev, color: e.target.value }))}
                              className="w-12 h-9 p-1"
                              data-testid="input-product-color"
                            />
                            <Input
                              value={productFormData.color}
                              onChange={(e) => setProductFormData(prev => ({ ...prev, color: e.target.value }))}
                              placeholder="#2d6a4f"
                              className="flex-1"
                              data-testid="input-product-color-text"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="product-order">Display Order</Label>
                          <Input
                            id="product-order"
                            type="number"
                            min={0}
                            value={productFormData.displayOrder}
                            onChange={(e) => setProductFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                            data-testid="input-product-display-order"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="product-active"
                            checked={productFormData.isActive}
                            onCheckedChange={(checked) => setProductFormData(prev => ({ ...prev, isActive: checked }))}
                            data-testid="switch-product-active"
                          />
                          <Label htmlFor="product-active">Active</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="product-default"
                            checked={productFormData.isDefault}
                            onCheckedChange={(checked) => setProductFormData(prev => ({ ...prev, isDefault: checked }))}
                            data-testid="switch-product-default"
                          />
                          <Label htmlFor="product-default">Default</Label>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-3">
                      <Button variant="outline" onClick={resetProductForm} data-testid="button-cancel-product">
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSubmitProduct}
                        disabled={createProductMutation.isPending || updateProductMutation.isPending || !productFormData.name || !productFormData.slug}
                        data-testid="button-save-product"
                      >
                        {createProductMutation.isPending || updateProductMutation.isPending ? "Saving..." : (editingProduct ? "Update" : "Create")}
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="text-center">Default</TableHead>
                        <TableHead className="text-center">Order</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productsData?.products.map((product) => (
                        <TableRow key={product.id} data-testid={`row-funding-product-${product.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: product.color || "#2d6a4f" }}
                              />
                              <span className="font-medium">{product.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.slug}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {product.isActive ? (
                              <Badge className="badge-emerald">Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.isDefault && (
                              <Badge className="badge-gold">Default</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{product.displayOrder}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditProduct(product)}
                                data-testid={`button-edit-product-${product.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this funding product?")) {
                                    deleteProductMutation.mutate(product.id);
                                  }
                                }}
                                disabled={deleteProductMutation.isPending}
                                data-testid={`button-delete-product-${product.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!productsData?.products || productsData.products.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-serif font-medium">No funding products yet</p>
                            <p className="text-sm">Create your first funding product to get started</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
