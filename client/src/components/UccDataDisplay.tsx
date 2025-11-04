import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, DollarSign, FileText, AlertTriangle, TrendingUp, Calendar } from "lucide-react";

interface UccDataDisplayProps {
  totalDebt?: number;
  activeUccCount?: number;
  lastFilingDate?: Date | string | null;
  riskLevel?: string;
  compact?: boolean;
}

export function UccDataDisplay({ 
  totalDebt = 0, 
  activeUccCount = 0, 
  lastFilingDate, 
  riskLevel = 'unknown',
  compact = false 
}: UccDataDisplayProps) {
  // Format the date
  const formattedDate = lastFilingDate 
    ? new Date(lastFilingDate).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })
    : 'No filings';

  // Determine risk badge variant
  const getRiskVariant = () => {
    switch (riskLevel?.toLowerCase()) {
      case 'low':
        return 'secondary';
      case 'medium':
        return 'outline';
      case 'high':
        return 'destructive';
      default:
        return 'default';
    }
  };

  // Determine risk color
  const getRiskColor = () => {
    switch (riskLevel?.toLowerCase()) {
      case 'low':
        return 'text-green-600';
      case 'medium':
        return 'text-yellow-600';
      case 'high':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  if (compact) {
    // Compact view for lead cards in lists
    return (
      <div className="flex items-center gap-4 text-sm">
        {activeUccCount > 0 && (
          <>
            <div className="flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">${(totalDebt / 100).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span>{activeUccCount} liens</span>
            </div>
            <Badge variant={getRiskVariant()} className="text-xs">
              {riskLevel} risk
            </Badge>
          </>
        )}
        {activeUccCount === 0 && (
          <span className="text-muted-foreground">No UCC filings</span>
        )}
      </div>
    );
  }

  // Full view for detailed lead pages
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          UCC Intelligence
        </CardTitle>
        <CardDescription>
          Uniform Commercial Code filing data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Risk Level Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Risk Level</span>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${getRiskColor()}`} />
              <Badge variant={getRiskVariant()}>
                {riskLevel?.charAt(0).toUpperCase() + riskLevel?.slice(1)} Risk
              </Badge>
            </div>
          </div>

          {/* Total Debt */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total UCC Debt</span>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-lg">
                ${(totalDebt / 100).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Active Liens */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Active Liens</span>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold">
                {activeUccCount}
              </span>
            </div>
          </div>

          {/* Last Filing Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Last Filing</span>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Risk Indicator Bar */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Debt Risk Score</span>
              <span className="text-xs font-medium">{riskLevel?.toUpperCase()}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  riskLevel === 'low' ? 'bg-green-500 w-1/3' :
                  riskLevel === 'medium' ? 'bg-yellow-500 w-2/3' :
                  riskLevel === 'high' ? 'bg-red-500 w-full' :
                  'bg-gray-500 w-0'
                }`}
              />
            </div>
          </div>

          {/* Summary Text */}
          {activeUccCount > 0 && (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              This business has {activeUccCount} active UCC filing{activeUccCount !== 1 ? 's' : ''} 
              {totalDebt > 0 && ` totaling $${(totalDebt / 100).toLocaleString()} in secured debt`}.
              {riskLevel === 'high' && ' Consider the high debt load when evaluating this lead.'}
              {riskLevel === 'medium' && ' Moderate debt levels indicate some financial obligations.'}
              {riskLevel === 'low' && ' Low debt levels suggest manageable financial obligations.'}
            </div>
          )}

          {activeUccCount === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              <Shield className="w-8 h-8 mx-auto mb-2 text-green-500" />
              No UCC filings found
              <p className="text-xs mt-1">This business has no recorded UCC liens</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}