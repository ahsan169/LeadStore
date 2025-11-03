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
import PricingPage from "@/pages/pricing";
import DashboardPage from "@/pages/dashboard";
import PurchasesPage from "@/pages/purchases";
import PurchaseTierPage from "@/pages/purchase-tier";
import PurchaseFlowPage from "@/pages/purchase-flow";
import PaymentSuccessPage from "@/pages/payment-success";
import PaymentCancelPage from "@/pages/payment-cancel";
import AdminDashboardPage from "@/pages/admin/admin-dashboard";
import UploadLeadsPage from "@/pages/admin/upload-leads";
import VerifyLeadsPage from "@/pages/admin/verify-leads";
import ManageLeadsPage from "@/pages/admin/manage-leads";
import CustomersPage from "@/pages/admin/customers";
import TiersPage from "@/pages/admin/tiers";
import ContactSubmissionsPage from "@/pages/admin/contact-submissions";
import ManageGuaranteesPage from "@/pages/admin/manage-guarantees";
import BulkManagementPage from "@/pages/admin/bulk-management";
import UccManagerPage from "@/pages/admin/ucc-manager";
import AnalyticsPage from "@/pages/analytics";
import IntegrationsPage from "@/pages/integrations";
import AlertsPage from "@/pages/alerts";
import LeadsPage from "@/pages/leads";
import GuaranteeReportsPage from "@/pages/guarantee-reports";
import CampaignsPage from "@/pages/campaigns";
import LeadActivationPage from "@/pages/lead-activation";
import DeveloperPage from "@/pages/developer";
import ApiDocsPage from "@/pages/api-docs";
import SmartSearchPage from "@/pages/smart-search";
import MLScoringPage from "@/pages/ml-scoring";
import CommandCenterPage from "@/pages/command-center";
import UccIntelligencePage from "@/pages/ucc-intelligence";
import LeadEnrichmentManagerPage from "@/pages/admin/lead-enrichment-manager";
import { Home, Package, Download, DollarSign, Users, Upload, Database, BarChart, Shield, LogOut, Tags, MessageSquare, Waves, TrendingUp, Link2, Bell, Search, ShieldCheck, Calculator, Send, Key, Book, Rocket, FileSearch, Brain } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@/../../shared/schema";
import logoUrl from "@assets/generated_images/Lakefront_Leadworks_logo_9f434e28.png";

// Engagement components
import { ExitIntentPopup } from "@/components/engagement/ExitIntentPopup";
import { FloatingActionButton } from "@/components/engagement/FloatingActionButton";
import { ActivityFeed } from "@/components/engagement/ActivityFeed";
import { NewsletterSlideIn } from "@/components/engagement/NewsletterSlideIn";
import { ChatWidget } from "@/components/engagement/ChatWidget";
import { StickyCTABar } from "@/components/engagement/StickyCTABar";
import { ProductTour } from "@/components/engagement/ProductTour";
import { StripeTestModeIndicator } from "@/components/StripeTestModeIndicator";
import { Badge } from "@/components/ui/badge";

