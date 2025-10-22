import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { QualityScoreBadge } from "@/components/QualityScoreBadge";
import { InsightsCard } from "@/components/InsightsCard";
import { Button } from "@/components/ui/button";
import { Package, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { AiInsight } from "@shared/schema";

export default function ManageLeadsPage() {
  const { data: batches, isLoading } = useQuery({
    queryKey: ["/api/batches"],
  });
  const { toast } = useToast();
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

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

  const toggleBatchExpansion = (batchId: string) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedBatches(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-manage">
          Manage Lead Batches
        </h1>
        <p className="text-muted-foreground">View and manage uploaded lead batches</p>
      </div>

      {!batches || batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No lead batches yet</h3>
            <p className="text-muted-foreground">Upload your first CSV file to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {batches.map((batch: any) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              isExpanded={expandedBatches.has(batch.id)}
              onToggleExpansion={() => toggleBatchExpansion(batch.id)}
              onGenerateInsights={() => generateInsightsMutation.mutate(batch.id)}
              isGenerating={generateInsightsMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BatchCardProps {
  batch: any;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onGenerateInsights: () => void;
  isGenerating: boolean;
}

function BatchCard({
  batch,
  isExpanded,
  onToggleExpansion,
  onGenerateInsights,
  isGenerating,
}: BatchCardProps) {
  const { data: insights, isLoading: insightsLoading } = useQuery<AiInsight>({
    queryKey: ["/api/insights/batch", batch.id],
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
            {isGenerating ? "Generating..." : "Generate AI Insights"}
          </Button>

          {insights && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleExpansion}
              data-testid={`button-toggle-insights-${batch.id}`}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Hide Insights
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  View Insights
                </>
              )}
            </Button>
          )}
        </div>

        {isExpanded && (
          <div className="pt-4">
            {insightsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading insights...
              </div>
            ) : insights ? (
              <InsightsCard insight={insights} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No insights available yet. Click "Generate AI Insights" to create them.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
