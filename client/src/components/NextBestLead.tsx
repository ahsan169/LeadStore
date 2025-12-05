import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Phone, Building2, User, Mail, MapPin, SkipForward,
  TrendingUp, Clock, Flame, PhoneCall, CheckCircle
} from "lucide-react";
import type { Lead } from "@shared/schema";

interface NextBestLeadResponse {
  lead: Lead | null;
  message?: string;
}

export function NextBestLead() {
  const { toast } = useToast();
  const [showCallModal, setShowCallModal] = useState(false);
  const [skipCount, setSkipCount] = useState(0);
  const [callData, setCallData] = useState({
    direction: "outbound",
    outcome: "",
    duration: "",
    notes: "",
  });

  const { data, isLoading, refetch, isFetching } = useQuery<NextBestLeadResponse>({
    queryKey: ["/api/leads/next-best", { skip: skipCount }],
    queryFn: async () => {
      const res = await fetch(`/api/leads/next-best?skip=${skipCount}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch next best lead");
      return res.json();
    },
  });

  const lead = data?.lead;

  const logCallMutation = useMutation({
    mutationFn: async (callInfo: typeof callData & { leadId: string }) =>
      apiRequest("POST", "/api/crm/call-logs", {
        leadId: callInfo.leadId,
        phoneDialed: lead?.phone || "",
        phoneNumber: lead?.phone || "",
        direction: callInfo.direction,
        outcome: callInfo.outcome,
        durationSec: callInfo.duration ? parseInt(callInfo.duration) : 0,
        notes: callInfo.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/next-best"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setShowCallModal(false);
      setCallData({ direction: "outbound", outcome: "", duration: "", notes: "" });
      toast({ title: "Call logged successfully" });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to log call", variant: "destructive" });
    },
  });

  const handleSkip = () => {
    setSkipCount((prev) => prev + 1);
  };

  const handleCallNow = () => {
    setShowCallModal(true);
  };

  const handleSubmitCall = () => {
    if (!lead || !callData.outcome) {
      toast({ title: "Please select a call outcome", variant: "destructive" });
      return;
    }
    logCallMutation.mutate({ ...callData, leadId: lead.id });
  };

  const getHotScoreColor = (score: number) => {
    if (score >= 80) return "bg-red-500 text-white";
    if (score >= 60) return "bg-orange-500 text-white";
    if (score >= 40) return "bg-yellow-500 text-white";
    return "bg-gray-500 text-white";
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return "N/A";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!lead) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="w-5 h-5 text-orange-500" />
            Next Best Lead
          </CardTitle>
          <CardDescription>AI-powered lead prioritization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <p className="text-lg font-medium mb-2">All caught up!</p>
            <p className="text-sm text-muted-foreground">No leads requiring immediate action</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flame className="w-5 h-5 text-orange-500" />
              Next Best Lead
            </CardTitle>
            <Badge className={getHotScoreColor(lead.hotScore || 0)} data-testid="badge-hot-score">
              <TrendingUp className="w-3 h-3 mr-1" />
              {lead.hotScore || 0}
            </Badge>
          </div>
          <CardDescription>AI-powered lead prioritization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate" data-testid="text-lead-business-name">
                  {lead.businessName || "Unnamed Business"}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span className="truncate" data-testid="text-lead-owner-name">
                    {lead.ownerName || lead.contactName || "No contact"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span className="truncate" data-testid="text-lead-phone">
                  {formatPhone(lead.phone)}
                </span>
              </div>
              {lead.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span className="truncate" data-testid="text-lead-email">
                    {lead.email}
                  </span>
                </div>
              )}
              {(lead.city || lead.stateCode) && (
                <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                  <MapPin className="w-4 h-4" />
                  <span data-testid="text-lead-location">
                    {[lead.city, lead.stateCode].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span data-testid="text-lead-attempts">
                {lead.attemptCount || 0} attempts
              </span>
              {lead.lastCallAt && (
                <>
                  <span>•</span>
                  <span data-testid="text-lead-last-call">
                    Last call: {new Date(lead.lastCallAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>

            {lead.lastOutcome && (
              <Badge variant="outline" className="text-xs" data-testid="badge-last-outcome">
                Last: {lead.lastOutcome}
              </Badge>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={handleCallNow}
              disabled={isFetching}
              data-testid="button-call-now"
            >
              <PhoneCall className="w-4 h-4 mr-2" />
              Call Now
            </Button>
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isFetching}
              data-testid="button-skip-lead"
            >
              <SkipForward className="w-4 h-4 mr-2" />
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCallModal} onOpenChange={setShowCallModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5" />
              Log Call
            </DialogTitle>
            <DialogDescription>
              Record the outcome of your call with {lead?.businessName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="call-direction">Direction</Label>
              <Select
                value={callData.direction}
                onValueChange={(value) => setCallData({ ...callData, direction: value })}
              >
                <SelectTrigger id="call-direction" data-testid="select-call-direction">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="call-outcome">Outcome *</Label>
              <Select
                value={callData.outcome}
                onValueChange={(value) => setCallData({ ...callData, outcome: value })}
              >
                <SelectTrigger id="call-outcome" data-testid="select-call-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="wrong_number">Wrong Number</SelectItem>
                  <SelectItem value="callback_requested">Callback Requested</SelectItem>
                  <SelectItem value="follow_up">Follow-up Needed</SelectItem>
                  <SelectItem value="funded">Funded</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="call-duration">Duration (seconds)</Label>
              <Input
                id="call-duration"
                type="number"
                placeholder="e.g., 120"
                value={callData.duration}
                onChange={(e) => setCallData({ ...callData, duration: e.target.value })}
                data-testid="input-call-duration"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="call-notes">Notes</Label>
              <Textarea
                id="call-notes"
                placeholder="Add any notes about the call..."
                value={callData.notes}
                onChange={(e) => setCallData({ ...callData, notes: e.target.value })}
                rows={3}
                data-testid="input-call-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCallModal(false)}
              data-testid="button-cancel-call"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCall}
              disabled={logCallMutation.isPending || !callData.outcome}
              data-testid="button-submit-call"
            >
              {logCallMutation.isPending ? "Logging..." : "Log Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
