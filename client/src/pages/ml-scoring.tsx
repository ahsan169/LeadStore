import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  TrendingUp,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle,
  Zap,
  BarChart3,
  Target,
  Activity,
  DollarSign,
  Users,
  Clock,
  Shield,
  Award
} from "lucide-react";

interface ModelInfo {
  id: string;
  name: string;
  version: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  trainedAt: string;
  trainingDataSize: number;
  features: string[];
  usingDefault?: boolean;
  message?: string;
}

interface MarketInsights {
  topIndustries: Array<{ industry: string; avgScore: number; count: number }>;
  bestPerformingStates: Array<{ state: string; avgScore: number }>;
  optimalCreditRange: { min: number; max: number; avgConversion: number };
  seasonalTrends: Array<{ month: string; avgScore: number }>;
  conversionPredictors: Array<{ factor: string; impact: number }>;
}

interface ScoringFactors {
  dataQuality: number;
  businessStrength: number;
  creditworthiness: number;
  urgencySignals: number;
  historicalPerformance: number;
  industryFit: number;
  geographicDesirability: number;
  revenueConsistency: number;
}

export default function MLScoringPage() {
  const { toast } = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [scoringResult, setScoringResult] = useState<any>(null);

  // Fetch model info
  const { data: modelInfo, isLoading: modelLoading } = useQuery({
    queryKey: ["/api/scoring/model"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/scoring/model");
      return response.json();
    },
  });

  // Fetch market insights
  const { data: marketInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ["/api/scoring/insights"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/scoring/insights");
      return response.json();
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Score leads mutation
  const scoreMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await apiRequest("POST", "/api/scoring/analyze", { leadIds });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: `Scored ${data.scoredLeads} leads successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/scoring/insights"] });
    },
    onError: () => {
      toast({ title: "Failed to score leads", variant: "destructive" });
    },
  });

  // Get scoring factors for a specific lead
  const factorsMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const response = await apiRequest("GET", `/api/scoring/factors/${leadId}`);
      return response.json();
    },
    onSuccess: (data) => {
      setScoringResult(data);
    },
    onError: () => {
      toast({ title: "Failed to get scoring factors", variant: "destructive" });
    },
  });

  // Retrain model mutation (admin only)
  const retrainMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/scoring/retrain");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scoring/model"] });
      toast({
        title: "Model retrained successfully",
        description: `New accuracy: ${(data.model.accuracy * 100).toFixed(1)}%`,
      });
    },
    onError: () => {
      toast({ title: "Failed to retrain model", variant: "destructive" });
    },
  });

  const renderScoringFactors = (factors: ScoringFactors) => {
    const factorItems = [
      { name: "Data Quality", value: factors.dataQuality, icon: Shield },
      { name: "Business Strength", value: factors.businessStrength, icon: TrendingUp },
      { name: "Creditworthiness", value: factors.creditworthiness, icon: Award },
      { name: "Urgency Signals", value: factors.urgencySignals, icon: Zap },
      { name: "Historical Performance", value: factors.historicalPerformance, icon: Clock },
      { name: "Industry Fit", value: factors.industryFit, icon: Target },
      { name: "Geographic Desirability", value: factors.geographicDesirability, icon: Users },
      { name: "Revenue Consistency", value: factors.revenueConsistency, icon: DollarSign },
    ];

    return (
      <div className="grid md:grid-cols-2 gap-4">
        {factorItems.map((factor) => (
          <div key={factor.name} className="flex items-center gap-3">
            <factor.icon className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">{factor.name}</span>
                <span className="text-sm text-muted-foreground">
                  {(factor.value * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={factor.value * 100} className="h-2" />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-ml-scoring">
          ML-Powered Lead Scoring
        </h1>
        <p className="text-muted-foreground">
          Advanced machine learning models for intelligent lead qualification
        </p>
      </div>

      <div className="grid gap-6">
        {/* Model Status Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>ML Model Status</CardTitle>
                <CardDescription>
                  Current active scoring model information
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {modelInfo?.usingDefault ? (
                  <Badge variant="secondary">Default Heuristics</Badge>
                ) : (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active Model
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {modelLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : modelInfo?.usingDefault ? (
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Using Default Heuristics</AlertTitle>
                <AlertDescription>
                  No trained ML model is active. The system is using default scoring rules.
                  Train a model to unlock advanced scoring capabilities.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="grid md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Model Version</p>
                    <p className="text-lg font-semibold">{modelInfo?.version}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Accuracy</p>
                    <p className="text-lg font-semibold">
                      {(modelInfo?.accuracy * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Training Data</p>
                    <p className="text-lg font-semibold">
                      {modelInfo?.trainingDataSize?.toLocaleString()} leads
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Trained</p>
                    <p className="text-lg font-semibold">
                      {new Date(modelInfo?.trainedAt || "").toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Precision</p>
                    <Progress value={(modelInfo?.precision || 0) * 100} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(modelInfo?.precision * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Recall</p>
                    <Progress value={(modelInfo?.recall || 0) * 100} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(modelInfo?.recall * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">F1 Score</p>
                    <Progress value={(modelInfo?.f1Score || 0) * 100} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(modelInfo?.f1Score * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {modelInfo?.features && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Model Features</p>
                    <div className="flex flex-wrap gap-2">
                      {modelInfo.features.map((feature: string) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => retrainMutation.mutate()}
                    disabled={retrainMutation.isPending}
                  >
                    {retrainMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Training...
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Retrain Model
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="insights" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="insights">Market Insights</TabsTrigger>
            <TabsTrigger value="scoring" data-testid="tab-scoring-factors">
              Scoring Factors
            </TabsTrigger>
            <TabsTrigger value="batch">Batch Scoring</TabsTrigger>
          </TabsList>

          <TabsContent value="insights">
            <div className="grid gap-6">
              {/* Top Industries */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Industries</CardTitle>
                  <CardDescription>
                    Industries with highest average lead scores
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {marketInsights?.topIndustries?.map((industry: any) => (
                        <div key={industry.industry} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{industry.industry}</span>
                            <Badge variant="secondary">{industry.count} leads</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={industry.avgScore} className="w-24" />
                            <span className="text-sm font-semibold">
                              {industry.avgScore.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Conversion Predictors */}
              <Card>
                <CardHeader>
                  <CardTitle>Key Conversion Predictors</CardTitle>
                  <CardDescription>
                    Factors most strongly correlated with successful conversions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {marketInsights?.conversionPredictors?.map((predictor: any) => (
                      <div key={predictor.factor} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{predictor.factor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={predictor.impact > 0.7 ? "default" : "secondary"}
                            className={predictor.impact > 0.7 ? "bg-green-600" : ""}
                          >
                            {(predictor.impact * 100).toFixed(0)}% impact
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scoring">
            <Card>
              <CardHeader>
                <CardTitle>Lead Scoring Analysis</CardTitle>
                <CardDescription>
                  Analyze individual leads to understand scoring factors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Lead ID"
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md"
                  />
                  <Button
                    onClick={() => factorsMutation.mutate(selectedLeadId)}
                    disabled={!selectedLeadId || factorsMutation.isPending}
                  >
                    {factorsMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Analyze Lead
                      </>
                    )}
                  </Button>
                </div>

                {scoringResult && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">ML Quality Score</p>
                        <p className="text-3xl font-bold text-primary">
                          {scoringResult.mlQualityScore}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">
                          Conversion Probability
                        </p>
                        <p className="text-3xl font-bold text-green-600">
                          {(scoringResult.conversionProbability * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Expected Deal Size</p>
                        <p className="text-3xl font-bold">
                          ${Number(scoringResult.expectedDealSize).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {scoringResult.scoringFactors && (
                      <div>
                        <h4 className="font-semibold mb-3">Scoring Breakdown</h4>
                        {renderScoringFactors(scoringResult.scoringFactors)}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batch">
            <Card>
              <CardHeader>
                <CardTitle>Batch Lead Scoring</CardTitle>
                <CardDescription>
                  Score multiple leads at once using ML models
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Info className="w-4 h-4" />
                  <AlertTitle>Automated Scoring</AlertTitle>
                  <AlertDescription>
                    All new leads are automatically scored when uploaded to the system.
                    Use this feature to re-score existing leads with updated models.
                  </AlertDescription>
                </Alert>

                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => {
                      // In a real app, this would let users select leads
                      toast({ title: "Select leads to score", description: "Feature coming soon" });
                    }}
                  >
                    Select Leads to Score
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}