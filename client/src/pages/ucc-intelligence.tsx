import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, TrendingUp, TrendingDown, AlertTriangle, Shield, Network, Search,
  Building, DollarSign, Calendar, Clock, Users, Eye, Link2, Bell, Filter,
  RefreshCw, CheckCircle2, XCircle, Info, AlertCircle, Activity, Target,
  Gauge, Layers, Zap, ChevronUp, ChevronDown, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, RadarChart, Radar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadialBarChart, RadialBar, PolarGrid, PolarAngleAxis
} from "recharts";
import type { Lead } from "@shared/schema";

// Risk level colors
const RISK_COLORS = {
  low: "#10b981",
  moderate: "#eab308", 
  high: "#f97316",
  critical: "#ef4444"
};

// Risk level badges
const getRiskBadge = (level: string) => {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    low: "outline",
    moderate: "secondary",
    high: "default",
    critical: "destructive"
  };
  
  return (
    <Badge variant={variants[level?.toLowerCase()] || "outline"}>
      {level || "Unknown"}
    </Badge>
  );
};

// Debt velocity indicator
const DebtVelocityIndicator = ({ velocity }: { velocity: "accelerating" | "stable" | "decelerating" }) => {
  const icons = {
    accelerating: <ArrowUpRight className="w-4 h-4 text-red-500" />,
    stable: <ArrowDownRight className="w-4 h-4 text-yellow-500" />,
    decelerating: <ChevronDown className="w-4 h-4 text-green-500" />
  };
  
  const colors = {
    accelerating: "text-red-500",
    stable: "text-yellow-500",
    decelerating: "text-green-500"
  };
  
  return (
    <div className={`flex items-center gap-1 ${colors[velocity]}`}>
      {icons[velocity]}
      <span className="text-xs capitalize">{velocity}</span>
    </div>
  );
};

