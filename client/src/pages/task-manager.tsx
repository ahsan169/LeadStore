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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Calendar, Clock, CheckCircle2, Circle, AlertCircle, 
  User, Building2, Trash, Edit, Filter, Search, XCircle,
  CalendarClock, ListTodo, CalendarDays, Crown, Sparkles
} from "lucide-react";
import type { Task, Lead, Reminder } from "@shared/schema";

export default function TaskManagerPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium",
    leadId: "",
    status: "pending",
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/crm/tasks"],
  });

  const { data: leadsResponse } = useQuery<{ leads: Lead[] }>({
    queryKey: ["/api/leads"],
  });
  const leads = leadsResponse?.leads || [];

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/crm/reminders"],
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: typeof newTask) =>
      apiRequest("POST", "/api/crm/tasks", {
        ...data,
        leadId: data.leadId || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tasks"] });
      setShowCreateDialog(false);
      setNewTask({
        title: "",
        description: "",
        dueDate: "",
        priority: "medium",
        leadId: "",
        status: "pending",
      });
      toast({ title: "Task created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; priority?: string; title?: string }) =>
      apiRequest("PATCH", `/api/crm/tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tasks"] });
      setEditingTask(null);
      toast({ title: "Task updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tasks"] });
      toast({ title: "Task deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete task", variant: "destructive" });
    },
  });

  const toggleTaskStatus = (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({ id: task.id, status: newStatus });
  };

  const formatDate = (date?: Date | string | null) => {
    if (!date) return "No due date";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isOverdue = (date?: Date | string | null) => {
    if (!date) return false;
    return new Date(date) < new Date() && new Date(date).toDateString() !== new Date().toDateString();
  };

  const isDueToday = (date?: Date | string | null) => {
    if (!date) return false;
    return new Date(date).toDateString() === new Date().toDateString();
  };

  const isDueSoon = (date?: Date | string | null) => {
    if (!date) return false;
    const dueDate = new Date(date);
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 3;
  };

  const getPriorityBadgeClass = (priority?: string | null) => {
    switch (priority) {
      case "high": return "badge-royal";
      case "medium": return "badge-gold";
      case "low": return "badge-emerald";
      default: return "badge-gold";
    }
  };

  const getStatusIcon = (status?: string | null) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case "in_progress": return <Clock className="w-5 h-5 text-primary" />;
      case "cancelled": return <XCircle className="w-5 h-5 text-muted-foreground" />;
      default: return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getLeadName = (leadId?: string | number | null) => {
    if (!leadId) return null;
    const lead = leads.find(l => l.id === (leadId as any));
    return lead?.businessName || `Lead #${leadId}`;
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || task.status === filterStatus;
    const matchesPriority = filterPriority === "all" || task.priority === filterPriority;
    
    let matchesTab = true;
    if (activeTab === "today") {
      matchesTab = isDueToday(task.dueDate);
    } else if (activeTab === "overdue") {
      matchesTab = isOverdue(task.dueDate) && task.status !== "completed";
    } else if (activeTab === "upcoming") {
      matchesTab = isDueSoon(task.dueDate) && task.status !== "completed";
    } else if (activeTab === "completed") {
      matchesTab = task.status === "completed";
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesTab;
  });

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    overdue: tasks.filter(t => isOverdue(t.dueDate) && t.status !== "completed").length,
    dueToday: tasks.filter(t => isDueToday(t.dueDate) && t.status !== "completed").length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  if (loadingTasks) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-muted-foreground font-serif">Loading your royal tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-background via-card to-background">
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-1">
            <Crown className="w-7 h-7 text-secondary" />
            <h1 className="text-3xl font-serif font-bold text-gradient-royal" data-testid="text-page-title">
              Task Manager
            </h1>
          </div>
          <p className="text-muted-foreground ml-10">Manage your royal tasks and follow-ups</p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)} 
          className="btn-kingdom animate-slide-up animate-delay-100"
          data-testid="button-create-task"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="divider-elegant" />

      <div className="grid grid-cols-5 gap-4 p-6 bg-muted/20">
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-100" data-testid="stat-total-tasks">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <ListTodo className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{taskStats.total}</p>
              <p className="text-sm text-muted-foreground">Total Tasks</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-200" data-testid="stat-pending-tasks">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-secondary/20 rounded-xl">
              <Clock className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{taskStats.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-300" data-testid="stat-overdue-tasks">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-destructive/10 rounded-xl">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{taskStats.overdue}</p>
              <p className="text-sm text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-400" data-testid="stat-today-tasks">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{taskStats.dueToday}</p>
              <p className="text-sm text-muted-foreground">Due Today</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-500" data-testid="stat-completed-tasks">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{taskStats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="divider-elegant" />

      <div className="flex-1 overflow-hidden p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <TabsList className="bg-card/50 border">
              <TabsTrigger value="all" data-testid="tab-all-tasks">All Tasks</TabsTrigger>
              <TabsTrigger value="today" data-testid="tab-today-tasks">Due Today</TabsTrigger>
              <TabsTrigger value="overdue" data-testid="tab-overdue-tasks">Overdue</TabsTrigger>
              <TabsTrigger value="upcoming" data-testid="tab-upcoming-tasks">Upcoming</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed-tasks">Completed</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search-tasks"
                />
              </div>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-36" data-testid="select-filter-priority">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {filteredTasks.length === 0 ? (
              <Card className="card-kingdom border-dashed animate-fade-in">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 bg-muted/50 rounded-full mb-4">
                    <ListTodo className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-serif font-medium mb-2">No tasks found</h3>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    {activeTab === "all" 
                      ? "Begin your royal duties by creating your first task"
                      : "No tasks match the current filters"}
                  </p>
                  {activeTab === "all" && (
                    <Button 
                      onClick={() => setShowCreateDialog(true)} 
                      className="btn-kingdom"
                      data-testid="button-create-first-task"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Task
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              filteredTasks.map((task, index) => (
                <Card
                  key={task.id}
                  className={`card-kingdom hover-lift transition-all animate-slide-up ${
                    task.status === "completed" ? "opacity-60" : ""
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  data-testid={`card-task-${task.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleTaskStatus(task)}
                        className="mt-1 transition-transform hover:scale-110"
                        data-testid={`button-toggle-task-${task.id}`}
                      >
                        {getStatusIcon(task.status)}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className={`font-medium text-lg ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </h3>
                            {task.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={getPriorityBadgeClass(task.priority)}>
                              {task.priority || "medium"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingTask(task)}
                              data-testid={`button-edit-task-${task.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                              data-testid={`button-delete-task-${task.id}`}
                            >
                              <Trash className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-4 text-sm">
                          <div className={`flex items-center gap-1.5 ${
                            isOverdue(task.dueDate) && task.status !== "completed" 
                              ? "text-destructive" 
                              : isDueToday(task.dueDate) 
                                ? "text-primary"
                                : "text-muted-foreground"
                          }`}>
                            <Calendar className="w-4 h-4" />
                            {formatDate(task.dueDate)}
                            {isOverdue(task.dueDate) && task.status !== "completed" && (
                              <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>
                            )}
                            {isDueToday(task.dueDate) && task.status !== "completed" && (
                              <Badge className="badge-royal ml-1 text-xs">Today</Badge>
                            )}
                          </div>
                          {task.leadId && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Building2 className="w-4 h-4" />
                              {getLeadName(task.leadId)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </Tabs>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="card-kingdom border-2">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif text-gradient-royal flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-secondary" />
              Create New Task
            </DialogTitle>
          </DialogHeader>
          <div className="divider-elegant my-2" />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="font-medium">Task Title</Label>
              <Input
                id="title"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Enter task title..."
                data-testid="input-task-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="font-medium">Description</Label>
              <Textarea
                id="description"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Add task description..."
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate" className="font-medium">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  data-testid="input-task-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="font-medium">Priority</Label>
                <Select
                  value={newTask.priority}
                  onValueChange={(value) => setNewTask({ ...newTask, priority: value })}
                >
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead" className="font-medium">Link to Lead (Optional)</Label>
              <Select
                value={newTask.leadId || "none"}
                onValueChange={(value) => setNewTask({ ...newTask, leadId: value === "none" ? "" : value })}
              >
                <SelectTrigger data-testid="select-task-lead">
                  <SelectValue placeholder="Select a lead..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.businessName || `Lead #${lead.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-task">
              Cancel
            </Button>
            <Button
              onClick={() => createTaskMutation.mutate(newTask)}
              disabled={!newTask.title || createTaskMutation.isPending}
              className="btn-kingdom"
              data-testid="button-submit-task"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="card-kingdom border-2">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif text-gradient-royal flex items-center gap-2">
              <Edit className="w-5 h-5 text-secondary" />
              Edit Task
            </DialogTitle>
          </DialogHeader>
          <div className="divider-elegant my-2" />
          {editingTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title" className="font-medium">Task Title</Label>
                <Input
                  id="edit-title"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  data-testid="input-edit-task-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description" className="font-medium">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingTask.description || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  data-testid="input-edit-task-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-status" className="font-medium">Status</Label>
                  <Select
                    value={editingTask.status || "pending"}
                    onValueChange={(value) => setEditingTask({ ...editingTask, status: value })}
                  >
                    <SelectTrigger data-testid="select-edit-task-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-priority" className="font-medium">Priority</Label>
                  <Select
                    value={editingTask.priority || "medium"}
                    onValueChange={(value) => setEditingTask({ ...editingTask, priority: value })}
                  >
                    <SelectTrigger data-testid="select-edit-task-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingTask(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingTask) {
                  updateTaskMutation.mutate({
                    id: editingTask.id,
                    status: editingTask.status,
                    priority: editingTask.priority,
                    title: editingTask.title,
                  });
                }
              }}
              disabled={updateTaskMutation.isPending}
              className="btn-kingdom"
              data-testid="button-save-edit"
            >
              {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
