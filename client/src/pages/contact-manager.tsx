import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Search, Phone, Mail, Building2, User, Users, 
  MoreHorizontal, Edit, Trash, Linkedin, Star, StarOff,
  Filter, ArrowUpDown, ExternalLink, MessageSquare
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Contact, Lead } from "@shared/schema";

export default function ContactManagerPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "company" | "recent">("name");

  const [newContact, setNewContact] = useState({
    leadId: "",
    firstName: "",
    lastName: "",
    title: "",
    role: "",
    department: "",
    email: "",
    phone: "",
    mobilePhone: "",
    linkedinUrl: "",
    isPrimary: false,
    notes: "",
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/crm/contacts"],
  });

  const { data: leadsResponse } = useQuery<{ leads: Lead[] }>({
    queryKey: ["/api/leads"],
  });
  const leads = leadsResponse?.leads || [];

  const createContactMutation = useMutation({
    mutationFn: (data: typeof newContact) =>
      apiRequest("POST", "/api/crm/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      setShowCreateDialog(false);
      resetNewContact();
      toast({ title: "Contact created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<typeof newContact>) =>
      apiRequest("PATCH", `/api/crm/contacts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      setEditingContact(null);
      toast({ title: "Contact updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      toast({ title: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const resetNewContact = () => {
    setNewContact({
      leadId: "",
      firstName: "",
      lastName: "",
      title: "",
      role: "",
      department: "",
      email: "",
      phone: "",
      mobilePhone: "",
      linkedinUrl: "",
      isPrimary: false,
      notes: "",
    });
  };

  const getLeadName = (leadId?: string | null) => {
    if (!leadId) return "N/A";
    const lead = leads.find((l) => l.id.toString() === leadId);
    return lead?.businessName || `Lead #${leadId}`;
  };

  const getInitials = (firstName: string, lastName?: string | null) => {
    return `${firstName.charAt(0)}${lastName?.charAt(0) || ""}`.toUpperCase();
  };

  const getRoleColor = (role?: string | null) => {
    switch (role) {
      case "decision_maker":
        return "badge-royal";
      case "influencer":
        return "badge-royal";
      case "champion":
        return "badge-emerald";
      case "blocker":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "end_user":
        return "badge-gold";
      default:
        return "badge-gold";
    }
  };

  const formatRole = (role?: string | null) => {
    if (!role) return "N/A";
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatDate = (date?: Date | string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const filteredContacts = contacts
    .filter((contact) => {
      const matchesSearch =
        `${contact.firstName} ${contact.lastName}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phone?.includes(searchQuery);

      const matchesRole = filterRole === "all" || contact.role === filterRole;

      let matchesTab = true;
      if (activeTab === "primary") {
        matchesTab = contact.isPrimary;
      } else if (activeTab === "decision_makers") {
        matchesTab = contact.role === "decision_maker";
      } else if (activeTab === "recent") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        matchesTab = contact.lastContactedAt
          ? new Date(contact.lastContactedAt) > oneWeekAgo
          : false;
      }

      return matchesSearch && matchesRole && matchesTab;
    })
    .sort((a, b) => {
      if (sortBy === "name") {
        return `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`
        );
      } else if (sortBy === "company") {
        return getLeadName(a.leadId).localeCompare(getLeadName(b.leadId));
      } else {
        const aDate = a.lastContactedAt ? new Date(a.lastContactedAt) : new Date(0);
        const bDate = b.lastContactedAt ? new Date(b.lastContactedAt) : new Date(0);
        return bDate.getTime() - aDate.getTime();
      }
    });

  const contactStats = {
    total: contacts.length,
    primary: contacts.filter((c) => c.isPrimary).length,
    decisionMakers: contacts.filter((c) => c.role === "decision_maker").length,
    recentlyContacted: contacts.filter((c) => {
      if (!c.lastContactedAt) return false;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      return new Date(c.lastContactedAt) > oneWeekAgo;
    }).length,
  };

  if (loadingContacts) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading contacts...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between p-6 border-b bg-background">
        <div className="animate-slide-up">
          <h1 className="text-2xl font-serif text-gradient-royal" data-testid="text-page-title">
            Contact Manager
          </h1>
          <p className="text-muted-foreground">
            Manage contacts across all your leads
          </p>
        </div>
        <Button className="btn-kingdom" onClick={() => setShowCreateDialog(true)} data-testid="button-create-contact">
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      <div className="divider-elegant" />

      <div className="grid grid-cols-4 gap-4 p-6 border-b bg-muted/30">
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{contactStats.total}</p>
              <p className="text-sm text-muted-foreground">Total Contacts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{contactStats.primary}</p>
              <p className="text-sm text-muted-foreground">Primary Contacts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-300">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <User className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{contactStats.decisionMakers}</p>
              <p className="text-sm text-muted-foreground">Decision Makers</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-kingdom hover-lift animate-slide-up animate-delay-400">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold">{contactStats.recentlyContacted}</p>
              <p className="text-sm text-muted-foreground">Recently Contacted</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="divider-elegant" />

      <div className="flex-1 overflow-hidden p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all-contacts">
                All Contacts
              </TabsTrigger>
              <TabsTrigger value="primary" data-testid="tab-primary-contacts">
                Primary
              </TabsTrigger>
              <TabsTrigger value="decision_makers" data-testid="tab-decision-makers">
                Decision Makers
              </TabsTrigger>
              <TabsTrigger value="recent" data-testid="tab-recent-contacts">
                Recently Contacted
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search-contacts"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-36" data-testid="select-filter-role">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="decision_maker">Decision Maker</SelectItem>
                  <SelectItem value="influencer">Influencer</SelectItem>
                  <SelectItem value="champion">Champion</SelectItem>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="end_user">End User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: typeof sortBy) => setSortBy(v)}>
                <SelectTrigger className="w-32" data-testid="select-sort-by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="recent">Recent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="card-kingdom flex-1 overflow-hidden animate-slide-up">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px] font-serif">Contact</TableHead>
                  <TableHead className="font-serif">Company</TableHead>
                  <TableHead className="font-serif">Role</TableHead>
                  <TableHead className="font-serif">Email</TableHead>
                  <TableHead className="font-serif">Phone</TableHead>
                  <TableHead className="font-serif">Last Contacted</TableHead>
                  <TableHead className="w-[80px] font-serif">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <Users className="w-12 h-12 mb-4 text-primary/40" />
                        <p className="text-lg font-serif font-medium mb-2">No contacts found</p>
                        <p className="text-sm mb-4">
                          {activeTab === "all"
                            ? "Add your first contact to get started"
                            : "No contacts match the current filters"}
                        </p>
                        {activeTab === "all" && (
                          <Button className="btn-kingdom" onClick={() => setShowCreateDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Contact
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => setSelectedContact(contact)}
                      data-testid={`row-contact-${contact.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {getInitials(contact.firstName, contact.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {contact.firstName} {contact.lastName}
                              </span>
                              {contact.isPrimary && (
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                            {contact.title && (
                              <span className="text-sm text-muted-foreground">
                                {contact.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          {getLeadName(contact.leadId)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.role && (
                          <Badge className={getRoleColor(contact.role)} variant="outline">
                            {formatRole(contact.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-4 h-4" />
                            {contact.email}
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="flex items-center gap-1 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="w-4 h-4" />
                            {contact.phone}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(contact.lastContactedAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingContact(contact);
                              }}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                updateContactMutation.mutate({
                                  id: contact.id,
                                  isPrimary: !contact.isPrimary,
                                });
                              }}
                            >
                              {contact.isPrimary ? (
                                <>
                                  <StarOff className="w-4 h-4 mr-2" />
                                  Remove Primary
                                </>
                              ) : (
                                <>
                                  <Star className="w-4 h-4 mr-2" />
                                  Set as Primary
                                </>
                              )}
                            </DropdownMenuItem>
                            {contact.linkedinUrl && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={contact.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Linkedin className="w-4 h-4 mr-2" />
                                  View LinkedIn
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteContactMutation.mutate(contact.id);
                              }}
                            >
                              <Trash className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </Tabs>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-gradient-royal">Add New Contact</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="leadId">Company / Lead</Label>
              <Select
                value={newContact.leadId || undefined}
                onValueChange={(value) => setNewContact({ ...newContact, leadId: value })}
              >
                <SelectTrigger data-testid="select-contact-lead">
                  <SelectValue placeholder="Select a lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.businessName || `Lead #${lead.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Contact Role</Label>
              <Select
                value={newContact.role || undefined}
                onValueChange={(value) => setNewContact({ ...newContact, role: value })}
              >
                <SelectTrigger data-testid="select-contact-role">
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decision_maker">Decision Maker</SelectItem>
                  <SelectItem value="influencer">Influencer</SelectItem>
                  <SelectItem value="champion">Champion</SelectItem>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="end_user">End User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={newContact.firstName}
                onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                placeholder="John"
                data-testid="input-contact-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={newContact.lastName}
                onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                placeholder="Doe"
                data-testid="input-contact-lastname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                value={newContact.title}
                onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                placeholder="CEO, CFO, Manager..."
                data-testid="input-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={newContact.department}
                onChange={(e) => setNewContact({ ...newContact, department: e.target.value })}
                placeholder="Finance, Operations..."
                data-testid="input-contact-department"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="john@company.com"
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="(555) 123-4567"
                data-testid="input-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobilePhone">Mobile Phone</Label>
              <Input
                id="mobilePhone"
                value={newContact.mobilePhone}
                onChange={(e) => setNewContact({ ...newContact, mobilePhone: e.target.value })}
                placeholder="(555) 987-6543"
                data-testid="input-contact-mobile"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input
                id="linkedinUrl"
                value={newContact.linkedinUrl}
                onChange={(e) => setNewContact({ ...newContact, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/..."
                data-testid="input-contact-linkedin"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={newContact.notes}
                onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                placeholder="Add any notes about this contact..."
                data-testid="input-contact-notes"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch
                id="isPrimary"
                checked={newContact.isPrimary}
                onCheckedChange={(checked) => setNewContact({ ...newContact, isPrimary: checked })}
                data-testid="switch-contact-primary"
              />
              <Label htmlFor="isPrimary">Set as primary contact for this company</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              className="btn-kingdom"
              onClick={() => createContactMutation.mutate(newContact)}
              disabled={!newContact.firstName || !newContact.leadId || createContactMutation.isPending}
              data-testid="button-submit-contact"
            >
              {createContactMutation.isPending ? "Creating..." : "Create Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-gradient-royal">Edit Contact</DialogTitle>
          </DialogHeader>
          {editingContact && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input
                  id="edit-firstName"
                  value={editingContact.firstName}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, firstName: e.target.value })
                  }
                  data-testid="input-edit-contact-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input
                  id="edit-lastName"
                  value={editingContact.lastName || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, lastName: e.target.value })
                  }
                  data-testid="input-edit-contact-lastname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-title">Job Title</Label>
                <Input
                  id="edit-title"
                  value={editingContact.title || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, title: e.target.value })
                  }
                  data-testid="input-edit-contact-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Contact Role</Label>
                <Select
                  value={editingContact.role || undefined}
                  onValueChange={(value) =>
                    setEditingContact({ ...editingContact, role: value })
                  }
                >
                  <SelectTrigger data-testid="select-edit-contact-role">
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decision_maker">Decision Maker</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="champion">Champion</SelectItem>
                    <SelectItem value="blocker">Blocker</SelectItem>
                    <SelectItem value="end_user">End User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingContact.email || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, email: e.target.value })
                  }
                  data-testid="input-edit-contact-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editingContact.phone || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, phone: e.target.value })
                  }
                  data-testid="input-edit-contact-phone"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editingContact.notes || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, notes: e.target.value })
                  }
                  data-testid="input-edit-contact-notes"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  id="edit-isPrimary"
                  checked={editingContact.isPrimary}
                  onCheckedChange={(checked) =>
                    setEditingContact({ ...editingContact, isPrimary: checked })
                  }
                  data-testid="switch-edit-contact-primary"
                />
                <Label htmlFor="edit-isPrimary">Primary contact for this company</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>
              Cancel
            </Button>
            <Button
              className="btn-kingdom"
              onClick={() => {
                if (editingContact) {
                  updateContactMutation.mutate({
                    id: editingContact.id,
                    firstName: editingContact.firstName,
                    lastName: editingContact.lastName ?? undefined,
                    title: editingContact.title ?? undefined,
                    role: editingContact.role ?? undefined,
                    email: editingContact.email ?? undefined,
                    phone: editingContact.phone ?? undefined,
                    notes: editingContact.notes ?? undefined,
                    isPrimary: editingContact.isPrimary,
                  });
                }
              }}
              disabled={updateContactMutation.isPending}
              data-testid="button-update-contact"
            >
              {updateContactMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedContact}
        onOpenChange={(open) => !open && setSelectedContact(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-gradient-royal">Contact Details</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-6 py-4 animate-fade-in">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                  <AvatarFallback className="text-lg font-serif bg-primary/10 text-primary">
                    {getInitials(selectedContact.firstName, selectedContact.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-serif font-semibold">
                      {selectedContact.firstName} {selectedContact.lastName}
                    </h2>
                    {selectedContact.isPrimary && (
                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  {selectedContact.title && (
                    <p className="text-muted-foreground">{selectedContact.title}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{getLeadName(selectedContact.leadId)}</span>
                  </div>
                </div>
                {selectedContact.role && (
                  <Badge className={getRoleColor(selectedContact.role)} variant="outline">
                    {formatRole(selectedContact.role)}
                  </Badge>
                )}
              </div>

              <div className="divider-elegant" />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  {selectedContact.email ? (
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Mail className="w-4 h-4" />
                      {selectedContact.email}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  {selectedContact.phone ? (
                    <a
                      href={`tel:${selectedContact.phone}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Phone className="w-4 h-4" />
                      {selectedContact.phone}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Mobile</p>
                  {selectedContact.mobilePhone ? (
                    <a
                      href={`tel:${selectedContact.mobilePhone}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Phone className="w-4 h-4" />
                      {selectedContact.mobilePhone}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">LinkedIn</p>
                  {selectedContact.linkedinUrl ? (
                    <a
                      href={selectedContact.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Linkedin className="w-4 h-4" />
                      View Profile
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p>{selectedContact.department || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Last Contacted</p>
                  <p>{formatDate(selectedContact.lastContactedAt)}</p>
                </div>
              </div>

              {selectedContact.notes && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm bg-muted/50 p-3 rounded">{selectedContact.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedContact(null);
                setEditingContact(selectedContact);
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Contact
            </Button>
            <Button variant="outline" onClick={() => setSelectedContact(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
