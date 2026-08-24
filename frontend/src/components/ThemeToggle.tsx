"use client";

import { Sun, Moon, Circle, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HAWKEYE_THEMES, setThemeAnimated } from "@/lib/theme";

const themeIcons: Record<string, typeof Sun> = {
  light: Sun,
  dark: Moon,
  black: Circle,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const ActiveIcon = themeIcons[theme ?? "dark"] ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <ActiveIcon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {HAWKEYE_THEMES.map((t) => {
          const Icon = themeIcons[t.value];
          return (
            <DropdownMenuItem
              key={t.value}
              onClick={() => setThemeAnimated(setTheme, t.value)}
              className={theme === t.value ? "bg-accent" : undefined}
            >
              <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
              <span className="flex-1">{t.label}</span>
              {theme === t.value && (
                <span className="text-xs text-muted-foreground">Active</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
