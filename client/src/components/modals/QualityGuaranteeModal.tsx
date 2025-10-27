import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertCircle, Clock, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const reportSchema = z.object({
  leadId: z.string().min(1, "Please select a lead"),
  issueType: z.enum(["disconnected", "wrong_number", "duplicate", "poor_quality"]),
  issueDescription: z.string().min(10, "Please provide at least 10 characters of detail"),
});

type ReportFormValues = z.infer<typeof reportSchema>;

interface QualityGuaranteeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: any;
}

export function QualityGuaranteeModal({ open, onOpenChange, purchase }: QualityGuaranteeModalProps) {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      leadId: "",
      issueType: "disconnected",
      issueDescription: "",
    },
  });

  // Check if guarantee is still valid
  const guaranteeExpiry = purchase.guaranteeExpiresAt
    ? new Date(purchase.guaranteeExpiresAt)
    : new Date(new Date(purchase.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpired = new Date() > guaranteeExpiry;
  const daysRemaining = Math.max(0, Math.ceil((guaranteeExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  // Fetch existing reports for this purchase
  const { data: existingReports } = useQuery({
    queryKey: ["/api/guarantee/reports", purchase.id],
    queryFn: async () => {
      const response = await fetch(`/api/guarantee/reports?purchaseId=${purchase.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reports");
      return response.json();
    },
    enabled: open,
  });

  const reportMutation = useMutation({
    mutationFn: async (data: ReportFormValues) => {
      return apiRequest("POST", "/api/guarantee/report", {
        ...data,
        purchaseId: purchase.id,
      });
    },
    onSuccess: () => {
      toast({
        title: "Report submitted successfully",
        description: "We'll review your quality issue within 24-48 hours.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guarantee/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit report",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ReportFormValues) => {
    reportMutation.mutate(data);
  };

  // Map lead IDs to lead data (in production, you'd fetch actual lead details)
  const leads = purchase.leadIds?.map((id: string, index: number) => ({
    id,
    displayName: `Lead ${index + 1}`,
    reported: existingReports?.some((r: any) => r.leadId === id),
  })) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Report Quality Issue
          </DialogTitle>
          <DialogDescription>
            Our 30-day quality guarantee ensures you get leads that meet our standards.
          </DialogDescription>
        </DialogHeader>

        {isExpired ? (
          <Alert className="border-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The quality guarantee for this purchase has expired. The guarantee period is 30 days from purchase.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Guarantee Period</span>
              </div>
              <Badge variant={daysRemaining > 7 ? "default" : "destructive"}>
                {daysRemaining} days remaining
              </Badge>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Lead</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedLead(leads.find((l: any) => l.id === value));
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-lead">
                            <SelectValue placeholder="Choose the problematic lead" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leads.map((lead: any) => (
                            <SelectItem
                              key={lead.id}
                              value={lead.id}
                              disabled={lead.reported}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{lead.displayName}</span>
                                {lead.reported && (
                                  <Badge variant="secondary" className="ml-2">
                                    Already Reported
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the lead that has quality issues
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issueType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-issue-type">
                            <SelectValue placeholder="Select issue type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="disconnected">
                            Disconnected Number
                          </SelectItem>
                          <SelectItem value="wrong_number">
                            Wrong/Invalid Number
                          </SelectItem>
                          <SelectItem value="duplicate">
                            Duplicate Lead
                          </SelectItem>
                          <SelectItem value="poor_quality">
                            Poor Quality Lead
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        What type of issue are you experiencing?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issueDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please provide details about the issue..."
                          className="resize-none"
                          rows={4}
                          {...field}
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormDescription>
                        Provide specific details to help us resolve the issue quickly
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {existingReports && existingReports.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      You have {existingReports.length} existing report(s) for this purchase.
                      {existingReports.filter((r: any) => r.status === 'pending').length > 0 && (
                        <span className="block mt-1">
                          {existingReports.filter((r: any) => r.status === 'pending').length} pending review
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Quality Guarantee Coverage
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      Disconnected or invalid phone numbers
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      Duplicate leads in your purchase
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      Leads not matching quality standards
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      Replacement leads or credits provided
                    </li>
                  </ul>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={reportMutation.isPending}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={reportMutation.isPending || isExpired}
                    data-testid="button-submit-report"
                  >
                    {reportMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Submit Report
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}