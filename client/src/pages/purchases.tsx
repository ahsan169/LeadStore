import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Send, Link2, Loader2, CheckCircle, AlertCircle, ShieldAlert, ShieldCheck, Clock, Mail, Crown, Package } from "lucide-react";
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Crown className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-serif font-bold text-gradient-royal" data-testid="heading-purchases">
              My Purchases
            </h1>
          </div>
          <p className="text-muted-foreground">View, download, and export your lead packages</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation("/integrations")}
          data-testid="button-manage-integrations"
          className="animate-slide-up animate-delay-100"
        >
          <Link2 className="w-4 h-4 mr-2" />
          CRM Integrations
        </Button>
      </div>

      <div className="divider-elegant" />

      {!purchases || purchases.length === 0 ? (
        <Card className="card-kingdom animate-scale-in">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Package className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-semibold mb-3">No purchases yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Browse our premium lead packages to start growing your business
            </p>
            <Button 
              onClick={() => setLocation("/pricing")}
              data-testid="button-view-pricing"
              className="btn-kingdom"
            >
              View Pricing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {purchases.map((purchase: any, index: number) => {
            const purchaseSyncLogs = syncLogs?.filter((log: any) => log.purchaseId === purchase.id) || [];
            const lastSync = purchaseSyncLogs[0];
            
            return (
              <Card 
                key={purchase.id} 
                data-testid={`card-purchase-${purchase.id}`}
                className={`card-kingdom hover-lift animate-slide-up animate-delay-${Math.min((index + 1) * 100, 500)}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-serif font-semibold flex items-center gap-2">
                        <Crown className="w-5 h-5 text-primary" />
                        {purchase.tier.charAt(0).toUpperCase() + purchase.tier.slice(1)} Package
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Purchased {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gradient-royal">${purchase.totalAmount}</div>
                      <div className="text-sm text-muted-foreground">{purchase.leadCount} leads</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">Order ID:</span>
                          <span className="font-mono badge-royal px-2 py-0.5 rounded text-xs" data-testid={`text-order-${purchase.id}`}>
                            {purchase.id.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge className={purchase.paymentStatus === 'succeeded' ? "badge-emerald" : "badge-gold"}>
                            {purchase.paymentStatus === 'succeeded' ? 'Completed' : 'Pending'}
                          </Badge>
                        </div>
                        {lastSync && (
                          <div className="text-sm flex items-center gap-2">
                            <span className="text-muted-foreground">Last CRM Export:</span>
                            <span className="flex items-center gap-1">
                              {lastSync.status === 'success' ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              )}
                              {formatDistanceToNow(new Date(lastSync.syncedAt), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        {purchase.paymentStatus === 'succeeded' && (
                          <div className="text-sm flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-muted-foreground">Quality Guarantee:</span>
                            {(() => {
                              const guaranteeExpiry = purchase.guaranteeExpiresAt
                                ? new Date(purchase.guaranteeExpiresAt)
                                : new Date(new Date(purchase.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                              const isExpired = new Date() > guaranteeExpiry;
                              const daysRemaining = Math.max(0, Math.ceil((guaranteeExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                              
                              if (isExpired) {
                                return <Badge className="badge-royal">Expired</Badge>;
                              } else {
                                return (
                                  <Badge className={daysRemaining > 7 ? "badge-emerald" : "badge-gold"}>
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
                            className="btn-kingdom"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Export to CRM
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              localStorage.setItem('selectedPurchaseId', purchase.id);
                              setLocation('/campaigns');
                            }}
                            data-testid={`button-create-campaign-${purchase.id}`}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Create Campaign
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

                    {purchase.totalContacted > 0 && (
                      <>
                        <div className="divider-elegant my-4" />
                        <div>
                          <h4 className="text-sm font-serif font-medium mb-3 flex items-center gap-2">
                            <Crown className="w-4 h-4 text-primary" />
                            Performance Metrics
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div className="p-3 rounded-lg bg-muted/50">
                              <span className="text-muted-foreground block mb-1">Contacted</span>
                              <div className="font-semibold text-lg">{purchase.totalContacted}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <span className="text-muted-foreground block mb-1">Qualified</span>
                              <div className="font-semibold text-lg">{purchase.totalQualified}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <span className="text-muted-foreground block mb-1">Closed</span>
                              <div className="font-semibold text-lg">{purchase.totalClosed}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <span className="text-muted-foreground block mb-1">ROI</span>
                              <div className="font-semibold text-lg text-emerald-600">
                                {purchase.roi ? `${purchase.roi}%` : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="animate-scale-in">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Export to CRM
            </DialogTitle>
            <DialogDescription>
              Select a CRM integration to export {selectedPurchase?.leadCount} leads
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="integration" className="font-medium">CRM Integration</Label>
              <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                <SelectTrigger id="integration" data-testid="select-integration" className="mt-2">
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
              <Alert className="border-primary/20 bg-primary/5">
                <AlertDescription>
                  <div className="space-y-1">
                    <div><strong>Package:</strong> {selectedPurchase.tier.charAt(0).toUpperCase() + selectedPurchase.tier.slice(1)}</div>
                    <div><strong>Leads:</strong> {selectedPurchase.leadCount}</div>
                    <div><strong>Purchase Date:</strong> {new Date(selectedPurchase.createdAt).toLocaleDateString()}</div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {exportProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Exporting...</span>
                  <span>{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} className="h-2" />
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

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setExportDialogOpen(false);
                setExportProgress(0);
              }}
              data-testid="button-cancel-export"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={!selectedIntegration || exportMutation.isPending}
              data-testid="button-confirm-export"
              className="btn-kingdom"
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
