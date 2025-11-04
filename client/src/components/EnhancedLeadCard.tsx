import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  Shield,
  Zap,
  Calendar,
  Building,
  DollarSign,
  Target,
  RefreshCw,
  Sparkles,
  MapPin,
  Award,
  CheckSquare
} from "lucide-react";

interface LeadInsight {
  type: string;
  label: string;
  description: string;
  icon: string;
  color: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
}

interface Lead {
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  industry: string;
  annualRevenue: string;
  requestedAmount: string;
  creditScore: string;
  stateCode: string;
  
  // New fields
  unifiedLeadScore?: number;
  leadScoreCategory?: string;
  emailVerificationScore?: number;
  phoneVerificationScore?: number;
  nameVerificationScore?: number;
  overallVerificationScore?: number;
  verificationStatus?: string;
  uccMatchConfidence?: number;
  uccRiskLevel?: string;
  leadInsights?: LeadInsight[];
  insightTags?: string[];
  freshnessScore?: number;
  updatedAt?: string;
}

interface EnhancedLeadCardProps {
  lead: Lead;
  onViewDetails?: (lead: Lead) => void;
  onExport?: (lead: Lead, format: string) => void;
  showPurchaseButton?: boolean;
  onPurchase?: (lead: Lead) => void;
}

export function EnhancedLeadCard({ 
  lead, 
  onViewDetails, 
  onExport, 
  showPurchaseButton = false,
  onPurchase 
}: EnhancedLeadCardProps) {
  // Get verification badge
  const getVerificationBadge = () => {
    const score = lead.overallVerificationScore || 0;
    
    if (score >= 80) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Verified ({score}%)</p>
          </TooltipContent>
        </Tooltip>
      );
    } else if (score >= 50) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="w-5 h-5 text-yellow-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Partially Verified ({score}%)</p>
          </TooltipContent>
        </Tooltip>
      );
    } else if (score > 0) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <XCircle className="w-5 h-5 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Unverified ({score}%)</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return null;
  };

  // Get score color and label
  const getScoreDisplay = (score: number) => {
    if (score >= 80) {
      return { color: 'text-green-600 bg-green-100', label: 'Excellent' };
    } else if (score >= 60) {
      return { color: 'text-blue-600 bg-blue-100', label: 'Good' };
    } else if (score >= 40) {
      return { color: 'text-yellow-600 bg-yellow-100', label: 'Fair' };
    } else {
      return { color: 'text-red-600 bg-red-100', label: 'Poor' };
    }
  };

  // Get UCC risk badge
  const getUccRiskBadge = () => {
    if (!lead.uccRiskLevel) return null;
    
    const riskColors = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-red-100 text-red-700'
    };
    
    return (
      <Badge className={riskColors[lead.uccRiskLevel as keyof typeof riskColors]}>
        UCC Risk: {lead.uccRiskLevel}
      </Badge>
    );
  };

  // Get insight icon
  const getInsightIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      'dollar-sign': DollarSign,
      'check-circle': CheckCircle,
      'shield-check': Shield,
      'clock': Calendar,
      'zap': Zap,
      'building': Building,
      'trending-up': TrendingUp,
      'target': Target,
      'refresh-cw': RefreshCw,
      'sparkles': Sparkles,
      'map-pin': MapPin,
      'award': Award,
      'check-square': CheckSquare
    };
    
    const Icon = icons[iconName] || AlertCircle;
    return Icon;
  };

  const scoreDisplay = lead.unifiedLeadScore ? getScoreDisplay(lead.unifiedLeadScore) : null;

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{lead.businessName}</h3>
              {getVerificationBadge()}
              {lead.uccMatchConfidence && lead.uccMatchConfidence > 70 && (
                <Tooltip>
                  <TooltipTrigger>
                    <Shield className="w-5 h-5 text-blue-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>UCC Match Confidence: {lead.uccMatchConfidence}%</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
            <p className="text-xs text-muted-foreground">{lead.industry} • {lead.stateCode}</p>
          </div>
          
          {/* Lead Score Display */}
          {lead.unifiedLeadScore && scoreDisplay && (
            <div className="text-center">
              <div className={`rounded-lg px-3 py-2 ${scoreDisplay.color}`}>
                <div className="text-2xl font-bold">{lead.unifiedLeadScore}</div>
                <div className="text-xs">{scoreDisplay.label}</div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Revenue:</span>
            <span className="ml-1 font-medium">{lead.annualRevenue}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Request:</span>
            <span className="ml-1 font-medium">{lead.requestedAmount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Credit:</span>
            <span className="ml-1 font-medium">{lead.creditScore}</span>
          </div>
          <div>
            <span className="text-muted-foreground">State:</span>
            <span className="ml-1 font-medium">{lead.stateCode}</span>
          </div>
        </div>

        {/* Verification Details */}
        <div className="flex gap-2 text-xs">
          {lead.emailVerificationScore !== undefined && (
            <Badge variant="outline" className="gap-1">
              Email: {lead.emailVerificationScore}%
            </Badge>
          )}
          {lead.phoneVerificationScore !== undefined && (
            <Badge variant="outline" className="gap-1">
              Phone: {lead.phoneVerificationScore}%
            </Badge>
          )}
          {lead.nameVerificationScore !== undefined && (
            <Badge variant="outline" className="gap-1">
              Name: {lead.nameVerificationScore}%
            </Badge>
          )}
        </div>

        {/* Risk and Metadata */}
        <div className="flex flex-wrap gap-2">
          {getUccRiskBadge()}
          {lead.freshnessScore && lead.freshnessScore >= 80 && (
            <Badge className="bg-blue-100 text-blue-700">
              Fresh Lead
            </Badge>
          )}
        </div>

        {/* Lead Insights */}
        {lead.leadInsights && lead.leadInsights.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {lead.leadInsights.slice(0, 3).map((insight, index) => {
                const Icon = getInsightIcon(insight.icon);
                const colorClasses = {
                  green: 'bg-green-100 text-green-700',
                  blue: 'bg-blue-100 text-blue-700',
                  yellow: 'bg-yellow-100 text-yellow-700',
                  red: 'bg-red-100 text-red-700',
                  purple: 'bg-purple-100 text-purple-700'
                };
                
                return (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge className={`${colorClasses[insight.color]} gap-1`}>
                          <Icon className="w-3 h-3" />
                          {insight.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{insight.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => onViewDetails?.(lead)}
          data-testid={`button-view-lead-${lead.id}`}
        >
          View Details
        </Button>
        
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExport(lead, 'csv')}
            data-testid={`button-export-lead-${lead.id}`}
          >
            Export
          </Button>
        )}
        
        {showPurchaseButton && onPurchase && (
          <Button 
            size="sm" 
            onClick={() => onPurchase(lead)}
            data-testid={`button-purchase-lead-${lead.id}`}
          >
            Purchase
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}