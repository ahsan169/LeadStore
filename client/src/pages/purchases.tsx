import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Send, Link2, Loader2, CheckCircle, AlertCircle, ShieldAlert, ShieldCheck, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { QualityGuaranteeModal } from "@/components/modals/QualityGuaranteeModal";

export default function PurchasesPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [qualityReportPurchase, setQualityReportPurchase] = useState<any>(null);

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const { data: integrations } = useQuery({
    queryKey: ["/api/integrations"]
  });

  const { data: syncLogs } = useQuery({
    queryKey: selectedPurchase ? [`/api/purchases/${selectedPurchase.id}/sync-logs`] : null,
    enabled: !!selectedPurchase
  });

  const downloadMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      return apiRequest("POST", `/api/purchases/${purchaseId}/download-url`);
    },
    onSuccess: (data: any) => {
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

  const exportMutation = useMutation({
    mutationFn: async ({ integrationId, purchaseId }: any) => {
      setExportProgress(30);
      return apiRequest('POST', `/api/integrations/${integrationId}/export`, {
        leadIds: selectedPurchase.leadIds || [],
        purchaseId
      });
    },
    onSuccess: (result: any) => {
      setExportProgress(100);
      toast({
        title: result.success ? "Export successful" : "Export partially successful",
        description: `Exported ${result.exportedCount} leads to CRM${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ''}`
      });
      setExportDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/purchases/${selectedPurchase.id}/sync-logs`] });
      setTimeout(() => setExportProgress(0), 500);
    },
    onError: (error: any) => {
      setExportProgress(0);
      toast({
        title: "Export failed",
        description: error.message || "Unable to export leads to CRM",
        variant: "destructive",
      });
    },
  });

  const activeIntegrations = integrations?.filter((i: any) => i.isActive) || [];

  const handleExportClick = (purchase: any) => {
    setSelectedPurchase(purchase);
    if (activeIntegrations.length === 0) {
      toast({
        title: "No CRM integrations",
        description: "Please set up a CRM integration first",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/integrations")}
          >
            Setup Integration
          </Button>
        )
      });
      return;
    }
    setExportDialogOpen(true);
  };

  const handleExport = () => {
    if (!selectedIntegration || !selectedPurchase) return;
    
    setExportProgress(10);
    exportMutation.mutate({
      integrationId: selectedIntegration,
      purchaseId: selectedPurchase.id
    });
  };

  const handleReportIssue = (purchase: any) => {
    setQualityReportPurchase(purchase);
    setQualityModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-purchases">My Purchases</h1>
          <p className="text-muted-foreground">View, download, and export your lead packages</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation("/integrations")}
          data-testid="button-manage-integrations"
        >
          <Link2 className="w-4 h-4 mr-2" />
          CRM Integrations
        </Button>
      </div>

      {!purchases || purchases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No purchases yet</h3>
            <p className="text-muted-foreground mb-4">Browse our pricing plans to get started</p>
            <Button 
              onClick={() => setLocation("/pricing")}
              data-testid="button-view-pricing"
            >
              View Pricing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {purchases.map((purchase: any) => {
            const purchaseSyncLogs = syncLogs?.filter((log: any) => log.purchaseId === purchase.id) || [];
            const lastSync = purchaseSyncLogs[0];
            
            return (
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
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Order ID:</span>{" "}
                          <span className="font-mono" data-testid={`text-order-${purchase.id}`}>
                            {purchase.id.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Status:</span>{" "}
                          <Badge variant={purchase.paymentStatus === 'succeeded' ? "default" : "secondary"}>
                            {purchase.paymentStatus === 'succeeded' ? 'Completed' : 'Pending'}
                          </Badge>
                        </div>
                        {lastSync && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Last CRM Export:</span>{" "}
                            <span className="flex items-center gap-1 inline-flex">
                              {lastSync.status === 'success' ? (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              )}
                              {formatDistanceToNow(new Date(lastSync.syncedAt), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        {purchase.paymentStatus === 'succeeded' && (
                          <div className="text-sm flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-green-500" />
                            <span className="text-muted-foreground">Quality Guarantee:</span>{" "}
                            {(() => {
                              const guaranteeExpiry = purchase.guaranteeExpiresAt
                                ? new Date(purchase.guaranteeExpiresAt)
                                : new Date(new Date(purchase.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                              const isExpired = new Date() > guaranteeExpiry;
                              const daysRemaining = Math.max(0, Math.ceil((guaranteeExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                              
                              if (isExpired) {
                                return <Badge variant="secondary">Expired</Badge>;
                              } else {
                                return (
                                  <Badge variant={daysRemaining > 7 ? "default" : "destructive"}>
                                    {daysRemaining} days left
                                  </Badge>
                                );
                              }
                            })()}
                          </div>
                        )}
                      </div>
                      
                      {purchase.paymentStatus === 'succeeded' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => downloadMutation.mutate(purchase.id)}
                            disabled={downloadMutation.isPending}
                            data-testid={`button-download-${purchase.id}`}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {downloadMutation.isPending ? "Generating..." : "Download"}
                          </Button>
                          <Button
                            onClick={() => handleExportClick(purchase)}
                            data-testid={`button-export-crm-${purchase.id}`}
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Export to CRM
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleReportIssue(purchase)}
                            data-testid={`button-report-issue-${purchase.id}`}
                          >
                            <ShieldAlert className="w-4 h-4 mr-2" />
                            Report Issue
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Analytics Summary */}
                    {purchase.totalContacted > 0 && (
                      <div className="border-t pt-3">
                        <h4 className="text-sm font-medium mb-2">Performance Metrics</h4>
                        <div className="grid grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Contacted:</span>
                            <div className="font-medium">{purchase.totalContacted}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Qualified:</span>
                            <div className="font-medium">{purchase.totalQualified}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Closed:</span>
                            <div className="font-medium">{purchase.totalClosed}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">ROI:</span>
                            <div className="font-medium text-green-600">
                              {purchase.roi ? `${purchase.roi}%` : 'N/A'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export to CRM</DialogTitle>
            <DialogDescription>
              Select a CRM integration to export {selectedPurchase?.leadCount} leads
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="integration">CRM Integration</Label>
              <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                <SelectTrigger id="integration" data-testid="select-integration">
                  <SelectValue placeholder="Select a CRM integration" />
                </SelectTrigger>
                <SelectContent>
                  {activeIntegrations.map((integration: any) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {integration.crmType.charAt(0).toUpperCase() + integration.crmType.slice(1)}
                      {integration.lastSyncAt && (
                        <span className="text-muted-foreground ml-2">
                          (last sync {formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPurchase && (
              <Alert>
                <AlertDescription>
                  <strong>Package:</strong> {selectedPurchase.tier.charAt(0).toUpperCase() + selectedPurchase.tier.slice(1)}<br />
                  <strong>Leads:</strong> {selectedPurchase.leadCount}<br />
                  <strong>Purchase Date:</strong> {new Date(selectedPurchase.createdAt).toLocaleDateString()}
                </AlertDescription>
              </Alert>
            )}

            {exportProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Exporting...</span>
                  <span>{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} />
              </div>
            )}

            {activeIntegrations.length === 0 && (
              <Alert>
                <AlertDescription>
                  No active CRM integrations found. Please set up an integration first.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setExportDialogOpen(false);
                setExportProgress(0);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={!selectedIntegration || exportMutation.isPending}
              data-testid="button-confirm-export"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Export Leads
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quality Guarantee Modal */}
      {qualityReportPurchase && (
        <QualityGuaranteeModal
          open={qualityModalOpen}
          onOpenChange={setQualityModalOpen}
          purchase={qualityReportPurchase}
        />
      )}
    </div>
  );
}