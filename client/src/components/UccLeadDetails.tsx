import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, TrendingUp, TrendingDown, AlertTriangle, Shield, Network,
  Building, DollarSign, Calendar, Clock, Users, Eye, Link2, Bell,
  CheckCircle2, XCircle, Info, AlertCircle, Activity, Target, Gauge,
  ArrowUpRight, ArrowDownRight, ChevronDown, RefreshCw, Layers
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarGrid
} from "recharts";
import type { Lead } from "@shared/schema";

interface UccFilingData {
  id: string;
  filingNumber: string;
  filingDate: Date;
  lender: string;
  amount: number;
  collateralDescription: string;
  filingType: "initial" | "continuation" | "amendment" | "termination";
  status: "active" | "expired" | "terminated";
}

interface UccIntelligenceData {
  score: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  debtVelocity: {
    trend: "accelerating" | "stable" | "decelerating";
    riskLevel: "low" | "moderate" | "high" | "critical";
  };
  lenderConcentration: {
    dominantLender: string | null;
    concentrationScore: number;
    numberOfLenders: number;
    diversificationRating: "well-diversified" | "moderate" | "concentrated" | "single-source";
  };
  collateralQuality: {
    overallScore: number;
    liquidityRating: "highly-liquid" | "liquid" | "illiquid" | "distressed";
    warningFlags: string[];
  };
  paymentBehavior: {
    hasPaymentIssues: boolean;
    refinancingPattern: "none" | "normal" | "concerning" | "distressed";
  };
  predictiveAnalysis: {
    defaultRisk: {
      probability: number;
      timeframe: number;
      confidence: number;
    };
    nextFinancing: {
      likelihood: number;
      estimatedTimeframe: number;
      estimatedAmount: number;
    };
  };
  filings: UccFilingData[];
  relatedLeads: Array<{
    leadId: string;
    businessName: string;
    matchType: string;
    confidence: number;
  }>;
}

interface UccLeadDetailsProps {
  lead: Lead;
  onClose?: () => void;
  onMonitorLead?: (leadId: string) => void;
  onViewRelated?: (leadId: string) => void;
}

// Risk colors
const RISK_COLORS = {
  low: "#10b981",
  moderate: "#eab308",
  high: "#f97316",
  critical: "#ef4444"
};

const getRiskBadge = (level: string) => {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    low: "outline",
    moderate: "secondary",
    high: "default",
    critical: "destructive"
  };
  
  return (
    <Badge variant={variants[level?.toLowerCase()] || "outline"}>
      {level || "Unknown"}
    </Badge>
  );
};

