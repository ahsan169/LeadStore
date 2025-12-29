import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { 
  Link2, 
  Plus, 
  RefreshCw, 
  Settings, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowRight,
  Cloud,
  Loader2,
  Download,
  Send
} from "lucide-react";
import { SiSalesforce, SiHubspot } from "react-icons/si";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

interface CrmIntegration {
  id: string;
  userId: string;
  crmType: 'salesforce' | 'hubspot' | 'pipedrive' | 'custom_api';
  apiUrl?: string;
  mappingConfig?: any;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
}

interface ExportResult {
  success: boolean;
  exportedCount: number;
  failedCount: number;
  errors?: string[];
}

const CRM_LOGOS: Record<string, any> = {
  salesforce: SiSalesforce,
  hubspot: SiHubspot,
  pipedrive: Cloud, // Using Cloud as placeholder
  custom_api: Link2
};

const CRM_NAMES: Record<string, string> = {
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  pipedrive: 'Pipedrive',
  custom_api: 'Custom API'
};

const CRM_DESCRIPTIONS: Record<string, string> = {
  salesforce: 'World\'s #1 CRM platform',
  hubspot: 'Inbound marketing and sales platform',
  pipedrive: 'Sales-focused CRM for growing teams',
  custom_api: 'Connect to any API endpoint'
};

