import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CampaignTemplate, Campaign, Purchase } from "@shared/schema";
import {
  Mail,
  MessageSquare,
  Calendar,
  Send,
  Clock,
  Eye,
  Edit,
  Trash2,
  Plus,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Target,
  Users,
  TrendingUp,
  FileText,
  Sparkles,
} from "lucide-react";

// Template creation schema
const createTemplateSchema = z.object({
  templateName: z.string().min(1, "Template name is required"),
  templateType: z.enum(["email", "sms"]),
  subject: z.string().optional(),
  content: z.string().min(10, "Content must be at least 10 characters"),
  category: z.enum(["intro", "follow_up", "offer", "reminder"]),
  isPublic: z.boolean().default(false),
});

type CreateTemplateForm = z.infer<typeof createTemplateSchema>;

// Campaign creation schema
const createCampaignSchema = z.object({
  purchaseId: z.string().min(1, "Purchase is required"),
  templateId: z.string().min(1, "Template is required"),
  campaignName: z.string().min(1, "Campaign name is required"),
  scheduledAt: z.string().optional(),
});

type CreateCampaignForm = z.infer<typeof createCampaignSchema>;

export default function CampaignTools() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [campaignPreview, setCampaignPreview] = useState<any>(null);
  const [preSelectedPurchaseId, setPreSelectedPurchaseId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useQuery<CampaignTemplate[]>({
    queryKey: ["/api/templates", selectedCategory],
    queryFn: async () => {
      const params = selectedCategory !== "all" ? `?category=${selectedCategory}` : "";
      const response = await fetch(`/api/templates${params}`);
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // Fetch campaigns
  const { data: campaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  // Fetch campaign stats
  const { data: campaignStats } = useQuery<{
    totalCampaigns: number;
    sentCampaigns: number;
    scheduledCampaigns: number;
    draftCampaigns: number;
    totalRecipients: number;
    averageOpenRate: number;
    averageClickRate: number;
  }>({
    queryKey: ["/api/campaigns/stats"],
  });

  // Fetch purchases for campaign creation
  const { data: purchases } = useQuery<Purchase[]>({
    queryKey: ["/api/purchases"],
  });

  // Fetch available variables
  const { data: availableVariables } = useQuery<
    { name: string; description: string; example: string }[]
  >({
    queryKey: ["/api/campaigns/variables"],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: CreateTemplateForm) =>
      apiRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setShowTemplateDialog(false);
      templateForm.reset();
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      });
    },
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: (data: CreateCampaignForm) =>
      apiRequest("/api/campaigns/create", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/stats"] });
      setShowCampaignDialog(false);
      campaignForm.reset();
      toast({
        title: "Success",
        description: "Campaign created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create campaign",
        variant: "destructive",
      });
    },
  });

  // Preview campaign mutation
  const previewCampaignMutation = useMutation({
    mutationFn: (data: { templateId: string; purchaseId: string }) =>
      apiRequest("/api/campaigns/preview", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      setCampaignPreview(data);
      setShowPreviewDialog(true);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate preview",
        variant: "destructive",
      });
    },
  });

  // Send campaign mutation
  const sendCampaignMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest(`/api/campaigns/${campaignId}/send`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/stats"] });
      toast({
        title: "Success",
        description: "Campaign sent successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send campaign",
        variant: "destructive",
      });
    },
  });

  // Template form
  const templateForm = useForm<CreateTemplateForm>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: {
      templateName: "",
      templateType: "email",
      subject: "",
      content: "",
      category: "intro",
      isPublic: false,
    },
  });

  // Campaign form
  const campaignForm = useForm<CreateCampaignForm>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      purchaseId: preSelectedPurchaseId || "",
      templateId: "",
      campaignName: "",
      scheduledAt: "",
    },
  });
  
  // Check for pre-selected purchase from purchases page
  useEffect(() => {
    const selectedPurchaseId = localStorage.getItem('selectedPurchaseId');
    if (selectedPurchaseId) {
      // Pre-fill the campaign form with the selected purchase
      campaignForm.setValue('purchaseId', selectedPurchaseId);
      setShowCampaignDialog(true);
      // Clear the stored value
      localStorage.removeItem('selectedPurchaseId');
    }
  }, []);

  const handleInsertVariable = (variable: string) => {
    const currentContent = templateForm.getValues("content");
    const cursorPosition = (document.activeElement as HTMLTextAreaElement)?.selectionStart || currentContent.length;
    const newContent = 
      currentContent.slice(0, cursorPosition) + 
      `{{${variable}}}` + 
      currentContent.slice(cursorPosition);
    templateForm.setValue("content", newContent);
  };

  const handlePreviewCampaign = () => {
    const purchaseId = campaignForm.getValues("purchaseId");
    const templateId = campaignForm.getValues("templateId");
    
    if (purchaseId && templateId) {
      previewCampaignMutation.mutate({ purchaseId, templateId });
    } else {
      toast({
        title: "Missing Information",
        description: "Please select both a purchase and a template",
        variant: "destructive",
      });
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "intro":
        return <Mail className="h-4 w-4" />;
      case "follow_up":
        return <Clock className="h-4 w-4" />;
      case "offer":
        return <Sparkles className="h-4 w-4" />;
      case "reminder":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500">Sent</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500">Scheduled</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Campaign Tools</h1>
        <p className="text-muted-foreground">
          Create and manage email/SMS campaigns to maximize your lead value
        </p>
      </div>

      {/* Stats Cards */}
      {campaignStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-campaigns">
                {campaignStats.totalCampaigns}
              </div>
              <p className="text-xs text-muted-foreground">
                {campaignStats.draftCampaigns} drafts, {campaignStats.scheduledCampaigns} scheduled
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recipients Reached</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-recipients-reached">
                {campaignStats.totalRecipients}
              </div>
              <p className="text-xs text-muted-foreground">Total leads contacted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Open Rate</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-open-rate">
                {campaignStats.averageOpenRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Email engagement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Click Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-click-rate">
                {campaignStats.averageClickRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Link clicks</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates" data-testid="tab-templates">
            Templates
          </TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">
            Campaigns
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <Button
                variant={selectedCategory === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("all")}
                data-testid="button-category-all"
              >
                All Templates
              </Button>
              <Button
                variant={selectedCategory === "intro" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("intro")}
                data-testid="button-category-intro"
              >
                Introduction
              </Button>
              <Button
                variant={selectedCategory === "follow_up" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("follow_up")}
                data-testid="button-category-followup"
              >
                Follow-up
              </Button>
              <Button
                variant={selectedCategory === "offer" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("offer")}
                data-testid="button-category-offer"
              >
                Special Offers
              </Button>
              <Button
                variant={selectedCategory === "reminder" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("reminder")}
                data-testid="button-category-reminder"
              >
                Reminders
              </Button>
            </div>
            <Button onClick={() => setShowTemplateDialog(true)} data-testid="button-create-template">
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </div>

          {templatesLoading ? (
            <div className="text-center py-8">Loading templates...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates?.map((template) => (
                <Card key={template.id} data-testid={`card-template-${template.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(template.category)}
                        <CardTitle className="text-lg">{template.templateName}</CardTitle>
                      </div>
                      <Badge variant={template.templateType === "email" ? "default" : "secondary"}>
                        {template.templateType === "email" ? (
                          <Mail className="mr-1 h-3 w-3" />
                        ) : (
                          <MessageSquare className="mr-1 h-3 w-3" />
                        )}
                        {template.templateType}
                      </Badge>
                    </div>
                    {template.subject && (
                      <CardDescription className="mt-2">
                        <strong>Subject:</strong> {template.subject}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.content}
                    </p>
                    {template.variables && template.variables.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-medium mb-2">Variables used:</p>
                        <div className="flex flex-wrap gap-1">
                          {template.variables.map((variable) => (
                            <Badge key={variable} variant="outline" className="text-xs">
                              {`{{${variable}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Badge variant="outline">{template.category}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        campaignForm.setValue("templateId", template.id);
                        setShowCampaignDialog(true);
                      }}
                      data-testid={`button-use-template-${template.id}`}
                    >
                      Use Template
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowCampaignDialog(true)} data-testid="button-create-campaign">
              <Send className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </div>

          {campaignsLoading ? (
            <div className="text-center py-8">Loading campaigns...</div>
          ) : campaigns?.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No campaigns yet</AlertTitle>
              <AlertDescription>
                Create your first campaign to start reaching out to your leads.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {campaigns?.map((campaign) => (
                <Card key={campaign.id} data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{campaign.campaignName}</CardTitle>
                        <CardDescription>
                          {campaign.recipientCount} recipients • Created {new Date(campaign.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(campaign.status)}
                        {campaign.status === "draft" && (
                          <Button
                            size="sm"
                            onClick={() => sendCampaignMutation.mutate(campaign.id)}
                            disabled={sendCampaignMutation.isPending}
                            data-testid={`button-send-campaign-${campaign.id}`}
                          >
                            <Send className="mr-1 h-3 w-3" />
                            Send Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {campaign.sentAt && (
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Sent: {new Date(campaign.sentAt).toLocaleString()}</span>
                        {campaign.openCount !== undefined && (
                          <span>Opens: {campaign.openCount}</span>
                        )}
                        {campaign.clickCount !== undefined && (
                          <span>Clicks: {campaign.clickCount}</span>
                        )}
                      </div>
                    </CardContent>
                  )}
                  {campaign.scheduledAt && campaign.status === "scheduled" && (
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Scheduled for: {new Date(campaign.scheduledAt).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a reusable template for your campaigns. Use variables like {`{{businessName}}`} to personalize messages.
            </DialogDescription>
          </DialogHeader>

          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit((data) => createTemplateMutation.mutate(data))} className="space-y-4">
              <FormField
                control={templateForm.control}
                name="templateName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Quick Funding Follow-up" {...field} data-testid="input-template-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={templateForm.control}
                  name="templateType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-template-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={templateForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-template-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="intro">Introduction</SelectItem>
                          <SelectItem value="follow_up">Follow-up</SelectItem>
                          <SelectItem value="offer">Special Offer</SelectItem>
                          <SelectItem value="reminder">Reminder</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {templateForm.watch("templateType") === "email" && (
                <FormField
                  control={templateForm.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Funding Available for {{businessName}}" {...field} data-testid="input-template-subject" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={templateForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter your template content..."
                        className="min-h-[200px]"
                        {...field}
                        data-testid="textarea-template-content"
                      />
                    </FormControl>
                    <FormDescription>
                      Use variables to personalize your message
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Available Variables */}
              <div className="border rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Available Variables (click to insert):</p>
                <div className="flex flex-wrap gap-2">
                  {availableVariables?.map((variable) => (
                    <Button
                      key={variable.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleInsertVariable(variable.name)}
                      data-testid={`button-insert-variable-${variable.name}`}
                    >
                      {`{{${variable.name}}}`}
                    </Button>
                  ))}
                </div>
              </div>

              <FormField
                control={templateForm.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="rounded"
                        data-testid="checkbox-template-public"
                      />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      Make this template public (available to all users)
                    </FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTemplateDialog(false)}
                  data-testid="button-cancel-template"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTemplateMutation.isPending} data-testid="button-save-template">
                  Create Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Select a purchase and template to create your campaign
            </DialogDescription>
          </DialogHeader>

          <Form {...campaignForm}>
            <form onSubmit={campaignForm.handleSubmit((data) => createCampaignMutation.mutate(data))} className="space-y-4">
              <FormField
                control={campaignForm.control}
                name="campaignName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Q1 2024 Outreach" {...field} data-testid="input-campaign-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={campaignForm.control}
                name="purchaseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Purchase</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-purchase">
                          <SelectValue placeholder="Choose a purchase with leads" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {purchases?.map((purchase) => (
                          <SelectItem key={purchase.id} value={purchase.id}>
                            {purchase.tier} - {purchase.leadCount} leads ({new Date(purchase.purchaseDate).toLocaleDateString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={campaignForm.control}
                name="templateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Template</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || selectedTemplate?.id}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Choose a template" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {templates?.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.templateName} ({template.templateType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={campaignForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        data-testid="input-schedule-datetime"
                      />
                    </FormControl>
                    <FormDescription>
                      Leave empty to save as draft
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewCampaign}
                  disabled={previewCampaignMutation.isPending}
                  data-testid="button-preview-campaign"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCampaignDialog(false)}
                  data-testid="button-cancel-campaign"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createCampaignMutation.isPending} data-testid="button-create-campaign-submit">
                  Create Campaign
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Campaign Preview</DialogTitle>
            <DialogDescription>
              Preview how your campaign will look for different leads
            </DialogDescription>
          </DialogHeader>

          {campaignPreview && (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {campaignPreview.previews?.map((preview: any, index: number) => (
                  <Card key={preview.leadId} data-testid={`card-preview-${index}`}>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Lead: {preview.businessName}
                      </CardTitle>
                      {preview.subject && (
                        <CardDescription>
                          <strong>Subject:</strong> {preview.subject}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <pre className="whitespace-pre-wrap text-sm">
                        {preview.content}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)} data-testid="button-close-preview">
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}