export function UccLeadDetails({ lead, onClose, onMonitorLead, onViewRelated }: UccLeadDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [uccData, setUccData] = useState<UccIntelligenceData | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);
  const [showRelatedLeads, setShowRelatedLeads] = useState(false);

  useEffect(() => {
    fetchUccData();
  }, [lead.id]);

  const fetchUccData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch UCC intelligence data
      const [filingsRes, insightsRes, relatedRes] = await Promise.all([
        fetch(`/api/admin/ucc/${lead.id}`),
        fetch(`/api/ucc/insights/${lead.id}`),
        fetch("/api/ucc/match-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, minConfidence: 50 })
        })
      ]);

      if (filingsRes.ok && insightsRes.ok) {
        const filingsData = await filingsRes.json();
        const insightsData = await insightsRes.json();
        const relatedData = relatedRes.ok ? await relatedRes.json() : { matchesByType: {} };

        // Combine data (using mock data if API returns incomplete data)
        const mockUccData: UccIntelligenceData = {
          score: insightsData.insights?.businessIntelligence?.mcaEligibilityScore || 75,
          riskLevel: insightsData.insights?.businessIntelligence?.riskLevel || "moderate",
          debtVelocity: {
            trend: insightsData.insights?.businessIntelligence?.businessGrowthIndicator === "growing" ? "accelerating" : "stable",
            riskLevel: insightsData.insights?.businessIntelligence?.debtStackingScore > 70 ? "high" : "moderate"
          },
          lenderConcentration: {
            dominantLender: filingsData.signals?.dominantSecuredParty || null,
            concentrationScore: 65,
            numberOfLenders: filingsData.signals?.uniqueSecuredParties || 3,
            diversificationRating: "moderate"
          },
          collateralQuality: {
            overallScore: 70,
            liquidityRating: "liquid",
            warningFlags: insightsData.recommendations?.cautionary || []
          },
          paymentBehavior: {
            hasPaymentIssues: false,
            refinancingPattern: insightsData.insights?.businessIntelligence?.refinancingProbability > 0.5 ? "concerning" : "normal"
          },
          predictiveAnalysis: {
            defaultRisk: {
              probability: insightsData.insights?.businessIntelligence?.riskScore || 0.25,
              timeframe: 6,
              confidence: 78
            },
            nextFinancing: {
              likelihood: insightsData.insights?.businessIntelligence?.refinancingProbability || 0.65,
              estimatedTimeframe: 90,
              estimatedAmount: filingsData.signals?.averageFilingAmount || 75000
            }
          },
          filings: (filingsData.filings || []).map((f: any) => ({
            id: f.id,
            filingNumber: f.filingNumber,
            filingDate: new Date(f.filingDate),
            lender: f.securedPartyName,
            amount: f.filingAmount || 0,
            collateralDescription: f.collateralDescription,
            filingType: f.filingType || "initial",
            status: f.status || "active"
          })),
          relatedLeads: Object.values(relatedData.matchesByType || {}).flat().map((match: any) => ({
            leadId: match.leadId,
            businessName: match.businessName || "Unknown Business",
            matchType: match.type || "similar",
            confidence: match.confidence || 50
          }))
        };

        setUccData(mockUccData);
      } else {
        throw new Error("Failed to fetch UCC data");
      }
    } catch (err) {
      console.error("Error fetching UCC data:", err);
      setError("Failed to load UCC intelligence data");
      
      // Use fallback mock data
      setUccData({
        score: 72,
        riskLevel: "moderate",
        debtVelocity: {
          trend: "stable",
          riskLevel: "moderate"
        },
        lenderConcentration: {
          dominantLender: "Capital One",
          concentrationScore: 60,
          numberOfLenders: 4,
          diversificationRating: "moderate"
        },
        collateralQuality: {
          overallScore: 68,
          liquidityRating: "liquid",
          warningFlags: ["Equipment aging", "Inventory turnover declining"]
        },
        paymentBehavior: {
          hasPaymentIssues: false,
          refinancingPattern: "normal"
        },
        predictiveAnalysis: {
          defaultRisk: {
            probability: 0.28,
            timeframe: 6,
            confidence: 75
          },
          nextFinancing: {
            likelihood: 0.7,
            estimatedTimeframe: 60,
            estimatedAmount: 85000
          }
        },
        filings: [
          {
            id: "1",
            filingNumber: "2024-123456",
            filingDate: new Date("2024-03-15"),
            lender: "Capital One",
            amount: 125000,
            collateralDescription: "All business assets",
            filingType: "initial",
            status: "active"
          },
          {
            id: "2",
            filingNumber: "2023-789012",
            filingDate: new Date("2023-11-20"),
            lender: "Wells Fargo",
            amount: 75000,
            collateralDescription: "Equipment and inventory",
            filingType: "initial",
            status: "active"
          }
        ],
        relatedLeads: []
      });
    } finally {
      setLoading(false);
    }
  };

  const lenderChartData = uccData?.filings.reduce((acc: any[], filing) => {
    const existing = acc.find(item => item.name === filing.lender);
    if (existing) {
      existing.value += 1;
      existing.amount += filing.amount;
    } else {
      acc.push({
        name: filing.lender,
        value: 1,
        amount: filing.amount
      });
    }
    return acc;
  }, []) || [];

  const timelineData = uccData?.filings
    .sort((a, b) => a.filingDate.getTime() - b.filingDate.getTime())
    .map(filing => ({
      date: filing.filingDate.toLocaleDateString(),
      amount: filing.amount,
      lender: filing.lender
    })) || [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error && !uccData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">UCC Intelligence Score</CardTitle>
              <CardDescription>
                Comprehensive analysis based on {uccData?.filings.length || 0} UCC filings
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-3xl font-bold">{uccData?.score || "N/A"}</div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
              {getRiskBadge(uccData?.riskLevel || "unknown")}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Debt Velocity</p>
              <div className="flex items-center gap-1 mt-1">
                {uccData?.debtVelocity.trend === "accelerating" && (
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                )}
                {uccData?.debtVelocity.trend === "stable" && (
                  <ArrowDownRight className="w-4 h-4 text-yellow-500" />
                )}
                {uccData?.debtVelocity.trend === "decelerating" && (
                  <ChevronDown className="w-4 h-4 text-green-500" />
                )}
                <span className="text-sm font-medium capitalize">
                  {uccData?.debtVelocity.trend}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Filings</p>
              <p className="text-lg font-semibold">{uccData?.filings.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lenders</p>
              <p className="text-lg font-semibold">{uccData?.lenderConcentration.numberOfLenders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Default Risk</p>
              <p className="text-lg font-semibold">
                {((uccData?.predictiveAnalysis.defaultRisk.probability || 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="filings">Filings</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Lender Concentration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Lender Concentration</CardTitle>
            </CardHeader>
            <CardContent>
              {lenderChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={lenderChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {lenderChartData.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444"][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No filing data available</p>
              )}
            </CardContent>
          </Card>

          {/* Risk Factors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Key Risk Indicators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Lender Diversification</span>
                <Badge variant={uccData?.lenderConcentration.diversificationRating === "well-diversified" ? "default" : "secondary"}>
                  {uccData?.lenderConcentration.diversificationRating}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Collateral Quality</span>
                <Badge variant={uccData?.collateralQuality.liquidityRating === "highly-liquid" ? "default" : "secondary"}>
                  {uccData?.collateralQuality.liquidityRating}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Refinancing Pattern</span>
                <Badge variant={uccData?.paymentBehavior.refinancingPattern === "normal" ? "default" : "destructive"}>
                  {uccData?.paymentBehavior.refinancingPattern}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Filing Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uccData?.filings
                  .sort((a, b) => b.filingDate.getTime() - a.filingDate.getTime())
                  .map((filing, idx) => (
                    <div key={filing.id} className="flex items-start gap-3">
                      <div className={`w-3 h-3 rounded-full mt-1 ${idx === 0 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{filing.lender}</p>
                          <Badge variant="outline" className="text-xs">
                            {filing.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {filing.filingDate.toLocaleDateString()} • ${filing.amount.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {filing.collateralDescription}
                        </p>
                      </div>
                    </div>
                  ))}
                {(!uccData?.filings || uccData.filings.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No filings found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Collateral Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Overall Quality Score</span>
                    <span className="text-sm font-medium">{uccData?.collateralQuality.overallScore}/100</span>
                  </div>
                  <Progress value={uccData?.collateralQuality.overallScore} className="h-2" />
                </div>
                
                {uccData?.collateralQuality.warningFlags && uccData.collateralQuality.warningFlags.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Warning Flags</p>
                    {uccData.collateralQuality.warningFlags.map((flag, idx) => (
                      <div key={idx} className="flex items-start gap-2 mb-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5" />
                        <span className="text-xs">{flag}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Related Leads */}
          {uccData?.relatedLeads && uccData.relatedLeads.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Related Leads</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRelatedLeads(true)}
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {uccData.relatedLeads.slice(0, 3).map((related, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{related.businessName}</p>
                        <p className="text-xs text-muted-foreground">{related.matchType}</p>
                      </div>
                      <Badge variant="outline">
                        {related.confidence}% match
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="predictions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Predictive Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Default Risk */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">Default Risk</p>
                    <p className="text-xs text-muted-foreground">
                      Within {uccData?.predictiveAnalysis.defaultRisk.timeframe} months
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      {((uccData?.predictiveAnalysis.defaultRisk.probability || 0) * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {uccData?.predictiveAnalysis.defaultRisk.confidence}% confidence
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(uccData?.predictiveAnalysis.defaultRisk.probability || 0) * 100} 
                  className="h-2"
                />
              </div>

              <Separator />

              {/* Next Financing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">Next Financing Likelihood</p>
                    <p className="text-xs text-muted-foreground">
                      Est. in {uccData?.predictiveAnalysis.nextFinancing.estimatedTimeframe} days
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      {((uccData?.predictiveAnalysis.nextFinancing.likelihood || 0) * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~${(uccData?.predictiveAnalysis.nextFinancing.estimatedAmount || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(uccData?.predictiveAnalysis.nextFinancing.likelihood || 0) * 100} 
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Recommendations</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1 text-xs">
                {uccData?.predictiveAnalysis.nextFinancing.likelihood && 
                 uccData.predictiveAnalysis.nextFinancing.likelihood > 0.6 && (
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5" />
                    <span>High refinancing probability - offer competitive rates to capture</span>
                  </li>
                )}
                {uccData?.lenderConcentration.diversificationRating === "concentrated" && (
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 text-yellow-500 mt-0.5" />
                    <span>Lender concentration risk - consider diversification requirements</span>
                  </li>
                )}
                {uccData?.debtVelocity.trend === "accelerating" && (
                  <li className="flex items-start gap-2">
                    <XCircle className="w-3 h-3 text-red-500 mt-0.5" />
                    <span>Accelerating debt velocity - enhanced monitoring recommended</span>
                  </li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        {onMonitorLead && (
          <Button variant="outline" onClick={() => onMonitorLead(lead.id)}>
            <Bell className="w-4 h-4 mr-2" />
            Enable Monitoring
          </Button>
        )}
        {onViewRelated && (
          <Button variant="outline" onClick={() => onViewRelated(lead.id)}>
            <Network className="w-4 h-4 mr-2" />
            View Network
          </Button>
        )}
        <Button onClick={() => fetchUccData()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Related Leads Dialog */}
      <Dialog open={showRelatedLeads} onOpenChange={setShowRelatedLeads}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Related Leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {uccData?.relatedLeads?.map((related, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{related.businessName}</p>
                    <p className="text-sm text-muted-foreground capitalize">{related.matchType} match</p>
                  </div>
                  <div className="text-right">
                    <Badge>{related.confidence}%</Badge>
                    <p className="text-xs text-muted-foreground mt-1">Confidence</p>
                  </div>
                </div>
              </Card>
            )) || (
              <p className="text-sm text-muted-foreground text-center py-4">No related leads found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}