// Alert Indicator Component
function AlertIndicator() {
  const [location, setLocation] = useLocation();
  const { data: unviewedCount } = useQuery<{ count: number }>({
    queryKey: ["/api/alerts/unviewed/count"],
    refetchInterval: 30000, // Check every 30 seconds
    enabled: !!queryClient.getQueryData(["/api/auth/me"]), // Only run if user is authenticated
  });
  
  if (!unviewedCount?.count || unviewedCount.count === 0) {
    return null;
  }
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocation("/alerts")}
      className="relative"
      data-testid="button-alert-indicator"
    >
      <Bell className="w-5 h-5" />
      <Badge 
        variant="destructive" 
        className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs"
      >
        {unviewedCount.count}
      </Badge>
    </Button>
  );
}

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
    { title: "Command Center", url: "/command-center", icon: BarChart },
    { title: "Lead Activation Hub", url: "/lead-activation", icon: Rocket },
    { title: "Lead Discovery", url: "/leads", icon: Search },
    { title: "Smart Search", url: "/smart-search", icon: Search },
    { title: "UCC Intelligence", url: "/ucc-intelligence", icon: Shield },
    { title: "Browse Leads", url: "/purchase", icon: Tags },
    { title: "Pricing", url: "/pricing", icon: DollarSign },
    { title: "My Purchases", url: "/purchases", icon: Package },
    { title: "Quality Guarantee", url: "/guarantee-reports", icon: ShieldCheck },
    { title: "Alerts", url: "/alerts", icon: Bell },
    { title: "ML Scoring", url: "/ml-scoring", icon: TrendingUp },
    { title: "API Docs", url: "/api-docs", icon: Book },
  ];

  const adminMenuItems = [
    { title: "Dashboard", url: "/admin/dashboard", icon: BarChart },
    { title: "Command Center", url: "/command-center", icon: BarChart },
    { title: "Lead Activation Hub", url: "/lead-activation", icon: Rocket },
    { title: "Lead Discovery", url: "/leads", icon: Search },
    { title: "Smart Search", url: "/smart-search", icon: Search },
    { title: "UCC Intelligence", url: "/ucc-intelligence", icon: Shield },
    { title: "Lead Enrichment", url: "/admin/lead-enrichment", icon: Brain },
    { title: "UCC Manager", url: "/admin/ucc-manager", icon: FileSearch },
    { title: "Upload Leads", url: "/admin/upload", icon: Upload },
    { title: "Manage Leads", url: "/admin/leads", icon: Database },
    { title: "Quality Guarantees", url: "/admin/manage-guarantees", icon: ShieldCheck },
    { title: "Pricing Tiers", url: "/admin/tiers", icon: Tags },
    { title: "Bulk Operations", url: "/admin/bulk-management", icon: Calculator },
    { title: "ML Scoring", url: "/ml-scoring", icon: TrendingUp },
    { title: "Customers", url: "/admin/customers", icon: Users },
    { title: "Contact Forms", url: "/admin/contact-submissions", icon: MessageSquare },
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
            <AlertIndicator />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              {/* Buyer routes */}
              <Route path="/" component={DashboardPage} />
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/command-center" component={CommandCenterPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/lead-activation" component={LeadActivationPage} />
              <Route path="/leads" component={LeadsPage} />
              <Route path="/pricing" component={PricingPage} />
              <Route path="/purchase" component={PurchaseFlowPage} />
              <Route path="/purchases" component={PurchasesPage} />
              <Route path="/campaigns" component={CampaignsPage} />
              <Route path="/guarantee-reports" component={GuaranteeReportsPage} />
              <Route path="/quality-guarantee" component={GuaranteeReportsPage} />
              <Route path="/alerts" component={AlertsPage} />
              <Route path="/integrations" component={IntegrationsPage} />
              <Route path="/crm-integrations" component={IntegrationsPage} />
              <Route path="/smart-search" component={SmartSearchPage} />
              <Route path="/ml-scoring" component={MLScoringPage} />
              <Route path="/ucc-intelligence" component={UccIntelligencePage} />
              <Route path="/developer" component={DeveloperPage} />
              <Route path="/api-docs" component={ApiDocsPage} />
              <Route path="/purchase/:tier" component={PurchaseTierPage} />
              <Route path="/payment-success" component={PaymentSuccessPage} />
              <Route path="/payment-cancel" component={PaymentCancelPage} />

              {/* Admin routes */}
              {user.role === "admin" && (
                <>
                  <Route path="/admin" component={AdminDashboardPage} />
                  <Route path="/admin/dashboard" component={AdminDashboardPage} />
                  <Route path="/admin/lead-enrichment" component={LeadEnrichmentManagerPage} />
                  <Route path="/admin/ucc-manager" component={UccManagerPage} />
                  <Route path="/admin/upload" component={UploadLeadsPage} />
                  <Route path="/admin/verify-leads" component={VerifyLeadsPage} />
                  <Route path="/admin/leads" component={ManageLeadsPage} />
                  <Route path="/admin/manage-guarantees" component={ManageGuaranteesPage} />
                  <Route path="/admin/tiers" component={TiersPage} />
                  <Route path="/admin/customers" component={CustomersPage} />
                  <Route path="/admin/contact-submissions" component={ContactSubmissionsPage} />
                  <Route path="/admin/bulk-management" component={BulkManagementPage} />
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
        
        {/* Global engagement components */}
        <ExitIntentPopup />
        <FloatingActionButton />
        <ActivityFeed />
        <NewsletterSlideIn />
        <ChatWidget />
        <StickyCTABar />
        <ProductTour autoStart={false} />
        
        {/* Stripe Test Mode Indicator */}
        <StripeTestModeIndicator />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
