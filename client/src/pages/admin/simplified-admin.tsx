import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Users, TrendingUp, Package, DollarSign, Database, Check, X, AlertCircle } from "lucide-react";
import type { User, Lead, LeadBatch, Purchase } from "@shared/schema";

export default function SimplifiedAdminPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch admin stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/dashboard'],
  });

  // Fetch recent uploads
  const { data: batches } = useQuery<LeadBatch[]>({
    queryKey: ['/api/batches'],
  });

  // Fetch customers
  const { data: customers } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Fetch recent purchases
  const { data: purchases } = useQuery<Purchase[]>({
    queryKey: ['/api/purchases/all'],
    queryFn: async () => {
      const response = await fetch('/api/purchases/all', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch purchases');
      return response.json();
    },
  });

  // Handle file upload
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        uploadedAt: new Date().toISOString(),
      }));

      const response = await fetch('/api/upload-batch', {
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploading(true);
      uploadMutation.mutate(file);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-admin">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage leads, customers, and monitor your business</p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{customers?.length || 0}</span>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
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
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="upload">Upload Leads</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Lead File</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file containing your leads. The file should include columns for:
                business name, owner name, phone, email, address, city, state, zip code, industry, annual revenue, and credit score.
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
                  {batches.slice(0, 3).map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{batch.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {batch.leadCount} leads • {new Date(batch.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {batch.status || 'Processed'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                All registered customers and their purchase history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {customers && customers.length > 0 ? (
                  customers.map((customer) => (
                    <div key={customer.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{customer.username}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={customer.role === 'admin' ? 'default' : 'secondary'}>
                          {customer.role}
                        </Badge>
                        <Badge variant="outline">
                          {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}
                        </Badge>
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
        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Purchases</CardTitle>
              <CardDescription>
                Latest purchases and transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {purchases && purchases.length > 0 ? (
                  purchases.slice(0, 10).map((purchase) => (
                    <div key={purchase.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">
                          {purchase.tier?.toUpperCase()} Package
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {purchase.leadCount} leads • ${purchase.totalAmount}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={purchase.status === 'fulfilled' ? 'default' : 'secondary'}>
                          {purchase.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(purchase.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">No purchases yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}