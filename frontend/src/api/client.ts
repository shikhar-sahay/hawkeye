/**
 * HawkEye Frontend - API Client
 * Centralized API client with TanStack Query integration
 */

import type {
  Source,
  SourceCreate,
  SourceUpdate,
  ApiKey,
  ApiKeyCreate,
  ApiKeyResponse,
  NormalizedEvent,
  EventListParams,
  Alert,
  AlertListParams,
  AlertStatusUpdate,
  AlertStats,
  Incident,
  IncidentListParams,
  IncidentStatusUpdate,
  IncidentStats,
  RawEventIngest,
  BatchEventsIngest,
  EventIngestResponse,
  BatchIngestResponse,
  DashboardStats,
} from "@/types";

const API_BASE = "/api/v1";

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // ==================== Sources ====================

  async getSources(): Promise<Source[]> {
    return this.request<Source[]>("/sources");
  }

  async getSource(id: number): Promise<Source> {
    return this.request<Source>(`/sources/${id}`);
  }

  async createSource(data: SourceCreate): Promise<Source> {
    return this.request<Source>("/sources", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSource(id: number, data: SourceUpdate): Promise<Source> {
    return this.request<Source>(`/sources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteSource(id: number): Promise<void> {
    return this.request<void>(`/sources/${id}`, {
      method: "DELETE",
    });
  }

  // ==================== API Keys ====================

  async getApiKeys(sourceId: number): Promise<ApiKey[]> {
    return this.request<ApiKey[]>(`/sources/${sourceId}/api-keys`);
  }

  async createApiKey(sourceId: number, data: ApiKeyCreate): Promise<ApiKeyResponse> {
    return this.request<ApiKeyResponse>(`/sources/${sourceId}/api-keys`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokeApiKey(sourceId: number, keyId: number): Promise<void> {
    return this.request<void>(`/sources/${sourceId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
  }

  // ==================== Events ====================

  async getEvents(params: EventListParams = {}): Promise<{ events: NormalizedEvent[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return this.request(`/events/query?${searchParams.toString()}`);
  }

  async getEvent(id: number): Promise<NormalizedEvent> {
    return this.request<NormalizedEvent>(`/events/${id}`);
  }

  async getEventAlerts(eventId: number): Promise<Alert[]> {
    return this.request<Alert[]>(`/events/${eventId}/alerts`);
  }

  // ==================== Alerts ====================

  async getAlerts(params: AlertListParams = {}): Promise<{ alerts: Alert[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return this.request(`/alerts?${searchParams.toString()}`);
  }

  async getAlert(id: number): Promise<Alert> {
    return this.request<Alert>(`/alerts/${id}`);
  }

  async updateAlertStatus(id: number, data: AlertStatusUpdate): Promise<Alert> {
    return this.request<Alert>(`/alerts/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getAlertStats(): Promise<AlertStats> {
    return this.request<AlertStats>("/alerts/stats");
  }

  // ==================== Incidents ====================

  async getIncidents(params: IncidentListParams = {}): Promise<{ incidents: Incident[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return this.request(`/incidents?${searchParams.toString()}`);
  }

  async getIncident(id: number): Promise<Incident> {
    return this.request<Incident>(`/incidents/${id}`);
  }

  async getIncidentAlerts(incidentId: number): Promise<Alert[]> {
    return this.request<Alert[]>(`/incidents/${incidentId}/alerts`);
  }

  async updateIncidentStatus(id: number, data: IncidentStatusUpdate): Promise<Incident> {
    return this.request<Incident>(`/incidents/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getIncidentStats(): Promise<IncidentStats> {
    return this.request<IncidentStats>("/incidents/stats");
  }

  // ==================== Ingestion ====================

  async ingestEvent(data: RawEventIngest): Promise<EventIngestResponse> {
    return this.request<EventIngestResponse>("/events/ingest", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async ingestBatch(data: BatchEventsIngest): Promise<BatchIngestResponse> {
    return this.request<BatchIngestResponse>("/events/ingest/batch", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ==================== Dashboard ====================

  async getDashboardStats(): Promise<DashboardStats> {
    const [alertStats, incidentStats] = await Promise.all([
      this.getAlertStats(),
      this.getIncidentStats(),
    ]);

    const sources = await this.getSources();

    return {
      alerts: alertStats,
      incidents: incidentStats,
      sources: {
        total: sources.length,
        active: sources.filter((s) => s.is_active).length,
        inactive: sources.filter((s) => !s.is_active).length,
      },
      events_24h: 0, // Would need a separate endpoint
    };
  }
}

export const apiClient = new ApiClient();

// ==================== Query Keys ====================

export const queryKeys = {
  sources: {
    all: ["sources"] as const,
    detail: (id: number) => ["sources", id] as const,
  },
  apiKeys: {
    all: (sourceId: number) => ["sources", sourceId, "api-keys"] as const,
  },
  events: {
    all: ["events"] as const,
    list: (params: EventListParams) => ["events", "list", params] as const,
    detail: (id: number) => ["events", id] as const,
    alerts: (eventId: number) => ["events", eventId, "alerts"] as const,
  },
  alerts: {
    all: ["alerts"] as const,
    list: (params: AlertListParams) => ["alerts", "list", params] as const,
    detail: (id: number) => ["alerts", id] as const,
    stats: ["alerts", "stats"] as const,
  },
  incidents: {
    all: ["incidents"] as const,
    list: (params: IncidentListParams) => ["incidents", "list", params] as const,
    detail: (id: number) => ["incidents", id] as const,
    alerts: (incidentId: number) => ["incidents", incidentId, "alerts"] as const,
    stats: ["incidents", "stats"] as const,
  },
  dashboard: {
    stats: ["dashboard", "stats"] as const,
  },
};