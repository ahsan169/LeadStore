import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Loader2,
  Calendar,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import { useLocation } from "wouter";
import { QualityGuaranteeModal } from "@/components/modals/QualityGuaranteeModal";

export default function GuaranteeReportsPage() {
  const [location, setLocation] = useLocation();
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/guarantee/reports"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/guarantee/stats"],
  });

  const { data: purchases } = useQuery({
    queryKey: ["/api/purchases"],
  });

  const statusColors = {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
    replaced: "default",
  } as const;

  const statusIcons = {
    pending: <Clock className="w-4 h-4" />,
    approved: <CheckCircle className="w-4 h-4" />,
    rejected: <XCircle className="w-4 h-4" />,
    replaced: <CheckCircle className="w-4 h-4" />,
  };

  const issueTypeLabels = {
    disconnected: "Disconnected Number",
    wrong_number: "Wrong Number",
    duplicate: "Duplicate Lead",
    poor_quality: "Poor Quality",
  };

  const activePurchases = (purchases as any[])?.filter((p: any) => {
    const guaranteeExpiry = p.guaranteeExpiresAt
      ? new Date(p.guaranteeExpiresAt)
      : new Date(new Date(p.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
    return new Date() <= guaranteeExpiry && p.paymentStatus === "succeeded";
  });

  if (reportsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const pendingReports = (reports as any[])?.filter((r: any) => r.status === "pending") || [];
  const resolvedReports = (reports as any[])?.filter((r: any) => r.status !== "pending") || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-guarantee">
            Quality Guarantee
          </h1>
          <p className="text-muted-foreground">
            Track and manage your quality guarantee reports
          </p>
        </div>
        <Button onClick={() => setLocation("/purchases")} variant="outline">
          <ChevronRight className="w-4 h-4 mr-2" />
          View Purchases
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                  <p className="text-2xl font-bold">{(stats as any).totalReports || 0}</p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(stats as any).approvedReports || 0}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {(stats as any).pendingReports || 0}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                  <p className="text-2xl font-bold">
                    {(stats as any).approvalRate ? `${Math.round((stats as any).approvalRate)}%` : "0%"}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Guarantees */}
      {activePurchases && activePurchases.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Active Guarantees
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activePurchases.map((purchase: any) => {
                const guaranteeExpiry = purchase.guaranteeExpiresAt
                  ? new Date(purchase.guaranteeExpiresAt)
                  : new Date(new Date(purchase.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                const daysRemaining = Math.max(
                  0,
                  Math.ceil((guaranteeExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                );

                return (
                  <div
                    key={purchase.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {purchase.tier.charAt(0).toUpperCase() + purchase.tier.slice(1)} Package
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {purchase.leadCount} leads • Purchased{" "}
                        {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={daysRemaining > 7 ? "default" : "destructive"}>
                        <Calendar className="w-3 h-3 mr-1" />
                        {daysRemaining} days left
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPurchase(purchase);
                          setModalOpen(true);
                        }}
                        data-testid={`button-new-report-${purchase.id}`}
                      >
                        Report Issue
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reports Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList data-testid="tabs-report-status">
          <TabsTrigger value="pending">
            Pending ({pendingReports.length})
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved ({resolvedReports.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No pending reports</h3>
                <p className="text-muted-foreground">
                  All your quality reports have been reviewed
                </p>
              </CardContent>
            </Card>
          ) : (
            pendingReports.map((report: any) => (
              <Card key={report.id} data-testid={`card-report-${report.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcons[report.status as keyof typeof statusIcons]}
                      <h3 className="font-semibold">
                        {issueTypeLabels[report.issueType as keyof typeof issueTypeLabels]}
                      </h3>
                    </div>
                    <Badge variant={statusColors[report.status as keyof typeof statusColors]}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{report.issueDescription}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Reported {formatDistanceToNow(new Date(report.reportedAt), { addSuffix: true })}
                      </span>
                      <span className="text-muted-foreground">
                        Lead ID: {report.leadId.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          {resolvedReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No resolved reports</h3>
                <p className="text-muted-foreground">
                  Your resolved reports will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            resolvedReports.map((report: any) => (
              <Card key={report.id} data-testid={`card-report-${report.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcons[report.status as keyof typeof statusIcons]}
                      <h3 className="font-semibold">
                        {issueTypeLabels[report.issueType as keyof typeof issueTypeLabels]}
                      </h3>
                    </div>
                    <Badge variant={statusColors[report.status as keyof typeof statusColors]}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{report.issueDescription}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Reported {formatDistanceToNow(new Date(report.reportedAt), { addSuffix: true })}
                      </span>
                      {report.resolvedAt && (
                        <span className="text-muted-foreground">
                          Resolved {formatDistanceToNow(new Date(report.resolvedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {report.status === "replaced" && report.replacementLeadId && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          Replacement lead provided (ID: {report.replacementLeadId.slice(0, 8)}...)
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Quality Guarantee Modal */}
      {selectedPurchase && (
        <QualityGuaranteeModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          purchase={selectedPurchase}
        />
      )}
    </div>
  );
}