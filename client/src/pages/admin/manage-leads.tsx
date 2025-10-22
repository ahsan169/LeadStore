import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { QualityScoreBadge } from "@/components/QualityScoreBadge";
import { Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ManageLeadsPage() {
  const { data: batches, isLoading } = useQuery({
    queryKey: ["/api/batches"],
  });

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
            <Card key={batch.id} data-testid={`card-batch-${batch.id}`}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{batch.filename}</h3>
                    <p className="text-sm text-muted-foreground">
                      Uploaded {formatDistanceToNow(new Date(batch.uploadedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    batch.status === 'published' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                      : batch.status === 'ready'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                  }`}>
                    {batch.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Leads</div>
                    <div className="text-2xl font-bold">{batch.totalLeads}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg Quality Score</div>
                    <div className="text-2xl font-bold">
                      {batch.averageQualityScore ? parseFloat(batch.averageQualityScore).toFixed(1) : "N/A"}
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
