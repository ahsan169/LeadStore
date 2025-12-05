import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Search, Phone, Mail, Building2, Clock, MessageSquare,
  FileText, CalendarClock, Activity, Filter, MoreHorizontal,
  Edit, Trash, PhoneCall, Video, Send, UserPlus, CheckCircle,
  AlertCircle, ArrowRight, Calendar
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Lead, Note, Activity as ActivityType, CallLog, EmailTracking } from "@shared/schema";

type TimelineEvent = {
  id: string;
  type: "note" | "activity" | "call" | "email" | "task_completed" | "stage_change";
  title: string;
  description?: string | null;
  timestamp: Date | string;
  icon: typeof Phone;
  color: string;
  metadata?: Record<string, unknown>;
};

export default function ActivityTimelinePage() {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showCallLogDialog, setShowCallLogDialog] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newActivity, setNewActivity] = useState({
    type: "call",
    description: "",
    outcome: "",
  });
  const [newCallLog, setNewCallLog] = useState({
    direction: "outbound",
    duration: "",
    outcome: "",
    notes: "",
  });

  const { data: leadsResponse, isLoading: loadingLeads } = useQuery<{ leads: Lead[] }>({
    queryKey: ["/api/leads"],
  });
  const leads = leadsResponse?.leads || [];

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/crm/notes", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/crm/activities", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const { data: callLogs = [] } = useQuery<CallLog[]>({
    queryKey: ["/api/crm/call-logs", "lead", selectedLead?.id],
    enabled: !!selectedLead,
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: { leadId: string; content: string }) =>
      apiRequest("POST", "/api/crm/notes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notes", "lead", selectedLead?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/activities", "lead", selectedLead?.id] });
      setShowNoteDialog(false);
      setNewNote("");
      toast({ title: "Note added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data: typeof newActivity & { leadId: string }) =>
      apiRequest("POST", "/api/crm/activities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/activities", "lead", selectedLead?.id] });
      setShowActivityDialog(false);
      setNewActivity({ type: "call", description: "", outcome: "" });
      toast({ title: "Activity logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log activity", variant: "destructive" });
    },
  });

  const createCallLogMutation = useMutation({
    mutationFn: (data: typeof newCallLog & { leadId: string }) =>
      apiRequest("POST", "/api/crm/call-logs", {
        ...data,
        leadId: data.leadId,
        duration: data.duration ? parseInt(data.duration) : 0,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/call-logs", "lead", selectedLead?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/activities", "lead", selectedLead?.id] });
      setShowCallLogDialog(false);
      setNewCallLog({ direction: "outbound", duration: "", outcome: "", notes: "" });
      toast({ title: "Call logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log call", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notes", "lead", selectedLead?.id] });
      toast({ title: "Note deleted successfully" });
    },
  });

  const formatDate = (date?: Date | string | null) => {
    if (!date) return "N/A";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (date?: Date | string | null) => {
    if (!date) return "N/A";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(date);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "call": return PhoneCall;
      case "email": return Mail;
      case "meeting": return Video;
      case "note": return FileText;
      case "task_completed": return CheckCircle;
      case "stage_change": return ArrowRight;
      default: return Activity;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "call": return "text-blue-500 bg-blue-500/10";
      case "email": return "text-green-500 bg-green-500/10";
      case "meeting": return "text-purple-500 bg-purple-500/10";
      case "note": return "text-yellow-500 bg-yellow-500/10";
      case "task_completed": return "text-emerald-500 bg-emerald-500/10";
      case "stage_change": return "text-orange-500 bg-orange-500/10";
      default: return "text-gray-500 bg-gray-500/10";
    }
  };

  const buildTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    notes.forEach((note) => {
      events.push({
        id: `note-${note.id}`,
        type: "note",
        title: "Note added",
        description: note.content,
        timestamp: note.createdAt,
        icon: FileText,
        color: "text-yellow-500 bg-yellow-500/10",
        metadata: { noteId: note.id },
      });
    });

    activities.forEach((activity) => {
      events.push({
        id: `activity-${activity.id}`,
        type: "activity",
        title: activity.type,
        description: activity.description,
        timestamp: activity.createdAt,
        icon: getActivityIcon(activity.type),
        color: getActivityColor(activity.type),
        metadata: { activityId: activity.id, outcome: activity.outcome },
      });
    });

    callLogs.forEach((call) => {
      events.push({
        id: `call-${call.id}`,
        type: "call",
        title: `${call.direction === "inbound" ? "Incoming" : "Outgoing"} call`,
        description: call.notes,
        timestamp: call.startTime,
        icon: PhoneCall,
        color: "text-blue-500 bg-blue-500/10",
        metadata: { 
          duration: call.duration, 
          outcome: call.outcome,
          direction: call.direction,
        },
      });
    });

    return events.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  const timeline = selectedLead ? buildTimeline() : [];

  const filteredTimeline = timeline.filter((event) => {
    if (filterType === "all") return true;
    return event.type === filterType;
  });

  const filteredLeads = leads.filter((lead) =>
    lead.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activityStats = {
    notes: notes.length,
    calls: callLogs.length,
    activities: activities.length,
    total: timeline.length,
  };

  if (loadingLeads) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-80 border-r flex flex-col bg-muted/20">
        <div className="p-4 border-b">
          <h2 className="font-semibold mb-3">Select Lead</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-leads"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedLead?.id === lead.id
                    ? "bg-primary text-primary-foreground"
                    : "hover-elevate"
                }`}
                data-testid={`button-select-lead-${lead.id}`}
              >
                <div className="font-medium truncate">
                  {lead.businessName || "Unnamed Business"}
                </div>
                <div className={`text-sm truncate ${
                  selectedLead?.id === lead.id 
                    ? "text-primary-foreground/80" 
                    : "text-muted-foreground"
                }`}>
                  {lead.ownerName || "No contact"}
                </div>
              </button>
            ))}
            {filteredLeads.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No leads found
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedLead ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Select a lead to view activity</p>
              <p className="text-sm">Choose a lead from the list to see their timeline</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b bg-background">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {selectedLead.businessName || "Unnamed Business"}
                  </h1>
                  <p className="text-muted-foreground">
                    {selectedLead.ownerName} {selectedLead.phone && `• ${selectedLead.phone}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNoteDialog(true)}
                    data-testid="button-add-note"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Add Note
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCallLogDialog(true)}
                    data-testid="button-log-call"
                  >
                    <PhoneCall className="w-4 h-4 mr-2" />
                    Log Call
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowActivityDialog(true)}
                    data-testid="button-log-activity"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Log Activity
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="p-1.5 bg-primary/10 rounded">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-medium">{activityStats.total}</span>
                    <span className="text-muted-foreground ml-1">total</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="p-1.5 bg-yellow-500/10 rounded">
                    <FileText className="w-4 h-4 text-yellow-500" />
                  </div>
                  <div>
                    <span className="font-medium">{activityStats.notes}</span>
                    <span className="text-muted-foreground ml-1">notes</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="p-1.5 bg-blue-500/10 rounded">
                    <PhoneCall className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <span className="font-medium">{activityStats.calls}</span>
                    <span className="text-muted-foreground ml-1">calls</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="p-1.5 bg-green-500/10 rounded">
                    <MessageSquare className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <span className="font-medium">{activityStats.activities}</span>
                    <span className="text-muted-foreground ml-1">activities</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Filter:</span>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32 h-8" data-testid="select-filter-type">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activity</SelectItem>
                    <SelectItem value="note">Notes</SelectItem>
                    <SelectItem value="call">Calls</SelectItem>
                    <SelectItem value="activity">Activities</SelectItem>
                    <SelectItem value="email">Emails</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-sm text-muted-foreground">
                {filteredTimeline.length} events
              </span>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                {filteredTimeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Activity className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No activity yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start tracking interactions with this lead
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowNoteDialog(true)}>
                        <FileText className="w-4 h-4 mr-2" />
                        Add Note
                      </Button>
                      <Button onClick={() => setShowActivityDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Log Activity
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border"></div>
                    <div className="space-y-6">
                      {filteredTimeline.map((event, index) => {
                        const Icon = event.icon;
                        return (
                          <div
                            key={event.id}
                            className="relative flex gap-4"
                            data-testid={`timeline-event-${event.id}`}
                          >
                            <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${event.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <Card className="flex-1">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium capitalize">{event.title}</span>
                                      {event.metadata?.outcome && (
                                        <Badge variant="outline" className="text-xs">
                                          {event.metadata.outcome as string}
                                        </Badge>
                                      )}
                                      {event.metadata?.duration && (
                                        <Badge variant="secondary" className="text-xs">
                                          {event.metadata.duration as number}min
                                        </Badge>
                                      )}
                                    </div>
                                    {event.description && (
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {event.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {formatRelativeTime(event.timestamp)}
                                    </span>
                                    {event.type === "note" && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <MoreHorizontal className="w-4 h-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => deleteNoteMutation.mutate(event.metadata?.noteId as string)}
                                          >
                                            <Trash className="w-4 h-4 mr-2" />
                                            Delete Note
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(event.timestamp)}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="note">Note Content</Label>
            <Textarea
              id="note"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Enter your note..."
              className="mt-2 min-h-[120px]"
              data-testid="input-note-content"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedLead && newNote) {
                  createNoteMutation.mutate({
                    leadId: selectedLead.id,
                    content: newNote,
                  });
                }
              }}
              disabled={!newNote || createNoteMutation.isPending}
              data-testid="button-submit-note"
            >
              {createNoteMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="activityType">Activity Type</Label>
              <Select
                value={newActivity.type}
                onValueChange={(value) => setNewActivity({ ...newActivity, type: value })}
              >
                <SelectTrigger data-testid="select-activity-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activityDescription">Description</Label>
              <Textarea
                id="activityDescription"
                value={newActivity.description}
                onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                placeholder="Describe the activity..."
                data-testid="input-activity-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activityOutcome">Outcome</Label>
              <Select
                value={newActivity.outcome}
                onValueChange={(value) => setNewActivity({ ...newActivity, outcome: value })}
              >
                <SelectTrigger data-testid="select-activity-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="scheduled">Scheduled Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivityDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedLead) {
                  createActivityMutation.mutate({
                    ...newActivity,
                    leadId: selectedLead.id,
                  });
                }
              }}
              disabled={!newActivity.type || createActivityMutation.isPending}
              data-testid="button-submit-activity"
            >
              {createActivityMutation.isPending ? "Logging..." : "Log Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCallLogDialog} onOpenChange={setShowCallLogDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="callDirection">Direction</Label>
                <Select
                  value={newCallLog.direction}
                  onValueChange={(value) => setNewCallLog({ ...newCallLog, direction: value })}
                >
                  <SelectTrigger data-testid="select-call-direction">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="callDuration">Duration (minutes)</Label>
                <Input
                  id="callDuration"
                  type="number"
                  value={newCallLog.duration}
                  onChange={(e) => setNewCallLog({ ...newCallLog, duration: e.target.value })}
                  placeholder="5"
                  data-testid="input-call-duration"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="callOutcome">Outcome</Label>
              <Select
                value={newCallLog.outcome}
                onValueChange={(value) => setNewCallLog({ ...newCallLog, outcome: value })}
              >
                <SelectTrigger data-testid="select-call-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="voicemail">Left Voicemail</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="wrong_number">Wrong Number</SelectItem>
                  <SelectItem value="scheduled_callback">Scheduled Callback</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="callNotes">Notes</Label>
              <Textarea
                id="callNotes"
                value={newCallLog.notes}
                onChange={(e) => setNewCallLog({ ...newCallLog, notes: e.target.value })}
                placeholder="Add call notes..."
                data-testid="input-call-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCallLogDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedLead) {
                  createCallLogMutation.mutate({
                    ...newCallLog,
                    leadId: selectedLead.id,
                  });
                }
              }}
              disabled={!newCallLog.outcome || createCallLogMutation.isPending}
              data-testid="button-submit-call"
            >
              {createCallLogMutation.isPending ? "Logging..." : "Log Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
