import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  Shield,
  Sparkles,
  Target,
  CheckCircle,
  AlertTriangle,
  Activity,
  BarChart3,
  Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IntelligenceSubScores {
  quality: number;
  freshness: number;
  risk: number;
  opportunity: number;
  confidence: number;
}

interface ScoreFactor {
  name: string;
  value: number;
  impact: number;
  description: string;
}

interface IntelligenceBreakdown {
  category: keyof IntelligenceSubScores;
  score: number;
  weight: number;
  contribution: number;
  factors: ScoreFactor[];
}

interface IntelligenceMetadata {
  calculatedAt: Date | string;
  version: string;
  breakdowns: IntelligenceBreakdown[];
  explanations: {
    overall: string;
    quality: string;
    freshness: string;
    risk: string;
    opportunity: string;
    confidence: string;
  };
  recommendations: string[];
  dataWarnings: string[];
}

interface LeadIntelligenceScoreProps {
  intelligenceScore: number;
  subScores: IntelligenceSubScores;
  metadata?: IntelligenceMetadata;
  className?: string;
  variant?: "compact" | "detailed" | "full";
  showBreakdown?: boolean;
  leadId?: string;
}

const getScoreColor = (score: number, isRisk = false) => {
  if (isRisk) {
    // For risk, lower is better (inverted)
    if (score >= 80) return "text-red-600 dark:text-red-400";
    if (score >= 60) return "text-orange-600 dark:text-orange-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    if (score >= 20) return "text-green-600 dark:text-green-400";
    return "text-emerald-600 dark:text-emerald-400";
  } else {
    // For other scores, higher is better
    if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 60) return "text-green-600 dark:text-green-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    if (score >= 20) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  }
};

const getScoreLabel = (score: number, isRisk = false) => {
  if (isRisk) {
    // For risk, lower is better (inverted)
    if (score >= 80) return "Very High Risk";
    if (score >= 60) return "High Risk";
    if (score >= 40) return "Moderate Risk";
    if (score >= 20) return "Low Risk";
    return "Very Low Risk";
  } else {
    // For other scores, higher is better
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    if (score >= 20) return "Poor";
    return "Very Poor";
  }
};

const getScoreBadgeVariant = (score: number, isRisk = false): any => {
  if (isRisk) {
    if (score >= 60) return "destructive";
    if (score >= 40) return "warning";
    return "success";
  } else {
    if (score >= 60) return "success";
    if (score >= 40) return "warning";
    return "destructive";
  }
};

const SubScoreIcon = ({ category }: { category: keyof IntelligenceSubScores }) => {
  switch (category) {
    case "quality":
      return <BarChart3 className="w-4 h-4" />;
    case "freshness":
      return <Sparkles className="w-4 h-4" />;
    case "risk":
      return <Shield className="w-4 h-4" />;
    case "opportunity":
      return <Target className="w-4 h-4" />;
    case "confidence":
      return <CheckCircle className="w-4 h-4" />;
    default:
      return <Activity className="w-4 h-4" />;
  }
};

/**
 * Compact variant - shows just the score badge
 */
const CompactScore = ({ intelligenceScore }: { intelligenceScore: number }) => {
  const scoreColor = getScoreColor(intelligenceScore);
  const scoreLabel = getScoreLabel(intelligenceScore);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getScoreBadgeVariant(intelligenceScore)}
            className="flex items-center gap-1 px-2 py-1"
            data-testid="badge-intelligence-score"
          >
            <Brain className="w-3 h-3" />
            <span className="font-bold">{intelligenceScore}</span>
            <span className="text-xs opacity-80">/ 100</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-semibold">Lead Intelligence Score</p>
            <p className={scoreColor}>{scoreLabel}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Detailed variant - shows score with sub-scores
 */
