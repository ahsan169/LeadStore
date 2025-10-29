import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  RefreshCw,
  Upload,
  Filter,
  Download,
  Ban,
  Info,
  Phone,
  Mail,
  Building2,
  User,
  MapPin,
  AlertCircle,
  Brain,
  Shield,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface VerificationSession {
  id: string;
  filename: string;
  totalLeads: number;
  verifiedCount: number;
  warningCount: number;
  failedCount: number;
  duplicateCount: number;
  status: string;
  strictnessLevel: string;
  createdAt: string;
  expiresAt: string;
}

interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  formatted?: string;
}

interface VerificationResult {
  id: string;
  sessionId: string;
  rowNumber: number;
  leadData: any;
  status: 'verified' | 'warning' | 'failed';
  verificationScore: number;
  phoneValidation: ValidationResult;
  emailValidation: ValidationResult;
  businessNameValidation: ValidationResult;
  ownerNameValidation: ValidationResult;
  addressValidation: ValidationResult;
  isDuplicate: boolean;
  duplicateType?: string;
  duplicateLeadId?: string;
  issues: string[];
  warnings: string[];
  selectedForImport: boolean;
}

type FilterMode = 'all' | 'verified' | 'warning' | 'failed' | 'duplicates' | 'non_duplicates';

export default function VerifyLeadsPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // Get session ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');
  
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [activeTab, setActiveTab] = useState<string>('table');
  
  // Fetch verification session data
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/verification-session/', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session ID provided");
      const response = await fetch(`/api/admin/verification-session/${sessionId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch verification session');
      }
      return response.json();
    },
    enabled: !!sessionId,
    retry: false
  });
  
  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (selectedRowNumbers: number[]) => {
      const response = await apiRequest('POST', '/api/admin/import-verified', { 
        sessionId, 
        selectedRowNumbers 
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import successful",
        description: `${data.importedCount} leads imported successfully`,
      });
      navigate('/admin/leads');
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Enrichment mutation
  const enrichmentMutation = useMutation({
    mutationFn: async (params: { selectedRowNumbers: number[]; withEnrichment: boolean }) => {
      // First import the leads
      const importResponse = await apiRequest('POST', '/api/admin/import-verified', { 
        sessionId, 
        selectedRowNumbers: params.selectedRowNumbers 
      });
      const importData = await importResponse.json();
      
      if (params.withEnrichment && importData.batchId) {
        // Then enrich them
        const enrichResponse = await apiRequest('POST', '/api/enrichment/batch', {
          batchId: importData.batchId
        });
        const enrichData = await enrichResponse.json();
        return { ...importData, enriched: enrichData };
      }
      
      return importData;
    },
    onSuccess: (data) => {
      if (data.enriched) {
        toast({
          title: "Import & Enrichment successful",
          description: `${data.importedCount} leads imported and ${data.enriched.enrichedCount} enriched successfully (30% premium applied)`,
        });
      } else {
        toast({
          title: "Import successful",
          description: `${data.importedCount} leads imported successfully`,
        });
      }
      navigate('/admin/leads');
    },
    onError: (error: any) => {
      toast({
        title: "Operation failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Initialize selected rows when data loads
  useEffect(() => {
    if (data?.results) {
      const initialSelected = new Set<number>();
      data.results.forEach((result: VerificationResult) => {
        if (result.selectedForImport) {
          initialSelected.add(result.rowNumber);
        }
      });
      setSelectedRows(initialSelected);
    }
  }, [data]);
  
  // Filter results based on current filter mode
  const filteredResults = data?.results?.filter((result: VerificationResult) => {
    switch (filterMode) {
      case 'verified':
        return result.status === 'verified';
      case 'warning':
        return result.status === 'warning';
      case 'failed':
        return result.status === 'failed';
      case 'duplicates':
        return result.isDuplicate;
      case 'non_duplicates':
        return !result.isDuplicate;
      default:
        return true;
    }
  }) || [];
  
  // Handle select all in current filter
  const handleSelectAll = () => {
    const newSelected = new Set(selectedRows);
    filteredResults.forEach((result: VerificationResult) => {
      newSelected.add(result.rowNumber);
    });
    setSelectedRows(newSelected);
  };
  
  // Handle deselect all
  const handleDeselectAll = () => {
    setSelectedRows(new Set());
  };
  
  // Handle select all verified
  const handleSelectAllVerified = () => {
    const newSelected = new Set<number>();
    data?.results?.forEach((result: VerificationResult) => {
      if (result.status === 'verified' && !result.isDuplicate) {
        newSelected.add(result.rowNumber);
      }
    });
    setSelectedRows(newSelected);
  };
  
  // Handle select non-duplicates
  const handleSelectNonDuplicates = () => {
    const newSelected = new Set<number>();
    data?.results?.forEach((result: VerificationResult) => {
      if (!result.isDuplicate) {
        newSelected.add(result.rowNumber);
      }
    });
    setSelectedRows(newSelected);
  };
  
  // Handle row selection
  const toggleRowSelection = (rowNumber: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowNumber)) {
      newSelected.delete(rowNumber);
    } else {
      newSelected.add(rowNumber);
    }
    setSelectedRows(newSelected);
  };
  
  // Handle import
  const handleImport = () => {
    if (selectedRows.size === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead to import",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(Array.from(selectedRows));
  };
  
  // Handle enrich and import
  const handleEnrichAndImport = () => {
    if (selectedRows.size === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead to enrich and import",
        variant: "destructive",
      });
      return;
    }
    enrichmentMutation.mutate({
      selectedRowNumbers: Array.from(selectedRows),
      withEnrichment: true
    });
  };
  
  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };
  
  // Get status badge variant
  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'verified':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };
  
  if (!sessionId) {
    return (
      <div className="p-6">
        <Alert className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No verification session found. Please upload a file first.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg font-medium">Loading verification results...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const session = data?.session as VerificationSession;
  const results = data?.results as VerificationResult[];
  
  // Calculate progress
  const verifiedPercentage = (session.verifiedCount / session.totalLeads) * 100;
  const warningPercentage = (session.warningCount / session.totalLeads) * 100;
  const failedPercentage = (session.failedCount / session.totalLeads) * 100;
  
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-verify">
            Verify Leads
          </h1>
          <p className="text-muted-foreground">
            Review and approve leads from {session.filename}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/admin/upload-leads')}
            data-testid="button-cancel"
          >
            <Ban className="w-4 h-4 mr-2" />
            Cancel & Discard
          </Button>
          <Button
            variant="outline"
            onClick={handleEnrichAndImport}
            disabled={selectedRows.size === 0 || enrichmentMutation.isPending || importMutation.isPending}
            data-testid="button-enrich-import"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Enrich & Import (+30% Premium)
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedRows.size === 0 || importMutation.isPending}
            data-testid="button-import"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import {selectedRows.size} Selected Leads
          </Button>
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold" data-testid="text-total">
                  {session.totalLeads}
                </p>
              </div>
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Verified</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-verified">
                  {session.verifiedCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {verifiedPercentage.toFixed(1)}%
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warnings</p>
                <p className="text-2xl font-bold text-yellow-600" data-testid="text-warnings">
                  {session.warningCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {warningPercentage.toFixed(1)}%
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-failed">
                  {session.failedCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {failedPercentage.toFixed(1)}%
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Verification Progress</span>
              <span>{selectedRows.size} of {session.totalLeads} selected</span>
            </div>
            <Progress value={session.verifiedCount / session.totalLeads * 100} className="h-4" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>✅ Verified ({session.verifiedCount})</span>
              <span>⚠️ Warnings ({session.warningCount})</span>
              <span>❌ Failed ({session.failedCount})</span>
              <span>🔄 Duplicates ({session.duplicateCount})</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Controls and Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">Lead Verification Results</h2>
              <Badge variant="outline">
                Strictness: {session.strictnessLevel}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter */}
              <Select 
                value={filterMode} 
                onValueChange={(value: FilterMode) => setFilterMode(value)}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-filter">
                  <SelectValue placeholder="Filter leads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  <SelectItem value="verified">✅ Verified Only</SelectItem>
                  <SelectItem value="warning">⚠️ Warnings Only</SelectItem>
                  <SelectItem value="failed">❌ Failed Only</SelectItem>
                  <SelectItem value="duplicates">🔄 Duplicates</SelectItem>
                  <SelectItem value="non_duplicates">Non-Duplicates</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Bulk Actions */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                data-testid="button-select-all"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                data-testid="button-deselect-all"
              >
                Deselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllVerified}
                data-testid="button-select-verified"
              >
                Select Verified
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectNonDuplicates}
                data-testid="button-select-non-duplicates"
              >
                Select Non-Duplicates
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Results Table */}
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-16">Score</TableHead>
                  {results?.[0]?.leadData?.aiInsights && (
                    <TableHead className="w-20">
                      <div className="flex items-center gap-1">
                        <Brain className="w-3 h-3" />
                        <span>AI</span>
                      </div>
                    </TableHead>
                  )}
                  <TableHead>Business</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="min-w-[200px]">Issues & Insights</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((result: VerificationResult) => (
                  <TableRow 
                    key={result.id}
                    className={result.isDuplicate ? 'bg-muted/50' : ''}
                    data-testid={`row-${result.rowNumber}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedRows.has(result.rowNumber)}
                        onCheckedChange={() => toggleRowSelection(result.rowNumber)}
                        disabled={result.status === 'failed'}
                        data-testid={`checkbox-${result.rowNumber}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {result.rowNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(result.status)}
                        {result.isDuplicate && (
                          <RefreshCw className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(result.status)}>
                        {result.verificationScore}
                      </Badge>
                    </TableCell>
                    {results?.[0]?.leadData?.aiInsights && (
                      <TableCell>
                        {result.leadData?.aiInsights ? (
                          <div className="flex flex-col gap-1">
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "gap-1 text-xs",
                                result.leadData.aiInsights.confidenceScore >= 80 
                                  ? 'confidence-high'
                                  : result.leadData.aiInsights.confidenceScore >= 60 
                                  ? 'confidence-medium'
                                  : 'confidence-low'
                              )}
                            >
                              <Sparkles className="w-3 h-3" />
                              {result.leadData.aiInsights.confidenceScore}%
                            </Badge>
                            {result.leadData.aiInsights.riskAssessment?.score && (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "gap-1 text-xs",
                                  result.leadData.aiInsights.riskAssessment.score <= 30 
                                    ? 'risk-low'
                                    : result.leadData.aiInsights.riskAssessment.score <= 60 
                                    ? 'risk-medium'
                                    : 'risk-high'
                                )}
                              >
                                <Shield className="w-3 h-3" />
                                Risk: {result.leadData.aiInsights.riskAssessment.score}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate max-w-[150px]" title={result.leadData.businessName}>
                          {result.leadData.businessName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate max-w-[150px]" title={result.leadData.ownerName}>
                          {result.leadData.ownerName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm">
                          {result.phoneValidation?.formatted || result.leadData.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate max-w-[150px]" title={result.leadData.email}>
                          {result.leadData.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {result.issues.map((issue, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <XCircle className="w-3 h-3 text-red-600 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-red-600">{issue}</span>
                          </div>
                        ))}
                        {result.warnings.map((warning, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-yellow-600">{warning}</span>
                          </div>
                        ))}
                        {result.isDuplicate && (
                          <div className="flex items-start gap-1">
                            <RefreshCw className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-blue-600">
                              Duplicate ({result.duplicateType})
                            </span>
                          </div>
                        )}
                        {/* AI Insights */}
                        {result.leadData?.aiInsights && (
                          <>
                            {result.leadData.aiInsights.aiRecommendation && (
                              <div className="flex items-start gap-1 mt-2 pt-2 border-t">
                                <Brain className="w-3 h-3 text-purple-600 mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-purple-600 italic">
                                  {result.leadData.aiInsights.aiRecommendation}
                                </span>
                              </div>
                            )}
                            {result.leadData.aiInsights.industryClassification && (
                              <div className="flex items-start gap-1">
                                <TrendingUp className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-blue-600">
                                  Industry: {result.leadData.aiInsights.industryClassification.industry}
                                  {result.leadData.aiInsights.industryClassification.subIndustry && 
                                    ` - ${result.leadData.aiInsights.industryClassification.subIndustry}`}
                                </span>
                              </div>
                            )}
                            {result.leadData.aiInsights.suggestions?.length > 0 && (
                              <div className="flex items-start gap-1">
                                <Sparkles className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-green-600">
                                  {result.leadData.aiInsights.suggestions[0]}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {result.issues.length === 0 && result.warnings.length === 0 && !result.isDuplicate && !result.leadData?.aiInsights && (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                            <span className="text-xs text-green-600">No issues</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Show details modal (could be implemented)
                          console.log("Show details for", result);
                        }}
                        data-testid={`button-details-${result.rowNumber}`}
                      >
                        <Info className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredResults.length} of {results.length} leads
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedRows.size} leads selected for import
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}