const CRM_INSTRUCTIONS: Record<string, JSX.Element> = {
  salesforce: (
    <div className="space-y-2 text-sm">
      <p>To connect Salesforce, you need:</p>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Your Salesforce Client ID</li>
        <li>Client Secret</li>
        <li>Refresh Token</li>
      </ol>
      <p className="text-muted-foreground">Format: CLIENT_ID:CLIENT_SECRET:REFRESH_TOKEN</p>
    </div>
  ),
  hubspot: (
    <div className="space-y-2 text-sm">
      <p>To connect HubSpot, you need:</p>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Go to Settings → Integrations → Private Apps</li>
        <li>Create a new private app</li>
        <li>Copy your Access Token</li>
      </ol>
    </div>
  ),
  pipedrive: (
    <div className="space-y-2 text-sm">
      <p>To connect Pipedrive, you need:</p>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Go to Settings → Personal → API</li>
        <li>Copy your API Token</li>
      </ol>
    </div>
  ),
  custom_api: (
    <div className="space-y-2 text-sm">
      <p>For custom API integration:</p>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Enter your API endpoint URL</li>
        <li>Provide your API key or Bearer token</li>
        <li>Configure field mappings as needed</li>
      </ol>
    </div>
  )
};

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<CrmIntegration | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  // Form state for new integration
  const [crmType, setCrmType] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [mappingConfig, setMappingConfig] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionValid, setConnectionValid] = useState<boolean | null>(null);

  // Export state
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [autoSync, setAutoSync] = useState(false);

  // Fetch integrations
  const { data: integrations, isLoading } = useQuery<CrmIntegration[]>({
    queryKey: ['/api/integrations']
  });

  // Fetch purchases for export dialog
  const { data: purchases } = useQuery({
    queryKey: ['/api/purchases']
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/integrations/connect', data);
    },
    onSuccess: () => {
      toast({
        title: "Integration connected",
        description: "Your CRM has been successfully connected"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect CRM",
        variant: "destructive"
      });
    }
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/integrations/${id}/test`);
    },
    onSuccess: (data: any) => {
      toast({
        title: data.success ? "Connection successful" : "Connection failed",
        description: data.success ? "Your CRM is properly connected" : "Failed to connect to CRM"
      });
    },
    onError: () => {
      toast({
        title: "Test failed",
        description: "Unable to test connection",
        variant: "destructive"
      });
    }
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async ({ integrationId, purchaseId }: any): Promise<ExportResult> => {
      // Get purchase details
      const purchase = (purchases as any[])?.find((p: any) => p.id === purchaseId);
      if (!purchase) throw new Error('Purchase not found');
      
      return apiRequest('POST', `/api/integrations/${integrationId}/export`, {
        leadIds: purchase.leadIds || [],
        purchaseId
      }) as any;
    },
    onSuccess: (result: ExportResult) => {
      toast({
        title: result.success ? "Export completed" : "Export failed",
        description: result.success 
          ? `Successfully exported ${result.exportedCount} leads` 
          : `Failed to export leads: ${result.errors?.join(', ')}`
      });
      setIsExportDialogOpen(false);
      setExportProgress(0);
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export leads to CRM",
        variant: "destructive"
      });
      setExportProgress(0);
    },
    onMutate: () => {
      setExportProgress(50);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/integrations/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Integration deleted",
        description: "CRM integration has been removed"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete integration",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setCrmType('');
    setApiKey('');
    setApiUrl('');
    setMappingConfig('');
    setTestingConnection(false);
    setConnectionValid(null);
  };

  const handleTestConnection = async () => {
    if (!crmType || !apiKey) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setTestingConnection(true);
    try {
      // Create a temporary integration to test
      const tempData = {
        crmType,
        apiKey,
        apiUrl: apiUrl || undefined,
        mappingConfig: mappingConfig ? JSON.parse(mappingConfig) : undefined
      };
      
      const response = await apiRequest('POST', '/api/integrations/connect', tempData) as any;
      setConnectionValid(true);
      
      // Delete the temporary integration
      if (response.id) {
        await apiRequest('DELETE', `/api/integrations/${response.id}`);
      }
    } catch (error) {
      setConnectionValid(false);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleConnect = () => {
    const data = {
      crmType,
      apiKey,
      apiUrl: apiUrl || undefined,
      mappingConfig: mappingConfig ? JSON.parse(mappingConfig) : undefined
    };
    connectMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-integrations">CRM Integrations</h1>
          <p className="text-muted-foreground">Connect your CRM to export leads automatically</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-integration">
          <Plus className="w-4 h-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {/* Integration Cards */}
      {!integrations || integrations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Link2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No integrations yet</h3>
            <p className="text-muted-foreground mb-4">Connect your CRM to start exporting leads</p>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-get-started">
              Get Started
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration) => {
            const Logo = CRM_LOGOS[integration.crmType];
            return (
              <Card key={integration.id} data-testid={`card-integration-${integration.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {Logo && <Logo className="w-8 h-8" />}
                      <div>
                        <CardTitle className="text-lg">
                          {CRM_NAMES[integration.crmType]}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {CRM_DESCRIPTIONS[integration.crmType]}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={integration.isActive ? "default" : "secondary"}>
                      {integration.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <div className="flex items-center gap-1">
                        {integration.isActive ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span>Connected</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                            <span>Disconnected</span>
                          </>
                        )}
                      </div>
                    </div>
                    {integration.lastSyncAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Last sync:</span>
                        <span>{formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{formatDistanceToNow(new Date(integration.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnectionMutation.mutate(integration.id)}
                    disabled={testConnectionMutation.isPending}
                    data-testid={`button-test-${integration.id}`}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Test
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setSelectedIntegration(integration);
                      setIsExportDialogOpen(true);
                    }}
                    data-testid={`button-export-${integration.id}`}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this integration?')) {
                        deleteMutation.mutate(integration.id);
                      }
                    }}
                    data-testid={`button-delete-${integration.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Integration Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect CRM Integration</DialogTitle>
            <DialogDescription>
              Choose your CRM platform and enter your credentials
            </DialogDescription>
          </DialogHeader>

          <Tabs value={crmType} onValueChange={setCrmType}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="salesforce">Salesforce</TabsTrigger>
              <TabsTrigger value="hubspot">HubSpot</TabsTrigger>
              <TabsTrigger value="pipedrive">Pipedrive</TabsTrigger>
              <TabsTrigger value="custom_api">Custom API</TabsTrigger>
            </TabsList>

            {Object.keys(CRM_INSTRUCTIONS).map((type) => (
              <TabsContent key={type} value={type} className="space-y-4">
                {CRM_INSTRUCTIONS[type as keyof typeof CRM_INSTRUCTIONS]}

                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="apiKey">API Key / Token</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={type === 'salesforce' ? 'CLIENT_ID:CLIENT_SECRET:REFRESH_TOKEN' : 'Enter your API key'}
                      data-testid="input-api-key"
                    />
                  </div>

                  {(type === 'custom_api' || type === 'salesforce') && (
                    <div>
                      <Label htmlFor="apiUrl">API URL {type === 'custom_api' ? '(Required)' : '(Optional)'}</Label>
                      <Input
                        id="apiUrl"
                        type="url"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder={type === 'custom_api' ? 'https://api.example.com/webhook' : 'Leave empty for default'}
                        data-testid="input-api-url"
                      />
                    </div>
                  )}

                  {type === 'custom_api' && (
                    <div>
                      <Label htmlFor="mappingConfig">Field Mapping (Optional JSON)</Label>
                      <Textarea
                        id="mappingConfig"
                        value={mappingConfig}
                        onChange={(e) => setMappingConfig(e.target.value)}
                        placeholder='[{"sourceField": "email", "targetField": "contact_email"}]'
                        rows={4}
                        data-testid="input-mapping-config"
                      />
                    </div>
                  )}

                  {connectionValid !== null && (
                    <Alert variant={connectionValid ? "default" : "destructive"}>
                      <AlertDescription className="flex items-center gap-2">
                        {connectionValid ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Connection test successful!
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            Connection test failed. Please check your credentials.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!crmType || !apiKey || testingConnection}
              data-testid="button-test-connection"
            >
              {testingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              onClick={handleConnect}
              disabled={!crmType || !apiKey || connectMutation.isPending || !connectionValid}
              data-testid="button-connect"
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Leads to CRM</DialogTitle>
            <DialogDescription>
              Select a purchase to export its leads to {selectedIntegration && CRM_NAMES[selectedIntegration.crmType]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="purchase">Select Purchase</Label>
              <Select value={selectedPurchaseId} onValueChange={setSelectedPurchaseId}>
                <SelectTrigger data-testid="select-purchase">
                  <SelectValue placeholder="Choose a purchase" />
                </SelectTrigger>
                <SelectContent>
                  {(purchases as any[])?.map((purchase: any) => (
                    <SelectItem key={purchase.id} value={purchase.id}>
                      {purchase.tier.charAt(0).toUpperCase() + purchase.tier.slice(1)} - {purchase.leadCount} leads
                      ({formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true })})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="autoSync">Auto-sync new purchases</Label>
              <Switch
                id="autoSync"
                checked={autoSync}
                onCheckedChange={setAutoSync}
                data-testid="switch-auto-sync"
              />
            </div>

            {exportProgress > 0 && (
              <Progress value={exportProgress} className="w-full" />
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsExportDialogOpen(false);
                setExportProgress(0);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedIntegration && selectedPurchaseId) {
                  exportMutation.mutate({
                    integrationId: selectedIntegration.id,
                    purchaseId: selectedPurchaseId
                  });
                }
              }}
              disabled={!selectedPurchaseId || exportMutation.isPending}
              data-testid="button-export-leads"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Export Leads
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}