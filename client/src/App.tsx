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
import SimplifiedAdminPage from "@/pages/admin/simplified-admin";
import ValidationCenter from "@/pages/validation-center";
import LeadManagementPage from "@/pages/lead-management";
import PipelineBoardPage from "@/pages/pipeline-board";
import TaskManagerPage from "@/pages/task-manager";
import ContactManagerPage from "@/pages/contact-manager";
import ActivityTimelinePage from "@/pages/activity-timeline";
import CrmDashboardPage from "@/pages/crm-dashboard";
import MyLeadsPage from "@/pages/my-leads";
import { Home, Upload, LogOut, Shield, Database, Kanban, CheckSquare, Users, Activity, LayoutDashboard, Building2, Briefcase } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User, Company } from "@/../../shared/schema";
import logoUrl from "@assets/generated_images/Lakefront_Leadworks_logo_9f434e28.png";

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
    const crmPages = [
      { title: "CRM Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Pipeline Board", url: "/pipeline", icon: Kanban },
      { title: "Task Manager", url: "/tasks", icon: CheckSquare },
      { title: "Contacts", url: "/contacts", icon: Users },
      { title: "Activity Timeline", url: "/activity", icon: Activity },
    ];

    const adminPages = [
      { title: "Lead Management", url: "/lead-management", icon: Database },
      { title: "Upload Leads", url: "/admin", icon: Upload },
      { title: "Validation", url: "/validation", icon: Shield },
    ];

    const companyManagement = [
      { title: "Company Management", url: "/companies", icon: Building2 },
    ];

    if (isSuperAdmin) {
      return [...crmPages, ...adminPages, ...companyManagement];
    }

    if (isCompanyAdmin || isLegacyAdmin) {
      return [...crmPages, ...adminPages];
    }

    if (isAgent) {
      return crmPages;
    }

    if (isBuyer) {
      return [
        { title: "Dashboard", url: "/", icon: Home },
        { title: "My Leads", url: "/my-leads", icon: Briefcase },
      ];
    }

    return [{ title: "Dashboard", url: "/", icon: Home }];
  };

  const menuItems = getMenuItems();

  const getRoleLabel = () => {
    if (isSuperAdmin) return "Super Admin";
    if (isCompanyAdmin) return "Company Admin";
    if (isAgent) return "Agent Portal";
    if (isLegacyAdmin) return "Admin Portal";
    if (isBuyer) return "Premium MCA Leads";
    return "Portal";
  };

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
            <h2 className="font-bold text-lg bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent" data-testid="text-app-title">
              Lakefront Leadworks
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

  const role = user.role;
  const isSuperAdmin = role === "super_admin";
  const isCompanyAdmin = role === "company_admin";
  const isAgent = role === "agent";
  const isLegacyAdmin = role === "admin";
  const canAccessCRM = isSuperAdmin || isCompanyAdmin || isAgent || isLegacyAdmin;
  const canAccessAdmin = isSuperAdmin || isCompanyAdmin || isLegacyAdmin;

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
              <Route path="/" component={CrmDashboardPage} />
              
              {canAccessCRM && (
                <>
                  <Route path="/pipeline" component={PipelineBoardPage} />
                  <Route path="/tasks" component={TaskManagerPage} />
                  <Route path="/contacts" component={ContactManagerPage} />
                  <Route path="/activity" component={ActivityTimelinePage} />
                </>
              )}
              
              {canAccessAdmin && (
                <>
                  <Route path="/admin" component={SimplifiedAdminPage} />
                  <Route path="/lead-management" component={LeadManagementPage} />
                  <Route path="/validation" component={ValidationCenter} />
                </>
              )}

              {/* Buyer routes */}
              <Route path="/my-leads" component={MyLeadsPage} />

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
