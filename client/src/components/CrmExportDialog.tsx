import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { SiSalesforce, SiHubspot } from "react-icons/si";

interface CrmExportDialogProps {
  leadIds: string[];
  disabled?: boolean;
  buttonText?: string;
}

export function CrmExportDialog({ 
  leadIds, 
  disabled = false, 
  buttonText = "Export Leads" 
}: CrmExportDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<'csv' | 'salesforce' | 'hubspot' | 'json'>('csv');
  const [options, setOptions] = useState({
    includeEnrichment: true,
    includeVerification: true,
    includeUccData: true,
    includeScoring: true,
    includeInsights: true,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/leads/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadIds,
          format,
          options
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Handle different response types
      if (format === 'json') {
        return response.json();
      } else {
        // For CSV/other formats, get the blob
        const blob = await response.blob();
        const filename = response.headers.get('content-disposition')
          ?.split('filename=')[1]
          ?.replace(/"/g, '') || `leads_export.${format === 'salesforce' ? 'csv' : format}`;
        
        // Download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        return { success: true };
      }
    },
    onSuccess: (data) => {
      if (format === 'json') {
        // For JSON, show the data in console or handle differently
        console.log('Exported data:', data);
      }
      
      toast({
        title: "Export successful",
        description: `Successfully exported ${leadIds.length} lead${leadIds.length > 1 ? 's' : ''} as ${format.toUpperCase()}`,
      });
      setIsOpen(false);
    },
    onError: () => {
      toast({
        title: "Export failed",
        description: "There was an error exporting your leads. Please try again.",
        variant: "destructive",
      });
    }
  });

  const getFormatIcon = () => {
    switch (format) {
      case 'salesforce':
        return <SiSalesforce className="w-4 h-4" />;
      case 'hubspot':
        return <SiHubspot className="w-4 h-4" />;
      case 'json':
        return <FileText className="w-4 h-4" />;
      default:
        return <FileSpreadsheet className="w-4 h-4" />;
    }
  };

  const getFormatDescription = () => {
    switch (format) {
      case 'salesforce':
        return "Export in a format optimized for Salesforce import with custom field mappings";
      case 'hubspot':
        return "Export with HubSpot-compatible column names and formatting";
      case 'json':
        return "Export as structured JSON data for programmatic use";
      default:
        return "Export as a standard CSV file that works with any spreadsheet application";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled || leadIds.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          {buttonText} ({leadIds.length})
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Leads to CRM</DialogTitle>
          <DialogDescription>
            Choose your export format and customize the data to include
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label htmlFor="format">Export Format</Label>
            <Select value={format} onValueChange={(value: any) => setFormat(value)}>
              <SelectTrigger id="format">
                <div className="flex items-center gap-2">
                  {getFormatIcon()}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>CSV (Universal)</span>
                  </div>
                </SelectItem>
                <SelectItem value="salesforce">
                  <div className="flex items-center gap-2">
                    <SiSalesforce className="w-4 h-4" />
                    <span>Salesforce</span>
                  </div>
                </SelectItem>
                <SelectItem value="hubspot">
                  <div className="flex items-center gap-2">
                    <SiHubspot className="w-4 h-4" />
                    <span>HubSpot</span>
                  </div>
                </SelectItem>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>JSON</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {getFormatDescription()}
            </p>
          </div>

          {/* Data Options */}
          <div className="space-y-2">
            <Label>Include Data</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enrichment"
                  checked={options.includeEnrichment}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, includeEnrichment: checked as boolean })
                  }
                />
                <Label 
                  htmlFor="enrichment" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Enrichment Data
                  <span className="text-muted-foreground ml-1">
                    (website, LinkedIn, company size, etc.)
                  </span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="verification"
                  checked={options.includeVerification}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, includeVerification: checked as boolean })
                  }
                />
                <Label 
                  htmlFor="verification" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Verification Scores
                  <span className="text-muted-foreground ml-1">
                    (email, phone, name verification)
                  </span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ucc"
                  checked={options.includeUccData}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, includeUccData: checked as boolean })
                  }
                />
                <Label 
                  htmlFor="ucc" 
                  className="text-sm font-normal cursor-pointer"
                >
                  UCC Data
                  <span className="text-muted-foreground ml-1">
                    (debt, risk level, filing dates)
                  </span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="scoring"
                  checked={options.includeScoring}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, includeScoring: checked as boolean })
                  }
                />
                <Label 
                  htmlFor="scoring" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Lead Scores
                  <span className="text-muted-foreground ml-1">
                    (unified score, quality metrics)
                  </span>
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="insights"
                  checked={options.includeInsights}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, includeInsights: checked as boolean })
                  }
                />
                <Label 
                  htmlFor="insights" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Lead Insights
                  <span className="text-muted-foreground ml-1">
                    (tags and intelligence)
                  </span>
                </Label>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-muted p-3">
            <div className="text-sm">
              <div className="font-medium mb-1">Export Summary</div>
              <div className="text-muted-foreground">
                • {leadIds.length} lead{leadIds.length !== 1 ? 's' : ''} selected<br />
                • Format: {format.toUpperCase()}<br />
                • {Object.values(options).filter(v => v).length} data categories included
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <>Exporting...</>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Now
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}