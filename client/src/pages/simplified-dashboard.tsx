import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, TrendingUp, Clock, Download, ChevronRight } from "lucide-react";
import type { User, Purchase } from "@shared/schema";

export default function SimplifiedDashboard() {
  const [, setLocation] = useLocation();
  
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  const { data: purchases } = useQuery<Purchase[]>({
    queryKey: ["/api/purchases"],
  });

  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/dashboard'],
  });

  // Get recent purchases (last 5)
  const recentPurchases = purchases?.slice(0, 5) || [];
  
  // Calculate total leads purchased
  const totalLeadsPurchased = purchases?.reduce((sum, p) => sum + (p.leadCount || 0), 0) || 0;
  
  // Calculate total spent
  const totalSpent = purchases?.reduce((sum, p) => sum + (p.totalAmount || 0), 0) || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-dashboard">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-muted-foreground">
          Your lead marketplace dashboard - everything you need in one place
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/purchase")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Buy New Leads
            </CardTitle>
            <CardDescription>Browse and purchase quality MCA leads</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" data-testid="button-buy-leads">
              Shop Now
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/purchases")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              My Purchases
            </CardTitle>
            <CardDescription>View and download your purchased leads</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" data-testid="button-view-purchases">
              View All
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Your Stats
            </CardTitle>
            <CardDescription>Quick overview of your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Leads</span>
              <span className="font-bold">{totalLeadsPurchased}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Spent</span>
              <span className="font-bold">${totalSpent}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {recentPurchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
            <CardDescription>Your latest lead purchases</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentPurchases.map((purchase) => (
                <div 
                  key={purchase.id} 
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {purchase.tier?.toUpperCase()} Package
                      </p>
                      <Badge variant={purchase.status === 'fulfilled' ? 'default' : 'secondary'}>
                        {purchase.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {purchase.leadCount} leads • ${purchase.totalAmount}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {new Date(purchase.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {purchase.status === 'fulfilled' && purchase.csvUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(purchase.csvUrl, '_blank')}
                        data-testid={`button-download-${purchase.id}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting Started (for new users) */}
      {purchases?.length === 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Ready to grow your MCA business? Start by purchasing your first lead package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setLocation("/purchase")}
              className="w-full sm:w-auto"
              data-testid="button-get-started"
            >
              Browse Lead Packages
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}