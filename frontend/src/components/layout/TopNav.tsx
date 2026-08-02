"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { useTheme } from "next-themes";
import {
  Bell,
  Search,
  Moon,
  Sun,
  LogOut,
  Shield,
  Menu,
  User,
} from "lucide-react";
import { ConnectionStatusInline } from "@/components/ConnectionStatusCard";
import { useConnectionStatusWithInit } from "@/context/WebSocketContext";
import { Logo } from "@/components/ui/logo";
import hawkeyeLogo from "@/assets/hawkeyelogo.png";

interface TopNavProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function TopNav({ onMenuClick, sidebarCollapsed }: TopNavProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  // Get connection status from shared WebSocket context
  const wsStatus = useConnectionStatusWithInit();

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const isDark = theme === "dark";

  // Handle search - navigate to Events page with search query
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
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
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left section: Logo when sidebar collapsed, mobile menu button */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden flex-shrink-0"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo when sidebar collapsed */}
          {sidebarCollapsed && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Logo size={24} />
              <span className="text-lg font-bold tracking-tight text-foreground">Hawkeye</span>
            </div>
          )}
        </div>

        {/* Center section: Search - prominent and centered */}
        <div className="relative flex-1 max-w-2xl mx-8 hidden sm:block min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search alerts, incidents, sources..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="pl-10 pr-10 h-10 text-sm"
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
        <div className="flex items-center gap-2 flex-shrink-0">
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
          <Button variant="ghost" size="icon" aria-label="Notifications" title="Notifications">
            <Bell className="h-5 w-5" />
          </Button>

          {/* User menu with Hawkeye logo avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                <Avatar className="h-9 w-9 overflow-hidden">
                  <img
                    src={hawkeyeLogo}
                    alt="Hawkeye"
                    className="h-full w-full object-cover"
                  />
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