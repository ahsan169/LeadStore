import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Upload, 
  FileText, 
  Link, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Database,
  TrendingUp,
  Building2,
  Calendar,
  DollarSign,
  AlertTriangle,
  Loader2,
  Download,
  Eye
} from "lucide-react";

interface UccUploadResult {
  success: boolean;
  message: string;
  stats: {
    totalProcessed: number;
    leadsMatched: number;
    leadsEnriched: number;
    errors: number;
  };
  errors: string[];
}

interface EnrichedLead {
  id: string;
  businessName: string;
  uccNumber: string;
  ownerName: string;
  city: string;
  state: string;
  securedParties: string;
  primaryLenderType: string;
  estimatedRevenue: number;
  filingCount: number;
  stackingRisk: string;
  businessMaturity: string;
  lastFilingDate: string;
  qualityScore: number;
}

export default function UccManager() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UccUploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Query for UCC stats
  const { data: uccStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/ucc/stats'],
    enabled: true
  });

  // Query for recently enriched leads
  const { data: enrichedLeads, isLoading: leadsLoading } = useQuery({
    queryKey: ['/api/leads/enriched'],
    queryFn: async () => {
      const response = await fetch('/api/leads?isEnriched=true&limit=20&sortBy=updatedAt');
      if (!response.ok) throw new Error('Failed to fetch enriched leads');
      const data = await response.json();
      return data.leads;
    }
  });

  // Mutation for uploading UCC file
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      setUploadProgress(10);
      
      const formData = new FormData();
      formData.append('file', file);
      
      setUploadProgress(30);
      
      const response = await fetch('/api/ucc/connect', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      setUploadProgress(80);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload UCC file');
      }
      
      setUploadProgress(100);
      return response.json();
    },
    onSuccess: (data: UccUploadResult) => {
      setUploadResult(data);
      setIsUploading(false);
      
      toast({
        title: "UCC Filings Processed",
        description: `${data.stats.leadsMatched} leads matched and ${data.stats.leadsEnriched} enriched`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ucc/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/enriched'] });
      
      // Reset after delay
      setTimeout(() => {
        setUploadProgress(0);
        setSelectedFile(null);
      }, 2000);
    },
    onError: (error: any) => {
      setIsUploading(false);
      setUploadProgress(0);
      
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">UCC Filing Manager</h1>
          <p className="text-muted-foreground mt-2">
            Upload UCC filings to automatically match and enrich your leads with valuable intelligence
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          Real Data Only
        </Badge>
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Upload UCC</TabsTrigger>
          <TabsTrigger value="enriched">Enriched Leads</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload UCC Filing Data</CardTitle>
              <CardDescription>
                Upload a CSV file containing UCC filings. The system will automatically match them to existing leads and enrich lead data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* File Upload Zone */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                <div className="flex flex-col items-center gap-4">
                  <Upload className="w-12 h-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop your UCC file here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      CSV format • Max 50MB • Real UCC data only
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    data-testid="input-file-ucc"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" asChild>
                      <span>Select File</span>
                    </Button>
                  </label>
                </div>
                
                {selectedFile && (
                  <div className="mt-4 p-3 bg-accent rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">{selectedFile.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleUpload}
                        disabled={isUploading}
                        data-testid="button-upload-ucc"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload & Connect
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Progress */}
              {uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing UCC filings...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}

              {/* Upload Results */}
              {uploadResult && (
                <Alert className={uploadResult.success ? "border-green-500" : "border-red-500"}>
                  <div className="flex items-start gap-3">
                    {uploadResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-2">
                      <AlertTitle>{uploadResult.message}</AlertTitle>
                      <AlertDescription>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Processed</p>
                            <p className="text-lg font-semibold">{uploadResult.stats.totalProcessed}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Matched</p>
                            <p className="text-lg font-semibold text-blue-600">
                              {uploadResult.stats.leadsMatched}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Enriched</p>
                            <p className="text-lg font-semibold text-green-600">
                              {uploadResult.stats.leadsEnriched}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Errors</p>
                            <p className="text-lg font-semibold text-red-600">
                              {uploadResult.stats.errors}
                            </p>
                          </div>
                        </div>
                        
                        {uploadResult.errors.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium mb-2">Errors:</p>
                            <ScrollArea className="h-24 w-full rounded border p-2">
                              {uploadResult.errors.map((error, idx) => (
                                <div key={idx} className="text-xs text-red-600">
                                  • {error}
                                </div>
                              ))}
                            </ScrollArea>
                          </div>
                        )}
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Expected Format Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Expected CSV Format</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Your UCC filing CSV should include these columns:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>ucc_number</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>debtor_name</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>secured_parties</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>filing_date</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>state</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>full_address</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enriched" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recently Enriched Leads</CardTitle>
              <CardDescription>
                Leads that have been enhanced with UCC intelligence
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : enrichedLeads?.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {enrichedLeads.map((lead: EnrichedLead) => (
                      <div key={lead.id} className="border rounded-lg p-4 hover-elevate">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              {lead.businessName}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {lead.city}, {lead.state} • UCC: {lead.uccNumber}
                            </p>
                          </div>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Score: {lead.qualityScore}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Owner</p>
                            <p className="text-sm font-medium">{lead.ownerName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Est. Revenue</p>
                            <p className="text-sm font-medium">
                              {lead.estimatedRevenue ? formatCurrency(lead.estimatedRevenue) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Filings</p>
                            <p className="text-sm font-medium">{lead.filingCount || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last Filing</p>
                            <p className="text-sm font-medium">
                              {formatDate(lead.lastFilingDate)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={lead.stackingRisk === 'high' ? 'destructive' : 
                                   lead.stackingRisk === 'medium' ? 'secondary' : 'default'}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {lead.stackingRisk || 'Low'} Risk
                          </Badge>
                          <Badge variant="outline">
                            {lead.primaryLenderType || 'Unknown'} Lender
                          </Badge>
                          <Badge variant="outline">
                            {lead.businessMaturity || 'Unknown'} Business
                          </Badge>
                        </div>
                        
                        {lead.securedParties && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Secured Parties</p>
                            <p className="text-sm">{lead.securedParties}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No enriched leads found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload UCC filings to start enriching your leads
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Filings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '...' : (uccStats?.totalFilings || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  All UCC filings processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Filings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '...' : (uccStats?.recentFilings || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Last 6 months
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Match Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '...' : 
                    uccStats?.totalFilings > 0 
                      ? `${Math.round((uccStats?.matchedFilings / uccStats?.totalFilings) * 100 || 0)}%`
                      : '0%'
                  }
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Filings matched to leads
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Enrichment Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '...' : 
                    uccStats?.totalFilings > 0 
                      ? `${Math.round((uccStats?.enrichedLeads / uccStats?.totalFilings) * 100 || 0)}%`
                      : '0%'
                  }
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Leads enriched with UCC data
                </p>
              </CardContent>
            </Card>
          </div>

          {uccStats?.filingsByType && Object.keys(uccStats.filingsByType).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Filing Types Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(uccStats.filingsByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{type}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}