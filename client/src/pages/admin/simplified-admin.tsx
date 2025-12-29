import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, Shield, TrendingUp, Database, AlertCircle, 
  FileText, ChevronRight, Loader2, CheckCircle, Clock, Users
} from "lucide-react";
import { useLocation } from "wouter";

export default function SimplifiedAdminPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/dashboard'],
  }) as { data: any };

  // Fetch validation stats
  const { data: validationStats } = useQuery({
    queryKey: ['/api/validation/stats'],
  }) as { data: any };


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
        title: "Upload Successful",
        description: `${data.leadCount} leads uploaded successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/validation/stats'] });
      setIsUploading(false);
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent" 
            data-testid="heading-admin">
          Lead Management System
        </h1>
        <p className="text-lg text-muted-foreground">
          Upload and validate your pre-enriched funding leads
        </p>
      </div>

      {/* Lead Management CTA */}
      <Card className="mb-8 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Lead Management Center</h2>
              <p className="text-muted-foreground">
                View, sort, filter, and manage all your leads in one powerful interface
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setLocation('/lead-management')}
              className="gap-2"
              data-testid="button-go-to-lead-management"
            >
              <Database className="w-5 h-5" />
              Open Lead Management
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
              <Database className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.leadCount || 0}</div>
            <p className="text-xs text-muted-foreground">In database</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Validated</CardTitle>
              <Shield className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{validationStats?.fullyValidated || 0}</div>
            <p className="text-xs text-muted-foreground">Fully validated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ready to Sell</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{validationStats?.fullyValidated || 0}</div>
            <p className="text-xs text-muted-foreground">Premium quality</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Feature Card */}
      <div className="mb-8">
        {/* Validation Feature */}
        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation('/validation')}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
                  <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>Validation Center</CardTitle>
                  <CardDescription>Verify and validate lead data</CardDescription>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fully validated</span>
                <Badge variant="default">{validationStats?.fullyValidated || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Partially validated</span>
                <Badge variant="secondary">{validationStats?.partiallyValidated || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Validation rate</span>
                <span className="font-medium">{validationStats?.validationRate || 0}%</span>
              </div>
              <Button className="w-full" variant="default">
                Open Validation Center
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Upload Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Quick Upload</CardTitle>
              <CardDescription>Upload pre-enriched leads for validation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file-upload">Select CSV or Excel file</Label>
              <div className="mt-2 flex items-center gap-4">
                <Input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="flex-1"
                  data-testid="input-file-upload"
                />
                {isUploading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Supported formats: CSV, Excel (.xlsx, .xls)
              </p>
            </div>

            {/* Upload Tips */}
            <div className="rounded-lg bg-muted/50 p-4">
              <h4 className="font-medium text-sm mb-2">Required Fields</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Business Name - Company or organization name</li>
                <li>• Owner Name - Primary contact person</li>
                <li>• Email - Valid email address (optional but recommended)</li>
                <li>• Phone - Contact phone number (optional but recommended)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Process Flow */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="text-center">Simple Process</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-background shadow-sm">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <span className="font-medium">Upload Leads</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-background shadow-sm">
                <Shield className="w-4 h-4 text-green-600" />
              </div>
              <span className="font-medium">Validate</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-background shadow-sm">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <span className="font-medium">Ready!</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Validation Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(validationStats?.partiallyValidated || 0) > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">{validationStats?.partiallyValidated} need review</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">All validated</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm">All systems operational</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
