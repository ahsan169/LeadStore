import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Area, AreaChart 
} from "recharts";
import { 
  GraduationCap, ThumbsUp, ThumbsDown, MessageSquare, 
  TrendingUp, Zap, CheckCircle, XCircle, AlertCircle,
  Lightbulb, RefreshCw, Play, Pause, Settings,
  ChevronRight, Brain, Target, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackItem {
  id: string;
  leadId: string;
  field: string;
  originalValue: any;
  correctedValue: any;
  explanation?: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
  submittedBy: string;
  submittedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
}

interface SystemImprovement {
  id: string;
  type: 'rule' | 'model' | 'process';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  status: 'proposed' | 'testing' | 'implemented';
  metrics?: {
    accuracyImprovement?: number;
    speedImprovement?: number;
    costReduction?: number;
  };
}

interface ABTest {
  id: string;
  name: string;
  description: string;
  variant_a: any;
  variant_b: any;
  status: 'running' | 'completed' | 'paused';
  startDate: Date;
  endDate?: Date;
  results?: {
    variant_a_performance: number;
    variant_b_performance: number;
    winner?: 'a' | 'b';
    confidence: number;
  };
}

export default function LearningCenter() {
  const { toast } = useToast();
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [feedbackFilter, setFeedbackFilter] = useState<string>("pending");
  const [showImprovementDialog, setShowImprovementDialog] = useState(false);
  const [newImprovement, setNewImprovement] = useState({
    type: 'rule',
    title: '',
    description: '',
    impact: 'medium'
  });

  // Fetch feedback queue
  const { data: feedbackQueue, isLoading: isLoadingFeedback } = useQuery<FeedbackItem[]>({
    queryKey: ['/api/admin/learning/feedback', feedbackFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('status', feedbackFilter);
      
      const response = await fetch(`/api/admin/learning/feedback?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch feedback');
      return response.json();
    },
  });

  // Fetch system improvements
  const { data: improvements } = useQuery<SystemImprovement[]>({
    queryKey: ['/api/admin/learning/improvements'],
    queryFn: async () => {
      const response = await fetch('/api/admin/learning/improvements', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch improvements');
      return response.json();
    },
  });

  // Fetch A/B tests
  const { data: abTests } = useQuery<ABTest[]>({
    queryKey: ['/api/admin/learning/ab-tests'],
    queryFn: async () => {
      const response = await fetch('/api/admin/learning/ab-tests', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch A/B tests');
      return response.json();
    },
  });

  // Fetch performance trends
  const { data: performanceTrends } = useQuery({
    queryKey: ['/api/admin/learning/trends'],
    queryFn: async () => {
      const response = await fetch('/api/admin/learning/trends', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch trends');
      return response.json();
    },
  });

  // Fetch learning stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/learning/stats'],
  });

  // Apply feedback mutation
  const applyFeedbackMutation = useMutation({
    mutationFn: async ({ feedbackId, action }: { feedbackId: string; action: 'accept' | 'reject' }) => {
      return apiRequest(`/api/admin/learning/feedback/${feedbackId}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: (data, variables) => {
      toast({ 
        title: variables.action === 'accept' ? "Feedback accepted" : "Feedback rejected",
        description: variables.action === 'accept' ? "System will learn from this correction" : "Feedback marked as incorrect"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/learning/feedback'] });
      setSelectedFeedback(null);
    },
    onError: () => {
      toast({ title: "Failed to process feedback", variant: "destructive" });
    },
  });

  // Create improvement mutation
  const createImprovementMutation = useMutation({
    mutationFn: async (improvement: any) => {
      return apiRequest('/api/admin/learning/improvements', {
        method: 'POST',
        body: JSON.stringify(improvement),
      });
    },
    onSuccess: () => {
      toast({ title: "Improvement proposal created" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/learning/improvements'] });
      setShowImprovementDialog(false);
      setNewImprovement({ type: 'rule', title: '', description: '', impact: 'medium' });
    },
    onError: () => {
      toast({ title: "Failed to create improvement", variant: "destructive" });
    },
  });

  // Toggle A/B test mutation
  const toggleABTestMutation = useMutation({
    mutationFn: async ({ testId, action }: { testId: string; action: 'pause' | 'resume' | 'complete' }) => {
      return apiRequest(`/api/admin/learning/ab-tests/${testId}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => {
      toast({ title: "A/B test updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/learning/ab-tests'] });
    },
    onError: () => {
      toast({ title: "Failed to update A/B test", variant: "destructive" });
    },
  });

  // Trigger model retraining
  const triggerRetrainingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/learning/retrain', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "Model retraining initiated", description: "This may take several minutes" });
    },
    onError: () => {
      toast({ title: "Failed to initiate retraining", variant: "destructive" });
    },
  });

  const getImpactColor = (impact: string) => {
    switch(impact) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'accepted': case 'implemented': case 'completed': return 'text-green-600';
      case 'rejected': return 'text-red-600';
      case 'pending': case 'proposed': return 'text-yellow-600';
      case 'testing': case 'running': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  // Format performance trends data
  const accuracyData = performanceTrends?.accuracy?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: item.accuracy,
    baseline: item.baseline
  })) || [];

  const feedbackVolumeData = performanceTrends?.feedbackVolume?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accepted: item.accepted,
    rejected: item.rejected,
    pending: item.pending
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-learning-center">
            <GraduationCap className="w-6 h-6" />
            Learning Center
          </h2>
          <p className="text-muted-foreground">System learning, feedback management, and continuous improvement</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImprovementDialog(true)}
            data-testid="button-propose-improvement"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Propose Improvement
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerRetrainingMutation.mutate()}
            disabled={triggerRetrainingMutation.isPending}
            data-testid="button-trigger-retraining"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", triggerRetrainingMutation.isPending && "animate-spin")} />
            Trigger Retraining
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Pending Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingFeedback || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Accuracy Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.accuracyImprovement ? `+${stats.accuracyImprovement.toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Active A/B Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {abTests?.filter(t => t.status === 'running').length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Model Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.modelVersion || 'v1.0.0'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last trained: {stats?.lastTraining ? new Date(stats.lastTraining).toLocaleDateString() : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="feedback" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="feedback">Feedback Queue</TabsTrigger>
          <TabsTrigger value="improvements">Improvements</TabsTrigger>
          <TabsTrigger value="abtesting">A/B Testing</TabsTrigger>
          <TabsTrigger value="trends">Performance Trends</TabsTrigger>
        </TabsList>

        {/* Feedback Queue Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operator Feedback</CardTitle>
              <CardDescription>Review and apply corrections from operators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Select value={feedbackFilter} onValueChange={setFeedbackFilter}>
                  <SelectTrigger className="w-48" data-testid="select-feedback-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>

                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {feedbackQueue?.map((feedback) => (
                      <Card 
                        key={feedback.id}
                        className={cn(
                          "cursor-pointer transition-colors",
                          selectedFeedback?.id === feedback.id && "ring-2 ring-primary"
                        )}
                        onClick={() => setSelectedFeedback(feedback)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">Lead #{feedback.leadId.slice(-8)}</p>
                              <p className="text-sm text-muted-foreground">
                                Field: <strong>{feedback.field}</strong>
                              </p>
                            </div>
                            <Badge className={cn("text-xs", getStatusColor(feedback.status))}>
                              {feedback.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Original Value:</p>
                              <p className="font-mono bg-muted p-1 rounded">
                                {JSON.stringify(feedback.originalValue)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Corrected Value:</p>
                              <p className="font-mono bg-green-50 p-1 rounded text-green-800">
                                {JSON.stringify(feedback.correctedValue)}
                              </p>
                            </div>
                          </div>
                          {feedback.explanation && (
                            <p className="text-sm text-muted-foreground">
                              {feedback.explanation}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Submitted by {feedback.submittedBy}</span>
                            <span>{new Date(feedback.submittedAt).toLocaleDateString()}</span>
                          </div>
                          {feedback.status === 'pending' && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyFeedbackMutation.mutate({ 
                                    feedbackId: feedback.id, 
                                    action: 'accept' 
                                  });
                                }}
                                data-testid={`button-accept-${feedback.id}`}
                              >
                                <ThumbsUp className="w-4 h-4 mr-2" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyFeedbackMutation.mutate({ 
                                    feedbackId: feedback.id, 
                                    action: 'reject' 
                                  });
                                }}
                                data-testid={`button-reject-${feedback.id}`}
                              >
                                <ThumbsDown className="w-4 h-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )) || (
                      <p className="text-center text-muted-foreground py-8">
                        {isLoadingFeedback ? "Loading feedback..." : "No feedback items found"}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Improvements Tab */}
        <TabsContent value="improvements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Improvements</CardTitle>
              <CardDescription>Proposed and implemented system enhancements</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {improvements?.map((improvement) => (
                    <Card key={improvement.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{improvement.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {improvement.type}
                              </Badge>
                              <Badge className={cn("text-xs", getImpactColor(improvement.impact))}>
                                {improvement.impact} impact
                              </Badge>
                              <Badge className={cn("text-xs", getStatusColor(improvement.status))}>
                                {improvement.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">
                          {improvement.description}
                        </p>
                        {improvement.metrics && (
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {improvement.metrics.accuracyImprovement !== undefined && (
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-xs text-muted-foreground">Accuracy</p>
                                <p className="font-bold text-green-600">
                                  +{improvement.metrics.accuracyImprovement}%
                                </p>
                              </div>
                            )}
                            {improvement.metrics.speedImprovement !== undefined && (
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-xs text-muted-foreground">Speed</p>
                                <p className="font-bold text-blue-600">
                                  +{improvement.metrics.speedImprovement}%
                                </p>
                              </div>
                            )}
                            {improvement.metrics.costReduction !== undefined && (
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-xs text-muted-foreground">Cost</p>
                                <p className="font-bold text-purple-600">
                                  -{improvement.metrics.costReduction}%
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )) || (
                    <p className="text-center text-muted-foreground py-8">
                      No improvements tracked yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B Testing Tab */}
        <TabsContent value="abtesting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>A/B Testing</CardTitle>
              <CardDescription>Compare rule and model variations</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {abTests?.map((test) => (
                    <Card key={test.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{test.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {test.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs", getStatusColor(test.status))}>
                              {test.status}
                            </Badge>
                            {test.status === 'running' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleABTestMutation.mutate({ 
                                  testId: test.id, 
                                  action: 'pause' 
                                })}
                                data-testid={`button-pause-${test.id}`}
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                            ) : test.status === 'paused' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleABTestMutation.mutate({ 
                                  testId: test.id, 
                                  action: 'resume' 
                                })}
                                data-testid={`button-resume-${test.id}`}
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">
                            Started: {new Date(test.startDate).toLocaleDateString()}
                            {test.endDate && ` • Ended: ${new Date(test.endDate).toLocaleDateString()}`}
                          </div>
                          
                          {test.results && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Variant A Performance:</span>
                                <span className="font-medium">{test.results.variant_a_performance}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm">Variant B Performance:</span>
                                <span className="font-medium">{test.results.variant_b_performance}%</span>
                              </div>
                              <Progress 
                                value={test.results.confidence} 
                                className="h-2"
                              />
                              <p className="text-xs text-muted-foreground">
                                {test.results.confidence}% statistical confidence
                              </p>
                              {test.results.winner && (
                                <Alert>
                                  <CheckCircle className="h-4 w-4" />
                                  <AlertDescription>
                                    Variant {test.results.winner.toUpperCase()} is the winner!
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )) || (
                    <p className="text-center text-muted-foreground py-8">
                      No A/B tests configured
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Accuracy Trend</CardTitle>
                <CardDescription>System accuracy over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={accuracyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="accuracy" stroke="#8884d8" name="Accuracy %" />
                    <Line type="monotone" dataKey="baseline" stroke="#82ca9d" strokeDasharray="5 5" name="Baseline" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feedback Volume</CardTitle>
                <CardDescription>Feedback activity by status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={feedbackVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="accepted" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Accepted" />
                    <Area type="monotone" dataKey="rejected" stackId="1" stroke="#ff7c7c" fill="#ff7c7c" name="Rejected" />
                    <Area type="monotone" dataKey="pending" stackId="1" stroke="#ffc658" fill="#ffc658" name="Pending" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Model Performance Metrics</CardTitle>
              <CardDescription>Key performance indicators for the learning system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{stats?.precision || 0}%</p>
                  <p className="text-sm text-muted-foreground">Precision</p>
                </div>
                <div className="text-center p-4 bg-muted rounded">
                  <Target className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{stats?.recall || 0}%</p>
                  <p className="text-sm text-muted-foreground">Recall</p>
                </div>
                <div className="text-center p-4 bg-muted rounded">
                  <Brain className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{stats?.f1Score || 0}</p>
                  <p className="text-sm text-muted-foreground">F1 Score</p>
                </div>
                <div className="text-center p-4 bg-muted rounded">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{stats?.learningRate || 0}</p>
                  <p className="text-sm text-muted-foreground">Learning Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Improvement Dialog */}
      <Dialog open={showImprovementDialog} onOpenChange={setShowImprovementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose System Improvement</DialogTitle>
            <DialogDescription>
              Suggest an enhancement to improve system performance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select 
                value={newImprovement.type} 
                onValueChange={(value) => setNewImprovement({...newImprovement, type: value})}
              >
                <SelectTrigger data-testid="select-improvement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule">Rule Enhancement</SelectItem>
                  <SelectItem value="model">Model Improvement</SelectItem>
                  <SelectItem value="process">Process Optimization</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={newImprovement.title}
                onChange={(e) => setNewImprovement({...newImprovement, title: e.target.value})}
                placeholder="Brief title for the improvement"
                data-testid="input-improvement-title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newImprovement.description}
                onChange={(e) => setNewImprovement({...newImprovement, description: e.target.value})}
                placeholder="Detailed description of the proposed improvement..."
                className="min-h-[100px]"
                data-testid="textarea-improvement-description"
              />
            </div>
            <div>
              <Label>Expected Impact</Label>
              <Select 
                value={newImprovement.impact} 
                onValueChange={(value) => setNewImprovement({...newImprovement, impact: value})}
              >
                <SelectTrigger data-testid="select-improvement-impact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => createImprovementMutation.mutate(newImprovement)}
              disabled={!newImprovement.title || !newImprovement.description || createImprovementMutation.isPending}
              data-testid="button-submit-improvement"
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              Submit Proposal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}