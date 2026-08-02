import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  })
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

export function getSeverityColor(severity: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'text-destructive bg-destructive/10 border-destructive/20'
    case 'high':
      return 'text-orange-600 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800'
    case 'medium':
      return 'text-yellow-600 bg-yellow-100 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-800'
    case 'low':
      return 'text-blue-600 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800'
    case 'info':
      return 'text-sky-600 bg-sky-100 border-sky-200 dark:text-sky-400 dark:bg-sky-900/30 dark:border-sky-800'
    default:
      return 'text-muted-foreground bg-muted border-border'
  }
}

export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'open':
      return 'text-destructive bg-destructive/10 border-destructive/20'
    case 'acknowledged':
      return 'text-orange-600 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800'
    case 'investigating':
      return 'text-blue-600 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800'
    case 'resolved':
      return 'text-green-600 bg-green-100 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800'
    case 'suppressed':
      return 'text-muted-foreground bg-muted border-border'
    default:
      return 'text-muted-foreground bg-muted border-border'
  }
}

export function getDetectionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    brute_force: 'Brute Force',
    credential_stuffing: 'Credential Stuffing',
    enumeration: 'Enumeration',
    bot: 'Bot Activity',
    sensitive_action: 'Sensitive Action',
    session_hijacking: 'Session Hijacking',
    api_abuse: 'API Abuse',
  }
  return labels[type] || type
}

export function getMitreTacticLabel(tactic: string): string {
  const labels: Record<string, string> = {
    reconnaissance: 'Reconnaissance',
    resource_development: 'Resource Development',
    initial_access: 'Initial Access',
    execution: 'Execution',
    persistence: 'Persistence',
    privilege_escalation: 'Privilege Escalation',
    defense_evasion: 'Defense Evasion',
    credential_access: 'Credential Access',
    discovery: 'Discovery',
    lateral_movement: 'Lateral Movement',
    collection: 'Collection',
    command_and_control: 'Command & Control',
    exfiltration: 'Exfiltration',
    impact: 'Impact',
  }
  return labels[tactic] || tactic
}

export function getSeverityBadgeVariant(severity: string): "default" | "destructive" | "outline" | "secondary" {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'destructive'
    case 'high':
      return 'default'
    case 'medium':
      return 'secondary'
    case 'low':
      return 'outline'
    default:
      return 'outline'
  }
}

export function getStatusBadgeVariant(status: string): "default" | "destructive" | "outline" | "secondary" {
  switch (status?.toLowerCase()) {
    case 'open':
      return 'destructive'
    case 'acknowledged':
      return 'default'
    case 'investigating':
      return 'default'
    case 'resolved':
      return 'secondary'
    case 'suppressed':
      return 'outline'
    case 'closed':
      return 'outline'
    default:
      return 'outline'
  }
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