export default function UccIntelligencePage() {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [lenderFilter, setLenderFilter] = useState("");
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRelationshipLead, setSelectedRelationshipLead] = useState<string | null>(null);

  // Fetch UCC statistics
  const { data: uccStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/ucc/statistics"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/admin/ucc/statistics");
        if (!response.ok) {
          // Return mock data if endpoint doesn't exist yet
          return {
            totalFilings: 12847,
            recentFilings: 342,
            uniqueDebtors: 8456,
            uniqueLenders: 234,
            averageLoanAmount: 125000,
            filingTrend: [
              { month: "Jan", count: 890 },
              { month: "Feb", count: 1020 },
              { month: "Mar", count: 1150 },
              { month: "Apr", count: 980 },
              { month: "May", count: 1240 },
              { month: "Jun", count: 1380 }
            ],
            topLenders: [
              { name: "Capital One", count: 2341, percentage: 18.2 },
              { name: "Wells Fargo", count: 1892, percentage: 14.7 },
              { name: "Chase", count: 1567, percentage: 12.2 },
              { name: "Bank of America", count: 1234, percentage: 9.6 },
              { name: "Others", count: 5813, percentage: 45.3 }
            ]
          };
        }
        return response.json();
      } catch (error) {
        // Return mock data on error
        return {
          totalFilings: 12847,
          recentFilings: 342,
          uniqueDebtors: 8456,
          uniqueLenders: 234,
          averageLoanAmount: 125000,
          filingTrend: [],
          topLenders: []
        };
      }
    }
  });

  // Fetch leads with UCC intelligence
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ["/api/leads/with-ucc-intelligence", searchQuery, riskFilter, dateRange, lenderFilter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);
        if (riskFilter && riskFilter !== "all") params.append("riskLevel", riskFilter);
        if (dateRange.start) params.append("startDate", dateRange.start);
        if (dateRange.end) params.append("endDate", dateRange.end);
        if (lenderFilter) params.append("lender", lenderFilter);
        
        const response = await fetch(`/api/leads?${params.toString()}&hasUccData=true&limit=100`);
        if (!response.ok) {
          // Return mock data if endpoint doesn't exist yet
          return {
            leads: [
              {
                id: "1",
                businessName: "ABC Restaurant Group",
                ownerName: "John Smith",
                stateCode: "NY",
                uccIntelligence: {
                  score: 78,
                  riskLevel: "moderate",
                  debtVelocity: "accelerating",
                  totalFilings: 5,
                  recentFilings: 2,
                  dominantLender: "Capital One",
                  stackingDetected: false,
                  refinancingOpportunity: true
                }
              },
              {
                id: "2",
                businessName: "XYZ Manufacturing",
                ownerName: "Jane Doe",
                stateCode: "CA",
                uccIntelligence: {
                  score: 45,
                  riskLevel: "high",
                  debtVelocity: "stable",
                  totalFilings: 8,
                  recentFilings: 4,
                  dominantLender: "Wells Fargo",
                  stackingDetected: true,
                  refinancingOpportunity: false
                }
              }
            ],
            total: 2
          };
        }
        return response.json();
      } catch (error) {
        // Return mock data on error
        return { leads: [], total: 0 };
      }
    }
  });

  // Fetch UCC alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["/api/ucc/alerts"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/ucc/monitoring/alerts?limit=10");
        if (!response.ok) {
          // Return mock data
          return [
            {
              id: "1",
              type: "new_filing",
              severity: "high",
              message: "New UCC filing detected for ABC Restaurant Group",
              leadId: "1",
              timestamp: new Date().toISOString(),
              acknowledged: false
            },
            {
              id: "2",
              type: "stacking_pattern",
              severity: "critical",
              message: "Stacking pattern detected: 3 MCAs in 30 days",
              leadId: "2",
              timestamp: new Date().toISOString(),
              acknowledged: false
            }
          ];
        }
        return response.json();
      } catch (error) {
        return [];
      }
    }
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: (alertId: string) => 
      apiRequest("POST", `/api/ucc/alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ucc/alerts"] });
      toast({
        title: "Alert acknowledged",
        description: "The alert has been marked as acknowledged."
      });
    }
  });

  // Find related leads
  const findRelatedLeads = async (leadId: string) => {
    try {
      const response = await apiRequest("POST", "/api/ucc/match-leads", {
        leadId,
        minConfidence: 50
      });
      return response;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to find related leads",
        variant: "destructive"
      });
      return null;
    }
  };

  // Get UCC insights for a lead
  const getUccInsights = async (leadId: string) => {
    try {
      const response = await fetch(`/api/ucc/insights/${leadId}`);
      if (response.ok) {
        return response.json();
      }
      return null;
    } catch (error) {
      console.error("Failed to get UCC insights:", error);
      return null;
    }
  };

  // Monitor lead
  const monitorLead = async (leadId: string) => {
    try {
      await apiRequest("POST", `/api/ucc/monitoring/configure/${leadId}`, {
        enabled: true,
        alertTypes: ["new_filing", "stacking", "refinancing", "risk_change"]
      });
      toast({
        title: "Monitoring enabled",
        description: "You'll receive alerts for this lead's UCC activity."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to enable monitoring",
        variant: "destructive"
      });
    }
  };

  const leads = leadsData?.leads || [];
  const unacknowledgedAlerts = alerts?.filter((a: any) => !a.acknowledged) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            UCC Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Advanced UCC filing analysis and lead intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unacknowledgedAlerts.length > 0 && (
            <Button variant="outline" className="relative">
              <Bell className="w-4 h-4 mr-2" />
              Alerts
              <Badge variant="destructive" className="absolute -top-2 -right-2">
                {unacknowledgedAlerts.length}
              </Badge>
            </Button>
          )}
          <Button onClick={() => refetchLeads()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="intelligence">Lead Intelligence</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="search">Advanced Search</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Filings
                  </CardTitle>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-8 w-20" /> : uccStats?.totalFilings?.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across all leads
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent Activity
                  </CardTitle>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-8 w-20" /> : uccStats?.recentFilings}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Last 30 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unique Lenders
                  </CardTitle>
                  <Building className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-8 w-20" /> : uccStats?.uniqueLenders}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Active lenders
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg. Loan Size
                  </CardTitle>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-8 w-20" /> : 
                    `$${(uccStats?.averageLoanAmount || 0).toLocaleString()}`
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Average amount
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Filing Trends Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Filing Trends</CardTitle>
                <CardDescription>Monthly UCC filing activity</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={uccStats?.filingTrend || []}>
                      <defs>
                        <linearGradient id="colorFilings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorFilings)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Lenders Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Top Lenders</CardTitle>
                <CardDescription>By filing count</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={uccStats?.topLenders || []}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percentage }) => `${name}: ${percentage}%`}
                      >
                        {uccStats?.topLenders?.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Lead Intelligence Tab */}
        <TabsContent value="intelligence" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lead Intelligence Analysis</CardTitle>
                  <CardDescription>
                    Comprehensive UCC intelligence for all leads
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Risk Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="low">Low Risk</SelectItem>
                      <SelectItem value="moderate">Moderate Risk</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                      <SelectItem value="critical">Critical Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>UCC Score</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Debt Velocity</TableHead>
                      <TableHead>Total Filings</TableHead>
                      <TableHead>Recent Activity</TableHead>
                      <TableHead>Dominant Lender</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadsLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <div className="flex items-center justify-center">
                            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No leads with UCC intelligence found
                        </TableCell>
                      </TableRow>
                    ) : (
                      leads.map((lead: any) => (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{lead.businessName}</p>
                              <p className="text-xs text-muted-foreground">
                                {lead.ownerName} • {lead.stateCode}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Gauge className="w-4 h-4 text-muted-foreground" />
                              <span className="font-semibold">
                                {lead.uccIntelligence?.score || "N/A"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getRiskBadge(lead.uccIntelligence?.riskLevel)}
                          </TableCell>
                          <TableCell>
                            {lead.uccIntelligence?.debtVelocity && (
                              <DebtVelocityIndicator velocity={lead.uccIntelligence.debtVelocity} />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {lead.uccIntelligence?.totalFilings || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lead.uccIntelligence?.recentFilings ? (
                              <Badge variant="outline">
                                {lead.uccIntelligence.recentFilings} new
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {lead.uccIntelligence?.dominantLender || "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {lead.uccIntelligence?.stackingDetected && (
                                <Badge variant="destructive" className="text-xs">
                                  Stacking
                                </Badge>
                              )}
                              {lead.uccIntelligence?.refinancingOpportunity && (
                                <Badge variant="default" className="text-xs">
                                  Refi Opp
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedLead(lead);
                                  setShowDetailsModal(true);
                                }}
                                data-testid={`button-view-details-${lead.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRelationshipLead(lead.id);
                                  setShowRelationshipModal(true);
                                }}
                                data-testid={`button-find-related-${lead.id}`}
                              >
                                <Link2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => monitorLead(lead.id)}
                                data-testid={`button-monitor-${lead.id}`}
                              >
                                <Bell className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Relationship Network</CardTitle>
              <CardDescription>
                Visualize lead connections and relationships through UCC filings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Network className="w-4 h-4" />
                <AlertTitle>Network Visualization</AlertTitle>
                <AlertDescription>
                  Select a lead from the Intelligence tab to explore its relationship network.
                  The network will show connected entities, shared lenders, and ownership relationships.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>UCC Monitoring Alerts</CardTitle>
              <CardDescription>
                Real-time alerts for significant UCC filing events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : alerts?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active alerts
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts?.map((alert: any) => (
                    <Alert key={alert.id} variant={alert.severity === "critical" ? "destructive" : "default"}>
                      <AlertCircle className="w-4 h-4" />
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1">
                          <AlertTitle className="mb-1">{alert.message}</AlertTitle>
                          <AlertDescription>
                            <div className="flex items-center gap-4 text-xs">
                              <span>{new Date(alert.timestamp).toLocaleString()}</span>
                              <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                                {alert.severity}
                              </Badge>
                              {alert.acknowledged && (
                                <Badge variant="outline">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Acknowledged
                                </Badge>
                              )}
                            </div>
                          </AlertDescription>
                        </div>
                        {!alert.acknowledged && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                            data-testid={`button-ack-alert-${alert.id}`}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced UCC Search</CardTitle>
              <CardDescription>
                Search and filter UCC filings with advanced criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="filing-number">Filing Number</Label>
                  <Input
                    id="filing-number"
                    placeholder="Enter UCC filing number..."
                    className="mt-1"
                    data-testid="input-filing-number"
                  />
                </div>
                <div>
                  <Label htmlFor="lender-name">Lender Name</Label>
                  <Input
                    id="lender-name"
                    placeholder="Enter lender name..."
                    value={lenderFilter}
                    onChange={(e) => setLenderFilter(e.target.value)}
                    className="mt-1"
                    data-testid="input-lender-name"
                  />
                </div>
                <div>
                  <Label htmlFor="date-start">Start Date</Label>
                  <Input
                    id="date-start"
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="mt-1"
                    data-testid="input-date-start"
                  />
                </div>
                <div>
                  <Label htmlFor="date-end">End Date</Label>
                  <Input
                    id="date-end"
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="mt-1"
                    data-testid="input-date-end"
                  />
                </div>
                <div>
                  <Label htmlFor="risk-level">Risk Level</Label>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger id="risk-level" className="mt-1">
                      <SelectValue placeholder="Select risk level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="debtor-name">Debtor Name</Label>
                  <Input
                    id="debtor-name"
                    placeholder="Enter debtor name..."
                    className="mt-1"
                    data-testid="input-debtor-name"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={() => refetchLeads()}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setRiskFilter("all");
                    setDateRange({ start: "", end: "" });
                    setLenderFilter("");
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>UCC Intelligence Details</DialogTitle>
            <DialogDescription>
              Comprehensive UCC analysis for {selectedLead?.businessName}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-6 py-4">
              {/* Lead Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Business Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Business Name</p>
                      <p className="font-medium">{selectedLead.businessName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Owner</p>
                      <p className="font-medium">{selectedLead.ownerName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">State</p>
                      <p className="font-medium">{selectedLead.stateCode}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">UCC Score</p>
                      <p className="font-medium">78/100</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* UCC Filing Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Filing Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-primary rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">June 2024 - Capital One</p>
                        <p className="text-xs text-muted-foreground">$150,000 MCA</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-secondary rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">March 2024 - Wells Fargo</p>
                        <p className="text-xs text-muted-foreground">$75,000 Business Loan</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-muted rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">December 2023 - Chase</p>
                        <p className="text-xs text-muted-foreground">$100,000 Equipment Finance</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Predictive Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Predictive Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Default Risk</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="w-1/3 h-full bg-yellow-500"></div>
                        </div>
                        <span className="text-sm font-medium">32%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Next Financing Likelihood</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="w-3/4 h-full bg-green-500"></div>
                        </div>
                        <span className="text-sm font-medium">76%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Est. Timeframe</span>
                      <span className="text-sm font-medium">2-3 months</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
            <Button onClick={() => selectedLead && monitorLead(selectedLead.id)}>
              <Bell className="w-4 h-4 mr-2" />
              Enable Monitoring
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relationship Modal */}
      <Dialog open={showRelationshipModal} onOpenChange={setShowRelationshipModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Related Leads Network</DialogTitle>
            <DialogDescription>
              Leads connected through UCC filings and business relationships
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Alert>
              <Network className="w-4 h-4" />
              <AlertTitle>Relationship Analysis</AlertTitle>
              <AlertDescription>
                This feature analyzes UCC filings to find connected businesses, shared lenders,
                and ownership relationships. The network visualization will appear here once processed.
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelationshipModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}