import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Download, Mail, CheckCircle, Clock, Eye, MailCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Papa from "papaparse";
import type { ContactSubmission } from "@shared/schema";

export default function ContactSubmissionsPage() {
  const { toast } = useToast();
  
  const { data: submissions, isLoading } = useQuery<ContactSubmission[]>({
    queryKey: ["/api/admin/contact-submissions"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/admin/contact-submissions/${id}`, { status });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-submissions"] });
      toast({
        title: "Status updated",
        description: "Contact submission status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const exportToCSV = () => {
    if (!submissions || submissions.length === 0) {
      toast({
        title: "No data",
        description: "There are no submissions to export.",
        variant: "destructive",
      });
      return;
    }

    const csvData = submissions.map(sub => ({
      Date: new Date(sub.createdAt).toLocaleDateString(),
      Time: new Date(sub.createdAt).toLocaleTimeString(),
      Name: sub.name,
      Email: sub.email,
      Phone: sub.phone || '',
      Company: sub.company || '',
      Message: sub.message,
      Status: sub.status
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contact-submissions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Contact submissions have been exported to CSV.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            <Clock className="w-3 h-3 mr-1" />
            New
          </Badge>
        );
      case 'read':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            <Eye className="w-3 h-3 mr-1" />
            Read
          </Badge>
        );
      case 'responded':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <MailCheck className="w-3 h-3 mr-1" />
            Responded
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading contact submissions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-contact-submissions">
            Contact Submissions
          </h1>
          <p className="text-muted-foreground">Review and manage contact form submissions</p>
        </div>
        <Button
          onClick={exportToCSV}
          disabled={!submissions || submissions.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="w-4 h-4 mr-2" />
          Export to CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">All Submissions</h2>
            <div className="flex gap-2">
              <Badge variant="secondary">
                Total: {submissions?.length || 0}
              </Badge>
              {submissions && (
                <>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                    New: {submissions.filter(s => s.status === 'new').length}
                  </Badge>
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    Responded: {submissions.filter(s => s.status === 'responded').length}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!submissions || submissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No contact submissions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((submission) => (
                    <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                      <TableCell className="text-sm">
                        <div>
                          <div>{new Date(submission.createdAt).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-name-${submission.id}`}>
                        {submission.name}
                      </TableCell>
                      <TableCell>
                        <a 
                          href={`mailto:${submission.email}`} 
                          className="text-primary hover:underline flex items-center gap-1"
                          data-testid={`link-email-${submission.id}`}
                        >
                          <Mail className="w-3 h-3" />
                          {submission.email}
                        </a>
                      </TableCell>
                      <TableCell>{submission.company || '-'}</TableCell>
                      <TableCell className="text-sm">{submission.phone || '-'}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={submission.message}>
                          {submission.message}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(submission.status)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={submission.status}
                          onValueChange={(value) => 
                            updateStatusMutation.mutate({ id: submission.id, status: value })
                          }
                          disabled={updateStatusMutation.isPending}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-status-${submission.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="read">Read</SelectItem>
                            <SelectItem value="responded">Responded</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}