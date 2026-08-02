"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import {
  Bell,
  Search,
  Moon,
  Sun,
  User,
  LogOut,
  Shield,
  Menu,
} from "lucide-react";
import { ConnectionStatusInline } from "@/components/ConnectionStatusCard";
import { useWebSocket } from "@/hooks/useWebSocket";

interface TopNavProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function TopNav({ onMenuClick, sidebarCollapsed }: TopNavProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const isDark = theme === "dark";

  // Get API key from localStorage for WebSocket auth
  const apiKey = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("hawkeye_api_key") || "";
  }, []);

  // WebSocket connection for status indicator
  const { status: wsStatus } = useWebSocket({
    apiKey,
    subscriptions: [],
    autoReconnect: true,
    onStatusChange: () => {}, // Status available via wsStatus
  });

  // Handle search - navigate to Events page with search query
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      // Navigate to Events page with search query
      navigate(`/events?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  // Handle search button click (for mobile/enter key alternative)
  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      navigate(`/events?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 z-30 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-200",
        sidebarCollapsed ? "left-16 right-0" : "left-64 right-0"
      )}
      role="banner"
    >
      <div className="flex h-full items-center gap-4 px-4 sm:px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search alerts, incidents, sources..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="pl-10"
            aria-label="Search"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={handleSearchSubmit}
            aria-label="Submit search"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <ConnectionStatusInline status={wsStatus} />

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="/assets/hawkeyelogo.png" alt="User" />
                  <AvatarFallback>SH</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">Security Admin</p>
                  <p className="text-xs text-muted-foreground">admin@hawkeye.local</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Shield className="mr-2 h-4 w-4" />
                Security Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive-focus">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}