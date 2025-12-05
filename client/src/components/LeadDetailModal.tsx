import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  TrendingUp,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Globe,
  Linkedin,
  Hash,
  Users,
  Activity,
  BarChart,
  FileText,
  Clock,
  Target,
  Award,
  Database,
  AlertTriangle,
  Info,
  ChevronRight,
  ExternalLink,
  Download,
  Send,
  Star,
  Copy,
  CheckSquare
} from "lucide-react";

interface Lead {
  // Basic Information
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  
  // Address Information
  fullAddress?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  zipCode?: string;
  
  // Business Information
  industry?: string;
  annualRevenue?: string | number;
  employeeCount?: string | number;
  yearFounded?: string | number;
  yearsInBusiness?: string | number;
  websiteUrl?: string;
  linkedinUrl?: string;
  
  // Financial Information
  requestedAmount?: string | number;
  creditScore?: string | number;
  dailyBankDeposits?: string | number;
  monthlyRevenue?: string | number;
  
  // Verification & Scoring
  unifiedLeadScore?: number;
  leadScoreCategory?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  emailVerificationScore?: number;
  phoneVerificationScore?: number;
  nameVerificationScore?: number;
  overallVerificationScore?: number;
  verificationStatus?: string;
  qualityScore?: number;
  freshnessScore?: number;
  
  // UCC & MCA Data
  uccMatchConfidence?: number;
  uccRiskLevel?: string;
  uccNumber?: string;
  uccFilingCount?: number;
  totalUccDebt?: number;
  mostRecentFiling?: string;
  securedParties?: string[];
  
  // California MCA Specific
  mcaScore?: number;
  mcaQualityTier?: string;
  mcaQualityScore?: number;
  hasBankRelationship?: boolean;
  hasEquipmentFinancing?: boolean;
  hasIrsLien?: boolean;
  hasSbaLoan?: boolean;
  mcaSector?: string;
  isGovernmentEntity?: boolean;
  whyGoodForMca?: string[];
  
  // Codes & Identifiers
  ein?: string;
  naicsCode?: string;
  sicCode?: string;
  
  // Metadata
  source?: string;
  batchId?: string;
  uploadedAt?: string;
  updatedAt?: string;
  lastEnrichedAt?: string;
  tags?: string[];
  notes?: string;
}

interface LeadDetailModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onExport?: (lead: Lead, format: string) => void;
  onPurchase?: (lead: Lead) => void;
}

