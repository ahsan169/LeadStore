import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function PurchasesPage() {
  const { toast } = useToast();
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const downloadMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      return apiRequest("POST", `/api/purchases/${purchaseId}/download-url`);
    },
    onSuccess: (data: any) => {
      // Open download URL in new window
      window.open(data.downloadUrl, '_blank');
      toast({
        title: "Download started",
        description: "Your CSV file is being downloaded",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
    },
    onError: () => {
      toast({
        title: "Download failed",
        description: "Unable to generate download link",
        variant: "destructive",
      });
    },
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
        <h1 className="text-3xl font-bold" data-testid="heading-purchases">My Purchases</h1>
        <p className="text-muted-foreground">View and download your lead packages</p>
      </div>

      {!purchases || purchases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No purchases yet</h3>
            <p className="text-muted-foreground mb-4">Browse our pricing plans to get started</p>
            <Button data-testid="button-view-pricing">
              View Pricing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {purchases.map((purchase: any) => (
            <Card key={purchase.id} data-testid={`card-purchase-${purchase.id}`}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {purchase.tier.charAt(0).toUpperCase() + purchase.tier.slice(1)} Package
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Purchased {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">${purchase.totalAmount}</div>
                    <div className="text-sm text-muted-foreground">{purchase.leadCount} leads</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Order ID:</span>{" "}
                      <span className="font-mono" data-testid={`text-order-${purchase.id}`}>
                        {purchase.id}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <span className={`font-medium ${
                        purchase.paymentStatus === 'succeeded' ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {purchase.paymentStatus === 'succeeded' ? 'Completed' : 'Pending'}
                      </span>
                    </div>
                    {purchase.downloadUrlExpiry && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Download expires:</span>{" "}
                        {formatDistanceToNow(new Date(purchase.downloadUrlExpiry), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                  
                  {purchase.paymentStatus === 'succeeded' && (
                    <Button
                      onClick={() => downloadMutation.mutate(purchase.id)}
                      disabled={downloadMutation.isPending}
                      data-testid={`button-download-${purchase.id}`}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {downloadMutation.isPending ? "Generating..." : "Download CSV"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
