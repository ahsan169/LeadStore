import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  TrendingUp,
  Users,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type WizardStep = 'upload' | 'validate' | 'process' | 'complete';

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
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [generatingTestLeads, setGeneratingTestLeads] = useState(false);
  const { toast } = useToast();

  const steps: WizardStep[] = ['upload', 'validate', 'process', 'complete'];
  const stepLabels = {
    upload: 'Upload',
    validate: 'Validate',
    process: 'Process',
    complete: 'Complete',
  };

  const getCurrentStepIndex = () => steps.indexOf(currentStep);
  const getProgress = () => ((getCurrentStepIndex() + 1) / steps.length) * 100;

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

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Call the verify-upload endpoint instead of direct upload
      const response = await fetch('/api/admin/verify-upload', {
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
        }
      };
      
      // Show verification in progress
      setCurrentStep('process');
      
      // Redirect to verification page after a brief moment
      setTimeout(() => {
        toast({
          title: "Verification complete",
          description: `${data.summary.totalLeads} leads verified. Redirecting to review page...`,
        });
        
        // Redirect to verification preview page with session ID
        window.location.href = `/admin/verify-leads?session=${data.sessionId}`;
      }, 1500);

    } catch (error: any) {
      console.error("Upload error:", error);
      setCurrentStep('upload');
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while processing your file",
        variant: "destructive",
      });
    } finally {
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-upload">
            Upload Lead Batch
          </h1>
          <p className="text-muted-foreground">Upload and process new MCA leads</p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={handleGenerateTestLeads}
          disabled={generatingTestLeads}
          className="gap-2"
          data-testid="button-generate-test-leads"
        >
          <Sparkles className="w-4 h-4" />
          {generatingTestLeads ? "Generating..." : "Generate Test Leads"}
        </Button>
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
                >
                  {uploading ? "Processing..." : "Upload & Process"}
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
            <h2 className="text-xl font-semibold">Step 3: Verifying Leads</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-medium">Verifying your leads...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Checking phone numbers, emails, and detecting duplicates
              </p>
            </div>
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
                onClick={() => window.location.href = `/admin/batches`}
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
