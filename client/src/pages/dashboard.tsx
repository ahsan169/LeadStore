import { useQuery } from "@tanstack/react-query";
import { LeadStatsCard } from "@/components/LeadStatsCard";
import { QualityScoreBadge } from "@/components/QualityScoreBadge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Download, TrendingUp, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
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
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-dashboard">
          Welcome back{user?.username ? `, ${user.username}` : ""}!
        </h1>
        <p className="text-muted-foreground">Here's your lead marketplace overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Recent Purchases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <h2 className="text-xl font-semibold">Recent Purchases</h2>
          <Link href="/purchases">
            <Button variant="outline" size="sm" data-testid="button-view-all">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!purchases || purchases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No purchases yet</p>
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
                    <th className="p-2 text-sm font-medium text-muted-foreground">Order ID</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Tier</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Leads</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="p-2 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.slice(0, 5).map((purchase: any) => (
                    <tr 
                      key={purchase.id} 
                      className="border-b hover-elevate"
                      data-testid={`row-purchase-${purchase.id}`}
                    >
                      <td className="p-2 font-mono text-sm" data-testid={`text-order-id-${purchase.id}`}>
                        {purchase.id.slice(0, 8)}...
                      </td>
                      <td className="p-2 text-sm">
                        {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                      </td>
                      <td className="p-2">
                        <span className="text-sm font-medium capitalize">{purchase.tier}</span>
                      </td>
                      <td className="p-2 text-sm">{purchase.leadCount}</td>
                      <td className="p-2 text-sm font-medium">${purchase.totalAmount}</td>
                      <td className="p-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          purchase.paymentStatus === 'succeeded' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                        }`}>
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
  );
}
