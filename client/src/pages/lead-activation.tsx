import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Lead, CrmIntegration, CampaignTemplate, LeadActivationHistory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Zap, CheckCircle2, AlertCircle, Loader2, Search, Filter, 
  Send, Database, Phone, Building2, User, Mail, Globe, 
  Calendar, DollarSign, TrendingUp, Activity, History,
  ChevronRight, Sparkles, Target, Rocket, RefreshCw,
  ArrowRight, Info, Check, X, Clock, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  steps: string[];
}

interface ActivationStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  message?: string;
  details?: any;
}

export default function LeadActivation() {
  const { toast } = useToast();
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activationSteps, setActivationSteps] = useState<ActivationStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedQuickAction, setSelectedQuickAction] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedCrmId, setSelectedCrmId] = useState<string>("");
  const [enrichmentOptions, setEnrichmentOptions] = useState({
    phone: true,
    social: true,
    company: true,
    industry: false
  });

  // Fetch leads
  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ leads: Lead[], total: string }>({
    queryKey: ["/api/leads"]
  });
  
  const leads = leadsData?.leads || [];

  // Fetch CRM integrations
  const { data: crmIntegrations = [] } = useQuery<CrmIntegration[]>({
    queryKey: ["/api/crm/integrations"]
  });

  // Fetch campaign templates
  const { data: campaignTemplates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["/api/campaigns/templates"]
  });

  // Fetch quick actions
  const { data: quickActions = [] } = useQuery<QuickAction[]>({
    queryKey: ["/api/lead-activation/quick-actions"]
  });

  // Fetch activation history
  const { data: activationHistory = [], refetch: refetchHistory } = useQuery<LeadActivationHistory[]>({
    queryKey: ["/api/lead-activation/history"],
    enabled: historyOpen
  });

  // Activate leads mutation
  const activateLeadsMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/lead-activation/activate", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lead-activation/history"] });
      toast({
        title: "Success",
        description: "Leads activated successfully"
      });
      setSelectedLeads(new Set());
      setIsProcessing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate leads",
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  });

  // Execute quick action mutation
  const executeQuickActionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/lead-activation/quick-action", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
      });
    },
    onMutate: () => {
      setIsProcessing(true);
      setActivationSteps([
        { id: 'init', name: 'Initializing', status: 'processing' }
      ]);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lead-activation/history"] });
      
      // Update activation steps with results
      if (data.steps) {
        setActivationSteps(data.steps);
      }
      
      toast({
        title: "Success",
        description: "Quick action executed successfully"
      });
      
      setTimeout(() => {
        setSelectedLeads(new Set());
        setIsProcessing(false);
        setActivationSteps([]);
      }, 2000);
    },
    onError: (error: any) => {
      setActivationSteps(prev => prev.map(step => ({
        ...step,
        status: 'error',
        message: error.message
      })));
      
      toast({
        title: "Error",
        description: error.message || "Failed to execute quick action",
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  });

  // Preview activation mutation
  const previewActivationMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/lead-activation/preview", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
      });
    },
    onSuccess: (data) => {
      console.log("Preview data:", data);
      setPreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to generate preview",
        variant: "destructive"
      });
    }
  });

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchQuery === "" || 
      lead.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "activated" && lead.lastActivatedAt) ||
      (statusFilter === "not-activated" && !lead.lastActivatedAt);
    
    return matchesSearch && matchesStatus;
  });

  // Handle lead selection
  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
    }
  };

  // Execute quick action
  const handleQuickAction = (actionId: string) => {
    if (selectedLeads.size === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead",
        variant: "destructive"
      });
      return;
    }

    setSelectedQuickAction(actionId);
    executeQuickActionMutation.mutate({
      actionId,
      leadIds: Array.from(selectedLeads),
      options: {}
    });
  };

  // Custom activation
  const handleCustomActivation = () => {
    if (selectedLeads.size === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead",
        variant: "destructive"
      });
      return;
    }

    const actions: any = {};
    
    // Add enrichment if any option is selected
    if (Object.values(enrichmentOptions).some(v => v)) {
      actions.enrich = enrichmentOptions;
    }
    
    // Add campaign if template or custom message
    if (selectedTemplate || customMessage) {
      actions.campaign = {
        templateId: selectedTemplate || undefined,
        customMessage: customMessage || undefined
      };
    }
    
    // Add CRM export if selected
    if (selectedCrmId) {
      actions.exportToCrm = {
        integrationId: selectedCrmId
      };
    }

    setIsProcessing(true);
    setActivationSteps([
      { id: 'init', name: 'Initializing activation', status: 'processing' }
    ]);

    activateLeadsMutation.mutate({
      leadIds: Array.from(selectedLeads),
      actions,
      options: {}
    });
  };

  // Get icon for quick action
  const getQuickActionIcon = (iconName: string) => {
    switch (iconName) {
      case 'zap': return Zap;
      case 'database': return Database;
      case 'send': return Send;
      case 'sparkles': return Sparkles;
      default: return Rocket;
    }
  };

  // Get step icon
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'processing': return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
      case 'error': return <X className="w-5 h-5 text-red-600" />;
      case 'skipped': return <AlertCircle className="w-5 h-5 text-gray-400" />;
      default: return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <Rocket className="w-8 h-8 text-primary" />
          Lead Activation Hub
        </h1>
        <p className="text-muted-foreground">
          Streamline your lead activation with enrichment, campaigns, and CRM export in one unified workflow
        </p>
      </div>

      {/* Quick Actions Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            One-click operations to activate your leads instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action) => {
              const Icon = getQuickActionIcon(action.icon);
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  className={cn(
                    "h-auto p-4 flex flex-col items-start gap-2 hover-elevate",
                    selectedQuickAction === action.id && isProcessing && "border-primary"
                  )}
                  onClick={() => handleQuickAction(action.id)}
                  disabled={isProcessing || selectedLeads.size === 0}
                  data-testid={`button-quick-action-${action.id}`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Icon 
                      className="w-5 h-5 text-primary"
                    />
                    <span className="font-semibold">{action.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    {action.description}
                  </p>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Selection */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Select Leads to Activate</CardTitle>
              <div className="flex gap-2 mt-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-leads"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Leads</SelectItem>
                    <SelectItem value="activated">Activated</SelectItem>
                    <SelectItem value="not-activated">Not Activated</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  {selectedLeads.size === filteredLeads.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {leadsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredLeads.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No leads found
                    </div>
                  ) : (
                    filteredLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-lg border",
                          selectedLeads.has(lead.id) ? "bg-accent" : "hover:bg-accent/50"
                        )}
                        data-testid={`lead-item-${lead.id}`}
                      >
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => handleSelectLead(lead.id)}
                          data-testid={`checkbox-lead-${lead.id}`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{lead.businessName}</span>
                            {lead.lastActivatedAt && (
                              <Badge variant="secondary" className="text-xs">
                                <Check className="w-3 h-3 mr-1" />
                                Activated
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {lead.contactName} • {lead.email}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={lead.tier === 'premium' ? 'default' : 'secondary'}>
                            {lead.tier}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-muted-foreground">
                  {selectedLeads.size} of {filteredLeads.length} leads selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryOpen(true)}
                  data-testid="button-view-history"
                >
                  <History className="w-4 h-4 mr-2" />
                  View History
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Activation Pipeline */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Activation Pipeline</CardTitle>
              <CardDescription>
                Configure and execute your activation workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="enrich" className="space-y-4">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="enrich" data-testid="tab-enrich">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Enrich
                  </TabsTrigger>
                  <TabsTrigger value="campaign" data-testid="tab-campaign">
                    <Send className="w-4 h-4 mr-2" />
                    Campaign
                  </TabsTrigger>
                  <TabsTrigger value="crm" data-testid="tab-crm">
                    <Database className="w-4 h-4 mr-2" />
                    CRM
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="enrich" className="space-y-4">
                  <div className="space-y-3">
                    <Label>Enrichment Options</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enrich-phone"
                          checked={enrichmentOptions.phone}
                          onCheckedChange={(checked) => 
                            setEnrichmentOptions(prev => ({ ...prev, phone: checked as boolean }))
                          }
                          data-testid="checkbox-enrich-phone"
                        />
                        <Label htmlFor="enrich-phone" className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          Phone Validation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enrich-social"
                          checked={enrichmentOptions.social}
                          onCheckedChange={(checked) => 
                            setEnrichmentOptions(prev => ({ ...prev, social: checked as boolean }))
                          }
                          data-testid="checkbox-enrich-social"
                        />
                        <Label htmlFor="enrich-social" className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Social Profiles
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enrich-company"
                          checked={enrichmentOptions.company}
                          onCheckedChange={(checked) => 
                            setEnrichmentOptions(prev => ({ ...prev, company: checked as boolean }))
                          }
                          data-testid="checkbox-enrich-company"
                        />
                        <Label htmlFor="enrich-company" className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          Company Details
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enrich-industry"
                          checked={enrichmentOptions.industry}
                          onCheckedChange={(checked) => 
                            setEnrichmentOptions(prev => ({ ...prev, industry: checked as boolean }))
                          }
                          data-testid="checkbox-enrich-industry"
                        />
                        <Label htmlFor="enrich-industry" className="flex items-center gap-2">
                          <Target className="w-4 h-4" />
                          Industry Analysis
                        </Label>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="campaign" className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="template-select">Campaign Template</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger id="template-select" data-testid="select-campaign-template">
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No template</SelectItem>
                        {campaignTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="custom-message">Custom Message</Label>
                    <Textarea
                      id="custom-message"
                      placeholder="Write a custom message..."
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="h-32"
                      data-testid="textarea-custom-message"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="crm" className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="crm-select">Export to CRM</Label>
                    <Select value={selectedCrmId} onValueChange={setSelectedCrmId}>
                      <SelectTrigger id="crm-select" data-testid="select-crm">
                        <SelectValue placeholder="Choose CRM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No CRM export</SelectItem>
                        {crmIntegrations.map((crm) => (
                          <SelectItem key={crm.id} value={crm.id}>
                            {crm.name} ({crm.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedCrmId && (
                    <div className="p-3 bg-accent rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Leads will be exported with automatic field mapping
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Separator className="my-4" />

              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={handleCustomActivation}
                  disabled={isProcessing || selectedLeads.size === 0}
                  data-testid="button-activate-leads"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Activate {selectedLeads.size} Lead{selectedLeads.size !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    previewActivationMutation.mutate({
                      leadIds: Array.from(selectedLeads),
                      actions: {
                        enrich: Object.values(enrichmentOptions).some(v => v) ? enrichmentOptions : undefined,
                        campaign: (selectedTemplate || customMessage) ? {
                          templateId: selectedTemplate,
                          customMessage
                        } : undefined,
                        exportToCrm: selectedCrmId ? { integrationId: selectedCrmId } : undefined
                      }
                    });
                  }}
                  disabled={selectedLeads.size === 0}
                  data-testid="button-preview"
                >
                  <Info className="w-4 h-4 mr-2" />
                  Preview Activation
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Real-time Status */}
          {isProcessing && activationSteps.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Processing Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activationSteps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3">
                      {getStepIcon(step.status)}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{step.name}</p>
                        {step.message && (
                          <p className="text-xs text-muted-foreground">{step.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* History Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-[500px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Activation History</SheetTitle>
            <SheetDescription>
              View recent lead activation activity
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-200px)] mt-6">
            <div className="space-y-4">
              {activationHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activation history yet
                </div>
              ) : (
                activationHistory.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant={entry.status === 'completed' ? 'default' : 'destructive'}>
                          {entry.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-1">
                        {entry.actionType === 'quick_action' ? 'Quick Action' : 'Custom Activation'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lead: {entry.leadId}
                      </p>
                      {entry.result && (
                        <div className="mt-2 p-2 bg-accent rounded text-xs">
                          <pre>{JSON.stringify(entry.result, null, 2)}</pre>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activation Preview</DialogTitle>
            <DialogDescription>
              Review what will happen when you activate these leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-4">
            <div className="p-4 bg-accent rounded-lg">
              <p className="text-sm">Preview details will be shown here...</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setPreviewOpen(false);
              handleCustomActivation();
            }}>
              Proceed with Activation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}