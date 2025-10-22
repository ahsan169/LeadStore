import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import HomePage from "@/pages/home";
import PricingPage from "@/pages/pricing";
import DashboardPage from "@/pages/dashboard";
import PurchasesPage from "@/pages/purchases";
import PurchaseTierPage from "@/pages/purchase-tier";
import AdminDashboardPage from "@/pages/admin/admin-dashboard";
import UploadLeadsPage from "@/pages/admin/upload-leads";
import ManageLeadsPage from "@/pages/admin/manage-leads";
import CustomersPage from "@/pages/admin/customers";
import { Home, Package, Download, DollarSign, Users, Upload, Database, BarChart, Shield, LogOut } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
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
    { title: "Pricing", url: "/pricing", icon: DollarSign },
    { title: "My Purchases", url: "/purchases", icon: Package },
  ];

  const adminMenuItems = [
    { title: "Dashboard", url: "/admin/dashboard", icon: BarChart },
    { title: "Upload Leads", url: "/admin/upload", icon: Upload },
    { title: "Manage Leads", url: "/admin/leads", icon: Database },
    { title: "Customers", url: "/admin/customers", icon: Users },
  ];

  const menuItems = isAdmin ? adminMenuItems : buyerMenuItems;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-bold text-lg">MCA Leads</h2>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Admin Portal" : "Lead Marketplace"}
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
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
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
              {/* Buyer routes */}
              <Route path="/" component={DashboardPage} />
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/pricing" component={PricingPage} />
              <Route path="/purchases" component={PurchasesPage} />
              <Route path="/purchase/:tier" component={PurchaseTierPage} />

              {/* Admin routes */}
              {user.role === "admin" && (
                <>
                  <Route path="/admin/dashboard" component={AdminDashboardPage} />
                  <Route path="/admin/upload" component={UploadLeadsPage} />
                  <Route path="/admin/leads" component={ManageLeadsPage} />
                  <Route path="/admin/customers" component={CustomersPage} />
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}
