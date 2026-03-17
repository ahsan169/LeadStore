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
import AnalyticsPage from "@/pages/analytics";
import CompanySearchPage from "@/pages/CompanySearchPage";
import RevenueCalculatorPage from "@/pages/revenue-calculator";
import ContactPage from "@/pages/contact";
import Redirect from "@/components/Redirect";
import { Home, LogOut, BarChart3, Search, Calculator, Phone } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User, Company } from "@/../../shared/schema";

import { StripeTestModeIndicator } from "@/components/StripeTestModeIndicator";
import { Badge } from "@/components/ui/badge";

interface AuthResponse {
  user: User;
  company: Company | null;
  permissions: {
    canManageCompany: boolean;
    canManageUsers: boolean;
    canViewAllCompanies: boolean;
  };
}

function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { data: authData } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const user = authData?.user;
  const company = authData?.company;

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/auth");
    },
  });

  const role = user?.role;
  const isSuperAdmin = role === "super_admin";
  const isCompanyAdmin = role === "company_admin";
  const isAgent = role === "agent";
  const isLegacyAdmin = role === "admin";
  const isBuyer = role === "buyer";

  const getMenuItems = () => {
    // Simplified menu for lead finder app
    return [
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Company Search", url: "/company-search", icon: Search },
      { title: "Revenue Calculator", url: "/calculator", icon: Calculator },
      { title: "Contact", url: "/contact", icon: Phone },
    ];
  };

  const menuItems = getMenuItems();

  const getRoleLabel = () => {
    return "Lead Finder";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg shadow-md bg-gradient-to-br from-emerald-600 via-emerald-700 to-amber-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white font-serif">L</span>
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg font-serif tracking-wide" data-testid="text-app-title">
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 bg-clip-text text-transparent">Land</span>
              <span className="text-muted-foreground mx-1">of</span>
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">Leads</span>
            </h2>
            {company?.name && (
              <p className="text-sm font-medium text-foreground" data-testid="text-company-name">
                {company.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground" data-testid="text-role-label">
              {getRoleLabel()}
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
  const { data: authData, isLoading } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const user = authData?.user;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/auth" component={AuthPage} />
        <Route component={HomePage} />
      </Switch>
    );
  }

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
              <Route path="/" component={AnalyticsPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/company-search" component={CompanySearchPage} />
              <Route path="/calculator" component={RevenueCalculatorPage} />
              <Route path="/contact" component={ContactPage} />
              <Route path="/dashboard">
                <Redirect to="/company-search" />
              </Route>
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
