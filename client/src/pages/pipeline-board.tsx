import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, GripVertical, Phone, Mail, Building2, DollarSign, 
  Calendar, User, MoreHorizontal, Edit, Trash, ChevronRight,
  Eye, CheckCircle, XCircle, Clock, AlertCircle, Settings, 
  ArrowLeft, ArrowRight, Crown, Sparkles
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Lead, PipelineStage, Task, Note, Activity } from "@shared/schema";

interface PipelineStageWithLeads extends PipelineStage {
  leads: Lead[];
}

export default function PipelineBoardPage() {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const { data: stages = [], isLoading: loadingStages } = useQuery<PipelineStage[]>({
    queryKey: ["/api/crm/pipeline-stages"],
  });

  const { data: leadsResponse, isLoading: loadingLeads } = useQuery<{ leads: Lead[] }>({
    queryKey: ["/api/leads"],
  });
  const leads = leadsResponse?.leads || [];

  const { data: leadTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/crm/tasks", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const { data: leadNotes = [] } = useQuery<Note[]>({
    queryKey: ["/api/crm/notes", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const { data: leadActivities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/crm/activities", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const createStageMutation = useMutation({
    mutationFn: (data: { name: string; color: string; order: number }) =>
      apiRequest("POST", "/api/crm/pipeline-stages", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline-stages"] });
      setShowStageDialog(false);
      setNewStageName("");
      toast({ title: "Stage created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create stage", variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; order?: number }) =>
      apiRequest("PATCH", `/api/crm/pipeline-stages/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline-stages"] });
      setEditingStage(null);
      setShowStageDialog(false);
      toast({ title: "Stage updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update stage", variant: "destructive" });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/pipeline-stages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline-stages"] });
      toast({ title: "Stage deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete stage", variant: "destructive" });
    },
  });

  const moveLeadMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      apiRequest("PATCH", `/api/leads/${leadId}`, { pipelineStageId: stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline-stages"] });
    },
    onError: () => {
      toast({ title: "Failed to move lead", variant: "destructive" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: { leadId: string; content: string }) =>
      apiRequest("POST", "/api/crm/notes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notes", "lead", selectedLead?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/activities", "lead", selectedLead?.id] });
      setNewNote("");
      toast({ title: "Note added successfully" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: { leadId: string; title: string; dueDate: string }) =>
      apiRequest("POST", "/api/crm/tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tasks", "lead", selectedLead?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/activities", "lead", selectedLead?.id] });
      setNewTaskTitle("");
      setNewTaskDueDate("");
      toast({ title: "Task created successfully" });
    },
  });

  const stagesWithLeads: PipelineStageWithLeads[] = stages.map((stage) => ({
    ...stage,
    leads: leads.filter((lead) => lead.pipelineStageId === stage.id),
  }));

  const unassignedLeads = leads.filter((lead) => !lead.pipelineStageId);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData("leadId", lead.id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId) {
      moveLeadMutation.mutate({ leadId, stageId });
    }
  };

  const handleOpenStageDialog = (stage?: PipelineStage) => {
    if (stage) {
      setEditingStage(stage);
      setNewStageName(stage.name);
      setNewStageColor(stage.color || "#3b82f6");
    } else {
      setEditingStage(null);
      setNewStageName("");
      setNewStageColor("#3b82f6");
    }
    setShowStageDialog(true);
  };

  const handleSaveStage = () => {
    if (!newStageName.trim()) {
      toast({ title: "Please enter a stage name", variant: "destructive" });
      return;
    }

    if (editingStage) {
      updateStageMutation.mutate({
        id: editingStage.id,
        name: newStageName,
        color: newStageColor,
      });
    } else {
      createStageMutation.mutate({
        name: newStageName,
        color: newStageColor,
        order: stages.length,
      });
    }
  };

  const getLeadQualityBadge = (qualityScore?: number | null) => {
    if (!qualityScore) return "badge-royal";
    if (qualityScore >= 80) return "badge-gold";
    if (qualityScore >= 60) return "badge-emerald";
    if (qualityScore >= 40) return "badge-royal";
    return "badge-royal";
  };

  const formatCurrency = (value?: string | null) => {
    if (!value) return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
  };

  const formatDate = (date?: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loadingStages || loadingLeads) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Crown className="w-12 h-12 text-primary animate-pulse" />
          <p className="text-muted-foreground font-serif">Loading your kingdom pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-background via-card to-background">
        <div className="animate-slide-up">
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-serif text-gradient-royal" data-testid="text-page-title">
              Pipeline Board
            </h1>
          </div>
          <p className="text-muted-foreground mt-1 ml-11">Manage leads through your sales pipeline</p>
        </div>
        <div className="flex items-center gap-3 animate-slide-up animate-delay-100">
          <Badge className="badge-gold px-4 py-1.5">
            <Sparkles className="w-3 h-3 mr-1" />
            {leads.length} total leads
          </Badge>
          <Button onClick={() => handleOpenStageDialog()} className="btn-kingdom" data-testid="button-add-stage">
            <Plus className="w-4 h-4 mr-2" />
            Add Stage
          </Button>
        </div>
      </div>

      <div className="divider-elegant" />

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-5 h-full min-w-max">
          <div
            className="flex flex-col w-80 min-h-96 bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30 animate-slide-up"
            onDragOver={handleDragOver}
            onDrop={(e) => {
              e.preventDefault();
              const leadId = e.dataTransfer.getData("leadId");
              if (leadId) {
                moveLeadMutation.mutate({ leadId, stageId: "" });
              }
            }}
          >
            <div className="p-4 border-b bg-card/50 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/50"></div>
                  <h3 className="font-serif font-semibold">Unassigned</h3>
                </div>
                <Badge className="badge-royal">{unassignedLeads.length}</Badge>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {unassignedLeads.map((lead, index) => (
                  <Card
                    key={lead.id}
                    className="card-kingdom hover-lift cursor-grab active:cursor-grabbing animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead)}
                    onClick={() => {
                      setSelectedLead(lead);
                      setShowLeadModal(true);
                    }}
                    data-testid={`card-lead-${lead.id}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-serif font-medium truncate">{lead.businessName || "Unnamed Business"}</p>
                          <p className="text-sm text-muted-foreground truncate">{lead.ownerName || "No contact"}</p>
                        </div>
                        <Badge className={getLeadQualityBadge(lead.qualityScore)}>
                          {lead.qualityScore || "N/A"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                        )}
                        {lead.estimatedValue && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {formatCurrency(lead.estimatedValue)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {unassignedLeads.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    <Crown className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No unassigned leads
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {stagesWithLeads.map((stage, stageIndex) => (
            <div
              key={stage.id}
              className="flex flex-col w-80 min-h-96 bg-card/30 rounded-lg border border-border/50 animate-slide-up"
              style={{ animationDelay: `${(stageIndex + 1) * 100}ms` }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className="p-4 border-b bg-card/80 rounded-t-lg backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full ring-2 ring-offset-1 ring-offset-background"
                      style={{ backgroundColor: stage.color || "#3b82f6" } as any}
                    ></div>
                    <h3 className="font-serif font-semibold">{stage.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="badge-emerald">{stage.leads.length}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-stage-menu-${stage.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenStageDialog(stage)} data-testid={`button-edit-stage-${stage.id}`}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Stage
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteStageMutation.mutate(stage.id)}
                          className="text-destructive"
                          data-testid={`button-delete-stage-${stage.id}`}
                        >
                          <Trash className="w-4 h-4 mr-2" />
                          Delete Stage
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {stage.leads.map((lead, index) => (
                    <Card
                      key={lead.id}
                      className="card-kingdom hover-lift cursor-grab active:cursor-grabbing animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowLeadModal(true);
                      }}
                      data-testid={`card-lead-${lead.id}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-serif font-medium truncate">{lead.businessName || "Unnamed Business"}</p>
                            <p className="text-sm text-muted-foreground truncate">{lead.ownerName || "No contact"}</p>
                          </div>
                          <Badge className={getLeadQualityBadge(lead.qualityScore)}>
                            {lead.qualityScore || "N/A"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </span>
                          )}
                          {lead.estimatedValue && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {formatCurrency(lead.estimatedValue)}
                            </span>
                          )}
                        </div>
                        {lead.lastContactedAt && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
                            <Calendar className="w-3 h-3" />
                            Last contact: {formatDate(lead.lastContactedAt)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {stage.leads.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      <ChevronRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Drag leads here
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}

          <Button
            variant="outline"
            className="h-full min-h-96 w-64 border-dashed border-2 flex flex-col items-center justify-center gap-3 text-muted-foreground hover-lift animate-slide-up"
            style={{ animationDelay: `${(stagesWithLeads.length + 1) * 100}ms` }}
            onClick={() => handleOpenStageDialog()}
            data-testid="button-add-stage-column"
          >
            <Plus className="w-8 h-8" />
            <span className="font-serif">Add New Stage</span>
          </Button>
        </div>
      </div>

      <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
        <DialogContent className="card-kingdom border-2">
          <DialogHeader>
            <DialogTitle className="font-serif text-gradient-royal text-xl">
              {editingStage ? "Edit Stage" : "Create New Stage"}
            </DialogTitle>
          </DialogHeader>
          <div className="divider-elegant my-2" />
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="stageName" className="font-serif">Stage Name</Label>
              <Input
                id="stageName"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="e.g., Qualified, Proposal, Negotiation"
                className="border-2"
                data-testid="input-stage-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stageColor" className="font-serif">Stage Color</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="stageColor"
                  type="color"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer border-2"
                  data-testid="input-stage-color"
                />
                <div className="flex gap-2">
                  {["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"].map((color) => (
                    <button
                      key={color}
                      className={`w-9 h-9 rounded-full border-2 transition-all hover-lift ${
                        newStageColor === color ? "border-foreground scale-110 ring-2 ring-offset-2" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewStageColor(color)}
                      data-testid={`button-color-${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowStageDialog(false)} data-testid="button-cancel-stage">
              Cancel
            </Button>
            <Button
              onClick={handleSaveStage}
              disabled={createStageMutation.isPending || updateStageMutation.isPending}
              className="btn-kingdom"
              data-testid="button-save-stage"
            >
              {createStageMutation.isPending || updateStageMutation.isPending
                ? "Saving..."
                : editingStage
                ? "Update Stage"
                : "Create Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeadModal} onOpenChange={(open) => {
        setShowLeadModal(open);
        if (!open) setSelectedLead(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col card-kingdom border-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 font-serif text-gradient-royal text-xl">
              <Building2 className="w-6 h-6" />
              {selectedLead?.businessName || "Lead Details"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="divider-elegant my-2" />
          
          {selectedLead && (
            <div className="flex-1 overflow-y-auto animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-6">
                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Owner:</span>
                        <span className="font-medium">{selectedLead.ownerName || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Phone:</span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-primary" />
                          {selectedLead.phone || "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Email:</span>
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-primary" />
                          {selectedLead.email || "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Address:</span>
                        <span>{selectedLead.fullAddress || "N/A"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-primary" />
                        Business Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Industry:</span>
                        <span>{selectedLead.industry || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Est. Value:</span>
                        <span className="font-medium text-primary">{formatCurrency(selectedLead.estimatedValue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Revenue:</span>
                        <span>{formatCurrency(selectedLead.annualRevenue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Employees:</span>
                        <span>{selectedLead.employeeCount || "N/A"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        Lead Scoring
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Quality:</span>
                        <Badge className={getLeadQualityBadge(selectedLead.qualityScore)}>
                          {selectedLead.qualityScore || "N/A"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Funding Score:</span>
                        <span>{selectedLead.mcaScore || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24">Status:</span>
                        <Badge className={selectedLead.leadStatus === "new" ? "badge-emerald" : "badge-royal"}>
                          {selectedLead.leadStatus || "N/A"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-primary" />
                        Tasks
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {leadTasks.length > 0 ? (
                        leadTasks.slice(0, 3).map((task) => (
                          <div key={task.id} className="flex items-center gap-2 text-sm p-3 bg-muted/30 rounded-lg border">
                            <span className={task.status === "completed" ? "line-through text-muted-foreground" : ""}>
                              {task.title}
                            </span>
                            {task.dueDate && (
                              <Badge className="badge-gold ml-auto text-xs">
                                {formatDate(task.dueDate)}
                              </Badge>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No tasks yet</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Input
                          placeholder="New task..."
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          className="flex-1"
                          data-testid="input-new-task"
                        />
                        <Input
                          type="date"
                          value={newTaskDueDate}
                          onChange={(e) => setNewTaskDueDate(e.target.value)}
                          className="w-36"
                          data-testid="input-task-due-date"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (newTaskTitle && selectedLead) {
                              createTaskMutation.mutate({
                                leadId: selectedLead.id,
                                title: newTaskTitle,
                                dueDate: newTaskDueDate || new Date().toISOString(),
                              });
                            }
                          }}
                          disabled={!newTaskTitle}
                          className="btn-kingdom"
                          data-testid="button-add-task"
                        >
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <Edit className="w-5 h-5 text-primary" />
                        Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {leadNotes.length > 0 ? (
                        leadNotes.slice(0, 3).map((note) => (
                          <div key={note.id} className="text-sm p-3 bg-muted/30 rounded-lg border">
                            <p>{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-2">{formatDate(note.createdAt)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No notes yet</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Textarea
                          placeholder="Add a note..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          className="flex-1 min-h-[60px]"
                          data-testid="input-new-note"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (newNote && selectedLead) {
                              createNoteMutation.mutate({
                                leadId: selectedLead.id,
                                content: newNote,
                              });
                            }
                          }}
                          disabled={!newNote}
                          className="btn-kingdom"
                          data-testid="button-add-note"
                        >
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-kingdom">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-40 overflow-y-auto">
                        {leadActivities.length > 0 ? (
                          leadActivities.slice(0, 5).map((activity) => (
                            <div key={activity.id} className="flex items-start gap-3 text-sm">
                              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 ring-4 ring-primary/20"></div>
                              <div>
                                <p className="font-medium">{activity.activityType}: {activity.description}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No activity yet</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          <div className="divider-elegant my-2" />

          <DialogFooter>
            <div className="flex items-center justify-between w-full gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground font-serif">Move to:</span>
                <Select
                  value={selectedLead?.pipelineStageId || "unassigned"}
                  onValueChange={(value) => {
                    if (selectedLead) {
                      const stageId = value === "unassigned" ? null : value;
                      moveLeadMutation.mutate({ leadId: selectedLead.id, stageId: stageId as string });
                      setSelectedLead({ ...selectedLead, pipelineStageId: stageId });
                    }
                  }}
                >
                  <SelectTrigger className="w-44" data-testid="select-pipeline-stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stage.color || "#3b82f6" }}
                          ></div>
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => setShowLeadModal(false)} data-testid="button-close-lead-modal">
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
