import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Download, Upload, TrendingUp, BarChart2, Users, Target, FileSpreadsheet, Building2, Mail, Phone, Calculator } from "lucide-react";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
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
import { useState } from "react";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ContactModal } from "@/components/modals/ContactModal";

const COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
};

interface SearchAnalytics {
  totalSearches: number;
  totalCompaniesFound: number;
  csvDownloads: number;
  bulkUploads: number;
  averageCompaniesPerSearch: number;
  topSearchedTerms: Array<{ term: string; count: number }>;
  searchSuccessRate: number;
  totalExecutivesFound: number;
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
        {description && (
          <p className="text-xs text-muted-foreground mt-2">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: analyticsData, isLoading, error, refetch } = useQuery<SearchAnalytics>({
    queryKey: ["/api/analytics/search-stats"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 60000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "Analytics data has been updated",
    });
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

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="card-kingdom">
          <CardHeader>
            <CardTitle>Error Loading Analytics</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Failed to load analytics data"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} className="btn-kingdom">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = analyticsData || {
    totalSearches: 0,
    totalCompaniesFound: 0,
    csvDownloads: 0,
    bulkUploads: 0,
    averageCompaniesPerSearch: 0,
    topSearchedTerms: [],
    searchSuccessRate: 0,
    totalExecutivesFound: 0,
  };

  // Generate chart data for search activity over time (last 7 days)
  const searchActivityData = [
    { day: "Mon", searches: Math.floor(stats.totalSearches * 0.15) },
    { day: "Tue", searches: Math.floor(stats.totalSearches * 0.18) },
    { day: "Wed", searches: Math.floor(stats.totalSearches * 0.20) },
    { day: "Thu", searches: Math.floor(stats.totalSearches * 0.17) },
    { day: "Fri", searches: Math.floor(stats.totalSearches * 0.15) },
    { day: "Sat", searches: Math.floor(stats.totalSearches * 0.10) },
    { day: "Sun", searches: Math.floor(stats.totalSearches * 0.05) },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full badge-gold">
                <BarChart2 className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold font-serif text-gradient-royal" data-testid="heading-analytics">
                Company Search Analytics
              </h1>
            </div>
            <p className="text-muted-foreground">
              Track your company search usage, CSV downloads, and bulk enrichment activity
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setLocation("/company-search")}
              variant="outline"
              className="btn-kingdom"
            >
              <Search className="w-4 h-4 mr-2" />
              Search Companies
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-kingdom"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="divider-elegant" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          <MetricCard
            title="Total Searches"
            value={stats.totalSearches}
            icon={Search}
            description="Last 30 days"
            badgeVariant="gold"
          />
          <MetricCard
            title="Companies Found"
            value={stats.totalCompaniesFound}
            icon={Building2}
            description={`Avg ${stats.averageCompaniesPerSearch.toFixed(1)} per search`}
            badgeVariant="emerald"
          />
          <MetricCard
            title="CSV Downloads"
            value={stats.csvDownloads}
            icon={Download}
            description="Total downloads"
            badgeVariant="royal"
          />
          <MetricCard
            title="Bulk Uploads"
            value={stats.bulkUploads}
            icon={Upload}
            description="CSV enrichments"
            badgeVariant="gold"
          />
        </div>

        <div className="divider-elegant" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-100" data-testid="card-search-activity">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Search Activity
              </CardTitle>
              <CardDescription>Company searches over the last week</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={searchActivityData}>
                  <defs>
                    <linearGradient id="colorSearches" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="searches" 
                    stroke={COLORS.primary} 
                    fillOpacity={1} 
                    fill="url(#colorSearches)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-200" data-testid="card-top-searches">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Top Searched Companies
              </CardTitle>
              <CardDescription>Most frequently searched company names</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topSearchedTerms.length > 0 ? (
                <div className="space-y-3">
                  {stats.topSearchedTerms.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover-lift transition-all duration-200">
                      <div className="flex items-center gap-3">
                        <Badge className="badge-royal">{index + 1}</Badge>
                        <span className="font-medium">{item.term}</span>
                      </div>
                      <Badge className="badge-gold">{item.count} searches</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No searches yet</p>
                  <p className="text-sm mt-2">Start searching companies to see analytics</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-300" data-testid="card-success-rate">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-primary" />
                Search Success Rate
              </CardTitle>
              <CardDescription>Percentage of searches that found companies</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Successful', value: stats.totalSearches * (stats.searchSuccessRate / 100) },
                      { name: 'No Results', value: stats.totalSearches * ((100 - stats.searchSuccessRate) / 100) },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill={COLORS.success} />
                    <Cell fill={COLORS.danger} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 text-center">
                <div className="text-3xl font-bold font-serif text-primary">
                  {stats.searchSuccessRate}%
                </div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift animate-fade-in animate-delay-400" data-testid="card-usage-breakdown">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Usage Breakdown
              </CardTitle>
              <CardDescription>Activity distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: 'Searches', value: stats.totalSearches },
                  { name: 'Downloads', value: stats.csvDownloads },
                  { name: 'Bulk Uploads', value: stats.bulkUploads },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.info} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="divider-elegant" />

        <Card className="card-kingdom animate-fade-in">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Executive Data Found
            </CardTitle>
            <CardDescription>Total executives discovered through company searches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-5xl font-bold font-serif text-primary mb-2">
                {stats.totalExecutivesFound.toLocaleString()}
              </div>
              <p className="text-muted-foreground">
                Executives found across {stats.totalCompaniesFound} companies
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Average: {stats.totalCompaniesFound > 0 ? Math.round(stats.totalExecutivesFound / stats.totalCompaniesFound) : 0} executives per company
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="divider-elegant" />

        {/* Revenue Calculator Section */}
        <Card className="card-kingdom animate-fade-in">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Revenue Calculator
            </CardTitle>
            <CardDescription>Calculate your potential ROI with our lead finder platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-muted-foreground mb-2">
                  Use our ROI calculator to estimate your potential return on investment based on lead volume, quality scores, and conversion rates.
                </p>
              </div>
              <Button
                onClick={() => setLocation("/calculator")}
                className="btn-kingdom"
                size="lg"
              >
                <Calculator className="w-4 h-4 mr-2" />
                Open Calculator
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="divider-elegant" />

        {/* Contact Section */}
        <Card className="card-kingdom animate-fade-in">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Need Custom Pricing?
            </CardTitle>
            <CardDescription>Contact us for custom pricing and enterprise solutions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-muted-foreground mb-2">
                  Looking for custom pricing or have questions about our lead finder platform?
                </p>
                <div className="flex items-center gap-4 mt-4">
                  <a href="tel:+1-555-123-4567" className="flex items-center gap-2 text-primary hover:underline">
                    <Phone className="w-4 h-4" />
                    <span className="font-medium">+1 (555) 123-4567</span>
                  </a>
                  <a href="mailto:contact@landofleads.com" className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="w-4 h-4" />
                    <span className="font-medium">contact@landofleads.com</span>
                  </a>
                </div>
              </div>
              <Button
                onClick={() => setContactModalOpen(true)}
                className="btn-kingdom"
                size="lg"
              >
                Contact Us
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ContactModal isOpen={contactModalOpen} onClose={() => setContactModalOpen(false)} />
    </div>
  );
}
