import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Key, Webhook, Activity, Code2, Eye, EyeOff, Copy, Check, Trash2, RefreshCw, Plus, TestTube, Settings, AlertCircle, BarChart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
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

interface ApiKey {
  id: string;
  keyName: string;
  permissions: {
    scopes: string[];
    endpoints: string[];
  };
  rateLimit: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { value: "read:leads", label: "Read Leads" },
  { value: "write:leads", label: "Write Leads" },
  { value: "read:purchases", label: "Read Purchases" },
  { value: "write:purchases", label: "Write Purchases" },
  { value: "read:analytics", label: "Read Analytics" },
  { value: "manage:webhooks", label: "Manage Webhooks" },
];

const WEBHOOK_EVENTS = [
  { value: "lead.created", label: "Lead Created" },
  { value: "lead.updated", label: "Lead Updated" },
  { value: "lead.sold", label: "Lead Sold" },
  { value: "purchase.completed", label: "Purchase Completed" },
  { value: "purchase.failed", label: "Purchase Failed" },
  { value: "credit.added", label: "Credit Added" },
  { value: "credit.used", label: "Credit Used" },
  { value: "batch.uploaded", label: "Batch Uploaded" },
  { value: "batch.processed", label: "Batch Processed" },
  { value: "alert.triggered", label: "Alert Triggered" },
  { value: "quality.reported", label: "Quality Issue Reported" },
  { value: "quality.resolved", label: "Quality Issue Resolved" },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function DeveloperPage() {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [selectedKeyForUsage, setSelectedKeyForUsage] = useState<string | null>(null);

  // API Keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/developer/keys"],
  });

  // Webhooks
  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery<Webhook[]>({
    queryKey: ["/api/v1/webhooks"],
  });

  // API Usage
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["/api/developer/usage", selectedKeyForUsage],
    enabled: !!selectedKeyForUsage,
  });

  // Create API Key Dialog
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [rateLimit, setRateLimit] = useState("100");

  const createKeyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/developer/keys", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/keys"] });
      setShowApiKey(data.apiKey);
      setCreateKeyOpen(false);
      setKeyName("");
      setSelectedScopes([]);
      setRateLimit("100");
      
      toast({
        title: "API Key Created",
        description: "Save your API key securely. It won't be shown again.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) => apiRequest("DELETE", `/api/developer/keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/keys"] });
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  // Create Webhook Dialog
  const [createWebhookOpen, setCreateWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const createWebhookMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/v1/webhooks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/webhooks"] });
      setCreateWebhookOpen(false);
      setWebhookUrl("");
      setSelectedEvents([]);
      
      toast({
        title: "Webhook Created",
        description: "Your webhook has been registered successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create webhook",
        variant: "destructive",
      });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (webhookId: string) => apiRequest("DELETE", `/api/v1/webhooks/${webhookId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/webhooks"] });
      toast({
        title: "Webhook Deleted",
        description: "The webhook has been removed successfully",
      });
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: ({ webhookId, event }: { webhookId: string; event: string }) => 
      apiRequest("POST", "/api/developer/webhooks/test", { webhookId, event }),
    onSuccess: () => {
      toast({
        title: "Test Webhook Sent",
        description: "Check your webhook endpoint for the test event",
      });
    },
  });

  const copyToClipboard = async (text: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (keyId) {
        setCopiedKeyId(keyId);
        setTimeout(() => setCopiedKeyId(null), 2000);
      }
      toast({
        title: "Copied",
        description: "Copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Never";
    return format(new Date(date), "MMM d, yyyy h:mm a");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold" data-testid="heading-developer">Developer Portal</h1>
        <p className="text-muted-foreground">
          Manage API keys, webhooks, and monitor your API usage
        </p>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="keys" data-testid="tab-api-keys">
            <Key className="w-4 h-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="w-4 h-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">
            <Activity className="w-4 h-4 mr-2" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="docs" data-testid="tab-docs">
            <Code2 className="w-4 h-4 mr-2" />
            Quick Start
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Generate and manage API keys for programmatic access
                  </CardDescription>
                </div>
                <Dialog open={createKeyOpen} onOpenChange={setCreateKeyOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-api-key">
                      <Plus className="w-4 h-4 mr-2" />
                      Generate New Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Generate API Key</DialogTitle>
                      <DialogDescription>
                        Create a new API key with specific permissions and rate limits
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="key-name">Key Name</Label>
                        <Input
                          id="key-name"
                          placeholder="Production API Key"
                          value={keyName}
                          onChange={(e) => setKeyName(e.target.value)}
                          data-testid="input-key-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Permissions</Label>
                        <div className="space-y-2">
                          {AVAILABLE_SCOPES.map((scope) => (
                            <div key={scope.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={scope.value}
                                checked={selectedScopes.includes(scope.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedScopes([...selectedScopes, scope.value]);
                                  } else {
                                    setSelectedScopes(selectedScopes.filter(s => s !== scope.value));
                                  }
                                }}
                                data-testid={`checkbox-scope-${scope.value}`}
                              />
                              <label
                                htmlFor={scope.value}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {scope.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rate-limit">Rate Limit (requests/minute)</Label>
                        <Input
                          id="rate-limit"
                          type="number"
                          min="10"
                          max="10000"
                          value={rateLimit}
                          onChange={(e) => setRateLimit(e.target.value)}
                          data-testid="input-rate-limit"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createKeyMutation.mutate({
                          keyName,
                          permissions: {
                            scopes: selectedScopes,
                            endpoints: []
                          },
                          rateLimit: parseInt(rateLimit)
                        })}
                        disabled={!keyName || selectedScopes.length === 0 || createKeyMutation.isPending}
                        data-testid="button-generate-key"
                      >
                        {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {showApiKey && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-green-600" />
                    <p className="font-medium text-green-900 dark:text-green-100">
                      Save this API key - it won't be shown again!
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-white dark:bg-gray-900 rounded text-sm font-mono">
                      {showApiKey}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        copyToClipboard(showApiKey);
                        setShowApiKey(null);
                      }}
                      data-testid="button-copy-new-key"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {keysLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading API keys...</div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No API keys yet. Generate your first key to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Rate Limit</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.keyName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.scopes.slice(0, 2).map((scope) => (
                              <Badge key={scope} variant="secondary" className="text-xs">
                                {scope.split(":")[1]}
                              </Badge>
                            ))}
                            {key.permissions.scopes.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{key.permissions.scopes.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{key.rateLimit}/min</TableCell>
                        <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={key.isActive ? "default" : "secondary"}>
                            {key.isActive ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedKeyForUsage(key.id)}
                              data-testid={`button-view-usage-${key.id}`}
                            >
                              <BarChart className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteKeyMutation.mutate(key.id)}
                              disabled={!key.isActive}
                              data-testid={`button-revoke-${key.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Webhooks</CardTitle>
                  <CardDescription>
                    Configure webhooks to receive real-time event notifications
                  </CardDescription>
                </div>
                <Dialog open={createWebhookOpen} onOpenChange={setCreateWebhookOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-webhook">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Add Webhook Endpoint</DialogTitle>
                      <DialogDescription>
                        Configure a URL to receive event notifications
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="webhook-url">Webhook URL</Label>
                        <Input
                          id="webhook-url"
                          type="url"
                          placeholder="https://api.yourcompany.com/webhooks"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          data-testid="input-webhook-url"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Events to Subscribe</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {WEBHOOK_EVENTS.map((event) => (
                            <div key={event.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={event.value}
                                checked={selectedEvents.includes(event.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedEvents([...selectedEvents, event.value]);
                                  } else {
                                    setSelectedEvents(selectedEvents.filter(e => e !== event.value));
                                  }
                                }}
                                data-testid={`checkbox-event-${event.value}`}
                              />
                              <label
                                htmlFor={event.value}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {event.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createWebhookMutation.mutate({
                          url: webhookUrl,
                          events: selectedEvents
                        })}
                        disabled={!webhookUrl || selectedEvents.length === 0 || createWebhookMutation.isPending}
                        data-testid="button-add-webhook"
                      >
                        {createWebhookMutation.isPending ? "Adding..." : "Add Webhook"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {webhooksLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading webhooks...</div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No webhooks configured. Add your first webhook to receive events.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Delivery</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {webhook.url}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {webhook.events.slice(0, 2).map((event) => (
                              <Badge key={event} variant="secondary" className="text-xs">
                                {event.split(".")[1]}
                              </Badge>
                            ))}
                            {webhook.events.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{webhook.events.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={webhook.isActive ? "default" : "secondary"}>
                              {webhook.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {webhook.failureCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {webhook.failureCount} failures
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {webhook.lastDeliveryStatus && (
                            <Badge
                              variant={webhook.lastDeliveryStatus === "success" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {webhook.lastDeliveryStatus}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => testWebhookMutation.mutate({
                                webhookId: webhook.id,
                                event: webhook.events[0]
                              })}
                              data-testid={`button-test-webhook-${webhook.id}`}
                            >
                              <TestTube className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                              data-testid={`button-delete-webhook-${webhook.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Usage Statistics</CardTitle>
              <CardDescription>
                Monitor your API usage and performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedKeyForUsage && usageData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Requests</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usageData.stats.totalRequests}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Success Rate</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usageData.stats.successRate.toFixed(1)}%</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Avg Response Time</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{usageData.stats.averageResponseTime.toFixed(0)}ms</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Active Keys</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{apiKeys.filter(k => k.isActive).length}</div>
                      </CardContent>
                    </Card>
                  </div>

                  {usageData.stats.topEndpoints.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top Endpoints</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <RechartsBarChart data={usageData.stats.topEndpoints}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="endpoint" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="count" fill="#3b82f6" />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {apiKeys.length > 0 ? "Select an API key from the API Keys tab to view usage statistics" : "Generate an API key first to track usage"}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                Get started with the Lakefront Leadworks API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">1. Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Include your API key in the Authorization header:
                  </p>
                  <div className="bg-muted p-4 rounded-md">
                    <code className="text-sm">
                      Authorization: Bearer lf_live_your_api_key_here
                    </code>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">2. Base URL</h3>
                  <div className="bg-muted p-4 rounded-md">
                    <code className="text-sm">
                      {window.location.origin}/api/v1
                    </code>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">3. Example: Search Leads</h3>
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-sm">
{`curl -X GET "${window.location.origin}/api/v1/leads?state=CA&minQuality=80" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">4. Example: Create Purchase</h3>
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-sm">
{`curl -X POST "${window.location.origin}/api/v1/purchases" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tier": "platinum",
    "leadCount": 100,
    "paymentMethodId": "pm_xxxx"
  }'`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">5. Rate Limiting</h3>
                  <p className="text-sm text-muted-foreground">
                    API requests are rate-limited based on your key's configuration. 
                    Rate limit headers are included in every response:
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                    <li>X-RateLimit-Limit: Maximum requests per minute</li>
                    <li>X-RateLimit-Remaining: Requests remaining</li>
                    <li>X-RateLimit-Reset: Time when limit resets</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">6. Webhook Signature Verification</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Verify webhook signatures to ensure requests are from Lakefront:
                  </p>
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-sm">
{`const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return signature === expectedSignature;
}`}
                    </pre>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button asChild variant="outline" className="w-full">
                    <a href="/api-docs" data-testid="button-view-full-docs">
                      View Full API Documentation
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}