import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/components/CommandPalette";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Bell,
  CheckCircle,
  Clock,
  Code2,
  Copy,
  Database,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Key,
  LineChart,
  Loader2,
  LogOut,
  Package,
  Play,
  Plus,
  RefreshCw,
  Send,
  Server,
  Settings,
  Shield,
  Terminal,
  TrendingUp,
  Upload,
  Users,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// Quick Action Component
function QuickActionPanel({ onAction }: { onAction: (action: string) => void }) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <CardDescription>Common operations at your fingertips</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("generate-key")}
            className="justify-start gap-2"
            data-testid="button-generate-key"
          >
            <Key className="w-4 h-4" />
            Generate API Key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("test-webhook")}
            className="justify-start gap-2"
            data-testid="button-test-webhook"
          >
            <Send className="w-4 h-4" />
            Test Webhook
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("export-analytics")}
            className="justify-start gap-2"
            data-testid="button-export-analytics"
          >
            <Download className="w-4 h-4" />
            Export Analytics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("view-logs")}
            className="justify-start gap-2"
            data-testid="button-view-logs"
          >
            <FileText className="w-4 h-4" />
            View Live Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Activity Feed Component
function ActivityFeed({ activities }: { activities: any[] }) {
  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3 pr-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-3 text-sm">
            <div className={cn(
              "mt-0.5 rounded-full p-1",
              activity.type === "success" && "bg-green-100 dark:bg-green-900",
              activity.type === "warning" && "bg-yellow-100 dark:bg-yellow-900",
              activity.type === "error" && "bg-red-100 dark:bg-red-900",
              activity.type === "info" && "bg-blue-100 dark:bg-blue-900"
            )}>
              {activity.type === "success" && <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />}
              {activity.type === "warning" && <AlertCircle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />}
              {activity.type === "error" && <X className="w-3 h-3 text-red-600 dark:text-red-400" />}
              {activity.type === "info" && <Activity className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium">{activity.title}</p>
              <p className="text-muted-foreground">{activity.description}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// API Console Component
function ApiConsole() {
  const [method, setMethod] = useState("GET");
  const [endpoint, setEndpoint] = useState("/api/v1/leads");
  const [headers, setHeaders] = useState("{\n  \"Authorization\": \"Bearer YOUR_API_KEY\"\n}");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const executeRequest = async () => {
    setIsLoading(true);
    try {
      const options: any = {
        method,
        headers: JSON.parse(headers),
      };

      if (method !== "GET" && body) {
        options.body = body;
      }

      const res = await fetch(endpoint, options);
      const data = await res.json();
      
      setResponse(JSON.stringify(data, null, 2));
      
      toast({
        title: "Request Executed",
        description: `${method} ${endpoint} - Status: ${res.status}`,
      });
    } catch (error) {
      setResponse(JSON.stringify({ error: error.message }, null, 2));
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3 sm:col-span-2">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-7 sm:col-span-8">
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="/api/v1/..."
          />
        </div>
        <div className="col-span-2">
          <Button
            onClick={executeRequest}
            disabled={isLoading}
            className="w-full"
            data-testid="button-execute-request"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline ml-2">Execute</span>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Headers</Label>
          <Textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            className="font-mono text-sm h-32"
            placeholder="{ }"
          />
        </div>
        {method !== "GET" && (
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-sm h-32"
              placeholder="{ }"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Response</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(response)}
            disabled={!response}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <Textarea
          value={response}
          readOnly
          className="font-mono text-sm h-64"
          placeholder="Response will appear here..."
        />
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Get URL params for tab navigation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  // Fetch unified dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["/api/command-center/dashboard"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch activity log
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["/api/command-center/activity"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["/api/developer/keys"],
  });

  // Fetch webhooks
  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery({
    queryKey: ["/api/v1/webhooks"],
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/command-center`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("Command Center WebSocket connected");
          setIsConnected(true);
          toast({
            title: "Connected",
            description: "Real-time updates enabled",
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleRealtimeUpdate(data);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnected(false);
        };

        ws.onclose = () => {
          console.log("WebSocket disconnected");
          setIsConnected(false);
          // Reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        setIsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleRealtimeUpdate = (data: any) => {
    switch (data.type) {
      case "metrics-update":
        queryClient.setQueryData(["/api/command-center/dashboard"], (old: any) => ({
          ...old,
          metrics: data.metrics,
        }));
        break;
      case "activity":
        queryClient.setQueryData(["/api/command-center/activity"], (old: any) => {
          const newActivities = [data.activity, ...(old || [])].slice(0, 100);
          return newActivities;
        });
        break;
      case "alert":
        toast({
          title: data.title,
          description: data.description,
          variant: data.variant || "default",
        });
        break;
      default:
        console.log("Unknown WebSocket message type:", data.type);
    }
  };

  const handleQuickAction = async (action: string) => {
    switch (action) {
      case "generate-key":
        setActiveTab("keys");
        break;
      case "test-webhook":
        setActiveTab("keys");
        break;
      case "export-analytics":
        try {
          const response = await apiRequest("POST", "/api/command-center/export-analytics");
          const link = document.createElement("a");
          link.href = response.downloadUrl;
          link.download = `analytics_${new Date().toISOString()}.csv`;
          link.click();
          toast({
            title: "Analytics Exported",
            description: "Your analytics data has been exported.",
          });
        } catch (error) {
          toast({
            title: "Export Failed",
            description: "Failed to export analytics data",
            variant: "destructive",
          });
        }
        break;
      case "view-logs":
        setActiveTab("activity");
        break;
    }
  };

  const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Command Center</h1>
          <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )} />
            {isConnected ? "Live" : "Offline"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <CommandPalette />
          <Button variant="ghost" size="icon" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4">
        <QuickActionPanel onAction={handleQuickAction} />
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="overview" className="gap-1">
              <BarChart2 className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1">
              <LineChart className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="api-console" className="gap-1">
              <Terminal className="w-4 h-4" />
              <span className="hidden sm:inline">API Console</span>
            </TabsTrigger>
            <TabsTrigger value="keys" className="gap-1">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Keys & Webhooks</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${dashboardData?.metrics?.totalRevenue?.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +{dashboardData?.metrics?.revenueGrowth || 0}% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">API Calls Today</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {dashboardData?.metrics?.apiCallsToday?.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dashboardData?.metrics?.apiCallsTrend || 0} avg response time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Webhooks</CardTitle>
                  <Webhook className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{webhooks.length || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {dashboardData?.metrics?.webhookDeliveryRate || 100}% delivery rate
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Health</CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {dashboardData?.metrics?.systemHealth || "Operational"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dashboardData?.metrics?.uptime || "99.9"}% uptime
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Live Activity Feed</CardTitle>
                  <CardDescription>Real-time system activity</CardDescription>
                </CardHeader>
                <CardContent>
                  {activitiesLoading ? (
                    <div className="flex items-center justify-center h-[300px]">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <ActivityFeed activities={activities} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>API Usage Overview</CardTitle>
                  <CardDescription>Last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dashboardData?.apiUsageChart || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab - Import from existing analytics page */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Analytics content from existing analytics page will be integrated here
              </p>
            </div>
          </TabsContent>

          {/* API Console Tab */}
          <TabsContent value="api-console" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Console</CardTitle>
                <CardDescription>Test and debug API endpoints in real-time</CardDescription>
              </CardHeader>
              <CardContent>
                <ApiConsole />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Keys & Webhooks Tab */}
          <TabsContent value="keys" className="space-y-4">
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                API Keys and Webhooks management from developer portal will be integrated here
              </p>
            </div>
          </TabsContent>

          {/* Activity Log Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
                <CardDescription>Complete system activity history</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {activities.map((activity, index) => (
                      <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-0">
                        <div className={cn(
                          "mt-1 rounded-full p-2",
                          activity.type === "success" && "bg-green-100 dark:bg-green-900",
                          activity.type === "warning" && "bg-yellow-100 dark:bg-yellow-900",
                          activity.type === "error" && "bg-red-100 dark:bg-red-900",
                          activity.type === "info" && "bg-blue-100 dark:bg-blue-900"
                        )}>
                          {activity.type === "success" && <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />}
                          {activity.type === "warning" && <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />}
                          {activity.type === "error" && <X className="w-4 h-4 text-red-600 dark:text-red-400" />}
                          {activity.type === "info" && <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{activity.title}</h4>
                            <time className="text-xs text-muted-foreground">
                              {format(new Date(activity.timestamp), "MMM d, HH:mm")}
                            </time>
                          </div>
                          <p className="text-sm text-muted-foreground">{activity.description}</p>
                          {activity.metadata && (
                            <div className="flex gap-2 mt-2">
                              {Object.entries(activity.metadata).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value as string}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Command Center Settings</CardTitle>
                <CardDescription>Configure notifications, alerts, and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Real-time Updates</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Enable WebSocket connection for live data
                    </span>
                    <Badge variant={isConnected ? "default" : "secondary"}>
                      {isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Notification Preferences</Label>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">API Errors</p>
                        <p className="text-xs text-muted-foreground">Get notified when API calls fail</p>
                      </div>
                      <input type="checkbox" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Webhook Failures</p>
                        <p className="text-xs text-muted-foreground">Alert on webhook delivery issues</p>
                      </div>
                      <input type="checkbox" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Rate Limit Warnings</p>
                        <p className="text-xs text-muted-foreground">Warn when approaching rate limits</p>
                      </div>
                      <input type="checkbox" defaultChecked />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Data Refresh Interval</Label>
                  <Select defaultValue="30">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">Every 10 seconds</SelectItem>
                      <SelectItem value="30">Every 30 seconds</SelectItem>
                      <SelectItem value="60">Every minute</SelectItem>
                      <SelectItem value="300">Every 5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end">
                  <Button>Save Settings</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}