export function LeadDetailModal({ lead, isOpen, onClose, onExport, onPurchase }: LeadDetailModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  if (!lead) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 60) return "text-blue-600 bg-blue-100";
    if (score >= 40) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getVerificationIcon = (score?: number) => {
    if (!score) return <AlertCircle className="h-4 w-4 text-gray-400" />;
    if (score >= 80) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (score >= 50) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const formatCurrency = (value: string | number | undefined) => {
    if (!value) return "N/A";
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (value: string | number | undefined) => {
    if (!value) return "N/A";
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    return new Intl.NumberFormat('en-US').format(num);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Building className="h-6 w-6 text-primary" />
                {lead.businessName}
              </DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {lead.ownerName || "Unknown Owner"}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {lead.city}, {lead.stateCode}
                </span>
                {lead.industry && (
                  <Badge variant="outline">{lead.industry}</Badge>
                )}
              </DialogDescription>
            </div>
            
            {/* Lead Score Display */}
            {lead.unifiedLeadScore && (
              <div className={`rounded-lg px-4 py-3 text-center ${getScoreColor(lead.unifiedLeadScore)}`}>
                <div className="text-3xl font-bold">{lead.unifiedLeadScore}</div>
                <div className="text-xs uppercase tracking-wider mt-1">Lead Score</div>
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="px-6 w-full justify-start border-b rounded-none h-12">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="verification">Verification</TabsTrigger>
            <TabsTrigger value="mca">MCA Analysis</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px]">
            <TabsContent value="overview" className="px-6 pb-6 mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Business Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Industry</span>
                      <span className="text-sm font-medium">{lead.industry || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Annual Revenue</span>
                      <span className="text-sm font-medium">{formatCurrency(lead.annualRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Employee Count</span>
                      <span className="text-sm font-medium">{formatNumber(lead.employeeCount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Years in Business</span>
                      <span className="text-sm font-medium">{lead.yearsInBusiness || lead.yearFounded || "N/A"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Financial Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Requested Amount</span>
                      <span className="text-sm font-medium">{formatCurrency(lead.requestedAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Credit Score</span>
                      <span className="text-sm font-medium">{lead.creditScore || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Daily Deposits</span>
                      <span className="text-sm font-medium">{formatCurrency(lead.dailyBankDeposits)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                      <span className="text-sm font-medium">{formatCurrency(lead.monthlyRevenue)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quality Indicators */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Quality Indicators</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {lead.qualityScore || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">Quality Score</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {lead.freshnessScore || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">Freshness</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {lead.overallVerificationScore || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">Verification</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tags and Notes */}
              {(lead.tags?.length || lead.notes) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {lead.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {lead.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {lead.notes && (
                      <p className="text-sm text-muted-foreground">{lead.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="contact" className="px-6 pb-6 mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{lead.phone || "No phone"}</div>
                        <div className="text-xs text-muted-foreground">Primary Phone</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getVerificationIcon(lead.phoneVerificationScore)}
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => copyToClipboard(lead.phone || "", "Phone")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {lead.secondaryPhone && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{lead.secondaryPhone}</div>
                          <div className="text-xs text-muted-foreground">Secondary Phone</div>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => copyToClipboard(lead.secondaryPhone || "", "Secondary Phone")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{lead.email || "No email"}</div>
                        <div className="text-xs text-muted-foreground">Email Address</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getVerificationIcon(lead.emailVerificationScore)}
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => copyToClipboard(lead.email || "", "Email")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium">Address</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {lead.fullAddress || lead.address || "N/A"}<br />
                          {lead.city}, {lead.stateCode} {lead.zipCode}
                        </div>
                      </div>
                    </div>

                    {lead.websiteUrl && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-primary" />
                        <a 
                          href={lead.websiteUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {lead.websiteUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {lead.linkedinUrl && (
                      <div className="flex items-center gap-3">
                        <Linkedin className="h-5 w-5 text-primary" />
                        <a 
                          href={lead.linkedinUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          LinkedIn Profile
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financial" className="px-6 pb-6 mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Revenue Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Annual Revenue</span>
                      <span className="text-lg font-semibold">{formatCurrency(lead.annualRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                      <span className="text-lg font-semibold">{formatCurrency(lead.monthlyRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Daily Bank Deposits</span>
                      <span className="text-lg font-semibold">{formatCurrency(lead.dailyBankDeposits)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Funding Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Requested Amount</span>
                      <span className="text-lg font-semibold">{formatCurrency(lead.requestedAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Credit Score</span>
                      <Badge variant={lead.creditScore && parseInt(lead.creditScore.toString()) > 650 ? "default" : "secondary"}>
                        {lead.creditScore || "N/A"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Employee Count</span>
                      <span className="text-lg font-semibold">{formatNumber(lead.employeeCount)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* UCC Information */}
              {(lead.uccNumber || lead.uccFilingCount) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      UCC Filing Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">UCC Number</span>
                          <span className="text-sm font-medium">{lead.uccNumber || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Filing Count</span>
                          <span className="text-sm font-medium">{lead.uccFilingCount || 0}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Debt</span>
                          <span className="text-sm font-medium">{formatCurrency(lead.totalUccDebt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Risk Level</span>
                          <Badge variant={
                            lead.uccRiskLevel === 'low' ? 'default' : 
                            lead.uccRiskLevel === 'high' ? 'destructive' : 'secondary'
                          }>
                            {lead.uccRiskLevel || "Unknown"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {lead.securedParties?.length > 0 && (
                      <div className="mt-4">
                        <div className="text-sm text-muted-foreground mb-2">Secured Parties</div>
                        <div className="flex flex-wrap gap-2">
                          {lead.securedParties.map((party, index) => (
                            <Badge key={index} variant="outline">{party}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="verification" className="px-6 pb-6 mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Verification Status</CardTitle>
                  <CardDescription>
                    Overall verification score: {lead.overallVerificationScore || 0}%
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span className="text-sm font-medium">Email Verification</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={lead.emailVerificationScore || 0} className="w-32" />
                        <span className="text-sm font-medium w-12 text-right">
                          {lead.emailVerificationScore || 0}%
                        </span>
                        {getVerificationIcon(lead.emailVerificationScore)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="text-sm font-medium">Phone Verification</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={lead.phoneVerificationScore || 0} className="w-32" />
                        <span className="text-sm font-medium w-12 text-right">
                          {lead.phoneVerificationScore || 0}%
                        </span>
                        {getVerificationIcon(lead.phoneVerificationScore)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span className="text-sm font-medium">Name Verification</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={lead.nameVerificationScore || 0} className="w-32" />
                        <span className="text-sm font-medium w-12 text-right">
                          {lead.nameVerificationScore || 0}%
                        </span>
                        {getVerificationIcon(lead.nameVerificationScore)}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium">Verification Status</span>
                      <Badge variant={
                        lead.verificationStatus === 'verified' ? 'default' :
                        lead.verificationStatus === 'partial' ? 'secondary' : 'outline'
                      }>
                        {lead.verificationStatus || 'Unverified'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last verified: {lead.updatedAt || 'Never'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mca" className="px-6 pb-6 mt-4 space-y-4">
              {lead.stateCode === 'CA' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        California MCA Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">MCA Score</span>
                          <div className={`px-3 py-1 rounded-lg font-bold ${getScoreColor(lead.mcaScore || 0)}`}>
                            {lead.mcaScore || 0}/100
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Quality Tier</span>
                          <Badge variant={
                            lead.mcaQualityTier === 'Excellent' ? 'default' :
                            lead.mcaQualityTier === 'Good' ? 'secondary' :
                            lead.mcaQualityTier === 'Fair' ? 'outline' : 'destructive'
                          }>
                            {lead.mcaQualityTier || 'Unknown'}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Sector Classification</span>
                          <Badge variant="outline">
                            {lead.mcaSector || 'General'}
                          </Badge>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            {lead.hasBankRelationship ? 
                              <CheckSquare className="h-4 w-4 text-green-500" /> : 
                              <XCircle className="h-4 w-4 text-gray-400" />
                            }
                            <span>Bank Relationship</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lead.hasEquipmentFinancing ? 
                              <CheckSquare className="h-4 w-4 text-green-500" /> : 
                              <XCircle className="h-4 w-4 text-gray-400" />
                            }
                            <span>Equipment Financing</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lead.hasIrsLien ? 
                              <AlertTriangle className="h-4 w-4 text-red-500" /> : 
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            }
                            <span>{lead.hasIrsLien ? 'Has' : 'No'} IRS Lien</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lead.hasSbaLoan ? 
                              <AlertTriangle className="h-4 w-4 text-yellow-500" /> : 
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            }
                            <span>{lead.hasSbaLoan ? 'Has' : 'No'} SBA Loan</span>
                          </div>
                        </div>

                        {lead.whyGoodForMca?.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <div className="text-sm font-medium mb-2">Why Good for MCA</div>
                              <div className="flex flex-wrap gap-2">
                                {lead.whyGoodForMca.map((reason, index) => (
                                  <Badge key={index} className="bg-green-100 text-green-700">
                                    {reason}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {lead.isGovernmentEntity && (
                          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-2 text-red-700">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm font-medium">Government Entity - Not Eligible for MCA</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Business Identifiers */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Business Identifiers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lead.ein && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">EIN</span>
                      <span className="text-sm font-medium font-mono">{lead.ein}</span>
                    </div>
                  )}
                  {lead.naicsCode && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">NAICS Code</span>
                      <span className="text-sm font-medium font-mono">{lead.naicsCode}</span>
                    </div>
                  )}
                  {lead.sicCode && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">SIC Code</span>
                      <span className="text-sm font-medium font-mono">{lead.sicCode}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </ScrollArea>
        </Tabs>

        <div className="px-6 pb-6 pt-4 border-t flex justify-between items-center">
          <div className="text-xs text-muted-foreground">
            Lead ID: {lead.id} • Uploaded: {lead.uploadedAt || 'Unknown'} • Last Updated: {lead.updatedAt || 'Unknown'}
          </div>
          <div className="flex gap-2">
            {onExport && (
              <Button variant="outline" size="sm" onClick={() => onExport(lead, 'csv')}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            )}
            {onPurchase && (
              <Button size="sm" onClick={() => onPurchase(lead)}>
                Purchase Lead
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}