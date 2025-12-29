import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { QualityScoreBadge } from "@/components/QualityScoreBadge";
import { InsightsCard } from "@/components/InsightsCard";
import { EnrichmentBadge, EnrichmentDetails } from "@/components/EnrichmentBadge";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Package, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Brain,
  Loader2,
  Mail,
  Phone,
  Building,
  DollarSign,
  Calendar,
  MapPin,
  TrendingUp
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { LeadDetailModal } from "@/components/LeadDetailModal";
import type { AiInsight, Lead, LeadBatch } from "@shared/schema";

export default function ManageLeadsPage() {
  const { data: batches, isLoading } = useQuery<LeadBatch[]>({
    queryKey: ["/api/batches"],
  });
  const { toast } = useToast();
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadAnalysis, setLeadAnalysis] = useState<AiInsight | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showLeadDetailModal, setShowLeadDetailModal] = useState(false);

  const generateInsightsMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("POST", `/api/insights/generate/${batchId}`);
      return await response.json();
    },
    onSuccess: (data, batchId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/insights/batch", batchId] });
      toast({
        title: "AI Insights Generated",
        description: "Successfully generated AI insights for this batch.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI insights.",
        variant: "destructive",
      });
    },
  });

  const analyzeLeadMutation = useMutation<AiInsight, Error, string>({
    mutationFn: async (leadId: string) => {
      const response = await apiRequest("POST", `/api/leads/${leadId}/analyze`);
      return await response.json() as AiInsight;
    },
    onSuccess: (data) => {
      setLeadAnalysis(data);
      toast({
        title: "Lead Analysis Complete",
        description: "AI analysis generated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze lead.",
        variant: "destructive",
      });
    },
  });

  const toggleBatchExpansion = (batchId: string) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedBatches(newExpanded);
  };

  const handleAnalyzeLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setLeadAnalysis(null);
    setShowAnalysisModal(true);
    await analyzeLeadMutation.mutateAsync(lead.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-hero-kingdom min-h-screen">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-serif font-bold text-gradient-royal" data-testid="heading-manage">
          Manage Lead Batches
        </h1>
        <p className="text-muted-foreground">View and manage uploaded lead batches</p>
      </div>
      
      <div className="divider-elegant" />

      {!batches || batches.length === 0 ? (
        <Card className="card-kingdom animate-slide-up">
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50 text-primary" />
            <h3 className="text-lg font-semibold mb-2">No lead batches yet</h3>
            <p className="text-muted-foreground">Upload your first CSV file to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 animate-slide-up">
          {batches.map((batch: any) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              isExpanded={expandedBatches.has(batch.id)}
              onToggleExpansion={() => toggleBatchExpansion(batch.id)}
              onGenerateInsights={() => generateInsightsMutation.mutate(batch.id)}
              isGenerating={generateInsightsMutation.isPending}
              onAnalyzeLead={handleAnalyzeLead}
              onLeadClick={(lead) => {
                setSelectedLead(lead);
                setShowLeadDetailModal(true);
              }}
            />
          ))}
        </div>
      )}

      {/* AI Analysis Modal */}
      <Dialog open={showAnalysisModal} onOpenChange={setShowAnalysisModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              AI Lead Analysis
            </DialogTitle>
            {selectedLead && (
              <DialogDescription>
                {selectedLead.businessName} - {selectedLead.ownerName}
              </DialogDescription>
            )}
          </DialogHeader>

          {(() => {
            if (analyzeLeadMutation.isPending) {
              return (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Analyzing lead...</span>
                </div>
              );
            }
            
            if (!leadAnalysis) {
              return null;
            }
            
            const renderAnalysis = () => {
              const summary = leadAnalysis.executiveSummary 
                ? String(leadAnalysis.executiveSummary)
                : null;
              
              const segments = leadAnalysis.segments as Record<string, unknown> | null;
              
              return (
                <div className="space-y-4">
                  {/* Executive Summary */}
                  {summary && (
                    <div className="rounded-lg bg-muted/50 p-4">
                      <h4 className="font-semibold mb-2">Executive Summary</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {summary}
                      </p>
                    </div>
                  )}

                  {/* Detailed Analysis Sections */}
                  {segments && typeof segments === 'object' && (
                    <div className="grid gap-4">
                      {Object.entries(segments).map(([key, value]) => {
                        if (key === 'leadId' || !value) return null;
                        
                        const formatTitle = (k: string) => {
                          return k.replace(/([A-Z])/g, ' $1')
                            .replace(/^./, str => str.toUpperCase())
                            .trim();
                        };

                        return (
                          <div key={key} className="rounded-lg border p-4">
                            <h4 className="font-semibold mb-2 text-sm">
                              {formatTitle(key)}
                            </h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {String(value)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            };
            
            return renderAnalysis();
          })()}
        </DialogContent>
      </Dialog>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead as any}
        isOpen={showLeadDetailModal}
        onClose={() => {
          setShowLeadDetailModal(false);
          setSelectedLead(null);
        }}
        onPurchase={async (lead: any) => {
          // Handle purchase
          toast({
            title: "Purchase Initiated",
            description: `Lead purchase started for ${lead.businessName}`,
          });
        }}
        onExport={async (lead: any, format: any) => {
          // Handle export
          toast({
            title: "Export Started",
            description: `Exporting lead data as ${format}`,
          });
        }}
      />
    </div>
  );
}

interface BatchCardProps {
  batch: any;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onGenerateInsights: () => void;
  isGenerating: boolean;
  onAnalyzeLead: (lead: Lead) => void;
  onLeadClick: (lead: Lead) => void;
}

function BatchCard({
  batch,
  isExpanded,
  onToggleExpansion,
  onGenerateInsights,
  isGenerating,
  onAnalyzeLead,
  onLeadClick,
}: BatchCardProps) {
  const { data: insights, isLoading: insightsLoading } = useQuery<AiInsight>({
    queryKey: ["/api/insights/batch", batch.id],
    enabled: isExpanded,
  });

  const { data: leads, isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads/batch", batch.id],
    enabled: isExpanded,
  });

  return (
    <Card data-testid={`card-batch-${batch.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{batch.filename}</h3>
            <p className="text-sm text-muted-foreground">
              Uploaded {formatDistanceToNow(new Date(batch.uploadedAt), { addSuffix: true })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                batch.status === "published"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  : batch.status === "ready"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
              }`}
            >
              {batch.status}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Leads</div>
            <div className="text-2xl font-bold">{batch.totalLeads}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg Quality Score</div>
            <div className="text-2xl font-bold">
              {batch.averageQualityScore
                ? parseFloat(batch.averageQualityScore).toFixed(1)
                : "N/A"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Batch ID</div>
            <div className="text-sm font-mono">{batch.id.slice(0, 12)}...</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Storage</div>
            <div className="text-sm truncate">{batch.storageKey}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={onGenerateInsights}
            disabled={isGenerating}
            data-testid={`button-generate-insights-${batch.id}`}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate Batch Insights"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpansion}
            data-testid={`button-toggle-expansion-${batch.id}`}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                View Leads & Insights
              </>
            )}
          </Button>
        </div>

        {isExpanded && (
          <div className="pt-4 space-y-4">
            {/* Batch Insights Section */}
            {insights && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-2">Batch Insights</h4>
                <InsightsCard insight={insights} />
              </div>
            )}

            {/* Individual Leads Section */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Individual Leads</h4>
              {leadsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading leads...
                </div>
              ) : leads && leads.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-sm font-medium">Business</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Industry</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Revenue</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Score</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Enrichment</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">State</th>
                        <th className="text-left py-2 px-3 text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr 
                          key={lead.id} 
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => onLeadClick(lead)}
                        >
                          <td className="py-3 px-3">
                            <div>
                              <div className="font-medium text-sm">{lead.businessName}</div>
                              <div className="text-xs text-muted-foreground">{lead.ownerName}</div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-sm">{lead.industry || '-'}</td>
                          <td className="py-3 px-3 text-sm">
                            {lead.annualRevenue ? `$${lead.annualRevenue}` : '-'}
                          </td>
                          <td className="py-3 px-3">
                            <QualityScoreBadge score={lead.qualityScore} />
                          </td>
                          <td className="py-3 px-3">
                            <EnrichmentBadge isEnriched={lead.isEnriched || false} />
                            {!lead.isEnriched && <span className="text-sm text-muted-foreground">-</span>}
                          </td>
                          <td className="py-3 px-3 text-sm">{lead.stateCode || '-'}</td>
                          <td className="py-3 px-3">
                            <div className="flex gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => onAnalyzeLead(lead)}
                                data-testid={`button-analyze-lead-${lead.id}`}
                                title="Analyze with AI"
                              >
                                <Brain className="w-4 h-4" />
                              </Button>
                              <LeadDetailsPopover lead={lead} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No leads found in this batch.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadDetailsPopover({ lead }: { lead: Lead }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      data-testid={`button-view-lead-${lead.id}`}
      title="View Details"
      onClick={() => {
        // This could open a popover or dialog with full lead details
        // For now, it's a placeholder
      }}
    >
      <TrendingUp className="w-4 h-4" />
    </Button>
  );
}