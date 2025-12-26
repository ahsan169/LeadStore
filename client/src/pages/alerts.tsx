import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Bell,
  BellOff,
  Edit,
  Trash,
  TestTube,
  Eye,
  Filter,
  History,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Mail,
  X,
} from "lucide-react";
import { format } from "date-fns";

// Alert form schema
const alertFormSchema = z.object({
  alertName: z.string().min(1).max(100),
  criteria: z.object({
    industries: z.array(z.string()).optional(),
    states: z.array(z.string()).optional(),
    minRevenue: z.number().optional(),
    maxRevenue: z.number().optional(),
    minQuality: z.number().min(0).max(100).optional(),
    maxQuality: z.number().min(0).max(100).optional(),
    minTimeInBusiness: z.number().optional(),
    minCreditScore: z.number().optional(),
    maxCreditScore: z.number().optional(),
    exclusivityStatus: z.array(z.string()).optional(),
    previousMCAHistory: z.array(z.string()).optional(),
    urgencyLevel: z.array(z.string()).optional(),
  }),
  isActive: z.boolean().default(true),
  emailNotifications: z.boolean().default(true),
});

type AlertFormData = z.infer<typeof alertFormSchema>;

// Available options for filters
const INDUSTRIES = [
  "Restaurant",
  "Retail",
  "Construction",
  "Healthcare",
  "Transportation",
  "Manufacturing",
  "Technology",
  "Real Estate",
  "Professional Services",
  "Other",
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const EXCLUSIVITY_OPTIONS = ["exclusive", "semi_exclusive", "non_exclusive"];
const MCA_HISTORY_OPTIONS = ["none", "current", "previous_paid", "multiple"];
const URGENCY_OPTIONS = ["immediate", "this_week", "this_month", "exploring"];

export default function AlertsPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<any>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedExclusivity, setSelectedExclusivity] = useState<string[]>([]);
  const [selectedMCAHistory, setSelectedMCAHistory] = useState<string[]>([]);
  const [selectedUrgency, setSelectedUrgency] = useState<string[]>([]);

  // Fetch alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/alerts"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch unviewed alerts count
  const { data: unviewedCount } = useQuery({
    queryKey: ["/api/alerts/unviewed/count"],
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Create alert mutation
  const createAlertMutation = useMutation({
    mutationFn: (data: AlertFormData) => apiRequest("POST", "/api/alerts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Alert Created",
        description: "Your lead alert has been created successfully.",
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create alert",
        variant: "destructive",
      });
    },
  });

  // Update alert mutation
  const updateAlertMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AlertFormData }) =>
      apiRequest("PUT", `/api/alerts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setEditingAlert(null);
      toast({
        title: "Alert Updated",
        description: "Your lead alert has been updated successfully.",
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update alert",
        variant: "destructive",
      });
    },
  });

  // Delete alert mutation
  const deleteAlertMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({
        title: "Alert Deleted",
        description: "The alert has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete alert",
        variant: "destructive",
      });
    },
  });

  // Toggle alert status
  const toggleAlertMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/alerts/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  // Test alert mutation
  const testAlertMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/alerts/${id}/test`),
    onSuccess: (data) => {
      toast({
        title: "Test Complete",
        description: `Found ${data.count} matching leads`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to test alert",
        variant: "destructive",
      });
    },
  });

  // Form
  const form = useForm<AlertFormData>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: {
      alertName: "",
      criteria: {},
      isActive: true,
      emailNotifications: true,
    },
  });

  const resetForm = () => {
    form.reset();
    setSelectedIndustries([]);
    setSelectedStates([]);
    setSelectedExclusivity([]);
    setSelectedMCAHistory([]);
    setSelectedUrgency([]);
  };

  const onSubmit = (data: AlertFormData) => {
    // Add selected multi-select values to criteria
    const criteria = { ...data.criteria };
    if (selectedIndustries.length > 0) criteria.industries = selectedIndustries;
    if (selectedStates.length > 0) criteria.states = selectedStates;
    if (selectedExclusivity.length > 0) criteria.exclusivityStatus = selectedExclusivity;
    if (selectedMCAHistory.length > 0) criteria.previousMCAHistory = selectedMCAHistory;
    if (selectedUrgency.length > 0) criteria.urgencyLevel = selectedUrgency;
    
    const submitData = { ...data, criteria };

    if (editingAlert) {
      updateAlertMutation.mutate({ id: editingAlert.id, data: submitData });
    } else {
      createAlertMutation.mutate(submitData);
    }
  };

  // Load alert for editing
  useEffect(() => {
    if (editingAlert) {
      form.reset(editingAlert);
      setSelectedIndustries(editingAlert.criteria?.industries || []);
      setSelectedStates(editingAlert.criteria?.states || []);
      setSelectedExclusivity(editingAlert.criteria?.exclusivityStatus || []);
      setSelectedMCAHistory(editingAlert.criteria?.previousMCAHistory || []);
      setSelectedUrgency(editingAlert.criteria?.urgencyLevel || []);
    }
  }, [editingAlert, form]);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Lead Alerts</h1>
          <p className="text-muted-foreground mt-2">
            Get notified when new leads match your criteria
          </p>
        </div>
        <div className="flex items-center gap-4">
          {unviewedCount?.count > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              <Bell className="w-4 h-4 mr-1" />
              {unviewedCount.count} New
            </Badge>
          )}
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Alert
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              <Bell className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {alerts?.filter((a: any) => a.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Email Enabled</CardTitle>
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {alerts?.filter((a: any) => a.emailNotifications).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Alerts</CardTitle>
          <CardDescription>
            Manage your lead alerts and notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading alerts...
            </div>
          ) : alerts?.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No alerts yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first alert to get notified about matching leads
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Alert
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts?.map((alert: any) => (
                <Card key={alert.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{alert.alertName}</h3>
                          <Badge variant={alert.isActive ? "default" : "secondary"}>
                            {alert.isActive ? "Active" : "Paused"}
                          </Badge>
                          {alert.emailNotifications && (
                            <Badge variant="outline">
                              <Mail className="w-3 h-3 mr-1" />
                              Email
                            </Badge>
                          )}
                        </div>
                        
                        {/* Criteria Summary */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {alert.criteria?.industries?.length > 0 && (
                            <Badge variant="secondary">
                              {alert.criteria.industries.length} Industries
                            </Badge>
                          )}
                          {alert.criteria?.states?.length > 0 && (
                            <Badge variant="secondary">
                              {alert.criteria.states.length} States
                            </Badge>
                          )}
                          {alert.criteria?.minQuality && (
                            <Badge variant="secondary">
                              Quality: {alert.criteria.minQuality}+
                            </Badge>
                          )}
                          {alert.criteria?.minRevenue && (
                            <Badge variant="secondary">
                              Revenue: ${alert.criteria.minRevenue}+
                            </Badge>
                          )}
                        </div>
                        
                        {/* Last Triggered */}
                        {alert.lastTriggeredAt && (
                          <p className="text-sm text-muted-foreground">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Last triggered: {format(new Date(alert.lastTriggeredAt), "MMM d, yyyy h:mm a")}
                          </p>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={alert.isActive}
                          onCheckedChange={(checked) => 
                            toggleAlertMutation.mutate({ id: alert.id, isActive: checked })
                          }
                          data-testid={`switch-alert-${alert.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => testAlertMutation.mutate(alert.id)}
                          disabled={testAlertMutation.isPending}
                          data-testid={`button-test-${alert.id}`}
                        >
                          <TestTube className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingHistory(alert.id)}
                          data-testid={`button-history-${alert.id}`}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingAlert(alert);
                            setIsCreateDialogOpen(true);
                          }}
                          data-testid={`button-edit-${alert.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this alert?")) {
                              deleteAlertMutation.mutate(alert.id);
                            }
                          }}
                          disabled={deleteAlertMutation.isPending}
                          data-testid={`button-delete-${alert.id}`}
                        >
                          <Trash className="w-4 h-4" />
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

      {/* Create/Edit Alert Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) {
          setEditingAlert(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAlert ? "Edit Alert" : "Create New Alert"}
            </DialogTitle>
            <DialogDescription>
              Define criteria to get notified when matching leads become available
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Alert Name */}
              <FormField
                control={form.control}
                name="alertName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., High-value Restaurant Leads"
                        data-testid="input-alert-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Criteria Tabs */}
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Criteria</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4">
                  {/* Industries */}
                  <div className="space-y-2">
                    <Label>Industries</Label>
                    <div className="flex flex-wrap gap-2">
                      {INDUSTRIES.map((industry) => (
                        <Badge
                          key={industry}
                          variant={selectedIndustries.includes(industry) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedIndustries(prev => 
                              prev.includes(industry)
                                ? prev.filter(i => i !== industry)
                                : [...prev, industry]
                            );
                          }}
                          data-testid={`badge-industry-${industry}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {/* States */}
                  <div className="space-y-2">
                    <Label>States</Label>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {US_STATES.map((state) => (
                        <Badge
                          key={state}
                          variant={selectedStates.includes(state) ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => {
                            setSelectedStates(prev => 
                              prev.includes(state)
                                ? prev.filter(s => s !== state)
                                : [...prev, state]
                            );
                          }}
                          data-testid={`badge-state-${state}`}
                        >
                          {state}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {/* Quality Score */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="criteria.minQuality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Quality Score</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="0"
                              data-testid="input-min-quality"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="criteria.maxQuality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Quality Score</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="100"
                              data-testid="input-max-quality"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="advanced" className="space-y-4">
                  {/* Revenue Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="criteria.minRevenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Annual Revenue</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="$0"
                              data-testid="input-min-revenue"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="criteria.maxRevenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Annual Revenue</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="No limit"
                              data-testid="input-max-revenue"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Credit Score Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="criteria.minCreditScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Credit Score</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="300"
                              data-testid="input-min-credit"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="criteria.maxCreditScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Credit Score</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="850"
                              data-testid="input-max-credit"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Time in Business */}
                  <FormField
                    control={form.control}
                    name="criteria.minTimeInBusiness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Time in Business (years)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="0"
                            data-testid="input-min-time-business"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {/* Exclusivity Status */}
                  <div className="space-y-2">
                    <Label>Exclusivity Status</Label>
                    <div className="flex flex-wrap gap-2">
                      {EXCLUSIVITY_OPTIONS.map((status) => (
                        <Badge
                          key={status}
                          variant={selectedExclusivity.includes(status) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedExclusivity(prev => 
                              prev.includes(status)
                                ? prev.filter(s => s !== status)
                                : [...prev, status]
                            );
                          }}
                          data-testid={`badge-exclusivity-${status}`}
                        >
                          {status.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {/* Funding History */}
                  <div className="space-y-2">
                    <Label>Funding History</Label>
                    <div className="flex flex-wrap gap-2">
                      {MCA_HISTORY_OPTIONS.map((history) => (
                        <Badge
                          key={history}
                          variant={selectedMCAHistory.includes(history) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedMCAHistory(prev => 
                              prev.includes(history)
                                ? prev.filter(h => h !== history)
                                : [...prev, history]
                            );
                          }}
                          data-testid={`badge-mca-${history}`}
                        >
                          {history.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {/* Urgency Level */}
                  <div className="space-y-2">
                    <Label>Urgency Level</Label>
                    <div className="flex flex-wrap gap-2">
                      {URGENCY_OPTIONS.map((urgency) => (
                        <Badge
                          key={urgency}
                          variant={selectedUrgency.includes(urgency) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedUrgency(prev => 
                              prev.includes(urgency)
                                ? prev.filter(u => u !== urgency)
                                : [...prev, urgency]
                            );
                          }}
                          data-testid={`badge-urgency-${urgency}`}
                        >
                          {urgency.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="settings" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active Alert</FormLabel>
                          <FormDescription>
                            Receive notifications when matching leads are available
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="emailNotifications"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Email Notifications</FormLabel>
                          <FormDescription>
                            Receive email notifications for this alert
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-email"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingAlert(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createAlertMutation.isPending || updateAlertMutation.isPending}
                  data-testid="button-save-alert"
                >
                  {editingAlert ? "Update Alert" : "Create Alert"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View History Dialog */}
      {viewingHistory && (
        <AlertHistoryDialog
          alertId={viewingHistory}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </div>
  );
}

// Alert History Dialog Component
function AlertHistoryDialog({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const { data: history, isLoading } = useQuery({
    queryKey: [`/api/alerts/${alertId}/history`],
    enabled: !!alertId,
  });

  const { data: stats } = useQuery({
    queryKey: [`/api/alerts/${alertId}/stats`],
    enabled: !!alertId,
  });

  return (
    <Dialog open={!!alertId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Alert History</DialogTitle>
          <DialogDescription>
            View when this alert was triggered and how many leads matched
          </DialogDescription>
        </DialogHeader>
        
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalTriggers}</div>
                <p className="text-xs text-muted-foreground">Total Triggers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalMatches}</div>
                <p className="text-xs text-muted-foreground">Total Matches</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {stats.avgMatchesPerTrigger.toFixed(1)}
                </div>
                <p className="text-xs text-muted-foreground">Avg per Trigger</p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {isLoading ? (
          <div className="text-center py-8">Loading history...</div>
        ) : history?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            This alert has not been triggered yet
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>Notification</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {format(new Date(item.createdAt), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell>{item.matchedLeads}</TableCell>
                  <TableCell>
                    {item.notificationSent ? (
                      <Badge variant="outline">
                        <Mail className="w-3 h-3 mr-1" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not Sent</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.viewedAt ? (
                      <Badge variant="outline">
                        <Eye className="w-3 h-3 mr-1" />
                        Viewed
                      </Badge>
                    ) : (
                      <Badge variant="default">New</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}