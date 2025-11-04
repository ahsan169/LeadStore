import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  Shield,
  RefreshCw,
  Play,
  Pause
} from "lucide-react";

export function AdminEnrichmentConfig() {
  const { toast } = useToast();
  
  const [config, setConfig] = useState({
    autoEnrichmentEnabled: true,
    autoVerificationEnabled: true,
    autoScoringEnabled: true,
    uccMatchingEnabled: true,
    
    minQualityScoreForEnrichment: 70,
    minQualityScoreForVerification: 50,
    
    enrichmentPriority: 'quality', // 'quality', 'freshness', 'revenue'
    verificationPriority: 'all', // 'all', 'high-value', 'new'
    
    batchSize: 10,
    processingInterval: 5, // minutes
    
    // Scoring weights
    scoringWeights: {
      dataCompleteness: 30,
      verificationScores: 30,
      uccRiskLevel: 20,
      leadFreshness: 20
    }
  });

  const [isProcessing, setIsProcessing] = useState(false);

  // Save configuration
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      // In a real app, this would save to the database
      localStorage.setItem('enrichmentConfig', JSON.stringify(config));
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: "Configuration saved successfully" });
    },
    onError: () => {
      toast({ 
        title: "Failed to save configuration", 
        variant: "destructive" 
      });
    }
  });

  // Trigger manual processing
  const triggerProcessingMutation = useMutation({
    mutationFn: async (type: 'enrichment' | 'verification' | 'scoring' | 'ucc') => {
      // This would trigger the respective batch processing
      await apiRequest(`/api/admin/trigger-${type}`, "POST");
      return { success: true };
    },
    onSuccess: (_, type) => {
      toast({ 
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} processing started`,
        description: "Check the status in a few moments"
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to start processing", 
        variant: "destructive" 
      });
    }
  });

  // Load saved configuration
  useState(() => {
    const savedConfig = localStorage.getItem('enrichmentConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
  });

  return (
    <div className="space-y-6">
      {/* Auto-Processing Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Automatic Processing
          </CardTitle>
          <CardDescription>
            Configure automatic lead enrichment, verification, and scoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle Switches */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-enrichment">Auto-Enrichment</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically enrich leads with company data
                </p>
              </div>
              <Switch
                id="auto-enrichment"
                checked={config.autoEnrichmentEnabled}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, autoEnrichmentEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-verification">Auto-Verification</Label>
                <p className="text-sm text-muted-foreground">
                  Verify email addresses and phone numbers
                </p>
              </div>
              <Switch
                id="auto-verification"
                checked={config.autoVerificationEnabled}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, autoVerificationEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-scoring">Auto-Scoring</Label>
                <p className="text-sm text-muted-foreground">
                  Calculate unified lead scores automatically
                </p>
              </div>
              <Switch
                id="auto-scoring"
                checked={config.autoScoringEnabled}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, autoScoringEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ucc-matching">UCC Matching</Label>
                <p className="text-sm text-muted-foreground">
                  Match UCC filings to leads automatically
                </p>
              </div>
              <Switch
                id="ucc-matching"
                checked={config.uccMatchingEnabled}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, uccMatchingEnabled: checked })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thresholds and Priorities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Processing Thresholds
          </CardTitle>
          <CardDescription>
            Set minimum requirements and processing priorities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quality Thresholds */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="enrichment-threshold">
                Minimum Quality Score for Enrichment: {config.minQualityScoreForEnrichment}
              </Label>
              <Slider
                id="enrichment-threshold"
                min={0}
                max={100}
                step={10}
                value={[config.minQualityScoreForEnrichment]}
                onValueChange={(value) => 
                  setConfig({ ...config, minQualityScoreForEnrichment: value[0] })
                }
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only enrich leads with quality score above this threshold
              </p>
            </div>

            <div>
              <Label htmlFor="verification-threshold">
                Minimum Quality Score for Verification: {config.minQualityScoreForVerification}
              </Label>
              <Slider
                id="verification-threshold"
                min={0}
                max={100}
                step={10}
                value={[config.minQualityScoreForVerification]}
                onValueChange={(value) => 
                  setConfig({ ...config, minQualityScoreForVerification: value[0] })
                }
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only verify leads with quality score above this threshold
              </p>
            </div>
          </div>

          {/* Processing Priorities */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="enrichment-priority">Enrichment Priority</Label>
              <Select
                value={config.enrichmentPriority}
                onValueChange={(value) => 
                  setConfig({ ...config, enrichmentPriority: value })
                }
              >
                <SelectTrigger id="enrichment-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">By Quality Score</SelectItem>
                  <SelectItem value="freshness">By Freshness</SelectItem>
                  <SelectItem value="revenue">By Revenue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="verification-priority">Verification Priority</Label>
              <Select
                value={config.verificationPriority}
                onValueChange={(value) => 
                  setConfig({ ...config, verificationPriority: value })
                }
              >
                <SelectTrigger id="verification-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  <SelectItem value="high-value">High Value Only</SelectItem>
                  <SelectItem value="new">New Leads First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Processing Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="batch-size">Batch Size</Label>
              <Input
                id="batch-size"
                type="number"
                min={1}
                max={50}
                value={config.batchSize}
                onChange={(e) => 
                  setConfig({ ...config, batchSize: parseInt(e.target.value) || 10 })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of leads to process at once
              </p>
            </div>

            <div>
              <Label htmlFor="processing-interval">Processing Interval (minutes)</Label>
              <Input
                id="processing-interval"
                type="number"
                min={1}
                max={60}
                value={config.processingInterval}
                onChange={(e) => 
                  setConfig({ ...config, processingInterval: parseInt(e.target.value) || 5 })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                How often to check for new leads
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoring Weights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Lead Scoring Configuration
          </CardTitle>
          <CardDescription>
            Adjust the weights for unified lead score calculation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <Label>Data Completeness</Label>
                <span className="text-sm font-medium">
                  {config.scoringWeights.dataCompleteness}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[config.scoringWeights.dataCompleteness]}
                onValueChange={(value) => 
                  setConfig({
                    ...config,
                    scoringWeights: { ...config.scoringWeights, dataCompleteness: value[0] }
                  })
                }
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <Label>Verification Scores</Label>
                <span className="text-sm font-medium">
                  {config.scoringWeights.verificationScores}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[config.scoringWeights.verificationScores]}
                onValueChange={(value) => 
                  setConfig({
                    ...config,
                    scoringWeights: { ...config.scoringWeights, verificationScores: value[0] }
                  })
                }
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <Label>UCC Risk Level</Label>
                <span className="text-sm font-medium">
                  {config.scoringWeights.uccRiskLevel}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[config.scoringWeights.uccRiskLevel]}
                onValueChange={(value) => 
                  setConfig({
                    ...config,
                    scoringWeights: { ...config.scoringWeights, uccRiskLevel: value[0] }
                  })
                }
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <Label>Lead Freshness</Label>
                <span className="text-sm font-medium">
                  {config.scoringWeights.leadFreshness}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[config.scoringWeights.leadFreshness]}
                onValueChange={(value) => 
                  setConfig({
                    ...config,
                    scoringWeights: { ...config.scoringWeights, leadFreshness: value[0] }
                  })
                }
              />
            </div>
          </div>

          {/* Total validation */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Weight</span>
              <Badge 
                variant={
                  Object.values(config.scoringWeights).reduce((a, b) => a + b, 0) === 100
                    ? "default"
                    : "destructive"
                }
              >
                {Object.values(config.scoringWeights).reduce((a, b) => a + b, 0)}%
              </Badge>
            </div>
            {Object.values(config.scoringWeights).reduce((a, b) => a + b, 0) !== 100 && (
              <p className="text-xs text-destructive mt-1">
                Weights must total 100%
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual Processing Triggers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Manual Processing
          </CardTitle>
          <CardDescription>
            Manually trigger processing for all eligible leads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => triggerProcessingMutation.mutate('enrichment')}
              disabled={triggerProcessingMutation.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              Run Enrichment
            </Button>
            
            <Button
              variant="outline"
              onClick={() => triggerProcessingMutation.mutate('verification')}
              disabled={triggerProcessingMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Run Verification
            </Button>
            
            <Button
              variant="outline"
              onClick={() => triggerProcessingMutation.mutate('scoring')}
              disabled={triggerProcessingMutation.isPending}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Recalculate Scores
            </Button>
            
            <Button
              variant="outline"
              onClick={() => triggerProcessingMutation.mutate('ucc')}
              disabled={triggerProcessingMutation.isPending}
            >
              <Shield className="w-4 h-4 mr-2" />
              Match UCC Filings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={() => saveConfigMutation.mutate()}
          disabled={
            saveConfigMutation.isPending ||
            Object.values(config.scoringWeights).reduce((a, b) => a + b, 0) !== 100
          }
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}