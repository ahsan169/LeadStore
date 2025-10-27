import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Search,
  RefreshCcw,
  TrendingUp,
  Users,
  FileText,
  Filter
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function ManageGuaranteesPage() {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [resolutionDialogOpen, setResolutionDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [selectedReplacementLead, setSelectedReplacementLead] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/guarantee/reports", filterStatus],
    queryFn: async () => {
      const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const response = await fetch(`/api/guarantee/reports${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reports");
      return response.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/guarantee/stats"],
  });

  const { data: availableLeads } = useQuery({
    queryKey: ["/api/admin/available-leads", selectedReport?.purchaseId],
    queryFn: async () => {
      if (!selectedReport?.purchaseId) return [];
      // Fetch available replacement leads from the same tier
      const response = await fetch(
        `/api/admin/available-leads?purchaseId=${selectedReport.purchaseId}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch available leads");
      return response.json();
    },
    enabled: !!selectedReport?.purchaseId,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      reportId,
      status,
      replacementLeadId,
      notes,
    }: any) => {
      return apiRequest(
        "PUT",
        `/api/guarantee/reports/${reportId}/resolve`,
        {
          status,
          replacementLeadId,
          notes,
        }
      );
    },
    onSuccess: () => {
      toast({
        title: "Report resolved",
        description: "The quality guarantee report has been resolved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guarantee/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guarantee/stats"] });
      setResolutionDialogOpen(false);
      setSelectedReport(null);
      setResolutionNotes("");
      setSelectedReplacementLead("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resolve report",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const handleResolve = (report: any, action: "approve" | "reject") => {
    setSelectedReport(report);
    if (action === "approve") {
      setResolutionDialogOpen(true);
    } else {
      resolveMutation.mutate({
        reportId: report.id,
        status: "rejected",
        replacementLeadId: null,
        notes: "",
      });
    }
  };

  const handleConfirmResolution = () => {
    if (!selectedReport) return;

    resolveMutation.mutate({
      reportId: selectedReport.id,
      status: "approved",
      replacementLeadId: selectedReplacementLead || null,
      notes: resolutionNotes,
    });
  };

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

  const filteredReports = reports?.filter((report: any) => {
    if (!searchTerm) return true;
    return (
      report.purchaseId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.leadId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.issueDescription?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (reportsLoading) {
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
          <h1 className="text-3xl font-bold" data-testid="heading-manage-guarantees">
            Manage Quality Guarantees
          </h1>
          <p className="text-muted-foreground">
            Review and resolve quality guarantee requests
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["/api/guarantee/reports"] })
          }
          data-testid="button-refresh"
        >
          <RefreshCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                  <p className="text-2xl font-bold">{stats.totalReports || 0}</p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.pendingReports || 0}
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
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.approvedReports || 0}
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
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.rejectedReports || 0}
                  </p>
                </div>
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                  <p className="text-2xl font-bold">
                    {stats.approvalRate ? `${Math.round(stats.approvalRate)}%` : "0%"}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by purchase ID, lead ID, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40" data-testid="select-filter-status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reports</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="replaced">Replaced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Quality Guarantee Reports</h2>
        </CardHeader>
        <CardContent>
          {filteredReports && filteredReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reports found matching your criteria
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report ID</TableHead>
                  <TableHead>Issue Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports?.map((report: any) => (
                  <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                    <TableCell className="font-mono text-sm">
                      {report.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {issueTypeLabels[report.issueType as keyof typeof issueTypeLabels]}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {report.issueDescription}
                    </TableCell>
                    <TableCell>{report.username || "Unknown"}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(report.reportedAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[report.status as keyof typeof statusColors]}>
                        <span className="flex items-center gap-1">
                          {statusIcons[report.status]}
                          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {report.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleResolve(report, "approve")}
                            data-testid={`button-approve-${report.id}`}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleResolve(report, "reject")}
                            data-testid={`button-reject-${report.id}`}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {report.status !== "pending" && (
                        <span className="text-sm text-muted-foreground">
                          {report.resolvedAt &&
                            `Resolved ${formatDistanceToNow(new Date(report.resolvedAt), {
                              addSuffix: true,
                            })}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolution Dialog */}
      <Dialog open={resolutionDialogOpen} onOpenChange={setResolutionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve Quality Guarantee Request</DialogTitle>
            <DialogDescription>
              Select a replacement lead or provide store credit for the customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Report Details</Label>
              <div className="text-sm text-muted-foreground space-y-1 mt-1">
                <p>Issue: {selectedReport && issueTypeLabels[selectedReport.issueType as keyof typeof issueTypeLabels]}</p>
                <p>Description: {selectedReport?.issueDescription}</p>
                <p>Lead ID: {selectedReport?.leadId.slice(0, 8)}...</p>
              </div>
            </div>

            <div>
              <Label htmlFor="replacement-lead">Replacement Lead (Optional)</Label>
              <Select value={selectedReplacementLead} onValueChange={setSelectedReplacementLead}>
                <SelectTrigger id="replacement-lead" data-testid="select-replacement">
                  <SelectValue placeholder="Select a replacement lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Replacement (Credit Only)</SelectItem>
                  {availableLeads?.map((lead: any) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      Lead {lead.id.slice(0, 8)}... - {lead.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                If no replacement is selected, the customer will receive a credit
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Resolution Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this resolution..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>

            {!selectedReplacementLead && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No replacement lead selected. The customer will receive a credit for future purchases.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolutionDialogOpen(false);
                setSelectedReport(null);
                setResolutionNotes("");
                setSelectedReplacementLead("");
              }}
              disabled={resolveMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmResolution}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolution"
            >
              {resolveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Approve Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}