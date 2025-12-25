import { useQuery } from "@tanstack/react-query";
import { LeadStatsCard } from "@/components/LeadStatsCard";
import { QualityScoreBadge } from "@/components/QualityScoreBadge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Package, Download, TrendingUp, DollarSign, ArrowUpRight, Activity, Users, Crown, Target, ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function DashboardPage() {
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
  });

  const stats = {
    totalPurchases: purchases?.length || 0,
    totalLeads: purchases?.reduce((sum: number, p: any) => sum + (p.leadCount || 0), 0) || 0,
    totalSpent: purchases?.reduce((sum: number, p: any) => sum + parseFloat(p.totalAmount || 0), 0) || 0,
    successfulPurchases: purchases?.filter((p: any) => p.paymentStatus === "succeeded").length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4">
          <Crown className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <div className="text-lg text-muted-foreground font-serif">Loading your kingdom...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header Section with Kingdom Background */}
        <div className="bg-hero-kingdom rounded-lg p-8 animate-fade-in">
          <div className="space-y-2">
            <h1 className="text-4xl font-serif font-bold flex items-center gap-3" data-testid="heading-dashboard">
              <span className="text-gradient-royal">Welcome back{user?.username ? `, ${user.username}` : ""}</span>
              <Crown className="w-8 h-8 text-secondary" />
            </h1>
            <p className="text-lg text-muted-foreground">Your lead marketplace kingdom awaits</p>
          </div>
        </div>

        <div className="divider-elegant" />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          <LeadStatsCard
            title="Total Purchases"
            value={stats.totalPurchases}
            icon={Package}
          />
          <LeadStatsCard
            title="Total Leads"
            value={stats.totalLeads}
            icon={Download}
          />
          <LeadStatsCard
            title="Total Spent"
            value={`$${stats.totalSpent.toFixed(2)}`}
            icon={DollarSign}
          />
          <LeadStatsCard
            title="Success Rate"
            value={stats.totalPurchases ? `${Math.round((stats.successfulPurchases / stats.totalPurchases) * 100)}%` : "N/A"}
            icon={TrendingUp}
          />
        </div>

        <div className="divider-elegant" />

        {/* Analytics Widgets */}
        {analyticsData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up animate-delay-100">
            {/* ROI Performance Card */}
            <Card className="card-kingdom">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                <div>
                  <h3 className="text-lg font-serif font-semibold">ROI Performance</h3>
                  <p className="text-sm text-muted-foreground">Your return on investment</p>
                </div>
                <div className={`flex items-center gap-1 ${analyticsData?.stats?.roi > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {analyticsData?.stats?.roi > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  <span className="text-2xl font-bold font-serif">{analyticsData?.stats?.roi?.toFixed(1) || '0'}%</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-medium">${analyticsData?.stats?.totalRevenue?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Best Tier</span>
                    <span className="badge-gold capitalize">
                      {analyticsData?.bestPerformingTier || 'none'}
                    </span>
                  </div>
                  <div className="pt-2">
                    <Link href="/analytics">
                      <Button variant="outline" size="sm" className="w-full" data-testid="button-view-analytics">
                        <Activity className="w-4 h-4 mr-2 text-primary" />
                        View Full Analytics
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conversion Rate Card */}
            <Card className="card-kingdom">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                <div>
                  <h3 className="text-lg font-serif font-semibold">Conversion Metrics</h3>
                  <p className="text-sm text-muted-foreground">Lead conversion performance</p>
                </div>
                <div className="text-primary">
                  <Target className="w-6 h-6" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Conversion Rate</span>
                    <span className="text-xl font-bold font-serif">{analyticsData?.stats?.averageConversionRate?.toFixed(1) || '0'}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-bold font-serif text-blue-600 dark:text-blue-400">{analyticsData?.stats?.contacted || 0}</div>
                      <div className="text-xs text-muted-foreground">Contacted</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-serif text-purple-600 dark:text-purple-400">{analyticsData?.stats?.qualified || 0}</div>
                      <div className="text-xs text-muted-foreground">Qualified</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-serif text-green-600 dark:text-green-400">{analyticsData?.stats?.closedWon || 0}</div>
                      <div className="text-xs text-muted-foreground">Closed</div>
                    </div>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground text-center">
                    Lead Velocity: {analyticsData?.leadVelocity > 0 ? '+' : ''}{analyticsData?.leadVelocity?.toFixed(0) || '0'}% monthly growth
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="divider-elegant" />

        {/* Recent Purchases */}
        <Card className="card-kingdom animate-slide-up animate-delay-200">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <h2 className="text-xl font-serif font-semibold">Recent Purchases</h2>
            <Link href="/purchases">
              <Button variant="outline" size="sm" data-testid="button-view-all">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!purchases || purchases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 text-primary opacity-50" />
                <p className="font-serif">No purchases yet</p>
                <Link href="/pricing">
                  <Button className="mt-4" data-testid="button-browse-pricing">
                    Browse Pricing
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Order ID</th>
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Date</th>
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Tier</th>
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Leads</th>
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Amount</th>
                      <th className="p-2 text-sm font-serif font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.slice(0, 5).map((purchase: any) => (
                      <tr 
                        key={purchase.id} 
                        className="border-b hover-elevate transition-smooth"
                        data-testid={`row-purchase-${purchase.id}`}
                      >
                        <td className="p-2 font-mono text-sm" data-testid={`text-order-id-${purchase.id}`}>
                          {purchase.id.slice(0, 8)}...
                        </td>
                        <td className="p-2 text-sm">
                          {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                        </td>
                        <td className="p-2">
                          <span className="badge-gold capitalize">{purchase.tier}</span>
                        </td>
                        <td className="p-2 text-sm font-medium">{purchase.leadCount}</td>
                        <td className="p-2 text-sm font-medium">${purchase.totalAmount}</td>
                        <td className="p-2">
                          <span className={purchase.paymentStatus === 'succeeded' ? 'badge-emerald' : 'badge-gold'}>
                            {purchase.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
