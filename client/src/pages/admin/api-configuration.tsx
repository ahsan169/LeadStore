import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Key, 
  DollarSign, 
  Check, 
  X, 
  AlertCircle, 
  Zap,
  TrendingUp,
  Shield,
  Globe
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ServiceConfig {
  enabled: boolean;
  available: boolean;
  tier: number;
  cost: number;
  monthlyBase: number;
}

interface ServiceStatus {
  [key: string]: ServiceConfig;
}

export default function APIConfiguration() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    HUNTER_API_KEY: '',
    NUMVERIFY_API_KEY: '',
    PROXYCURL_API_KEY: '',
    ABSTRACTAPI_KEY: '',
    CLEARBIT_API_KEY: '',
    PEOPLEDATALABS_API_KEY: ''
  });

  // Fetch service status
  const { data: serviceStatus, refetch: refetchStatus } = useQuery<ServiceStatus>({
    queryKey: ['/api/enrichment/services/status'],
    refetchInterval: 5000
  });

  // Fetch cost estimates
  const { data: costEstimates } = useQuery({
    queryKey: ['/api/enrichment/cost-estimates'],
    enabled: !!serviceStatus
  });

  // Save API keys mutation
  const saveKeysMutation = useMutation({
    mutationFn: async (keys: Record<string, string>) => {
      return apiRequest('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify(keys)
      });
    },
    onSuccess: () => {
      toast({
        title: 'API Keys Saved',
        description: 'Your API keys have been securely stored.'
      });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Toggle service mutation
  const toggleServiceMutation = useMutation({
    mutationFn: async ({ service, enabled }: { service: string; enabled: boolean }) => {
      return apiRequest(`/api/enrichment/services/${service}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
    },
    onSuccess: () => {
      refetchStatus();
    }
  });

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1: return 'bg-green-500';
      case 2: return 'bg-blue-500';
      case 3: return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getTierName = (tier: number) => {
    switch (tier) {
      case 1: return 'Free/Low-Cost';
      case 2: return 'Mid-Tier';
      case 3: return 'Premium';
      default: return 'Unknown';
    }
  };

  const serviceDetails = {
    perplexity: { name: 'Perplexity', icon: Globe, description: 'Web search for company info' },
    openai: { name: 'OpenAI GPT-4', icon: Zap, description: 'AI-powered insights' },
    hunter: { name: 'Hunter.io', icon: Shield, description: 'Email verification' },
    numverify: { name: 'Numverify', icon: Shield, description: 'Phone verification' },
    proxycurl: { name: 'Proxycurl', icon: TrendingUp, description: 'LinkedIn data' },
    abstractapi: { name: 'AbstractAPI', icon: Globe, description: 'Company enrichment' },
    clearbit: { name: 'Clearbit', icon: TrendingUp, description: 'Premium company & person data' },
    peopledatalabs: { name: 'PeopleDataLabs', icon: TrendingUp, description: 'Largest data coverage' }
  };

  return (
    <div className="container mx-auto py-8 max-w-6xl bg-hero-kingdom min-h-screen">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-serif font-bold mb-2 text-gradient-royal" data-testid="text-page-title">API Configuration</h1>
        <p className="text-muted-foreground">
          Configure your data enrichment services for maximum accuracy and cost efficiency
        </p>
      </div>
      
      <div className="divider-elegant mb-6" />

      <Alert className="mb-6 animate-slide-up">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Smart Cost Optimization:</strong> The system uses a waterfall approach, trying cheaper services first 
          and only using premium services when needed. Configure multiple services for best results.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="services" data-testid="button-services-tab">Services</TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="button-api-keys-tab">API Keys</TabsTrigger>
          <TabsTrigger value="costs" data-testid="button-costs-tab">Cost Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <Card className="card-kingdom">
            <CardHeader>
              <CardTitle className="font-serif">Enrichment Services</CardTitle>
              <CardDescription>
                Enable or disable services based on your needs and budget
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {serviceStatus && Object.entries(serviceStatus).map(([key, service]) => {
                const details = serviceDetails[key as keyof typeof serviceDetails];
                if (!details) return null;
                
                const Icon = details.icon;
                
                return (
                  <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{details.name}</span>
                          <Badge className={`${getTierColor(service.tier)} text-white`}>
                            {getTierName(service.tier)}
                          </Badge>
                          {service.available && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <Check className="h-3 w-3 mr-1" />
                              Ready
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{details.description}</p>
                        <div className="flex gap-4 mt-1">
                          <span className="text-xs text-muted-foreground">
                            ${service.cost.toFixed(3)}/request
                          </span>
                          {service.monthlyBase > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ${service.monthlyBase}/month base
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={service.enabled}
                      onCheckedChange={(enabled) => 
                        toggleServiceMutation.mutate({ service: key, enabled })
                      }
                      disabled={!service.available && service.tier > 1}
                      data-testid={`switch-${key}-service`}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Key Configuration</CardTitle>
              <CardDescription>
                Add API keys to enable additional enrichment services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="hunter">Hunter.io API Key ($34/month)</Label>
                  <Input
                    id="hunter"
                    type="password"
                    placeholder="Enter your Hunter.io API key"
                    value={apiKeys.HUNTER_API_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, HUNTER_API_KEY: e.target.value})}
                    data-testid="input-hunter-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://hunter.io/api
                  </p>
                </div>

                <div>
                  <Label htmlFor="numverify">Numverify API Key (Free tier available)</Label>
                  <Input
                    id="numverify"
                    type="password"
                    placeholder="Enter your Numverify API key"
                    value={apiKeys.NUMVERIFY_API_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, NUMVERIFY_API_KEY: e.target.value})}
                    data-testid="input-numverify-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://numverify.com/
                  </p>
                </div>

                <div>
                  <Label htmlFor="proxycurl">Proxycurl API Key ($49/month)</Label>
                  <Input
                    id="proxycurl"
                    type="password"
                    placeholder="Enter your Proxycurl API key"
                    value={apiKeys.PROXYCURL_API_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, PROXYCURL_API_KEY: e.target.value})}
                    data-testid="input-proxycurl-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://nubela.co/proxycurl/
                  </p>
                </div>

                <div>
                  <Label htmlFor="abstractapi">AbstractAPI Key ($9/month)</Label>
                  <Input
                    id="abstractapi"
                    type="password"
                    placeholder="Enter your AbstractAPI key"
                    value={apiKeys.ABSTRACTAPI_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, ABSTRACTAPI_KEY: e.target.value})}
                    data-testid="input-abstractapi-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://www.abstractapi.com/
                  </p>
                </div>

                <div>
                  <Label htmlFor="clearbit">Clearbit API Key (Pay-as-you-go)</Label>
                  <Input
                    id="clearbit"
                    type="password"
                    placeholder="Enter your Clearbit API key"
                    value={apiKeys.CLEARBIT_API_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, CLEARBIT_API_KEY: e.target.value})}
                    data-testid="input-clearbit-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://clearbit.com/
                  </p>
                </div>

                <div>
                  <Label htmlFor="peopledatalabs">PeopleDataLabs API Key (Pay-per-request)</Label>
                  <Input
                    id="peopledatalabs"
                    type="password"
                    placeholder="Enter your PeopleDataLabs API key"
                    value={apiKeys.PEOPLEDATALABS_API_KEY}
                    onChange={(e) => setApiKeys({...apiKeys, PEOPLEDATALABS_API_KEY: e.target.value})}
                    data-testid="input-peopledatalabs-api-key"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get key from: https://www.peopledatalabs.com/
                  </p>
                </div>
              </div>

              <Button 
                onClick={() => saveKeysMutation.mutate(apiKeys)}
                disabled={saveKeysMutation.isPending}
                data-testid="button-save-api-keys"
              >
                <Key className="h-4 w-4 mr-2" />
                {saveKeysMutation.isPending ? 'Saving...' : 'Save API Keys'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Analysis</CardTitle>
              <CardDescription>
                Estimated monthly costs based on your configuration and usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {costEstimates ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Fixed Monthly Costs</p>
                      <p className="text-2xl font-bold" data-testid="text-fixed-costs">
                        ${costEstimates.fixed?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Est. Variable Costs (1000 leads)</p>
                      <p className="text-2xl font-bold" data-testid="text-variable-costs">
                        ${costEstimates.variable?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 border rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Total Estimated Monthly Cost</p>
                    <p className="text-3xl font-bold text-primary" data-testid="text-total-costs">
                      ${costEstimates.total?.toFixed(2) || '0.00'}
                    </p>
                  </div>

                  {costEstimates.breakdown && (
                    <div className="space-y-2">
                      <p className="font-medium">Cost Breakdown by Service:</p>
                      {Object.entries(costEstimates.breakdown).map(([service, cost]: [string, any]) => (
                        <div key={service} className="flex justify-between text-sm">
                          <span>{serviceDetails[service as keyof typeof serviceDetails]?.name || service}</span>
                          <span>${cost.toFixed(2)}/month</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Loading cost estimates...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}