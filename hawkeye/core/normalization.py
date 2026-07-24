"""Normalization engine - converts raw events to normalized schema."""

from datetime import datetime

from hawkeye.models.events import NormalizedEvent, RawEvent
from hawkeye.schemas.ingestion import RawEventIngest

# Category inference from event type
EVENT_CATEGORIES = {
    # Authentication
    "login": "authentication",
    "login_success": "authentication",
    "login_failed": "authentication",
    "logout": "authentication",
    "password_reset": "authentication",
    "account_locked": "authentication",
    "mfa_enabled": "authentication",
    "mfa_disabled": "authentication",
    "mfa_challenge": "authentication",
    # HTTP
    "http_request": "http",
    "http_response": "http",
    "api_access": "http",
    "rate_limit_exceeded": "http",
    "http_exception": "http",
    # Application
    "user_created": "application",
    "user_deleted": "application",
    "data_export": "application",
    "api_key_created": "application",
    "billing_change": "application",
    "admin_action": "application",
    "role_changed": "application",
    # Browser
    "devtools_detected": "browser",
    "headless_browser_detected": "browser",
    "automation_detected": "browser",
    "cookie_tampering": "browser",
    "localstorage_tampering": "browser",
    "csp_violation": "browser",
    "token_removed": "browser",
    "integrity_failure": "browser",
}

# MITRE ATT&CK mappings for known event types
MITRE_MAPPINGS = {
    "login_failed": ("TA0006", "T1110"),      # Credential Access / Brute Force
    "login_success": ("TA0006", "T1078"),     # Credential Access / Valid Accounts
    "account_locked": ("TA0006", "T1110"),    # Credential Access / Brute Force
    "password_reset": ("TA0006", "T1078"),    # Credential Access / Valid Accounts
    "privilege_escalation": ("TA0004", "T1068"), # Privilege Escalation / Exploitation for Privilege Escalation
    "admin_action": ("TA0004", "T1098"),      # Privilege Escalation / Account Manipulation
    "data_export": ("TA0010", "T1005"),       # Exfiltration / Data from Local System
    "api_key_created": ("TA0005", "T1602"),   # Defense Evasion / External Remote Services
    "role_changed": ("TA0005", "T1098"),      # Defense Evasion / Account Manipulation
    "automation_detected": ("TA0007", "T1588"), # Discovery / Obtain Capabilities (bot detection)
    "headless_browser_detected": ("TA0007", "T1588"),
    "devtools_detected": ("TA0007", "T1588"),
    "csp_violation": ("TA0005", "T1036"),     # Defense Evasion / Masquerading
    "cookie_tampering": ("TA0005", "T1556"),  # Defense Evasion / Modify Authentication Process
    "localstorage_tampering": ("TA0005", "T1556"),
    "token_removed": ("TA0006", "T1528"),     # Credential Access / Steal Application Access Token
    "integrity_failure": ("TA0005", "T1565"), # Defense Evasion / Data Manipulation
}


# Severity inference
DEFAULT_SEVERITY = "low"
HIGH_SEVERITY_EVENTS = {
    "account_locked", "privilege_escalation",
    "admin_action", "data_export", "automation_detected",
    "headless_browser_detected", "cookie_tampering",
    "localstorage_tampering", "integrity_failure",
}
MEDIUM_SEVERITY_EVENTS = {
    "login_failed", "login", "mfa_challenge", "rate_limit_exceeded",
    "http_exception", "role_changed", "api_key_created",
    "csp_violation", "devtools_detected", "token_removed",
    "password_reset",
}


def infer_category(event_type: str) -> str:
    """Infer event category from event type."""
    return EVENT_CATEGORIES.get(event_type, "custom")


def infer_severity(event_type: str, status_code: int | None = None) -> str:
    """Infer severity from event type and optional status code."""
    if event_type in HIGH_SEVERITY_EVENTS:
        return "high"
    if event_type in MEDIUM_SEVERITY_EVENTS:
        return "medium"
    return DEFAULT_SEVERITY


def infer_mitre_tags(event_type: str) -> tuple[str | None, str | None]:
    """Infer MITRE ATT&CK tactic and technique from event type."""
    return MITRE_MAPPINGS.get(event_type, (None, None))


class NormalizationEngine:
    """Normalizes raw events from various sources into standard schema."""

    def normalize(self, raw: RawEventIngest, source_id: int) -> NormalizedEvent:
        """Normalize a raw event into the standard schema."""
        category = infer_category(raw.event_type)
        severity = infer_severity(raw.event_type, raw.status_code)
        mitre_tactic, mitre_technique = infer_mitre_tags(raw.event_type)

        # Build metadata from provided fields
        metadata = raw.metadata or {}
        if raw.route:
            metadata.setdefault("route", raw.route)
        if raw.method:
            metadata.setdefault("method", raw.method)
        if raw.status_code:
            metadata.setdefault("status_code", raw.status_code)

        normalized = NormalizedEvent(
            timestamp=raw.timestamp or datetime.utcnow(),
            source_id=source_id,
            category=category,
            event_type=raw.event_type,
            severity=severity,
            user_id=raw.user_id,
            session_id=raw.session_id,
            ip=raw.ip,
            user_agent=raw.user_agent,
            route=raw.route,
            method=raw.method,
            status_code=raw.status_code,
            event_metadata=metadata,
            mitre_tactic=mitre_tactic,
            mitre_technique=mitre_technique,
        )
        return normalized

    def create_raw_event(self, raw: RawEventIngest, source_id: int) -> RawEvent:
        """Create raw event record for audit trail."""
        return RawEvent(
            source_id=source_id,
            payload=raw.model_dump(exclude_none=True),
            client_ip=raw.ip,
            user_agent=raw.user_agent,
        )

    def normalize_batch(
        self, events: list[RawEventIngest], source_id: int
    ) -> list[tuple[NormalizedEvent, RawEvent]]:
        """Normalize a batch of events."""
        return [
            (self.normalize(e, source_id), self.create_raw_event(e, source_id))
            for e in events
        ]
