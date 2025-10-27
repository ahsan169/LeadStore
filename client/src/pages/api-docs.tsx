import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Code, FileJson, Lock, Webhook, Zap, BookOpen, Download, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  auth: boolean;
  scopes?: string[];
  params?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  body?: any;
  response?: any;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  // Leads
  {
    method: "GET",
    path: "/api/v1/leads",
    description: "Search and filter leads with advanced criteria",
    auth: true,
    scopes: ["read:leads"],
    params: [
      { name: "page", type: "integer", required: false, description: "Page number (default: 1)" },
      { name: "limit", type: "integer", required: false, description: "Results per page (max: 100, default: 20)" },
      { name: "industry", type: "string", required: false, description: "Comma-separated industry filters" },
      { name: "state", type: "string", required: false, description: "Comma-separated state codes" },
      { name: "minQuality", type: "integer", required: false, description: "Minimum quality score (0-100)" },
      { name: "maxQuality", type: "integer", required: false, description: "Maximum quality score (0-100)" },
      { name: "minRevenue", type: "integer", required: false, description: "Minimum annual revenue" },
      { name: "maxRevenue", type: "integer", required: false, description: "Maximum annual revenue" },
      { name: "exclusivity", type: "string", required: false, description: "Exclusivity status filter" },
      { name: "sold", type: "boolean", required: false, description: "Filter by sold status" },
    ],
    response: {
      success: true,
      data: [
        {
          id: "lead_123",
          businessName: "ABC Company",
          ownerName: "John Doe",
          email: "john@abc.com",
          phone: "+1234567890",
          industry: "Retail",
          stateCode: "CA",
          qualityScore: 85,
          annualRevenue: "500000",
          requestedAmount: "50000",
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 150,
        totalPages: 8,
        hasNext: true,
        hasPrev: false
      }
    }
  },
  {
    method: "GET",
    path: "/api/v1/leads/:id",
    description: "Get detailed information about a specific lead",
    auth: true,
    scopes: ["read:leads"],
    response: {
      success: true,
      data: {
        id: "lead_123",
        businessName: "ABC Company",
        ownerName: "John Doe",
        email: "john@abc.com",
        phone: "+1234567890",
        industry: "Retail",
        annualRevenue: "500000",
        requestedAmount: "50000",
        timeInBusiness: "5 years",
        creditScore: "700",
        stateCode: "CA",
        qualityScore: 85,
        isEnriched: true,
        linkedinUrl: "https://linkedin.com/company/abc",
        websiteUrl: "https://abc.com",
        companySize: "11-50",
        yearFounded: 2018,
        createdAt: "2024-01-15T10:00:00Z"
      }
    }
  },
  // Purchases
  {
    method: "POST",
    path: "/api/v1/purchases",
    description: "Create a new lead purchase",
    auth: true,
    scopes: ["write:purchases"],
    body: {
      tier: "platinum",
      leadCount: 100,
      paymentMethodId: "pm_xxxx"
    },
    response: {
      success: true,
      data: {
        id: "purchase_456",
        userId: "user_123",
        tier: "platinum",
        leadCount: 100,
        totalAmount: "1500.00",
        paymentStatus: "succeeded",
        leadIds: ["lead_1", "lead_2", "..."],
        createdAt: "2024-01-15T10:00:00Z"
      }
    }
  },
  {
    method: "GET",
    path: "/api/v1/purchases",
    description: "Get purchase history",
    auth: true,
    scopes: ["read:purchases"],
    params: [
      { name: "page", type: "integer", required: false, description: "Page number" },
      { name: "limit", type: "integer", required: false, description: "Results per page" }
    ],
    response: {
      success: true,
      data: [
        {
          id: "purchase_456",
          tier: "platinum",
          leadCount: 100,
          totalAmount: "1500.00",
          paymentStatus: "succeeded",
          createdAt: "2024-01-15T10:00:00Z"
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1
      }
    }
  },
  // Analytics
  {
    method: "GET",
    path: "/api/v1/analytics",
    description: "Get comprehensive analytics data",
    auth: true,
    scopes: ["read:analytics"],
    response: {
      success: true,
      data: {
        performance: {
          totalLeads: 500,
          contacted: 350,
          qualified: 150,
          closedWon: 45,
          closedLost: 30,
          totalRevenue: 450000,
          averageConversionRate: 12.8,
          roi: 280.5
        },
        funnel: [
          { stage: "New", count: 500, conversionRate: 100 },
          { stage: "Contacted", count: 350, conversionRate: 70 },
          { stage: "Qualified", count: 150, conversionRate: 42.8 },
          { stage: "Closed", count: 75, conversionRate: 50 }
        ],
        roi: [
          {
            tier: "platinum",
            totalSpent: 15000,
            totalRevenue: 125000,
            roi: 733.3,
            leadCount: 1000
          }
        ]
      }
    }
  },
  // Webhooks
  {
    method: "POST",
    path: "/api/v1/webhooks",
    description: "Register a new webhook endpoint",
    auth: true,
    scopes: ["manage:webhooks"],
    body: {
      url: "https://api.yourcompany.com/webhooks",
      events: ["lead.created", "purchase.completed"]
    },
    response: {
      success: true,
      data: {
        id: "webhook_789",
        url: "https://api.yourcompany.com/webhooks",
        events: ["lead.created", "purchase.completed"],
        secret: "whsec_xxxxx",
        isActive: true,
        createdAt: "2024-01-15T10:00:00Z"
      }
    }
  },
  {
    method: "GET",
    path: "/api/v1/webhooks",
    description: "List all configured webhooks",
    auth: true,
    scopes: ["manage:webhooks"],
    response: {
      success: true,
      data: [
        {
          id: "webhook_789",
          url: "https://api.yourcompany.com/webhooks",
          events: ["lead.created", "purchase.completed"],
          isActive: true,
          failureCount: 0,
          lastDeliveryAt: "2024-01-15T10:00:00Z",
          lastDeliveryStatus: "success",
          createdAt: "2024-01-14T10:00:00Z"
        }
      ]
    }
  },
  {
    method: "DELETE",
    path: "/api/v1/webhooks/:id",
    description: "Delete a webhook endpoint",
    auth: true,
    scopes: ["manage:webhooks"],
    response: {
      success: true,
      data: {
        success: true
      }
    }
  }
];

const WEBHOOK_EVENTS = [
  { name: "lead.created", description: "Triggered when a new lead is added to the system" },
  { name: "lead.updated", description: "Triggered when lead information is updated" },
  { name: "lead.sold", description: "Triggered when a lead is sold" },
  { name: "purchase.completed", description: "Triggered when a purchase is successfully completed" },
  { name: "purchase.failed", description: "Triggered when a purchase fails" },
  { name: "credit.added", description: "Triggered when credits are added to an account" },
  { name: "credit.used", description: "Triggered when credits are consumed" },
  { name: "batch.uploaded", description: "Triggered when a new lead batch is uploaded" },
  { name: "batch.processed", description: "Triggered when batch processing completes" },
  { name: "alert.triggered", description: "Triggered when a lead alert matches criteria" },
  { name: "quality.reported", description: "Triggered when a quality issue is reported" },
  { name: "quality.resolved", description: "Triggered when a quality issue is resolved" }
];

const LANGUAGE_EXAMPLES = {
  curl: {
    name: "cURL",
    auth: `curl -X GET "https://api.lakefront.com/api/v1/leads" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    request: `curl -X POST "https://api.lakefront.com/api/v1/purchases" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tier": "platinum",
    "leadCount": 100,
    "paymentMethodId": "pm_xxxx"
  }'`
  },
  javascript: {
    name: "JavaScript",
    auth: `const headers = {
  'Authorization': 'Bearer YOUR_API_KEY',
  'Content-Type': 'application/json'
};`,
    request: `const response = await fetch('https://api.lakefront.com/api/v1/purchases', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'platinum',
    leadCount: 100,
    paymentMethodId: 'pm_xxxx'
  })
});

const data = await response.json();
console.log(data);`
  },
  python: {
    name: "Python",
    auth: `import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}`,
    request: `import requests
import json

url = 'https://api.lakefront.com/api/v1/purchases'
headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}
payload = {
    'tier': 'platinum',
    'leadCount': 100,
    'paymentMethodId': 'pm_xxxx'
}

response = requests.post(url, headers=headers, data=json.dumps(payload))
print(response.json())`
  },
  node: {
    name: "Node.js",
    auth: `const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'https://api.lakefront.com/api/v1',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});`,
    request: `const axios = require('axios');

const createPurchase = async () => {
  try {
    const response = await axios.post(
      'https://api.lakefront.com/api/v1/purchases',
      {
        tier: 'platinum',
        leadCount: 100,
        paymentMethodId: 'pm_xxxx'
      },
      {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY',
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
};

createPurchase();`
  },
  php: {
    name: "PHP",
    auth: `$headers = [
    'Authorization: Bearer YOUR_API_KEY',
    'Content-Type: application/json'
];`,
    request: `<?php
$url = 'https://api.lakefront.com/api/v1/purchases';
$data = [
    'tier' => 'platinum',
    'leadCount' => 100,
    'paymentMethodId' => 'pm_xxxx'
];

$options = [
    'http' => [
        'header' => [
            'Authorization: Bearer YOUR_API_KEY',
            'Content-Type: application/json'
        ],
        'method' => 'POST',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);
$result = json_decode($response, true);

print_r($result);
?>`
  }
};

