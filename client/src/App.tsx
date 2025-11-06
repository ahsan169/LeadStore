import { Switch, Route, useLocation } from "wouter";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import HomePage from "@/pages/home";
import SimplifiedDashboard from "@/pages/simplified-dashboard";
import SimplifiedPurchasePage from "@/pages/simplified-purchase";
import PurchasesPage from "@/pages/purchases";
import PaymentSuccessPage from "@/pages/payment-success";
import PaymentCancelPage from "@/pages/payment-cancel";
import SimplifiedAdminPage from "@/pages/admin/simplified-admin";
import IntelligenceDashboard from "@/pages/intelligence-dashboard";
import EnrichmentDashboard from "@/pages/admin/enrichment-dashboard";
import { Home, Package, DollarSign, Users, Upload, LogOut, ShoppingCart, CreditCard, Settings, Brain, Zap } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@/../../shared/schema";
import logoUrl from "@assets/generated_images/Lakefront_Leadworks_logo_9f434e28.png";

import { StripeTestModeIndicator } from "@/components/StripeTestModeIndicator";
import { Badge } from "@/components/ui/badge";

function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/auth");
    },
  });

  const isAdmin = user?.role === "admin";

  const buyerMenuItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Buy Leads", url: "/purchase", icon: ShoppingCart },
    { title: "My Purchases", url: "/purchases", icon: Package },
  ];

  const adminMenuItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home },
    { title: "Buy Leads", url: "/purchase", icon: ShoppingCart },
    { title: "My Purchases", url: "/purchases", icon: Package },
    { title: "Intelligence", url: "/intelligence", icon: Brain },
    { title: "Enrichment", url: "/enrichment", icon: Zap },
    { title: "Admin Panel", url: "/admin", icon: Settings },
  ];

  const menuItems = isAdmin ? adminMenuItems : buyerMenuItems;

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-3">
          <img 
            src={logoUrl} 
            alt="Lakefront Leadworks" 
            className="w-12 h-12 rounded-lg shadow-md"
          />
          <div className="flex-1">
            <h2 className="font-bold text-lg bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Lakefront Leadworks
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Admin Portal" : "Premium MCA Leads"}
            </p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <a href={item.url} onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.url);
                    }}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="space-y-2">
          {user && (
            <div className="text-sm text-muted-foreground">
              Logged in as <span className="font-medium text-foreground">{user.username}</span>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Router() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/auth" component={AuthPage} />
        <Route component={HomePage} />
      </Switch>
    );
  }

  // Authenticated with sidebar
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              {/* Main routes */}
              <Route path="/" component={SimplifiedDashboard} />
              <Route path="/dashboard" component={SimplifiedDashboard} />
              <Route path="/purchase" component={SimplifiedPurchasePage} />
              <Route path="/purchases" component={PurchasesPage} />
              <Route path="/payment-success" component={PaymentSuccessPage} />
              <Route path="/payment-cancel" component={PaymentCancelPage} />

              {/* Admin routes */}
              {user.role === "admin" && (
                <>
                  <Route path="/intelligence" component={IntelligenceDashboard} />
                  <Route path="/enrichment" component={EnrichmentDashboard} />
                  <Route path="/admin" component={SimplifiedAdminPage} />
                  <Route path="/admin/upload" component={SimplifiedAdminPage} />
                  <Route path="/admin/customers" component={SimplifiedAdminPage} />
                </>
              )}

              {/* 404 */}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        
        {/* Stripe Test Mode Indicator */}
        <StripeTestModeIndicator />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
