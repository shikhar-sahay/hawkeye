"""Enumeration types for HawkEye models."""

from enum import Enum


class EventCategory(str, Enum):
    """High-level event categories."""

    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    HTTP = "http"
    APPLICATION = "application"
    BROWSER = "browser"
    CUSTOM = "custom"


class EventType(str, Enum):
    """Standardized event types."""

    # Authentication
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"
    ACCOUNT_LOCKED = "account_locked"
    MFA_ENABLED = "mfa_enabled"
    MFA_DISABLED = "mfa_disabled"

    # Authorization
    ADMIN_ACCESS = "admin_access"
    PERMISSION_DENIED = "permission_denied"
    ROLE_CHANGED = "role_changed"
    PRIVILEGE_ESCALATION = "privilege_escalation"

    # HTTP
    REQUEST = "request"
    RESPONSE = "response"
    API_ACCESS = "api_access"
    RATE_LIMITED = "rate_limited"
    EXCEPTION = "exception"

    # Application
    USER_CREATED = "user_created"
    USER_DELETED = "user_deleted"
    DATA_EXPORT = "data_export"
    API_KEY_CREATED = "api_key_created"
    BILLING_CHANGE = "billing_change"

    # Browser
    DEVTOOLS_DETECTED = "devtools_detected"
    HEADLESS_DETECTED = "headless_detected"
    AUTOMATION_DETECTED = "automation_detected"
    COOKIE_TAMPERED = "cookie_tampered"
    LOCALSTORAGE_TAMPERED = "localstorage_tampered"
    CSP_VIOLATION = "csp_violation"
    TOKEN_REMOVED = "token_removed"
    INTEGRITY_FAILURE = "integrity_failure"


class Severity(str, Enum):
    """Event/alert severity levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

    @property
    def weight(self) -> int:
        """Numeric weight for scoring."""
        return {"low": 1, "medium": 3, "high": 7, "critical": 15}[self.value]


class AlertStatus(str, Enum):
    """Alert processing status."""

    NEW = "new"
    PROCESSING = "processing"
    CORRELATED = "correlated"
    DISMISSED = "dismissed"


class IncidentStatus(str, Enum):
    """Incident lifecycle status."""

    OPEN = "open"
    INVESTIGATING = "investigating"
    CONTAINED = "contained"
    RESOLVED = "resolved"
    CLOSED = "closed"


class IncidentSeverity(str, Enum):
    """Incident severity (derived from alerts)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DetectionType(str, Enum):
    """Types of detection rules."""

    BRUTE_FORCE = "brute_force"
    CREDENTIAL_STUFFING = "credential_stuffing"
    ENUMERATION = "enumeration"
    BOT_DETECTION = "bot_detection"
    SENSITIVE_ACTION = "sensitive_action"
    SESSION_HIJACKING = "session_hijacking"
    API_ABUSE = "api_abuse"
