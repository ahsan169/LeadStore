import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Phone, Mail, Building2, User, DollarSign, CheckCircle2, 
  XCircle, Clock, MessageSquare, RefreshCcw, TrendingUp,
  AlertTriangle, ThumbsUp, ThumbsDown, Filter, Search
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MyLead {
  assignmentId: string;
  leadId: string;
  businessName: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  stateCode: string | null;
  aiScore: number;
  status: string;
  conversionLabel: string;
  source: string;
  assignedAt: string;
  lastOutcomeAt: string | null;
  pricePaidCents: number;
  batchId: string | null;
}

interface LeadStats {
  stats: {
    total: number;
    new: number;
    working: number;
    contacted: number;
    funded: number;
    bad_lead: number;
    no_response: number;
  };
  fundRate: string;
  feedbackRate: string;
  feedbackGiven: number;
}

interface PaginatedResponse {
  leads: MyLead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function MyLeadsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedLead, setSelectedLead] = useState<MyLead | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityType, setActivityType] = useState<string>("");
  const [activityNote, setActivityNote] = useState("");
  const [dealAmount, setDealAmount] = useState("");

  const { data: leadsResponse, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/my-leads", page, statusFilter === "all" ? "" : statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(`/api/my-leads?${params}`);
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json();
    },
  });

  const { data: stats } = useQuery<LeadStats>({
    queryKey: ["/api/my-leads/stats"],
  });

  const activityMutation = useMutation({
    mutationFn: async (data: { leadId: string; type: string; note?: string; dealAmount?: number }) => {
      const response = await apiRequest("POST", `/api/leads/${data.leadId}/activity`, {
        type: data.type,
        note: data.note,
        dealAmount: data.dealAmount,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Lead activity recorded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-leads/stats"] });
      setActivityModalOpen(false);
      setActivityNote("");
      setDealAmount("");
      setSelectedLead(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const leads = leadsResponse?.leads || [];
  const pagination = leadsResponse?.pagination;

  const filteredLeads = leads.filter(lead => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      lead.businessName?.toLowerCase().includes(search) ||
      lead.ownerName?.toLowerCase().includes(search) ||
      lead.email?.toLowerCase().includes(search) ||
      lead.phone?.includes(search)
    );
  });

  const handleQuickAction = (lead: MyLead, actionType: string) => {
    setSelectedLead(lead);
    setActivityType(actionType);
    
    if (actionType === "funded") {
      setActivityModalOpen(true);
    } else {
      activityMutation.mutate({ leadId: lead.leadId, type: actionType });
    }
  };

  const handleSubmitActivity = () => {
    if (!selectedLead || !activityType) return;
    
    activityMutation.mutate({
      leadId: selectedLead.leadId,
      type: activityType,
      note: activityNote || undefined,
      dealAmount: dealAmount ? parseFloat(dealAmount) : undefined,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-blue-600 dark:text-blue-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary">New</Badge>;
      case "working":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Working</Badge>;
      case "contacted":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Contacted</Badge>;
      case "funded":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Funded</Badge>;
      case "bad_lead":
        return <Badge variant="destructive">Bad Lead</Badge>;
      case "no_response":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">No Response</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">My Leads</h1>
          <p className="text-muted-foreground">Track and provide feedback on your purchased leads</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.stats.total || 0}</div>
            <p className="text-xs text-muted-foreground">Assigned to you</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-funded">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Funded</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats?.stats.funded || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.fundRate || "0.00"}% fund rate
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-working">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Working</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {(stats?.stats.working || 0) + (stats?.stats.contacted || 0)}
            </div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-feedback">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Feedback Given</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.feedbackGiven || 0}</div>
            <Progress 
              value={parseFloat(stats?.feedbackRate || "0")} 
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.feedbackRate || "0.00"}% complete
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle data-testid="text-leads-table-title">Your Leads</CardTitle>
              <CardDescription>
                Provide feedback to improve lead quality
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-48"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="working">Working</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="funded">Funded</SelectItem>
                  <SelectItem value="bad_lead">Bad Lead</SelectItem>
                  <SelectItem value="no_response">No Response</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading your leads...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No leads found. Purchase leads to get started.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => (
                      <TableRow key={lead.assignmentId} data-testid={`row-lead-${lead.leadId}`}>
                        <TableCell>
                          <div className="font-medium">{lead.businessName || "Unknown"}</div>
                          <div className="text-sm text-muted-foreground">
                            {lead.industry || "N/A"} {lead.stateCode && `• ${lead.stateCode}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <User className="h-3 w-3" />
                            {lead.ownerName || "N/A"}
                          </div>
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </div>
                          )}
                          {lead.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground truncate max-w-40">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={`text-lg font-bold ${getScoreColor(lead.aiScore)}`}>
                            {lead.aiScore}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(lead.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(lead.assignedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuickAction(lead, "funded")}
                              title="Mark as Funded"
                              data-testid={`button-funded-${lead.leadId}`}
                            >
                              <DollarSign className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuickAction(lead, "contacted")}
                              title="Mark as Contacted"
                              data-testid={`button-contacted-${lead.leadId}`}
                            >
                              <Phone className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuickAction(lead, "no_response")}
                              title="No Response"
                              data-testid={`button-no-response-${lead.leadId}`}
                            >
                              <Clock className="h-4 w-4 text-gray-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuickAction(lead, "bad_lead")}
                              title="Bad Lead"
                              data-testid={`button-bad-lead-${lead.leadId}`}
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredLeads.length} of {pagination.total} leads
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={activityModalOpen} onOpenChange={setActivityModalOpen}>
        <DialogContent data-testid="dialog-activity">
          <DialogHeader>
            <DialogTitle>
              {activityType === "funded" ? "Record Funded Deal" : "Add Activity Note"}
            </DialogTitle>
            <DialogDescription>
              {selectedLead?.businessName && (
                <span className="font-medium">{selectedLead.businessName}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {activityType === "funded" && (
              <div>
                <label className="text-sm font-medium">Deal Amount ($)</label>
                <Input
                  type="number"
                  placeholder="e.g., 50000"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  className="mt-1"
                  data-testid="input-deal-amount"
                />
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this lead..."
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                className="mt-1"
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityModalOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitActivity} 
              disabled={activityMutation.isPending}
              data-testid="button-submit-activity"
            >
              {activityMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
