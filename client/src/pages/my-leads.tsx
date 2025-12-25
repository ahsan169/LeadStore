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
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Phone, Mail, Building2, User, DollarSign, CheckCircle2, 
  XCircle, Clock, MessageSquare, TrendingUp, Sparkles,
  Filter, Search, ChevronLeft, ChevronRight, Zap, Award,
  ArrowUpRight, Briefcase, MapPin, Target
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
    if (score >= 40) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800";
    if (score >= 60) return "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800";
    if (score >= 40) return "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800";
    return "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return (
          <Badge className="badge-royal">
            <Sparkles className="h-3 w-3 mr-1" />
            New
          </Badge>
        );
      case "working":
        return (
          <Badge className="badge-royal">
            <Zap className="h-3 w-3 mr-1" />
            Working
          </Badge>
        );
      case "contacted":
        return (
          <Badge className="badge-royal">
            <Phone className="h-3 w-3 mr-1" />
            Contacted
          </Badge>
        );
      case "funded":
        return (
          <Badge className="badge-emerald">
            <DollarSign className="h-3 w-3 mr-1" />
            Funded
          </Badge>
        );
      case "bad_lead":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border border-red-200 dark:border-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Bad Lead
          </Badge>
        );
      case "no_response":
        return (
          <Badge className="badge-gold">
            <Clock className="h-3 w-3 mr-1" />
            No Response
          </Badge>
        );
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
    <div className="min-h-screen bg-mesh">
      <div className="relative z-10 p-6 space-y-6">
        {/* Kingdom Page Header */}
        <div className="page-header-gradient animate-fade-in">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="icon-container icon-container-green w-14 h-14">
                <Briefcase className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-serif font-bold text-gradient-royal flex items-center gap-2" data-testid="text-page-title">
                  My Leads
                  <Award className="h-6 w-6 text-yellow-300" />
                </h1>
                <p className="text-white/80 mt-1">Track and provide feedback on your purchased leads</p>
              </div>
            </div>
          </div>
        </div>

        {/* Kingdom Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up">
          <Card className="card-kingdom hover-lift overflow-visible" data-testid="card-stat-total">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Leads</p>
                  <div className="text-3xl font-bold counter-animate">{stats?.stats.total || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Assigned to you
                  </p>
                </div>
                <div className="icon-container icon-container-blue w-12 h-12">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift overflow-visible glow-success" data-testid="card-stat-funded">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Funded</p>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 counter-animate">
                    {stats?.stats.funded || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    {stats?.fundRate || "0.00"}% fund rate
                  </p>
                </div>
                <div className="icon-container icon-container-green w-12 h-12">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift overflow-visible" data-testid="card-stat-working">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Working</p>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 counter-animate">
                    {(stats?.stats.working || 0) + (stats?.stats.contacted || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Zap className="h-3 w-3 text-purple-500" />
                    In progress
                  </p>
                </div>
                <div className="icon-container icon-container-purple w-12 h-12">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-kingdom hover-lift overflow-visible" data-testid="card-stat-feedback">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Feedback Given</p>
                  <div className="text-3xl font-bold counter-animate">{stats?.feedbackGiven || 0}</div>
                  <div className="mt-2 w-32">
                    <div className="progress-premium">
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                        style={{ width: `${Math.min(parseFloat(stats?.feedbackRate || "0"), 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats?.feedbackRate || "0.00"}% complete
                  </p>
                </div>
                <div className="icon-container icon-container-gold w-12 h-12">
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Elegant Divider */}
        <div className="divider-elegant my-8" />

        {/* Leads Table Card */}
        <Card className="card-kingdom animate-slide-up animate-delay-100">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="icon-container icon-container-blue w-10 h-10">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="font-serif text-gradient-royal" data-testid="text-leads-table-title">Your Leads</CardTitle>
                  <CardDescription>
                    Provide feedback to improve lead quality
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-48 bg-background"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 bg-background" data-testid="select-status-filter">
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
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="shimmer-premium h-24 rounded-lg" />
                ))}
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-16 animate-fade-in">
                <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-serif font-semibold mb-2 text-gradient-royal">No leads found</h3>
                <p className="text-muted-foreground">Purchase leads to get started</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3 pr-4">
                    {filteredLeads.map((lead) => (
                      <div 
                        key={lead.assignmentId} 
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card hover-lift transition-all group animate-fade-in"
                        data-testid={`row-lead-${lead.leadId}`}
                      >
                        {/* Score */}
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-xl border-2 ${getScoreBg(lead.aiScore)} ${getScoreColor(lead.aiScore)}`}>
                          {lead.aiScore}
                        </div>
                        
                        {/* Business Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-serif font-semibold truncate">{lead.businessName || "Unknown Business"}</h4>
                            {getStatusBadge(lead.status)}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {lead.ownerName || "N/A"}
                            </span>
                            {lead.industry && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {lead.industry}
                              </span>
                            )}
                            {lead.stateCode && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {lead.stateCode}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </span>
                            )}
                            {lead.email && (
                              <span className="flex items-center gap-1 truncate max-w-48">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Assigned Date */}
                        <div className="hidden md:block text-right">
                          <p className="text-xs text-muted-foreground">Assigned</p>
                          <p className="text-sm font-medium">{formatDate(lead.assignedAt)}</p>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 rounded-full bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40"
                            onClick={() => handleQuickAction(lead, "funded")}
                            title="Mark as Funded"
                            data-testid={`button-funded-${lead.leadId}`}
                          >
                            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                            onClick={() => handleQuickAction(lead, "contacted")}
                            title="Mark as Contacted"
                            data-testid={`button-contacted-${lead.leadId}`}
                          >
                            <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-800/50"
                            onClick={() => handleQuickAction(lead, "no_response")}
                            title="No Response"
                            data-testid={`button-no-response-${lead.leadId}`}
                          >
                            <Clock className="h-5 w-5 text-gray-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"
                            onClick={() => handleQuickAction(lead, "bad_lead")}
                            title="Bad Lead"
                            data-testid={`button-bad-lead-${lead.leadId}`}
                          >
                            <XCircle className="h-5 w-5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 divider-elegant">
                    <div className="text-sm text-muted-foreground">
                      Showing <span className="font-medium">{filteredLeads.length}</span> of <span className="font-medium">{pagination.total}</span> leads
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="gap-1"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1 px-3">
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pageNum;
                          if (pagination.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (page <= 3) {
                            pageNum = i + 1;
                          } else if (page >= pagination.totalPages - 2) {
                            pageNum = pagination.totalPages - 4 + i;
                          } else {
                            pageNum = page - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={page === pageNum ? "default" : "ghost"}
                              size="sm"
                              className={`w-8 h-8 p-0 ${page === pageNum ? "btn-kingdom" : ""}`}
                              onClick={() => setPage(pageNum)}
                              data-testid={`button-page-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                        disabled={page === pagination.totalPages}
                        className="gap-1"
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Activity Modal */}
        <Dialog open={activityModalOpen} onOpenChange={setActivityModalOpen}>
          <DialogContent className="sm:max-w-md animate-scale-in" data-testid="dialog-activity">
            <DialogHeader>
              <DialogTitle className="font-serif text-gradient-royal flex items-center gap-2">
                <div className="icon-container icon-container-green w-8 h-8">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                Record Funded Deal
              </DialogTitle>
              <DialogDescription>
                {selectedLead?.businessName && (
                  <span className="font-medium text-foreground">{selectedLead.businessName}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Deal Amount ($)</label>
                <Input
                  type="number"
                  placeholder="e.g., 50000"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  className="bg-background"
                  data-testid="input-deal-amount"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  placeholder="Add any notes about this lead..."
                  value={activityNote}
                  onChange={(e) => setActivityNote(e.target.value)}
                  className="bg-background resize-none"
                  rows={3}
                  data-testid="input-notes"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setActivityModalOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitActivity} 
                disabled={activityMutation.isPending}
                className="btn-kingdom gap-2"
                data-testid="button-submit-activity"
              >
                {activityMutation.isPending ? (
                  <>
                    <span className="animate-spin">&#8987;</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