export default function ApiDocsPage() {
  const [selectedLanguage, setSelectedLanguage] = useState("curl");
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);

  const getMethodBadgeVariant = (method: string) => {
    switch (method) {
      case "GET": return "secondary";
      case "POST": return "default";
      case "PUT": return "outline";
      case "DELETE": return "destructive";
      default: return "secondary";
    }
  };

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-1 mb-8">
        <h1 className="text-3xl font-bold" data-testid="heading-api-docs">API Documentation</h1>
        <p className="text-muted-foreground">
          Complete reference for the Lakefront Leadworks Enterprise API
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <div className="col-span-3">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Navigation</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="p-4 pt-0 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Getting Started</h4>
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("authentication")?.scrollIntoView()}
                        data-testid="nav-authentication"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Authentication
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("rate-limiting")?.scrollIntoView()}
                        data-testid="nav-rate-limiting"
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Rate Limiting
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">API Reference</h4>
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("endpoints")?.scrollIntoView()}
                        data-testid="nav-endpoints"
                      >
                        <Code className="w-4 h-4 mr-2" />
                        Endpoints
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("webhooks")?.scrollIntoView()}
                        data-testid="nav-webhooks"
                      >
                        <Webhook className="w-4 h-4 mr-2" />
                        Webhooks
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Resources</h4>
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("examples")?.scrollIntoView()}
                        data-testid="nav-examples"
                      >
                        <FileJson className="w-4 h-4 mr-2" />
                        Code Examples
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => document.getElementById("sdks")?.scrollIntoView()}
                        data-testid="nav-sdks"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        SDKs
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-8">
          {/* Authentication */}
          <Card id="authentication">
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>
                How to authenticate with the Lakefront Leadworks API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">API Keys</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  All API requests must include an API key in the Authorization header. 
                  You can generate API keys from the Developer Portal.
                </p>
                
                <div className="bg-muted p-4 rounded-lg">
                  <code className="text-sm">Authorization: Bearer lf_live_your_api_key_here</code>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Security Best Practices</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Never expose your API keys in client-side code</li>
                  <li>Store API keys securely using environment variables</li>
                  <li>Rotate API keys regularly</li>
                  <li>Use different keys for development and production</li>
                  <li>Set appropriate rate limits and permissions</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Rate Limiting */}
          <Card id="rate-limiting">
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
              <CardDescription>
                Understanding API rate limits and how to handle them
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                API requests are rate-limited on a per-key basis. The default limit is 100 requests per minute,
                but this can be configured when creating your API key.
              </p>

              <div>
                <h3 className="text-lg font-semibold mb-2">Rate Limit Headers</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Every API response includes headers with rate limit information:
                </p>
                
                <div className="space-y-2">
                  <div className="bg-muted p-3 rounded-lg">
                    <code className="text-sm font-mono">X-RateLimit-Limit</code>
                    <p className="text-xs text-muted-foreground mt-1">Maximum requests per minute</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <code className="text-sm font-mono">X-RateLimit-Remaining</code>
                    <p className="text-xs text-muted-foreground mt-1">Requests remaining in current window</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <code className="text-sm font-mono">X-RateLimit-Reset</code>
                    <p className="text-xs text-muted-foreground mt-1">Time when the rate limit resets (ISO 8601)</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Handling Rate Limit Errors</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  When you exceed the rate limit, you'll receive a 429 status code:
                </p>
                
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm">
{`{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Maximum 100 requests per minute.",
  "retryAfter": 60
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <Card id="endpoints">
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>
                Complete reference of all available API endpoints
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {API_ENDPOINTS.map((endpoint, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedEndpoint(endpoint)}
                    data-testid={`endpoint-${endpoint.method}-${endpoint.path}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={getMethodBadgeVariant(endpoint.method)}>
                          {endpoint.method}
                        </Badge>
                        <code className="text-sm font-mono">{endpoint.path}</code>
                      </div>
                      {endpoint.auth && (
                        <Badge variant="outline">
                          <Lock className="w-3 h-3 mr-1" />
                          Auth Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {endpoint.description}
                    </p>
                    {endpoint.scopes && (
                      <div className="flex gap-2 mt-2">
                        {endpoint.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Webhooks */}
          <Card id="webhooks">
            <CardHeader>
              <CardTitle>Webhook Events</CardTitle>
              <CardDescription>
                Real-time event notifications for your application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Webhook Payload Structure</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="text-sm">
{`{
  "event": "purchase.completed",
  "timestamp": "2024-01-15T10:00:00Z",
  "data": {
    "purchaseId": "purchase_456",
    "userId": "user_123",
    "tier": "platinum",
    "leadCount": 100,
    "totalAmount": 1500
  }
}`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Available Events</h3>
                  <div className="space-y-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <div key={event.name} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <code className="text-sm font-mono">{event.name}</code>
                          <Badge variant="outline">Event</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Webhook Security</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Verify webhook signatures to ensure requests are from Lakefront:
                  </p>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="text-sm">
{`const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Code Examples */}
          <Card id="examples">
            <CardHeader>
              <CardTitle>Code Examples</CardTitle>
              <CardDescription>
                Implementation examples in popular programming languages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger className="w-48" data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE_EXAMPLES).map(([key, lang]) => (
                      <SelectItem key={key} value={key}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Tabs defaultValue="auth" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="auth">Authentication</TabsTrigger>
                    <TabsTrigger value="request">API Request</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="auth">
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-sm overflow-x-auto">
                        {LANGUAGE_EXAMPLES[selectedLanguage as keyof typeof LANGUAGE_EXAMPLES].auth}
                      </pre>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="request">
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-sm overflow-x-auto">
                        {LANGUAGE_EXAMPLES[selectedLanguage as keyof typeof LANGUAGE_EXAMPLES].request}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* SDKs */}
          <Card id="sdks">
            <CardHeader>
              <CardTitle>SDKs & Libraries</CardTitle>
              <CardDescription>
                Official and community SDKs for easier integration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">JavaScript SDK</h3>
                    <Badge>Official</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Full-featured SDK for Node.js and browser applications
                  </p>
                  <div className="space-y-2">
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      npm install @lakefront/api-client
                    </div>
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-download-js-sdk">
                      <Download className="w-4 h-4 mr-2" />
                      View on NPM
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Python SDK</h3>
                    <Badge>Official</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Python client library with async support
                  </p>
                  <div className="space-y-2">
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      pip install lakefront-api
                    </div>
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-download-python-sdk">
                      <Download className="w-4 h-4 mr-2" />
                      View on PyPI
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">PHP SDK</h3>
                    <Badge variant="outline">Community</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Community-maintained PHP client
                  </p>
                  <div className="space-y-2">
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      composer require lakefront/php-sdk
                    </div>
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-download-php-sdk">
                      <Download className="w-4 h-4 mr-2" />
                      View on Packagist
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Ruby SDK</h3>
                    <Badge variant="outline">Coming Soon</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ruby gem for Rails and Ruby applications
                  </p>
                  <div className="space-y-2">
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      gem install lakefront-api
                    </div>
                    <Button variant="outline" size="sm" className="w-full" disabled data-testid="button-download-ruby-sdk">
                      <Download className="w-4 h-4 mr-2" />
                      Coming Soon
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">Building Your Own SDK?</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  We provide OpenAPI specifications for generating client libraries in any language.
                </p>
                <Button variant="outline" size="sm" data-testid="button-download-openapi">
                  <FileJson className="w-4 h-4 mr-2" />
                  Download OpenAPI Spec
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Endpoint Details Modal */}
          {selectedEndpoint && (
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Endpoint Details</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEndpoint(null)}
                    data-testid="button-close-details"
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={getMethodBadgeVariant(selectedEndpoint.method)}>
                      {selectedEndpoint.method}
                    </Badge>
                    <code className="text-sm font-mono">{selectedEndpoint.path}</code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedEndpoint.description}
                  </p>
                </div>

                {selectedEndpoint.params && (
                  <div>
                    <h4 className="font-semibold mb-2">Parameters</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedEndpoint.params.map((param) => (
                          <TableRow key={param.name}>
                            <TableCell>
                              <code className="text-xs">{param.name}</code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {param.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {param.required ? (
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Optional</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {param.description}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {selectedEndpoint.body && (
                  <div>
                    <h4 className="font-semibold mb-2">Request Body</h4>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-sm">{formatJson(selectedEndpoint.body)}</pre>
                    </div>
                  </div>
                )}

                {selectedEndpoint.response && (
                  <div>
                    <h4 className="font-semibold mb-2">Response Example</h4>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-sm">{formatJson(selectedEndpoint.response)}</pre>
                    </div>
                  </div>
                )}

                {selectedEndpoint.scopes && (
                  <div>
                    <h4 className="font-semibold mb-2">Required Scopes</h4>
                    <div className="flex gap-2">
                      {selectedEndpoint.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}