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
  WifiOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function UploadLeadsEnhancedPage() {
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
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // Setup WebSocket connection for real-time progress
  useEffect(() => {
    if (!uploading || !useAiVerification) return;

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
  }, [uploading, useAiVerification, sessionId, toast]);

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
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
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
    setVerificationProgress(null);
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-upload">
            Upload Lead Batch
          </h1>
          <p className="text-muted-foreground">Upload and process new MCA leads</p>
        </div>
        <div className="flex items-center gap-4">
          {useAiVerification && uploading && (
            <Badge variant={wsConnected ? "default" : "secondary"} className="gap-1">
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {wsConnected ? 'Live Updates' : 'Disconnected'}
            </Badge>
          )}
          {/* Test data generation removed - working with real data only */}
        </div>
      </div>

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
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-xl font-semibold">Step 1: Upload Lead File</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rest of upload UI remains the same... */}
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
                accept=".csv,.xlsx,.xls"
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
                    Optimized AI Verification (Faster!)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Uses batched API calls for 10x faster verification
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
                  className="gap-2"
                >
                  {useAiVerification && <Brain className="w-4 h-4" />}
                  {uploading ? "Processing..." : useAiVerification ? "AI Verify & Process" : "Upload & Process"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 & 3: Processing with Real-time Progress */}
      {(currentStep === 'validate' || currentStep === 'process') && (
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              {useAiVerification ? (
                <>
                  <Brain className="w-6 h-6 text-purple-600" />
                  AI Verification in Progress
                </>
              ) : (
                <>
                  <Activity className="w-6 h-6" />
                  Processing Leads
                </>
              )}
            </h2>
          </CardHeader>
          <CardContent className="space-y-6">
            {verificationProgress ? (
              <>
                {/* Real-time Progress Display */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="font-medium">{verificationProgress.message}</span>
                    </div>
                    <Badge variant="secondary">
                      Batch {verificationProgress.currentBatch} of {verificationProgress.totalBatches}
                    </Badge>
                  </div>

                  <Progress 
                    value={verificationProgress.percentage} 
                    className="h-3"
                    data-testid="progress-verification"
                  />

                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {verificationProgress.processedLeads}
                      </div>
                      <div className="text-sm text-muted-foreground">Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {verificationProgress.totalLeads}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold flex items-center justify-center gap-1">
                        <Clock className="w-5 h-5" />
                        {formatTime(verificationProgress.estimatedTimeRemaining)}
                      </div>
                      <div className="text-sm text-muted-foreground">Time Remaining</div>
                    </div>
                  </div>

                  {/* Progress Status */}
                  <Alert className={
                    verificationProgress.status === 'error' ? 'border-red-500' :
                    verificationProgress.status === 'done' ? 'border-green-500' :
                    'border-primary'
                  }>
                    <Activity className="h-4 w-4" />
                    <AlertDescription>
                      {verificationProgress.status === 'initializing' && 'Initializing verification engine...'}
                      {verificationProgress.status === 'processing' && `Processing leads in batches for optimal performance...`}
                      {verificationProgress.status === 'completing' && 'Finalizing verification results...'}
                      {verificationProgress.status === 'done' && '✅ Verification complete! Preparing results...'}
                      {verificationProgress.status === 'error' && '❌ An error occurred during verification'}
                    </AlertDescription>
                  </Alert>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-lg font-medium">
                    {useAiVerification ? 'Initializing AI verification...' : 'Processing your file...'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This may take a few moments depending on file size
                  </p>
                </div>
                
                {/* Loading skeleton while waiting for WebSocket */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}