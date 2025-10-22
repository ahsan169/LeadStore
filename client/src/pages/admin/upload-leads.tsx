import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function UploadLeadsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // In a real implementation, this would:
      // 1. Upload CSV to object storage
      // 2. Parse and validate CSV
      // 3. Calculate quality scores
      // 4. Store leads in database
      // 5. Generate AI insights

      toast({
        title: "Upload started",
        description: "Your CSV is being processed. This may take a few minutes.",
      });

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "Upload successful",
        description: `${file.name} has been processed successfully`,
      });

      setFile(null);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "An error occurred while processing your file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-upload">
          Upload Lead Batch
        </h1>
        <p className="text-muted-foreground">Upload and process new MCA leads</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-xl font-semibold">CSV File Upload</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Area */}
          <div className="border-2 border-dashed rounded-lg p-12 text-center hover-elevate">
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-lg font-medium">Upload your CSV file</p>
              <p className="text-sm text-muted-foreground">
                File should contain business leads with contact information
              </p>
            </div>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="mt-4 max-w-xs mx-auto"
              data-testid="input-file"
            />
          </div>

          {/* File Info */}
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
                {uploading ? "Uploading..." : "Process File"}
              </Button>
            </div>
          )}

          {/* CSV Format Guide */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold">Required CSV Columns:</h3>
            <ul className="text-sm space-y-1 text-muted-foreground font-mono">
              <li>• Business Name</li>
              <li>• Owner Name</li>
              <li>• Email</li>
              <li>• Phone</li>
              <li>• Industry (optional)</li>
              <li>• Annual Revenue (optional)</li>
              <li>• Requested Amount (optional)</li>
              <li>• Time in Business (optional)</li>
              <li>• Credit Score (optional)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
