import { useQuery } from "@tanstack/react-query";
import { LeadStatsCard } from "@/components/LeadStatsCard";
import { InsightsCard } from "@/components/InsightsCard";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Package, DollarSign, Users, TrendingUp, Sparkles, Waves, Activity, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AiInsight } from "@shared/schema";

export default function AdminDashboardPage() {
  const { data: leadStats } = useQuery({
    queryKey: ["/api/leads/stats"],
  });

  const { data: purchases } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: batches } = useQuery({
    queryKey: ["/api/batches"],
  });

  const mostRecentBatchId = batches?.[0]?.id;

  const { data: recentInsights } = useQuery<AiInsight>({
    queryKey: ["/api/insights/batch", mostRecentBatchId],
    enabled: !!mostRecentBatchId,
  });

  const totalRevenue = purchases?.reduce((sum: number, p: any) => 
    sum + parseFloat(p.totalAmount || 0), 0
  ) || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header Section */}
        <div className="space-y-2 animate-fade-in">
          <h1 className="text-4xl font-bold flex items-center gap-3" data-testid="heading-admin-dashboard">
            <span className="text-gradient">Admin Dashboard</span>
            <BarChart3 className="w-8 h-8 text-primary/50" />
          </h1>
          <p className="text-lg text-muted-foreground">Manage your MCA lead marketplace</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
        <LeadStatsCard
          title="Total Leads"
          value={leadStats?.total || 0}
          icon={Package}
          description={`${leadStats?.available || 0} available`}
        />
        <LeadStatsCard
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(0)}`}
          icon={DollarSign}
          description={`${purchases?.length || 0} orders`}
        />
        <LeadStatsCard
          title="Customers"
          value={customers?.length || 0}
          icon={Users}
        />
        <LeadStatsCard
          title="Avg Quality Score"
          value={leadStats?.avgQualityScore?.toFixed(1) || "N/A"}
          icon={TrendingUp}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Batches */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Recent Lead Batches</h2>
          </CardHeader>
          <CardContent>
            {!batches || batches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No batches uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.slice(0, 5).map((batch: any) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`batch-${batch.id}`}
                  >
                    <div>
                      <div className="font-medium">{batch.filename}</div>
                      <div className="text-sm text-muted-foreground">
                        {batch.totalLeads} leads • Avg score: {batch.averageQualityScore || "N/A"}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(batch.uploadedAt), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Recent Orders</h2>
          </CardHeader>
          <CardContent>
            {!purchases || purchases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No orders yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {purchases.slice(0, 5).map((purchase: any) => (
                  <div
                    key={purchase.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`purchase-${purchase.id}`}
                  >
                    <div>
                      <div className="font-medium capitalize">{purchase.tier} Package</div>
                      <div className="text-sm text-muted-foreground">
                        {purchase.leadCount} leads
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${purchase.totalAmount}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Insights for Most Recent Batch */}
      {recentInsights && batches?.[0] && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Latest Batch Insights</h2>
            <span className="text-sm text-muted-foreground">
              for {batches[0].filename}
            </span>
          </div>
          <InsightsCard insight={recentInsights} />
        </div>
      )}
      </div>
    </div>
  );
}