const DetailedScore = ({ 
  intelligenceScore, 
  subScores,
  showDetails,
  onToggleDetails
}: { 
  intelligenceScore: number;
  subScores: IntelligenceSubScores;
  showDetails: boolean;
  onToggleDetails: () => void;
}) => {
  return (
    <Card className="w-full" data-testid="card-intelligence-detailed">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              intelligenceScore >= 60 ? "bg-green-100 dark:bg-green-900/20" :
              intelligenceScore >= 40 ? "bg-yellow-100 dark:bg-yellow-900/20" :
              "bg-red-100 dark:bg-red-900/20"
            )}>
              <Brain className={cn("w-6 h-6", getScoreColor(intelligenceScore))} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Lead Intelligence Score</h3>
              <p className={cn("text-2xl font-bold", getScoreColor(intelligenceScore))}>
                {intelligenceScore}
                <span className="text-sm text-muted-foreground font-normal"> / 100</span>
              </p>
            </div>
          </div>
          <Badge variant={getScoreBadgeVariant(intelligenceScore)}>
            {getScoreLabel(intelligenceScore)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(subScores).map(([key, value]) => {
            const category = key as keyof IntelligenceSubScores;
            const isRisk = category === 'risk';
            return (
              <div 
                key={key}
                className="flex flex-col items-center p-3 rounded-lg bg-muted/50"
                data-testid={`subscore-${key}`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <SubScoreIcon category={category} />
                  <span className="text-xs font-medium capitalize">{key}</span>
                </div>
                <span className={cn("text-lg font-bold", getScoreColor(value, isRisk))}>
                  {value}
                </span>
                <Progress 
                  value={value} 
                  className="w-full h-1 mt-1"
                />
              </div>
            );
          })}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDetails}
          className="w-full"
          data-testid="button-toggle-details"
        >
          {showDetails ? (
            <>Hide Details <ChevronUp className="w-4 h-4 ml-1" /></>
          ) : (
            <>Show Details <ChevronDown className="w-4 h-4 ml-1" /></>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

/**
 * Full variant - shows everything including metadata
 */
const FullScore = ({
  intelligenceScore,
  subScores,
  metadata
}: {
  intelligenceScore: number;
  subScores: IntelligenceSubScores;
  metadata?: IntelligenceMetadata;
}) => {
  return (
    <div className="space-y-4" data-testid="intelligence-score-full">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-lg",
                intelligenceScore >= 60 ? "bg-green-100 dark:bg-green-900/20" :
                intelligenceScore >= 40 ? "bg-yellow-100 dark:bg-yellow-900/20" :
                "bg-red-100 dark:bg-red-900/20"
              )}>
                <Brain className={cn("w-8 h-8", getScoreColor(intelligenceScore))} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Lead Intelligence Score™</h2>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={cn("text-3xl font-bold", getScoreColor(intelligenceScore))}>
                    {intelligenceScore}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                  <Badge variant={getScoreBadgeVariant(intelligenceScore)} className="ml-2">
                    {getScoreLabel(intelligenceScore)}
                  </Badge>
                </div>
              </div>
            </div>
            {metadata?.calculatedAt && (
              <div className="text-right text-sm text-muted-foreground">
                <p>Last updated</p>
                <p>{new Date(metadata.calculatedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="recommendations">Actions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Sub-scores visualization */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.entries(subScores).map(([key, value]) => {
                  const category = key as keyof IntelligenceSubScores;
                  const isRisk = category === 'risk';
                  const label = getScoreLabel(value, isRisk);
                  
                  return (
                    <Card key={key} className="relative overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <SubScoreIcon category={category} />
                            <span className="font-medium capitalize text-sm">{key}</span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-sm">
                                  {metadata?.explanations?.[category] || `${key} score: ${value}/100`}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-baseline gap-2">
                            <span className={cn("text-2xl font-bold", getScoreColor(value, isRisk))}>
                              {value}
                            </span>
                            <span className="text-xs text-muted-foreground">/ 100</span>
                          </div>
                          <Progress value={value} className="h-2" />
                          <p className={cn("text-xs", getScoreColor(value, isRisk))}>
                            {label}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Overall explanation */}
              {metadata?.explanations?.overall && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium mb-1">Overall Assessment</p>
                        <p className="text-sm text-muted-foreground">
                          {metadata.explanations.overall}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="breakdown" className="mt-4">
              {metadata?.breakdowns && (
                <div className="space-y-4">
                  {metadata.breakdowns.map((breakdown, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <SubScoreIcon category={breakdown.category} />
                            <h4 className="font-semibold capitalize">{breakdown.category}</h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              Score: {breakdown.score}
                            </Badge>
                            <Badge variant="outline">
                              Weight: {(breakdown.weight * 100).toFixed(0)}%
                            </Badge>
                            <Badge variant={getScoreBadgeVariant(breakdown.score, breakdown.category === 'risk')}>
                              Contribution: {breakdown.contribution.toFixed(1)}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {breakdown.factors.map((factor, factorIndex) => (
                            <div key={factorIndex} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{factor.name}</p>
                                <p className="text-xs text-muted-foreground">{factor.description}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress value={factor.value} className="w-20 h-2" />
                                <span className={cn("text-sm font-bold min-w-[3ch]", getScoreColor(factor.value))}>
                                  {factor.value.toFixed(0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="insights" className="mt-4 space-y-4">
              {/* Data Warnings */}
              {metadata?.dataWarnings && metadata.dataWarnings.length > 0 && (
                <Card className="border-orange-200 dark:border-orange-900">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h4 className="font-semibold">Data Warnings</h4>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {metadata.dataWarnings.map((warning, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Explanations for each dimension */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metadata?.explanations && Object.entries(metadata.explanations).map(([key, explanation]) => {
                  if (key === 'overall') return null;
                  const category = key as keyof IntelligenceSubScores;
                  return (
                    <Card key={key}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <SubScoreIcon category={category} />
                          <h4 className="font-semibold capitalize">{key} Analysis</h4>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{explanation}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
            
            <TabsContent value="recommendations" className="mt-4">
              {metadata?.recommendations && metadata.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <h4 className="font-semibold">Recommended Actions</h4>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {metadata.recommendations.map((recommendation, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">{index + 1}</span>
                          </div>
                          <span className="text-sm">{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Main LeadIntelligenceScore component
 */
export function LeadIntelligenceScore({
  intelligenceScore,
  subScores,
  metadata,
  className,
  variant = "detailed",
  showBreakdown = true,
  leadId
}: LeadIntelligenceScoreProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showFullDialog, setShowFullDialog] = useState(false);

  if (variant === "compact") {
    return (
      <div className={className} onClick={() => setShowFullDialog(true)}>
        <CompactScore intelligenceScore={intelligenceScore} />
        {showFullDialog && (
          <Dialog open={showFullDialog} onOpenChange={setShowFullDialog}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Lead Intelligence Analysis</DialogTitle>
              </DialogHeader>
              <FullScore 
                intelligenceScore={intelligenceScore}
                subScores={subScores}
                metadata={metadata}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  if (variant === "detailed") {
    return (
      <div className={className}>
        <DetailedScore
          intelligenceScore={intelligenceScore}
          subScores={subScores}
          showDetails={showDetails}
          onToggleDetails={() => setShowDetails(!showDetails)}
        />
        {showDetails && metadata && (
          <div className="mt-4">
            <FullScore
              intelligenceScore={intelligenceScore}
              subScores={subScores}
              metadata={metadata}
            />
          </div>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div className={className}>
      <FullScore
        intelligenceScore={intelligenceScore}
        subScores={subScores}
        metadata={metadata}
      />
    </div>
  );
}

/**
 * Simplified badge version for list views
 */
export function IntelligenceScoreBadge({ 
  score, 
  className 
}: { 
  score: number; 
  className?: string; 
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getScoreBadgeVariant(score)}
            className={cn("flex items-center gap-1", className)}
            data-testid="badge-intelligence"
          >
            <Brain className="w-3 h-3" />
            {score}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Intelligence Score: {getScoreLabel(score)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}