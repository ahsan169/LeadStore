import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { 
  Loader2, Upload, Users, TrendingUp, Package, DollarSign, Database, 
  Check, X, AlertCircle, Calendar, Filter, Edit, Settings,
  ChevronDown, Search, Download, RefreshCw, Trash2, Save, FileText, Shield, Link2, Zap
} from "lucide-react";
import type { User, Lead, LeadBatch, Purchase, ProductTier } from "@shared/schema";
import { AdminEnrichmentConfig } from "@/components/AdminEnrichmentConfig";
import IntelligenceDashboard from "@/components/admin/intelligence-dashboard";
import PipelineInspector from "@/components/admin/pipeline-inspector";
import RulesManager from "@/components/admin/rules-manager";
import KnowledgeManager from "@/components/admin/knowledge-manager";
import EntityResolution from "@/components/admin/entity-resolution";
import LearningCenter from "@/components/admin/learning-center";
import LeadEnrichmentManager from "./lead-enrichment-manager";

export default function SimplifiedAdminPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uccFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingUcc, setIsUploadingUcc] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);

  // Fetch admin stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/dashboard'],
  });

  // Fetch detailed analytics
  const { data: detailedAnalytics } = useQuery({
    queryKey: ['/api/admin/analytics/detailed'],
  });

  // Fetch recent uploads
  const { data: batches } = useQuery<LeadBatch[]>({
    queryKey: ['/api/batches'],
  });

  // Fetch customers with details
  const { data: usersWithStats } = useQuery({
    queryKey: ['/api/admin/users/detailed'],
  });

  // Fetch all leads
  const { data: leadsData } = useQuery({
    queryKey: ['/api/admin/leads/all', searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      params.append('limit', '100');
      return fetch(`/api/admin/leads/all?${params}`, {
        credentials: 'include',
      }).then(res => res.json());
    },
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['/api/admin/settings'],
  });

  // Fetch UCC stats
  const { data: uccStats } = useQuery({
    queryKey: ['/api/admin/ucc/stats'],
  });

  // Fetch all UCC filings
  const { data: uccFilings } = useQuery({
    queryKey: ['/api/admin/ucc-filings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/ucc-filings', {
        credentials: 'include',
      });
      return response.json();
    },
  });

  // Handle file upload
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/batches/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `Uploaded ${data.leadCount} leads successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/detailed'] });
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  // Update user role mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users/detailed'] });
      setEditingUserId(null);
    },
    onError: () => {
      toast({ title: "Failed to update user", variant: "destructive" });
    },
  });

  // Update lead mutation
  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, updates }: { leadId: string; updates: any }) => {
      return apiRequest(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      toast({ title: "Lead updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/all'] });
      setEditingLeadId(null);
    },
    onError: () => {
      toast({ title: "Failed to update lead", variant: "destructive" });
    },
  });

  // Bulk action mutation
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, value }: { action: string; value?: any }) => {
      return apiRequest('/api/admin/leads/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ leadIds: selectedLeads, action, value }),
      });
    },
    onSuccess: () => {
      toast({ title: "Bulk action completed successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/all'] });
      setSelectedLeads([]);
    },
    onError: () => {
      toast({ title: "Failed to perform bulk action", variant: "destructive" });
    },
  });

  // Update tier mutation
  const updateTierMutation = useMutation({
    mutationFn: async ({ tierId, updates }: { tierId: string; updates: any }) => {
      return apiRequest(`/api/admin/settings/tier/${tierId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      toast({ title: "Tier updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      setEditingTierId(null);
    },
    onError: () => {
      toast({ title: "Failed to update tier", variant: "destructive" });
    },
  });

  // UCC upload mutation
  const uploadUccMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/admin/upload-ucc', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'UCC upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "UCC Data Uploaded!",
        description: `Processed ${data.summary?.totalRecords || 0} UCC filings. Matched ${data.summary?.matchedLeads || 0} leads.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ucc/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ucc-filings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/all'] });
      setIsUploadingUcc(false);
    },
    onError: (error: any) => {
      toast({
        title: "UCC Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploadingUcc(false);
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploading(true);
      uploadMutation.mutate(file);
    }
  };

  const handleUccFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploadingUcc(true);
      uploadUccMutation.mutate(file);
    }
  };

  // Format chart data
  const chartData = detailedAnalytics?.leadsByDate?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: item.count,
  })) || [];

  const revenueChartData = detailedAnalytics?.revenueTrends?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: item.revenue,
    purchases: item.purchases,
  })) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-admin">Admin Dashboard</h1>
        <p className="text-muted-foreground">Comprehensive admin panel for managing your marketplace</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stats?.stats?.totalLeads || 0}</span>
              <Database className="w-4 h-4 text-muted-foreground" />
            </div>
            {detailedAnalytics?.leadsByDate && detailedAnalytics.leadsByDate.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                +{detailedAnalytics.leadsByDate[detailedAnalytics.leadsByDate.length - 1].count} today
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">${stats?.stats?.totalRevenue || 0}</span>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </div>
            {detailedAnalytics?.revenueTrends && detailedAnalytics.revenueTrends.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                ${detailedAnalytics.revenueTrends[detailedAnalytics.revenueTrends.length - 1].revenue} today
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{usersWithStats?.length || 0}</span>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usersWithStats?.filter((u: any) => u.role === 'admin').length || 0} admins
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Lead Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stats?.stats?.averageQuality || 0}</span>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            {detailedAnalytics?.conversionRates && (
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round(detailedAnalytics.conversionRates.reduce((acc: number, cur: any) => 
                  acc + (cur.conversionRate || 0), 0) / detailedAnalytics.conversionRates.length)}% conversion
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="intelligence" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto p-1 gap-1">
          <TabsTrigger value="intelligence" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="resolution">Resolution</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="ucc">UCC</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="enrichment">Enrichment</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Intelligence Dashboard Tab */}
        <TabsContent value="intelligence" className="space-y-4">
          <IntelligenceDashboard />
        </TabsContent>

        {/* Pipeline Inspector Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <PipelineInspector />
        </TabsContent>

        {/* Rules Manager Tab */}
        <TabsContent value="rules" className="space-y-4">
          <RulesManager />
        </TabsContent>

        {/* Knowledge Manager Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeManager />
        </TabsContent>

        {/* Entity Resolution Tab */}
        <TabsContent value="resolution" className="space-y-4">
          <EntityResolution />
        </TabsContent>

        {/* Learning Center Tab */}
        <TabsContent value="learning" className="space-y-4">
          <LearningCenter />
        </TabsContent>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Lead File</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file containing your leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Drag and drop your file here, or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-upload"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Select File
                    </>
                  )}
                </Button>
              </div>

              {/* Recent Uploads */}
              {batches && batches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Recent Uploads</h3>
                  {batches.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{batch.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {batch.totalLeads} leads • {new Date(batch.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {batch.status || 'Ready'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Leads by Date</CardTitle>
                <CardDescription>New leads added over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" name="Leads" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>Revenue and purchases over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill="#8884d8" name="Revenue ($)" />
                    <Bar dataKey="purchases" fill="#82ca9d" name="Purchases" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Customers</CardTitle>
                <CardDescription>Highest spending customers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detailedAnalytics?.topCustomers?.map((customer: any, index: number) => (
                    <div key={customer.userId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{customer.username}</p>
                          <p className="text-sm text-muted-foreground">{customer.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${customer.totalRevenue}</p>
                        <p className="text-xs text-muted-foreground">
                          {customer.purchaseCount} purchases
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Rates by Tier</CardTitle>
                <CardDescription>Lead conversion performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detailedAnalytics?.conversionRates?.map((tier: any) => (
                    <div key={tier.tier} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">
                          {tier.tier || 'Unassigned'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {tier.sold}/{tier.total} sold ({tier.conversionRate}%)
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${tier.conversionRate || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user accounts and roles</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Purchases</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersWithStats?.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {editingUserId === user.id ? (
                          <Select
                            defaultValue={user.role}
                            onValueChange={(value) => {
                              updateUserMutation.mutate({ userId: user.id, role: value });
                            }}
                          >
                            <SelectTrigger className="w-24" data-testid={`select-role-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="buyer">Buyer</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>${user.totalSpent || 0}</TableCell>
                      <TableCell>{user.purchaseCount || 0}</TableCell>
                      <TableCell>
                        {editingUserId === user.id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUserId(null)}
                            data-testid={`button-cancel-${user.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUserId(user.id)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lead Management Tab */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lead Management</CardTitle>
                  <CardDescription>View and manage all leads in the system</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                    data-testid="input-search-leads"
                  />
                  {selectedLeads.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => bulkActionMutation.mutate({ action: 'markSold' })}
                        data-testid="button-mark-sold"
                      >
                        Mark Sold
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => bulkActionMutation.mutate({ action: 'markAvailable' })}
                        data-testid="button-mark-available"
                      >
                        Mark Available
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLeads(leadsData?.leads?.map((l: any) => l.id) || []);
                          } else {
                            setSelectedLeads([]);
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsData?.leads?.map((lead: Lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeads([...selectedLeads, lead.id]);
                            } else {
                              setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                            }
                          }}
                          data-testid={`checkbox-select-${lead.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.businessName}</TableCell>
                      <TableCell>{lead.ownerName}</TableCell>
                      <TableCell className="text-xs">{lead.email}</TableCell>
                      <TableCell className="text-xs">{lead.phone}</TableCell>
                      <TableCell>
                        {editingLeadId === lead.id ? (
                          <Input
                            type="number"
                            defaultValue={lead.qualityScore}
                            className="w-16"
                            onBlur={(e) => {
                              updateLeadMutation.mutate({
                                leadId: lead.id,
                                updates: { qualityScore: parseInt(e.target.value) }
                              });
                            }}
                            data-testid={`input-quality-${lead.id}`}
                          />
                        ) : (
                          <Badge variant="outline">{lead.qualityScore}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingLeadId === lead.id ? (
                          <Select
                            defaultValue={lead.tier || ''}
                            onValueChange={(value) => {
                              updateLeadMutation.mutate({
                                leadId: lead.id,
                                updates: { tier: value }
                              });
                            }}
                          >
                            <SelectTrigger className="w-24" data-testid={`select-tier-${lead.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gold">Gold</SelectItem>
                              <SelectItem value="platinum">Platinum</SelectItem>
                              <SelectItem value="diamond">Diamond</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className="capitalize">{lead.tier || 'None'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={lead.sold ? 'default' : 'secondary'}>
                          {lead.sold ? 'Sold' : 'Available'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editingLeadId === lead.id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingLeadId(null)}
                            data-testid={`button-save-${lead.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingLeadId(lead.id)}
                            data-testid={`button-edit-lead-${lead.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {leadsData?.total > 0 && (
                <div className="mt-4 text-sm text-muted-foreground text-center">
                  Showing {leadsData?.leads?.length || 0} of {leadsData?.total} leads
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* UCC Intelligence Tab */}
        <TabsContent value="ucc" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* UCC Stats Cards */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total UCC Filings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{uccStats?.totalFilings || 0}</span>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {uccStats?.matchedLeads || 0} matched to leads
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Debt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    ${((uccStats?.totalDebt || 0) / 100).toLocaleString()}
                  </span>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: ${((uccStats?.averageDebt || 0) / 100).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Risk Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Low Risk</span>
                    <span>{uccStats?.lowRisk || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-yellow-600">Medium Risk</span>
                    <span>{uccStats?.mediumRisk || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-red-600">High Risk</span>
                    <span>{uccStats?.highRisk || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Upload UCC Filings</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file containing UCC filing data to match against existing leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Upload UCC filing data (CSV or Excel format)
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Required columns: Debtor Name, Creditor, Amount, Filing Date
                </p>
                <input
                  ref={uccFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleUccFileSelect}
                  className="hidden"
                />
                <Button
                  onClick={() => uccFileInputRef.current?.click()}
                  disabled={isUploadingUcc}
                  data-testid="button-upload-ucc"
                >
                  {isUploadingUcc ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing UCC Data...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Select UCC File
                    </>
                  )}
                </Button>
              </div>

              {/* Recent UCC Filings */}
              {uccFilings && uccFilings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Recent UCC Filings</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Debtor</TableHead>
                        <TableHead>Creditor</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Filing Date</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Matched Lead</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uccFilings.slice(0, 10).map((filing: any) => (
                        <TableRow key={filing.id}>
                          <TableCell className="font-medium">{filing.debtorName}</TableCell>
                          <TableCell>{filing.securedParty}</TableCell>
                          <TableCell>${(filing.loanAmount / 100).toLocaleString()}</TableCell>
                          <TableCell>
                            {new Date(filing.filingDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                filing.riskLevel === 'low' ? 'secondary' :
                                filing.riskLevel === 'medium' ? 'outline' :
                                'destructive'
                              }
                            >
                              {filing.riskLevel || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {filing.leadId ? (
                              <div className="flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                <span className="text-sm">Matched</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">No match</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* UCC Intelligence Summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  UCC Intelligence Summary
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Active Liens</p>
                    <p className="font-bold">{uccStats?.activeFilings || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Terminated</p>
                    <p className="font-bold">{uccStats?.terminatedFilings || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Match Rate</p>
                    <p className="font-bold">
                      {uccStats?.totalFilings ? 
                        Math.round((uccStats.matchedLeads / uccStats.totalFilings) * 100) : 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p className="font-bold">
                      {uccStats?.lastUpdated ? 
                        new Date(uccStats.lastUpdated).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Overview</CardTitle>
              <CardDescription>All registered customers and their activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usersWithStats && usersWithStats.length > 0 ? (
                  usersWithStats.filter((u: any) => u.role === 'buyer').map((customer: any) => (
                    <div key={customer.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{customer.username}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">
                            {customer.purchaseCount || 0} purchases
                          </Badge>
                          <Badge variant="outline">
                            {customer.totalLeads || 0} leads
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">${customer.totalSpent || 0}</p>
                        {customer.lastPurchase && (
                          <p className="text-xs text-muted-foreground">
                            Last: {new Date(customer.lastPurchase).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">No customers yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest system activity and transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Recent Uploads */}
              <div>
                <h3 className="font-medium mb-3">Recent Uploads</h3>
                <div className="space-y-2">
                  {batches?.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{batch.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {batch.totalLeads} leads uploaded
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={batch.status === 'ready' ? 'default' : 'secondary'}>
                          {batch.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(batch.uploadedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Enrichment Tab */}
        <TabsContent value="enrichment" className="space-y-4">
          <LeadEnrichmentManager />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Pricing Tiers</CardTitle>
                <CardDescription>Configure pricing tiers and features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {settings?.tiers?.map((tier: ProductTier) => (
                  <div key={tier.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium capitalize">{tier.tier}</h4>
                      {editingTierId === tier.id ? (
                        <Button
                          size="sm"
                          onClick={() => setEditingTierId(null)}
                          data-testid={`button-save-tier-${tier.id}`}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTierId(tier.id)}
                          data-testid={`button-edit-tier-${tier.id}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Price</Label>
                        {editingTierId === tier.id ? (
                          <Input
                            type="number"
                            defaultValue={tier.price}
                            onBlur={(e) => {
                              updateTierMutation.mutate({
                                tierId: tier.id,
                                updates: { price: parseFloat(e.target.value) }
                              });
                            }}
                            data-testid={`input-price-${tier.id}`}
                          />
                        ) : (
                          <p className="font-bold">${tier.price}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Leads/Month</Label>
                        {editingTierId === tier.id ? (
                          <Input
                            type="number"
                            defaultValue={tier.leadsPerMonth}
                            onBlur={(e) => {
                              updateTierMutation.mutate({
                                tierId: tier.id,
                                updates: { leadsPerMonth: parseInt(e.target.value) }
                              });
                            }}
                            data-testid={`input-leads-${tier.id}`}
                          />
                        ) : (
                          <p className="font-bold">{tier.leadsPerMonth}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Min Quality</Label>
                        {editingTierId === tier.id ? (
                          <Input
                            type="number"
                            defaultValue={tier.minQualityScore}
                            onBlur={(e) => {
                              updateTierMutation.mutate({
                                tierId: tier.id,
                                updates: { minQualityScore: parseInt(e.target.value) }
                              });
                            }}
                            data-testid={`input-min-quality-${tier.id}`}
                          />
                        ) : (
                          <p>{tier.minQualityScore}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Max Quality</Label>
                        {editingTierId === tier.id ? (
                          <Input
                            type="number"
                            defaultValue={tier.maxQualityScore}
                            onBlur={(e) => {
                              updateTierMutation.mutate({
                                tierId: tier.id,
                                updates: { maxQualityScore: parseInt(e.target.value) }
                              });
                            }}
                            data-testid={`input-max-quality-${tier.id}`}
                          />
                        ) : (
                          <p>{tier.maxQualityScore}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch
                        checked={tier.isActive}
                        onCheckedChange={(checked) => {
                          updateTierMutation.mutate({
                            tierId: tier.id,
                            updates: { isActive: checked }
                          });
                        }}
                        data-testid={`switch-active-${tier.id}`}
                      />
                      <Label className="text-sm">Active</Label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upload Settings</CardTitle>
                <CardDescription>Configure file upload limits and formats</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Max File Size</Label>
                  <p className="text-2xl font-bold mt-1">
                    {settings?.uploadLimits?.maxFileSize 
                      ? `${settings.uploadLimits.maxFileSize / (1024 * 1024)}MB`
                      : '50MB'}
                  </p>
                </div>
                <div>
                  <Label>Allowed Formats</Label>
                  <div className="flex gap-2 mt-2">
                    {settings?.uploadLimits?.allowedFormats?.map((format: string) => (
                      <Badge key={format} variant="secondary">
                        {format}
                      </Badge>
                    )) || ['.csv', '.xlsx', '.xls'].map(format => (
                      <Badge key={format} variant="secondary">
                        {format}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}