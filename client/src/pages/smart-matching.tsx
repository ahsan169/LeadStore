import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  Filter,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Settings,
  AlertCircle,
  CheckCircle,
  Target,
  Zap
} from "lucide-react";

interface MatchingCriteria {
  id: string;
  name: string;
  industry?: string[];
  stateCode?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  minRevenue?: number;
  maxRevenue?: number;
  minCreditScore?: number;
  urgencyLevel?: string[];
  emailAlert: boolean;
  smsAlert: boolean;
  frequency: string;
  isActive: boolean;
}

export default function SmartMatchingPage() {
  const { toast } = useToast();
  const [selectedCriteria, setSelectedCriteria] = useState<MatchingCriteria | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch matching criteria
  const { data: criteriaList, isLoading } = useQuery({
    queryKey: ["/api/lead-matching/criteria"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/lead-matching/criteria");
      return response.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/lead-matching/criteria", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-matching/criteria"] });
      toast({ title: "Matching criteria created successfully" });
      setIsCreating(false);
    },
    onError: () => {
      toast({ title: "Failed to create criteria", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/lead-matching/criteria/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-matching/criteria"] });
      toast({ title: "Criteria deleted successfully" });
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/lead-matching/criteria/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-matching/criteria"] });
    },
  });

  const industries = [
    "Restaurant", "Retail", "Healthcare", "Construction",
    "Manufacturing", "Transportation", "Technology", "Professional Services"
  ];

  const states = [
    "CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI"
  ];

  const urgencyLevels = ["immediate", "within_week", "within_month", "flexible"];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-smart-matching">Smart Lead Matching</h1>
        <p className="text-muted-foreground">
          Set up automated alerts when new leads match your criteria
        </p>
      </div>

      <Tabs defaultValue="criteria" className="space-y-6">
        <TabsList>
          <TabsTrigger value="criteria">Matching Criteria</TabsTrigger>
          <TabsTrigger value="alerts">Alert Settings</TabsTrigger>
          <TabsTrigger value="history">Match History</TabsTrigger>
        </TabsList>

        <TabsContent value="criteria">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Active Matching Criteria</CardTitle>
                    <CardDescription>
                      Define the lead characteristics you're looking for
                    </CardDescription>
                  </div>
                  <Button onClick={() => setIsCreating(true)} data-testid="button-create-criteria">
                    <Plus className="w-4 h-4 mr-2" />
                    New Criteria
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {criteriaList?.length === 0 ? (
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      No matching criteria set up yet. Create your first criteria to start receiving alerts.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {criteriaList?.map((criteria: MatchingCriteria) => (
                      <Card key={criteria.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold">{criteria.name}</h4>
                                <Badge variant={criteria.isActive ? "default" : "secondary"}>
                                  {criteria.isActive ? "Active" : "Paused"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                {criteria.industry && (
                                  <span>Industries: {criteria.industry.join(", ")}</span>
                                )}
                                {criteria.minQualityScore && (
                                  <span>Quality: {criteria.minQualityScore}-{criteria.maxQualityScore}</span>
                                )}
                                {criteria.minRevenue && (
                                  <span>Revenue: ${criteria.minRevenue.toLocaleString()}+</span>
                                )}
                              </div>
                              <div className="flex gap-4 mt-2">
                                {criteria.emailAlert && (
                                  <Badge variant="outline">
                                    <Mail className="w-3 h-3 mr-1" />
                                    Email
                                  </Badge>
                                )}
                                {criteria.smsAlert && (
                                  <Badge variant="outline">
                                    <MessageSquare className="w-3 h-3 mr-1" />
                                    SMS
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {criteria.frequency}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Switch
                                checked={criteria.isActive}
                                onCheckedChange={(checked) =>
                                  toggleMutation.mutate({ id: criteria.id, isActive: checked })
                                }
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(criteria.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {isCreating && (
              <Card>
                <CardHeader>
                  <CardTitle>Create New Matching Criteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      createMutation.mutate({
                        name: formData.get("name"),
                        industry: formData.getAll("industry"),
                        stateCode: formData.getAll("state"),
                        minQualityScore: Number(formData.get("minQuality")),
                        maxQualityScore: Number(formData.get("maxQuality")),
                        minRevenue: Number(formData.get("minRevenue")),
                        emailAlert: formData.get("emailAlert") === "on",
                        smsAlert: formData.get("smsAlert") === "on",
                        frequency: formData.get("frequency"),
                      });
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="name">Criteria Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="e.g., High-Quality Restaurant Leads"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Industries</Label>
                        <Select name="industry">
                          <SelectTrigger>
                            <SelectValue placeholder="Select industries" />
                          </SelectTrigger>
                          <SelectContent>
                            {industries.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>States</Label>
                        <Select name="state">
                          <SelectTrigger>
                            <SelectValue placeholder="Select states" />
                          </SelectTrigger>
                          <SelectContent>
                            {states.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Quality Score Range</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          name="minQuality"
                          type="number"
                          placeholder="Min (0-100)"
                          min="0"
                          max="100"
                        />
                        <Input
                          name="maxQuality"
                          type="number"
                          placeholder="Max (0-100)"
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Minimum Annual Revenue</Label>
                      <Input
                        name="minRevenue"
                        type="number"
                        placeholder="e.g., 100000"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Alert Channels</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="emailAlert" defaultChecked />
                          <span>Email</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="smsAlert" />
                          <span>SMS</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <Label>Alert Frequency</Label>
                      <Select name="frequency" defaultValue="instant">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="instant">Instant</SelectItem>
                          <SelectItem value="hourly">Hourly Summary</SelectItem>
                          <SelectItem value="daily">Daily Digest</SelectItem>
                          <SelectItem value="weekly">Weekly Report</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creating..." : "Create Criteria"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreating(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alert Settings</CardTitle>
              <CardDescription>
                Configure how you want to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Bell className="w-4 h-4" />
                <AlertDescription>
                  Alerts are sent based on your matching criteria settings.
                  You can configure email and SMS notifications for each criteria.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts via email
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Get instant SMS alerts for high-priority matches
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>In-App Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Show alerts in the notification center
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Matches</CardTitle>
              <CardDescription>
                Leads that matched your criteria in the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Zap className="w-4 h-4" />
                <AlertDescription>
                  Your matching criteria will automatically identify new leads as they're added to the system.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}