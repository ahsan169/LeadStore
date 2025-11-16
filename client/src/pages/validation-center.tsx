import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, CheckCircle2, XCircle, AlertTriangle, Mail, Phone, Building, User, Search, RefreshCw, FileCheck, AlertCircle, Loader2 } from "lucide-react";
import { LeadDetailModal } from "@/components/LeadDetailModal";
import type { Lead } from "@/../../shared/schema";

export default function ValidationCenter() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch leads for validation
  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/leads/validation-queue"],
  });

  // Fetch validation stats
  const { data: stats } = useQuery({
    queryKey: ["/api/validation/stats"],
  });

  // Validate single lead
  const validateMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await apiRequest("POST", `/api/validation/validate/${leadId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Validation Complete",
        description: "Lead has been validated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/validation-queue"] });
    },
    onError: () => {
      toast({
        title: "Validation Failed",
        description: "Failed to validate lead",
        variant: "destructive",
      });
    },
  });

  // Bulk validate mutation
  const bulkValidateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/validation/bulk-validate`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Validation Started",
        description: `${data.validated} leads queued for validation`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/validation-queue"] });
    },
  });

  const filteredLeads = leads?.filter((lead: Lead) => 
    !searchQuery || 
    lead.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVerificationBadge = (score: number | null | undefined) => {
    if (score === null || score === undefined) return { variant: "outline" as const, text: "Not Verified", color: "text-gray-500" };
    if (score >= 80) return { variant: "default" as const, text: "Verified", color: "text-green-600" };
    if (score >= 60) return { variant: "secondary" as const, text: "Partial", color: "text-yellow-600" };
    return { variant: "destructive" as const, text: "Failed", color: "text-red-600" };
  };

  const getOverallValidation = (lead: any) => {
    const scores = [
      lead.emailVerificationScore,
      lead.phoneVerificationScore,
      lead.nameVerificationScore
    ].filter(s => s !== null && s !== undefined);
    
    if (scores.length === 0) return "Unvalidated";
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    if (avg >= 80) return "Fully Validated";
    if (avg >= 60) return "Partially Validated";
    return "Validation Issues";
  };

  const getValidationColor = (status: string) => {
    switch (status) {
      case "Fully Validated": return "text-green-600";
      case "Partially Validated": return "text-yellow-600";
      case "Validation Issues": return "text-red-600";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-validation">
          Validation Center
        </h1>
        <p className="text-muted-foreground">
          Comprehensive lead validation and verification system to ensure data quality
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Fully Validated</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.fullyValidated || 0}</div>
            <p className="text-xs text-muted-foreground">100% verified leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Partial Validation</CardTitle>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.partiallyValidated || 0}</div>
            <p className="text-xs text-muted-foreground">Needs review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed Validation</CardTitle>
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.failedValidation || 0}</div>
            <p className="text-xs text-muted-foreground">Invalid data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Validation Rate</CardTitle>
              <Shield className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.validationRate || 0}%</div>
            <p className="text-xs text-muted-foreground">Overall accuracy</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="validation" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="validation">Validation Queue</TabsTrigger>
          <TabsTrigger value="verified">Verified Leads</TabsTrigger>
          <TabsTrigger value="issues">Validation Issues</TabsTrigger>
        </TabsList>

        {/* Validation Queue Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leads Awaiting Validation</CardTitle>
                  <CardDescription>Verify contact information and business details</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/leads/validation-queue"] })}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                  <Button
                    onClick={() => bulkValidateMutation.mutate()}
                    disabled={bulkValidateMutation.isPending || !filteredLeads?.length}
                  >
                    <FileCheck className="w-4 h-4 mr-2" />
                    Validate All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Leads List */}
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLeads?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No leads pending validation</p>
                  <p className="text-sm mt-2">All leads have been validated</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads?.map((lead: any) => (
                    <div
                      key={lead.id}
                      className="p-4 border rounded-lg hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowDetailModal(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{lead.businessName}</h4>
                          <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            validateMutation.mutate(lead.id);
                          }}
                          disabled={validateMutation.isPending}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Validate
                        </Button>
                      </div>

                      {/* Validation Status Grid */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">Email</p>
                            {lead.emailVerificationScore !== null ? (
                              <Progress value={lead.emailVerificationScore} className="h-2" />
                            ) : (
                              <Badge variant="outline" className="text-xs">Unverified</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">Phone</p>
                            {lead.phoneVerificationScore !== null ? (
                              <Progress value={lead.phoneVerificationScore} className="h-2" />
                            ) : (
                              <Badge variant="outline" className="text-xs">Unverified</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">Name</p>
                            {lead.nameVerificationScore !== null ? (
                              <Progress value={lead.nameVerificationScore} className="h-2" />
                            ) : (
                              <Badge variant="outline" className="text-xs">Unverified</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verified Leads Tab */}
        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fully Verified Leads</CardTitle>
              <CardDescription>Leads with complete validation</CardDescription>
            </CardHeader>
            <CardContent>
              {leads?.filter((l: any) => getOverallValidation(l) === "Fully Validated").length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No fully verified leads yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leads?.filter((l: any) => getOverallValidation(l) === "Fully Validated").map((lead: any) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover-elevate"
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowDetailModal(true);
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          <div>
                            <h4 className="font-medium">{lead.businessName}</h4>
                            <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
                          </div>
                        </div>
                        <div className="flex gap-4 mt-2">
                          <Badge variant="default" className="text-xs">
                            <Mail className="w-3 h-3 mr-1" />
                            Email {lead.emailVerificationScore}%
                          </Badge>
                          <Badge variant="default" className="text-xs">
                            <Phone className="w-3 h-3 mr-1" />
                            Phone {lead.phoneVerificationScore}%
                          </Badge>
                          <Badge variant="default" className="text-xs">
                            <User className="w-3 h-3 mr-1" />
                            Name {lead.nameVerificationScore}%
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-green-600 font-medium">
                        100% Validated
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Issues Tab */}
        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Issues</CardTitle>
              <CardDescription>Leads with failed or partial validation</CardDescription>
            </CardHeader>
            <CardContent>
              {leads?.filter((l: any) => {
                const status = getOverallValidation(l);
                return status === "Validation Issues" || status === "Partially Validated";
              }).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No validation issues found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leads?.filter((l: any) => {
                    const status = getOverallValidation(l);
                    return status === "Validation Issues" || status === "Partially Validated";
                  }).map((lead: any) => (
                    <div
                      key={lead.id}
                      className="p-4 border rounded-lg cursor-pointer hover-elevate"
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowDetailModal(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getOverallValidation(lead) === "Validation Issues" ? (
                            <XCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-yellow-500" />
                          )}
                          <div>
                            <h4 className="font-medium">{lead.businessName}</h4>
                            <p className="text-sm text-muted-foreground">{lead.ownerName}</p>
                          </div>
                        </div>
                        <Badge 
                          variant={getOverallValidation(lead) === "Validation Issues" ? "destructive" : "secondary"}
                        >
                          {getOverallValidation(lead)}
                        </Badge>
                      </div>

                      {/* Issue Details */}
                      <div className="space-y-2 pl-8">
                        {(lead.emailVerificationScore === null || lead.emailVerificationScore < 60) && (
                          <div className="flex items-center gap-2 text-sm">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span>Email validation failed</span>
                          </div>
                        )}
                        {(lead.phoneVerificationScore === null || lead.phoneVerificationScore < 60) && (
                          <div className="flex items-center gap-2 text-sm">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span>Phone validation failed</span>
                          </div>
                        )}
                        {(lead.nameVerificationScore === null || lead.nameVerificationScore < 60) && (
                          <div className="flex items-center gap-2 text-sm">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span>Name validation failed</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedLead(null);
        }}
        onEnrich={async (lead) => {
          toast({
            title: "Enrichment Started",
            description: `Enriching ${lead.businessName}`,
          });
        }}
        onExport={async (lead, format) => {
          toast({
            title: "Export Started",
            description: `Exporting lead as ${format}`,
          });
        }}
      />
    </div>
  );
}