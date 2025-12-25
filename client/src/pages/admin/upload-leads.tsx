import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  TrendingUp,
  Users,
  Sparkles,
  Brain,
  Zap,
  Clock,
  Activity,
  Loader2,
  Wifi,
  WifiOff,
  Cloud,
  Link,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WizardStep = 'upload' | 'validate' | 'process' | 'complete';

interface VerificationProgress {
  totalLeads: number;
  processedLeads: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  estimatedTimeRemaining: number;
  status: 'initializing' | 'processing' | 'completing' | 'done' | 'error';
  message: string;
}

interface ValidationResult {
  total: number;
  valid: number;
  errors: Array<{ row: number; error: string; data: any }>;
  warnings: Array<{ row: number; warning: string; data: any }>;
}

interface UploadSummary {
  totalLeads: number;
  averageQualityScore: number;
  tierDistribution: {
    gold: number;
    platinum: number;
    diamond: number;
  };
  validationResults: ValidationResult;
}

export default function UploadLeadsPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batchId, setBatchId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [generatingTestLeads, setGeneratingTestLeads] = useState(false);
  const [useAiVerification, setUseAiVerification] = useState(true);
  const [strictnessLevel, setStrictnessLevel] = useState<'strict' | 'moderate' | 'lenient'>('moderate');
  const [useEnrichment, setUseEnrichment] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [driveProgress, setDriveProgress] = useState<any>(null);
  const [googleDriveConnected, setGoogleDriveConnected] = useState<boolean | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // Check Google Drive connection status on mount
  useEffect(() => {
    fetch('/api/admin/google-drive/validate', {
      credentials: 'include'
    })
    .then(res => res.json())
    .then(data => {
      setGoogleDriveConnected(data.connected);
    })
    .catch(err => {
      console.error('Failed to check Google Drive connection:', err);
      setGoogleDriveConnected(false);
    });
  }, []);

  // Setup WebSocket connection for real-time progress
  useEffect(() => {
    if (!uploading) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket connected for verification progress');
      setWsConnected(true);
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'verification-progress' && message.sessionId === sessionId) {
          setVerificationProgress(message.data);
          
          // Show stage transitions
          if (message.data.status === 'done') {
            toast({
              title: "✅ Verification Complete!",
              description: `Successfully verified ${message.data.totalLeads} leads`,
            });
          } else if (message.data.status === 'error') {
            toast({
              title: "❌ Verification Error",
              description: message.data.message,
              variant: "destructive",
            });
          }
        } else if (message.type === 'google-drive-progress') {
          setDriveProgress(message.data);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    };
    
    wsRef.current = ws;
    
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [uploading, sessionId, toast]);

  const steps: WizardStep[] = ['upload', 'validate', 'process', 'complete'];
  const stepLabels = {
    upload: 'Upload',
    validate: 'Validate',
    process: 'Process',
    complete: 'Complete',
  };

  const getCurrentStepIndex = () => steps.indexOf(currentStep);
  const getProgress = () => ((getCurrentStepIndex() + 1) / steps.length) * 100;

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    const isValidFile = droppedFile && (
      droppedFile.name.endsWith('.csv') || 
      droppedFile.name.endsWith('.xlsx') || 
      droppedFile.name.endsWith('.xls')
    );
    
    if (isValidFile) {
      setFile(droppedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleGoogleDriveUpload = async () => {
    if (!driveLink) {
      toast({
        title: "No Google Drive link provided",
        description: "Please enter a valid Google Drive sharing link",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setCurrentStep('validate');
    setDriveProgress(null);

    try {
      const response = await fetch('/api/admin/upload-ucc-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ driveLink }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        console.error('Google Drive upload error:', error);
        
        throw new Error(error.details || error.error || 'Upload failed');
      }

      const data = await response.json();
      
      toast({
        title: "✅ UCC Data Imported Successfully",
        description: data.message || `Processed ${data.summary.totalRecords} UCC records`,
      });

      // Show summary
      setSummary({
        totalLeads: data.summary.totalLeads || data.summary.totalRecords, // Use totalLeads if available (from UCC), else totalRecords
        averageQualityScore: 0,
        tierDistribution: {
          gold: 0,
          platinum: 0,
          diamond: 0,
        },
        validationResults: {
          total: data.summary.totalRecords,
          valid: data.summary.validRecords || data.summary.totalRecords,
          errors: [],
          warnings: [],
        },
      });
      
      setCurrentStep('complete');
      
    } catch (error: any) {
      console.error("Google Drive upload error:", error);
      setCurrentStep('upload');
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while processing your Google Drive file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setDriveProgress(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV or Excel file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setCurrentStep('validate');
    setVerificationProgress(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add AI enrichment options
      if (useAiVerification) {
        formData.append('addQualityScore', 'true');
        formData.append('addConfidenceScore', 'true');
        formData.append('addPreviousMCA', 'true');
        formData.append('addFundingUrgency', 'true');
        formData.append('addExclusivity', 'true');
        formData.append('addLeadAge', 'true');
      }

      // Choose endpoint based on AI verification toggle
      const endpoint = useAiVerification 
        ? `/api/admin/verify-upload-ai?strictness=${strictnessLevel}`
        : `/api/admin/verify-upload?strictness=${strictnessLevel}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        console.error('Upload error:', error);
        
        // Provide specific error messages based on the error
        let errorMessage = error.error || 'Upload failed';
        if (errorMessage.includes('File format')) {
          errorMessage = 'Invalid file format. Please upload a CSV or Excel file.';
        } else if (errorMessage.includes('WebSocket')) {
          errorMessage = 'Connection error. Please try again.';
        } else if (errorMessage.includes('OpenAI')) {
          errorMessage = 'AI verification service temporarily unavailable. Please try again.';
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json() as { 
        success: boolean; 
        sessionId: string; 
        summary: {
          totalLeads: number;
          verifiedCount: number;
          warningCount: number;
          failedCount: number;
          duplicateCount: number;
          strictnessLevel: string;
          averageConfidenceScore?: number;
          aiPowered?: boolean;
        }
      };
      
      // Store session ID for WebSocket tracking
      setSessionId(data.sessionId);
      
      // Show verification in progress
      setCurrentStep('process');
      
      // Wait for WebSocket completion or timeout after 60 seconds
      const redirectTimeout = setTimeout(() => {
        if (verificationProgress?.status !== 'done') {
          // Redirect even if WebSocket didn't complete
          window.location.href = `/admin/verify-leads?session=${data.sessionId}`;
        }
      }, 60000);
      
      // Watch for completion via WebSocket
      const checkInterval = setInterval(() => {
        if (verificationProgress?.status === 'done') {
          clearInterval(checkInterval);
          clearTimeout(redirectTimeout);
          
          setTimeout(() => {
            const aiDescription = data.summary.aiPowered 
              ? ` AI confidence: ${data.summary.averageConfidenceScore}%.`
              : '';
            
            toast({
              title: useAiVerification ? "AI Verification complete" : "Verification complete",
              description: `${data.summary.totalLeads} leads verified.${aiDescription} Redirecting to review page...`,
            });
            
            // Redirect to verification preview page with session ID
            window.location.href = `/admin/verify-leads?session=${data.sessionId}`;
          }, 1000);
        }
      }, 500);

    } catch (error: any) {
      console.error("Upload error:", error);
      setCurrentStep('upload');
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while processing your file",
        variant: "destructive",
      });
      setUploading(false);
    }
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setFile(null);
    setBatchId('');
    setSummary(null);
  };

  const handleGenerateTestLeads = async () => {
    setGeneratingTestLeads(true);
    
    try {
      const response = await fetch('/api/admin/generate-test-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate test leads');
      }

      const data = await response.json();
      
      toast({
        title: "Test leads generated successfully",
        description: `Generated ${data.distribution.total} test leads (Gold: ${data.distribution.gold}, Platinum: ${data.distribution.platinum}, Diamond: ${data.distribution.diamond})`,
      });

      // Optionally redirect to batch details
      if (data.batchId) {
        setBatchId(data.batchId);
        setSummary({
          totalLeads: data.distribution.total,
          averageQualityScore: parseFloat(data.distribution.averageQualityScore),
          tierDistribution: {
            gold: data.distribution.gold,
            platinum: data.distribution.platinum,
            diamond: data.distribution.diamond,
          },
          validationResults: {
            total: data.distribution.total,
            valid: data.distribution.total,
            errors: [],
            warnings: [],
          },
        });
        setCurrentStep('complete');
      }
    } catch (error: any) {
      console.error("Generate test leads error:", error);
      toast({
        title: "Failed to generate test leads",
        description: error.message || "An error occurred while generating test leads",
        variant: "destructive",
      });
    } finally {
      setGeneratingTestLeads(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-hero-kingdom min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-3xl font-serif font-bold text-gradient-royal" data-testid="heading-upload">
            Upload Lead Batch
          </h1>
          <p className="text-muted-foreground">Upload and process new MCA leads</p>
        </div>
        {/* Test data generation removed - working with real data only */}
      </div>
      
      <div className="divider-elegant" />

      {/* Progress Indicator */}
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <div 
              key={step}
              className="flex items-center"
            >
              <div 
                className={`flex items-center gap-2 ${
                  index <= getCurrentStepIndex() 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                }`}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < getCurrentStepIndex()
                      ? 'bg-primary text-primary-foreground'
                      : index === getCurrentStepIndex()
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                  data-testid={`step-indicator-${step}`}
                >
                  {index < getCurrentStepIndex() ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-sm font-medium hidden sm:inline">
                  {stepLabels[step]}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div 
                  className={`w-12 h-0.5 mx-2 ${
                    index < getCurrentStepIndex() 
                      ? 'bg-primary' 
                      : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <Progress value={getProgress()} className="h-2" data-testid="progress-bar" />
      </div>

      {/* Step 1: Upload */}
      {currentStep === 'upload' && (
        <Card className="max-w-2xl card-kingdom animate-slide-up">
          <CardHeader>
            <h2 className="text-xl font-serif font-semibold">Step 1: Import UCC Data</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="local" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Local File Upload
                </TabsTrigger>
                <TabsTrigger value="drive" className="gap-2">
                  <Cloud className="w-4 h-4" />
                  Google Drive Import
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="local" className="space-y-6 mt-6">
                {/* Drag and Drop Zone */}
                <div 
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover-elevate'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="dropzone"
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-lg font-medium">
                  {isDragging ? 'Drop your file here' : 'Drag and drop your CSV or Excel file'}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click below to browse
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
                data-testid="input-file"
              />
              <label htmlFor="file-input">
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('file-input')?.click();
                  }}
                  data-testid="button-browse"
                >
                  Browse Files
                </Button>
              </label>
            </div>

            {/* AI Verification Options */}
            <div className="border rounded-lg p-4 space-y-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="ai-toggle" className="text-base font-semibold flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-600" />
                    AI-Powered Verification
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Use OpenAI for advanced lead verification with confidence scoring
                  </p>
                </div>
                <Switch
                  id="ai-toggle"
                  checked={useAiVerification}
                  onCheckedChange={setUseAiVerification}
                  className="data-[state=checked]:bg-purple-600"
                  data-testid="switch-ai-verification"
                />
              </div>

              {useAiVerification && (
                <div className="space-y-3 pt-3 border-t">
                  <Label className="text-sm font-medium">Verification Strictness</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={strictnessLevel === 'lenient' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStrictnessLevel('lenient')}
                      className="gap-1"
                      data-testid="button-strictness-lenient"
                    >
                      <Zap className="w-3 h-3" />
                      Lenient
                    </Button>
                    <Button
                      type="button"
                      variant={strictnessLevel === 'moderate' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStrictnessLevel('moderate')}
                      data-testid="button-strictness-moderate"
                    >
                      Moderate
                    </Button>
                    <Button
                      type="button"
                      variant={strictnessLevel === 'strict' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStrictnessLevel('strict')}
                      data-testid="button-strictness-strict"
                    >
                      Strict
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {strictnessLevel === 'lenient' && 'More forgiving - accepts most leads with minor issues'}
                    {strictnessLevel === 'moderate' && 'Balanced approach - flags significant issues'}
                    {strictnessLevel === 'strict' && 'Maximum accuracy - only accepts high-quality leads'}
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-blue-100 dark:bg-blue-950/50 rounded">
                    <Sparkles className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-medium text-blue-900 dark:text-blue-100">AI Features:</p>
                      <ul className="space-y-0.5 text-blue-800 dark:text-blue-200 mt-1">
                        <li>• Business legitimacy analysis</li>
                        <li>• Intelligent duplicate detection</li>
                        <li>• Risk scoring and insights</li>
                        <li>• Data correction suggestions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lead Enrichment Options */}
            <div className="border rounded-lg p-4 space-y-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enrichment-toggle" className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    Lead Enrichment
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically append business data to increase lead value
                  </p>
                </div>
                <Switch
                  id="enrichment-toggle"
                  checked={useEnrichment}
                  onCheckedChange={setUseEnrichment}
                  className="data-[state=checked]:bg-green-600"
                  data-testid="switch-lead-enrichment"
                />
              </div>

              {useEnrichment && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-950/50 rounded">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <div className="text-xs">
                      <p className="font-medium text-yellow-900 dark:text-yellow-100">30% Premium Applied</p>
                      <p className="text-yellow-800 dark:text-yellow-200">Enriched leads include additional business data and are priced at a 30% premium</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-green-100 dark:bg-green-950/50 rounded">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-medium text-green-900 dark:text-green-100">Enrichment Data Includes:</p>
                      <ul className="space-y-0.5 text-green-800 dark:text-green-200 mt-1">
                        <li>• Social media profiles (LinkedIn, Twitter)</li>
                        <li>• Company size and employee count</li>
                        <li>• Year founded and business history</li>
                        <li>• NAICS code and industry details</li>
                        <li>• Website status and contact info</li>
                        <li>• Risk indicators and confidence scores</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Selected File Info */}
            {file && (
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <FileText className="w-8 h-8 text-primary" />
                <div className="flex-1">
                  <div className="font-medium" data-testid="text-filename">{file.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  data-testid="button-upload"
                  className={useAiVerification ? "gap-2" : ""}
                >
                  {useAiVerification && <Brain className="w-4 h-4" />}
                  {uploading ? "Processing..." : useAiVerification ? "AI Verify & Process" : "Upload & Process"}
                </Button>
              </div>
            )}

            {/* File Format Guide */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold">Required Columns (CSV/Excel):</h3>
              <ul className="text-sm space-y-1 text-muted-foreground font-mono">
                <li>• businessName (required)</li>
                <li>• ownerName (required)</li>
                <li>• email (required)</li>
                <li>• phone (required)</li>
                <li>• industry (optional)</li>
                <li>• annualRevenue (optional)</li>
                <li>• requestedAmount (optional)</li>
                <li>• timeInBusiness (optional)</li>
                <li>• creditScore (optional)</li>
              </ul>
            </div>
              </TabsContent>

              <TabsContent value="drive" className="space-y-6 mt-6">
                {/* Google Drive Connection Status */}
                {googleDriveConnected === false && (
                  <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <AlertDescription>
                      Google Drive is not connected. Please connect Google Drive from the integrations panel to use this feature.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Google Drive Link Input */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="drive-link">Google Drive Link</Label>
                    <div className="flex gap-2">
                      <Input
                        id="drive-link"
                        placeholder="https://drive.google.com/file/d/..."
                        value={driveLink}
                        onChange={(e) => setDriveLink(e.target.value)}
                        disabled={uploading}
                        className="flex-1"
                        data-testid="input-drive-link"
                      />
                      <Button
                        onClick={handleGoogleDriveUpload}
                        disabled={!driveLink || uploading || googleDriveConnected === false}
                        className="gap-2"
                        data-testid="button-drive-import"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Import UCC Data
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share the file with "Anyone with the link" permission
                    </p>
                  </div>

                  {/* Download Progress */}
                  {driveProgress && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {driveProgress.status === 'downloading' ? 'Downloading...' : 
                               driveProgress.status === 'complete' ? 'Download Complete' :
                               'Error'}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {driveProgress.percentage}%
                            </span>
                          </div>
                          <Progress value={driveProgress.percentage} />
                          {driveProgress.bytesDownloaded > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {(driveProgress.bytesDownloaded / 1024 / 1024).toFixed(1)} MB / 
                              {(driveProgress.totalBytes / 1024 / 1024).toFixed(1)} MB
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Supported Formats */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold">Supported File Formats:</h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        CSV files (.csv)
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Excel files (.xlsx, .xls)
                      </li>
                      <li className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        ZIP archives (containing CSV/Excel files)
                      </li>
                    </ul>
                  </div>

                  {/* UCC Data Info */}
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Link className="w-4 h-4 text-blue-600" />
                      UCC Filing Data
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Import UCC filing records to match against existing leads and analyze MCA eligibility signals.
                    </p>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Debtor name matching</li>
                      <li>• Filing date analysis</li>
                      <li>• Secured party identification</li>
                      <li>• Collateral assessment</li>
                      <li>• MCA eligibility scoring</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Validation */}
      {currentStep === 'validate' && summary && (
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-xl font-semibold">Step 2: Validation Results</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-2xl font-bold" data-testid="text-total-rows">
                      {summary.validationResults.total}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Rows</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold text-green-600" data-testid="text-valid-leads">
                      {summary.validationResults.valid}
                    </div>
                    <div className="text-sm text-muted-foreground">Valid Leads</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                    <div className="text-2xl font-bold text-red-600" data-testid="text-errors">
                      {summary.validationResults.errors.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Errors</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Errors List */}
            {summary.validationResults.errors.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  Validation Errors ({summary.validationResults.errors.length})
                </h3>
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {summary.validationResults.errors.slice(0, 10).map((error, i) => (
                    <div key={i} className="text-sm py-1" data-testid={`error-${i}`}>
                      <span className="font-medium">Row {error.row}:</span> {error.error}
                    </div>
                  ))}
                  {summary.validationResults.errors.length > 10 && (
                    <div className="text-sm text-muted-foreground mt-2">
                      ... and {summary.validationResults.errors.length - 10} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Warnings List */}
            {summary.validationResults.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Warnings ({summary.validationResults.warnings.length})
                </h3>
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {summary.validationResults.warnings.slice(0, 10).map((warning, i) => (
                    <div key={i} className="text-sm py-1" data-testid={`warning-${i}`}>
                      <span className="font-medium">Row {warning.row}:</span> {warning.warning}
                    </div>
                  ))}
                  {summary.validationResults.warnings.length > 10 && (
                    <div className="text-sm text-muted-foreground mt-2">
                      ... and {summary.validationResults.warnings.length - 10} more warnings
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Processing */}
      {currentStep === 'process' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600 animate-pulse" />
              Step 3: AI Verification in Progress
            </h2>
            {wsConnected && (
              <Badge variant="outline" className="w-fit gap-1 border-green-500 text-green-600">
                <Wifi className="w-3 h-3" />
                Live Updates
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enhanced Progress Bar Section */}
            {verificationProgress ? (
              <div className="space-y-6">
                {/* Main Progress Bar */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary animate-pulse" />
                      Processing Leads
                    </span>
                    <span className="text-muted-foreground">
                      {verificationProgress.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={verificationProgress.percentage} 
                    className="h-3 bg-muted"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{verificationProgress.processedLeads} / {verificationProgress.totalLeads} leads</span>
                    <span>Batch {verificationProgress.currentBatch} of {verificationProgress.totalBatches}</span>
                  </div>
                </div>

                {/* Status Cards Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardContent className="pt-4 pb-4 px-3">
                      <div className="flex flex-col items-center space-y-1">
                        <Users className="w-5 h-5 text-blue-600" />
                        <div className="text-lg font-bold text-blue-600">
                          {verificationProgress.processedLeads}
                        </div>
                        <div className="text-xs text-muted-foreground">Processed</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20">
                    <CardContent className="pt-4 pb-4 px-3">
                      <div className="flex flex-col items-center space-y-1">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        <div className="text-lg font-bold text-purple-600">
                          {verificationProgress.totalLeads - verificationProgress.processedLeads}
                        </div>
                        <div className="text-xs text-muted-foreground">Remaining</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
                    <CardContent className="pt-4 pb-4 px-3">
                      <div className="flex flex-col items-center space-y-1">
                        <Clock className="w-5 h-5 text-green-600" />
                        <div className="text-lg font-bold text-green-600">
                          {verificationProgress.estimatedTimeRemaining > 0 
                            ? Math.ceil(verificationProgress.estimatedTimeRemaining / 60)
                            : 0}m
                        </div>
                        <div className="text-xs text-muted-foreground">Est. Time</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Current Operation */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium">
                          {verificationProgress.status === 'processing' 
                            ? 'AI Analysis in Progress'
                            : verificationProgress.status === 'completing'
                            ? 'Finalizing Results'
                            : verificationProgress.status === 'initializing'
                            ? 'Preparing Verification'
                            : 'Processing'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {verificationProgress.message || 'Analyzing lead quality, detecting duplicates, and scoring confidence levels...'}
                      </p>
                    </div>
                    <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  </div>
                </div>

                {/* Processing Features */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Business legitimacy verification</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Duplicate detection</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Contact validation</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Quality scoring</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Fallback loading state */
              <div className="text-center py-12">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium">Initializing AI Verification...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Connecting to verification service
                </p>
                {!wsConnected && (
                  <Badge variant="outline" className="mt-4 gap-1 border-yellow-500 text-yellow-600">
                    <WifiOff className="w-3 h-3" />
                    Establishing connection...
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {currentStep === 'complete' && summary && (
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Upload Complete!
            </h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Batch ID</div>
                  <div className="font-mono text-sm" data-testid="text-batch-id">{batchId}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Leads</div>
                    <div className="text-2xl font-bold" data-testid="text-total-leads">
                      {summary.totalLeads}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg Quality Score</div>
                    <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-avg-quality">
                      {summary.averageQualityScore.toFixed(1)}
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tier Distribution */}
            <div className="space-y-3">
              <h3 className="font-semibold">Tier Distribution</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-950 border-yellow-500">
                      Gold
                    </Badge>
                    <span className="text-sm text-muted-foreground">(Quality: 60-69)</span>
                  </div>
                  <span className="font-bold" data-testid="text-gold-count">
                    {summary.tierDistribution.gold}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-slate-100 dark:bg-slate-950 border-slate-500">
                      Platinum
                    </Badge>
                    <span className="text-sm text-muted-foreground">(Quality: 70-79)</span>
                  </div>
                  <span className="font-bold" data-testid="text-platinum-count">
                    {summary.tierDistribution.platinum}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 border-blue-500">
                      Diamond
                    </Badge>
                    <span className="text-sm text-muted-foreground">(Quality: 80-100)</span>
                  </div>
                  <span className="font-bold" data-testid="text-diamond-count">
                    {summary.tierDistribution.diamond}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleReset}
                variant="outline"
                className="flex-1"
                data-testid="button-upload-another"
              >
                Upload Another Batch
              </Button>
              <Button 
                onClick={() => window.location.href = `/admin/leads`}
                className="flex-1"
                data-testid="button-view-batch"
              >
                View Batch Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
