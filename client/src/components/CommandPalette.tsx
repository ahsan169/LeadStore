import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { DialogDescription } from "@/components/ui/dialog";
import {
  Home,
  Settings,
  Key,
  Webhook,
  BarChart,
  Download,
  FileText,
  Plus,
  Search,
  Terminal,
  Activity,
  AlertCircle,
  Send,
  Copy,
  RefreshCw,
  Eye,
  LogOut,
  Shield,
  User,
  FileDown,
  Upload,
  Bell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CommandItem {
  id: string;
  label: string;
  icon?: any;
  shortcut?: string;
  action: () => void;
  category?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  // Handle keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }

      // Quick shortcuts when palette is closed
      if (!open) {
        // Alt+A for API key generation
        if (e.altKey && e.key === "a") {
          e.preventDefault();
          generateApiKey();
        }
        // Alt+W for test webhook
        if (e.altKey && e.key === "w") {
          e.preventDefault();
          testWebhook();
        }
        // Alt+E for export analytics
        if (e.altKey && e.key === "e") {
          e.preventDefault();
          exportAnalytics();
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  // Auto-focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const generateApiKey = async () => {
    try {
      const keyName = prompt("Enter a name for the API key:");
      if (!keyName) return;

      const response = await apiRequest("POST", "/api/developer/keys", {
        keyName,
        permissions: {
          scopes: ["read:leads", "read:analytics"],
          endpoints: [],
        },
        rateLimit: 100,
      });

      toast({
        title: "API Key Created",
        description: "Your new API key has been generated successfully.",
      });

      // Copy to clipboard
      navigator.clipboard.writeText(response.apiKey);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate API key",
        variant: "destructive",
      });
    }
  };

  const testWebhook = async () => {
    try {
      const url = prompt("Enter webhook URL to test:");
      if (!url) return;

      await apiRequest("POST", "/api/v1/webhooks/test", { url });
      
      toast({
        title: "Webhook Test Sent",
        description: "Check your webhook endpoint for the test payload.",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test webhook",
        variant: "destructive",
      });
    }
  };

  const exportAnalytics = async () => {
    try {
      const response = await apiRequest("POST", "/api/command-center/export-analytics");
      
      // Download the file
      const link = document.createElement("a");
      link.href = response.downloadUrl;
      link.download = `analytics_${new Date().toISOString()}.csv`;
      link.click();
      
      toast({
        title: "Analytics Exported",
        description: "Your analytics data has been exported successfully.",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export analytics",
        variant: "destructive",
      });
    }
  };

  const navigateTo = (path: string) => {
    setLocation(path);
    setOpen(false);
  };

  // Define command items
  const commands: CommandItem[] = [
    // Navigation
    {
      id: "home",
      label: "Go to Overview",
      icon: Home,
      shortcut: "⌘H",
      action: () => navigateTo("/command-center"),
      category: "Navigation",
    },
    {
      id: "analytics",
      label: "View Analytics",
      icon: BarChart,
      shortcut: "⌘A",
      action: () => navigateTo("/command-center?tab=analytics"),
      category: "Navigation",
    },
    {
      id: "api-console",
      label: "Open API Console",
      icon: Terminal,
      shortcut: "⌘T",
      action: () => navigateTo("/command-center?tab=api-console"),
      category: "Navigation",
    },
    {
      id: "keys",
      label: "Manage API Keys",
      icon: Key,
      shortcut: "⌘K",
      action: () => navigateTo("/command-center?tab=keys"),
      category: "Navigation",
    },
    {
      id: "webhooks",
      label: "Configure Webhooks",
      icon: Webhook,
      shortcut: "⌘W",
      action: () => navigateTo("/command-center?tab=keys"),
      category: "Navigation",
    },
    {
      id: "activity",
      label: "View Activity Log",
      icon: Activity,
      shortcut: "⌘L",
      action: () => navigateTo("/command-center?tab=activity"),
      category: "Navigation",
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      shortcut: "⌘,",
      action: () => navigateTo("/command-center?tab=settings"),
      category: "Navigation",
    },

    // Quick Actions
    {
      id: "generate-api-key",
      label: "Generate API Key",
      icon: Plus,
      shortcut: "⌥A",
      action: generateApiKey,
      category: "Quick Actions",
    },
    {
      id: "test-webhook",
      label: "Test Webhook",
      icon: Send,
      shortcut: "⌥W",
      action: testWebhook,
      category: "Quick Actions",
    },
    {
      id: "export-analytics",
      label: "Export Analytics",
      icon: Download,
      shortcut: "⌥E",
      action: exportAnalytics,
      category: "Quick Actions",
    },
    {
      id: "view-logs",
      label: "View Live Logs",
      icon: FileText,
      shortcut: "⌥L",
      action: () => navigateTo("/command-center?tab=activity&filter=live"),
      category: "Quick Actions",
    },
    {
      id: "refresh-data",
      label: "Refresh All Data",
      icon: RefreshCw,
      shortcut: "⌥R",
      action: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Data Refreshed",
          description: "All data has been refreshed successfully.",
        });
        setOpen(false);
      },
      category: "Quick Actions",
    },
    {
      id: "copy-api-endpoint",
      label: "Copy API Endpoint",
      icon: Copy,
      shortcut: "⌥C",
      action: () => {
        const endpoint = `${window.location.origin}/api/v1`;
        navigator.clipboard.writeText(endpoint);
        toast({
          title: "Copied",
          description: "API endpoint copied to clipboard",
        });
        setOpen(false);
      },
      category: "Quick Actions",
    },

    // User Actions
    {
      id: "view-profile",
      label: "View Profile",
      icon: User,
      action: () => navigateTo("/dashboard"),
      category: "User",
    },
    {
      id: "view-alerts",
      label: "View Alerts",
      icon: Bell,
      action: () => navigateTo("/alerts"),
      category: "User",
    },
    {
      id: "logout",
      label: "Logout",
      icon: LogOut,
      action: async () => {
        await apiRequest("POST", "/api/auth/logout");
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/auth");
        setOpen(false);
      },
      category: "User",
    },

    // Admin Actions (if user is admin)
    ...(user?.role === "admin"
      ? [
          {
            id: "upload-leads",
            label: "Upload Leads",
            icon: Upload,
            action: () => navigateTo("/admin/upload-leads"),
            category: "Admin",
          },
          {
            id: "manage-users",
            label: "Manage Users",
            icon: Shield,
            action: () => navigateTo("/admin/customers"),
            category: "Admin",
          },
        ]
      : []),
  ];

  // Group commands by category
  const groupedCommands = commands.reduce((acc, cmd) => {
    const category = cmd.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Filter commands based on search
  const filteredGroups = Object.entries(groupedCommands).reduce((acc, [category, items]) => {
    const filtered = items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, CommandItem[]>);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative gap-2 pr-2"
        data-testid="button-command-palette"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Command Palette</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogDescription className="sr-only">
          Command palette for quick navigation and actions
        </DialogDescription>
        <CommandInput
          ref={inputRef}
          placeholder="Type a command or search..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(filteredGroups).map(([category, items], index) => (
            <div key={category}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={category}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => item.action()}
                      className="flex items-center justify-between"
                      data-testid={`command-${item.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="w-4 h-4" />}
                        <span>{item.label}</span>
                      </div>
                      {item.shortcut && (
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                          {item.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}