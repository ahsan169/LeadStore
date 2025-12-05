import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { 
  Users, Building2, CheckCircle2, Clock, AlertCircle, 
  TrendingUp, Target, Calendar, Phone, Mail, ArrowRight,
  Kanban, ListTodo, Activity, DollarSign, Star, Briefcase
} from "lucide-react";
import type { Lead, PipelineStage, Task, Contact, Activity as ActivityType } from "@shared/schema";
import { NextBestLead } from "@/components/NextBestLead";

export default function CrmDashboardPage() {
  const { data: leadsResponse } = useQuery<{ leads: Lead[] }>({
    queryKey: ["/api/leads"],
  });
  const leads = leadsResponse?.leads || [];

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ["/api/crm/pipeline-stages"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/crm/tasks"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/crm/contacts"],
  });

  const { data: activities = [] } = useQuery<ActivityType[]>({
    queryKey: ["/api/crm/activities"],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const leadsInPipeline = leads.filter(l => l.pipelineStageId);
  const tasksDueToday = tasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = new Date(t.dueDate);
    return dueDate >= today && dueDate < tomorrow && t.status !== "completed";
  });
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < today && t.status !== "completed" && t.status !== "cancelled";
  });
  const completedTasks = tasks.filter(t => t.status === "completed");
  const pendingTasks = tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const recentActivities = activities
    .filter(a => new Date(a.createdAt) > oneWeekAgo)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const pipelineValue = leads
    .filter(l => l.pipelineStageId && l.estimatedValue)
    .reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date?: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
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

  const getLeadQualityColor = (qualityScore?: number | null) => {
    if (!qualityScore) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    if (qualityScore >= 80) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (qualityScore >= 60) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    if (qualityScore >= 40) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const taskCompletionRate = tasks.length > 0 
    ? Math.round((completedTasks.length / tasks.length) * 100) 
    : 0;

  const stagesWithCounts = stages.map(stage => ({
    ...stage,
    count: leads.filter(l => l.pipelineStageId === stage.id).length,
    value: leads
      .filter(l => l.pipelineStageId === stage.id && l.estimatedValue)
      .reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0),
  }));

  const highQualityLeads = leads.filter(l => (l.qualityScore || 0) >= 80);
  const recentLeads = leads
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">CRM Dashboard</h1>
          <p className="text-muted-foreground">Overview of your sales pipeline and activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pipeline">
            <Button variant="outline" data-testid="button-go-to-pipeline">
              <Kanban className="w-4 h-4 mr-2" />
              Pipeline Board
            </Button>
          </Link>
          <Link href="/tasks">
            <Button variant="outline" data-testid="button-go-to-tasks">
              <ListTodo className="w-4 h-4 mr-2" />
              Task Manager
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1">
          <NextBestLead />
        </div>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-3xl font-bold">{leads.length}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Badge variant="secondary">{leadsInPipeline.length} in pipeline</Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200">
                {highQualityLeads.length} high quality
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
                <p className="text-3xl font-bold">{formatCurrency(pipelineValue)}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4" />
              Across {stagesWithCounts.length} stages
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tasks</p>
                <p className="text-3xl font-bold">{pendingTasks.length}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <ListTodo className="w-6 h-6 text-blue-500" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="w-3 h-3" />
                {overdueTasks.length} overdue
              </Badge>
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                {tasksDueToday.length} due today
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Contacts</p>
                <p className="text-3xl font-bold">{contacts.length}</p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <Users className="w-6 h-6 text-purple-500" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Badge variant="secondary">
                {contacts.filter(c => c.isPrimary).length} primary
              </Badge>
              <Badge variant="outline">
                {contacts.filter(c => c.role === "decision_maker").length} decision makers
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Kanban className="w-5 h-5" />
              Pipeline Overview
            </CardTitle>
            <CardDescription>Leads distributed across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            {stagesWithCounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Kanban className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No pipeline stages yet</p>
                <p className="text-muted-foreground mb-4">Create your first pipeline stage to get started</p>
                <Link href="/pipeline">
                  <Button>Set Up Pipeline</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {stagesWithCounts.map((stage) => (
                  <div key={stage.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color || "#3b82f6" }}
                        ></div>
                        <span className="font-medium">{stage.name}</span>
                        <Badge variant="secondary">{stage.count}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(stage.value)}
                      </span>
                    </div>
                    <Progress
                      value={leads.length > 0 ? (stage.count / leads.length) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Task Completion
            </CardTitle>
            <CardDescription>Overall task progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-muted stroke-current"
                    strokeWidth="10"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                  ></circle>
                  <circle
                    className="text-primary stroke-current"
                    strokeWidth="10"
                    strokeLinecap="round"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    strokeDasharray={`${taskCompletionRate * 2.51} 251`}
                    transform="rotate(-90 50 50)"
                  ></circle>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{taskCompletionRate}%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>{completedTasks.length} completed</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{pendingTasks.length} pending</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>{overdueTasks.length} overdue</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-yellow-500" />
                <span>{tasksDueToday.length} due today</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <Link href="/activity">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-10 h-10 text-muted-foreground mb-4" />
                <p className="font-medium mb-1">No recent activity</p>
                <p className="text-sm text-muted-foreground">Start logging calls, meetings, and notes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      {activity.type === "call" ? (
                        <Phone className="w-4 h-4" />
                      ) : activity.type === "email" ? (
                        <Mail className="w-4 h-4" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium capitalize">{activity.type}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {activity.description || "No description"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(activity.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5" />
                Top Leads
              </CardTitle>
              <Link href="/lead-management">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground mb-4" />
                <p className="font-medium mb-1">No leads yet</p>
                <p className="text-sm text-muted-foreground">Upload leads to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-muted rounded-lg">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {lead.businessName || "Unnamed Business"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {lead.ownerName || "No contact"}
                        </p>
                      </div>
                    </div>
                    <Badge className={getLeadQualityColor(lead.qualityScore)} variant="outline">
                      {lead.qualityScore || "N/A"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Tasks Due Today
          </CardTitle>
          <CardDescription>Tasks that need your attention</CardDescription>
        </CardHeader>
        <CardContent>
          {tasksDueToday.length === 0 && overdueTasks.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-center">
              <div>
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-4" />
                <p className="font-medium mb-1">All caught up!</p>
                <p className="text-sm text-muted-foreground">No tasks due today or overdue</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {overdueTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-red-600 dark:text-red-400">
                        Overdue: {formatDate(task.dueDate)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="destructive">Overdue</Badge>
                </div>
              ))}
              {tasksDueToday.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">Due today</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                    Today
                  </Badge>
                </div>
              ))}
              {(tasksDueToday.length > 3 || overdueTasks.length > 3) && (
                <Link href="/tasks">
                  <Button variant="outline" className="w-full">
                    View All Tasks
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
