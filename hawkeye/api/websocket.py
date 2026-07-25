"""WebSocket API for real-time alerts and incidents."""

import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    Query,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hawkeye.config import settings
from hawkeye.database import get_session as get_db_session
from hawkeye.models.events import ApiKey, ApplicationSource

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


@dataclass
class ConnectionInfo:
    """Information about a connected WebSocket client."""

    connection_id: str
    websocket: WebSocket
    source: ApplicationSource
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_ping: datetime = field(default_factory=datetime.utcnow)
    subscriptions: set[str] = field(default_factory=set)
    # Reconnection support
    session_id: str = field(default_factory=lambda: str(uuid4()))
    last_event_id: int = 0


@dataclass
class SessionData:
    """Stores session data for reconnection support."""

    session_id: str
    connection_id: str
    source_id: int
    subscriptions: set[str]
    last_event_id: int
    # Store recent messages for replay (max 1000 per session)
    message_history: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def add_message(self, message: dict[str, Any], event_id: int) -> None:
        """Add a message to history and update last_event_id."""
        self.message_history.append(message)
        self.last_event_id = event_id
        self.updated_at = time.time()
        # Keep only last 1000 messages to prevent memory issues
        if len(self.message_history) > 1000:
            self.message_history = self.message_history[-1000:]

    def get_messages_since(self, event_id: int) -> list[dict[str, Any]]:
        """Get messages with event_id greater than the given id."""
        return [msg for msg in self.message_history if msg.get("event_id", 0) > event_id]


class ConnectionManager:
    """
    Manages WebSocket connections for real-time alert/incident broadcasting.

    Supports:
    - Multiple simultaneous connections
    - Per-source authentication and isolation
    - Subscription-based filtering (alerts, incidents, or both)
    - Heartbeat/ping-pong for connection health
    - Graceful connection cleanup
    - Reconnection with message replay
    """

    def __init__(self, heartbeat_interval: int = 30, session_ttl: int = 3600) -> None:
        """Initialize the connection manager.

        Args:
            heartbeat_interval: Seconds between heartbeat pings
            session_ttl: Seconds to keep session data after disconnect (default 1 hour)
        """
        self._connections: dict[str, ConnectionInfo] = {}
        self._sessions: dict[str, SessionData] = {}  # session_id -> SessionData
        self._heartbeat_interval = heartbeat_interval
        self._session_ttl = session_ttl
        self._heartbeat_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._event_counter = 0  # Monotonically increasing event ID

    def _next_event_id(self) -> int:
        """Get next event ID for message ordering."""
        self._event_counter += 1
        return self._event_counter

    async def start(self) -> None:
        """Start the heartbeat background task."""
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            logger.info("WebSocket heartbeat task started")

    async def stop(self) -> None:
        """Stop the heartbeat task and close all connections."""
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._heartbeat_task
        # Close all connections
        for conn_id in list(self._connections.keys()):
            await self.disconnect(conn_id)
        logger.info("WebSocket manager stopped")

    async def connect(
        self, websocket: WebSocket, source: ApplicationSource, subscriptions: set[str]
    ) -> str:
        """
        Accept a new WebSocket connection.

        Args:
            websocket: The WebSocket connection
            source: Authenticated application source
            subscriptions: Set of event types to subscribe to ('alerts', 'incidents')

        Returns:
            Connection ID
        """
        await websocket.accept()
        connection_id = str(uuid4())

        conn_info = ConnectionInfo(
            connection_id=connection_id,
            websocket=websocket,
            source=source,
            subscriptions=subscriptions,
        )

        async with self._lock:
            self._connections[connection_id] = conn_info
            # Create session for reconnection support
            session_id = conn_info.session_id
            self._sessions[session_id] = SessionData(
                session_id=session_id,
                connection_id=connection_id,
                source_id=source.id,
                subscriptions=subscriptions.copy(),
                last_event_id=0,
            )

        logger.info(
            "WebSocket connected: connection_id=%s, source_id=%s, source_name=%s, subscriptions=%s",
            connection_id,
            source.id,
            source.name,
            subscriptions,
        )
        return connection_id

    async def reconnect(
        self, websocket: WebSocket, session_id: str, last_event_id: int
    ) -> tuple[str, list[dict[str, Any]]] | None:
        """
        Reconnect a previous session.

        Args:
            websocket: New WebSocket connection
            session_id: Previous session ID
            last_event_id: Last event ID the client received

        Returns:
            Tuple of (new_connection_id, missed_messages) or None if session not found/expired
        """
        await websocket.accept()

        async with self._lock:
            session = self._sessions.get(session_id)

        if not session:
            logger.info("Reconnection failed: session %s not found", session_id)
            return None

        # Check if session belongs to the same source (validated by auth dependency)
        # Check session TTL
        if time.time() - session.updated_at > self._session_ttl:
            logger.info("Reconnection failed: session %s expired", session_id)
            async with self._lock:
                self._sessions.pop(session_id, None)
            return None

        # Get missed messages
        missed_messages = session.get_messages_since(last_event_id)

        # Create new connection with same session
        connection_id = str(uuid4())
        conn_info = ConnectionInfo(
            connection_id=connection_id,
            websocket=websocket,
            source=None,  # Will be set after auth
            subscriptions=session.subscriptions.copy(),
            session_id=session.session_id,
            last_event_id=session.last_event_id,
        )

        async with self._lock:
            self._connections[connection_id] = conn_info
            # Update session with new connection_id
            session.connection_id = connection_id
            session.updated_at = time.time()

        logger.info(
            "WebSocket reconnected: connection_id=%s, session_id=%s, missed_messages=%d",
            connection_id,
            session_id,
            len(missed_messages),
        )

        return connection_id, missed_messages

    async def resume_session(
        self, connection_id: str, session_id: str, last_event_id: int
    ) -> tuple[list[dict[str, Any]], ApplicationSource | None] | None:
        """
        Resume a previous session on an existing connection.

        Args:
            connection_id: Current connection ID
            session_id: Previous session ID to resume
            last_event_id: Last event ID the client received

        Returns:
            Tuple of (missed_messages, source) or None if session not found/expired
        """
        async with self._lock:
            session = self._sessions.get(session_id)
            conn_info = self._connections.get(connection_id)

        if not session:
            logger.info("Session resume failed: session %s not found", session_id)
            return None

        # Check session TTL
        if time.time() - session.updated_at > self._session_ttl:
            logger.info("Session resume failed: session %s expired", session_id)
            async with self._lock:
                self._sessions.pop(session_id, None)
            return None

        # Verify the session belongs to the same source as the current connection
        if conn_info and conn_info.source and session.source_id != conn_info.source.id:
            logger.warning(
                "Session resume failed: session %s belongs to source %s, not %s",
                session_id,
                session.source_id,
                conn_info.source.id if conn_info.source else "unknown",
            )
            return None

        # Get missed messages
        missed_messages = session.get_messages_since(last_event_id)

        # Update connection to use the resumed session
        if conn_info:
            async with self._lock:
                conn_info.session_id = session.session_id
                conn_info.last_event_id = session.last_event_id
                # Update subscriptions from session
                conn_info.subscriptions = session.subscriptions.copy()
                # Update session with current connection_id
                session.connection_id = connection_id
                session.updated_at = time.time()

        logger.info(
            "Session resumed: connection_id=%s, session_id=%s, missed_messages=%d",
            connection_id,
            session_id,
            len(missed_messages),
        )

        return missed_messages, conn_info.source if conn_info else None

    async def disconnect(self, connection_id: str) -> bool:
        """
        Disconnect and clean up a connection.

        Args:
            connection_id: Connection ID to disconnect

        Returns:
            True if connection was found and removed
        """
        async with self._lock:
            conn_info = self._connections.pop(connection_id, None)

        if conn_info:
            with contextlib.suppress(Exception):
                await conn_info.websocket.close()
            logger.info(
                "WebSocket disconnected: connection_id=%s, source_id=%s",
                connection_id,
                conn_info.source.id if conn_info.source else "unknown",
            )
            # Note: We keep session data for reconnection support
            # Session cleanup happens in _cleanup_expired_sessions
            return True
        return False

    def get_connection(self, connection_id: str) -> ConnectionInfo | None:
        """Get connection info by ID."""
        return self._connections.get(connection_id)

    def get_connections_for_source(self, source_id: int) -> list[ConnectionInfo]:
        """Get all connections for a specific source."""
        return [
            conn for conn in self._connections.values() if conn.source.id == source_id
        ]

    def get_all_connections(self) -> list[ConnectionInfo]:
        """Get all active connections."""
        return list(self._connections.values())

    def get_connection_count(self) -> int:
        """Get total number of active connections."""
        return len(self._connections)

    def get_source_connection_count(self, source_id: int) -> int:
        """Get number of connections for a specific source."""
        return len(self.get_connections_for_source(source_id))

    async def broadcast_alert(
        self, alert_data: dict[str, Any], source_id: int | None = None
    ) -> int:
        """
        Broadcast an alert to all subscribed connections.

        Args:
            alert_data: Alert payload to broadcast
            source_id: Optional source ID to filter connections (None = all sources)

        Returns:
            Number of connections that received the message
        """
        event_id = self._next_event_id()
        message = {
            "type": "alert",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_id": event_id,
            "data": alert_data,
        }
        return await self._broadcast(message, "alerts", source_id)

    async def broadcast_incident(
        self, incident_data: dict[str, Any], source_id: int | None = None
    ) -> int:
        """
        Broadcast an incident to all subscribed connections.

        Args:
            incident_data: Incident payload to broadcast
            source_id: Optional source ID to filter connections (None = all sources)

        Returns:
            Number of connections that received the message
        """
        event_id = self._next_event_id()
        message = {
            "type": "incident",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_id": event_id,
            "data": incident_data,
        }
        return await self._broadcast(message, "incidents", source_id)

    async def broadcast_custom(
        self, message_type: str, data: dict[str, Any], source_id: int | None = None
    ) -> int:
        """
        Broadcast a custom message type to all subscribed connections.

        Args:
            message_type: Custom message type identifier
            data: Payload to broadcast
            source_id: Optional source ID to filter connections

        Returns:
            Number of connections that received the message
        """
        event_id = self._next_event_id()
        message = {
            "type": message_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_id": event_id,
            "data": data,
        }
        return await self._broadcast(message, message_type, source_id)

    async def _broadcast(
        self, message: dict[str, Any], subscription_type: str, source_id: int | None = None
    ) -> int:
        """Internal broadcast method."""
        sent_count = 0
        dead_connections = []

        async with self._lock:
            connections = list(self._connections.values())

        for conn in connections:
            # Filter by source if specified
            if source_id is not None and conn.source.id != source_id:
                continue

            # Filter by subscription
            if subscription_type not in conn.subscriptions:
                continue

            try:
                await conn.websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(
                    "Failed to send to connection %s: %s",
                    conn.connection_id,
                    e,
                )
                dead_connections.append(conn.connection_id)

        # Clean up dead connections
        for conn_id in dead_connections:
            await self.disconnect(conn_id)

        # Store message in session history for replay
        if sent_count > 0:
            event_id = message.get("event_id", 0)
            async with self._lock:
                for conn in connections:
                    if source_id is not None and conn.source.id != source_id:
                        continue
                    if subscription_type not in conn.subscriptions:
                        continue
                    session = self._sessions.get(conn.session_id)
                    if session:
                        session.add_message(message, event_id)

            logger.debug(
                "Broadcast %s to %d connections (type=%s, source_id=%s, event_id=%d)",
                message["type"],
                sent_count,
                subscription_type,
                source_id,
                event_id,
            )

        return sent_count

    async def send_to_connection(self, connection_id: str, message: dict[str, Any]) -> bool:
        """
        Send a message to a specific connection.

        Args:
            connection_id: Target connection ID
            message: Message to send

        Returns:
            True if sent successfully
        """
        conn = self.get_connection(connection_id)
        if not conn:
            return False

        try:
            await conn.websocket.send_json(message)
        except Exception as e:
            logger.warning("Failed to send to connection %s: %s", connection_id, e)
            await self.disconnect(connection_id)
            return False
        else:
            return True

    async def update_subscriptions(self, connection_id: str, subscriptions: set[str]) -> bool:
        """
        Update subscriptions for a connection.

        Args:
            connection_id: Connection ID
            subscriptions: New subscription set

        Returns:
            True if connection was found and updated
        """
        conn = self.get_connection(connection_id)
        if not conn:
            return False

        conn.subscriptions = subscriptions

        # Update session
        session = self._sessions.get(conn.session_id)
        if session:
            session.subscriptions = subscriptions.copy()
            session.updated_at = time.time()

        logger.info(
            "Updated subscriptions for connection %s: %s",
            connection_id,
            subscriptions,
        )
        return True

    async def handle_pong(self, connection_id: str) -> bool:
        """Handle pong response from client (heartbeat)."""
        conn = self.get_connection(connection_id)
        if not conn:
            return False

        conn.last_ping = datetime.utcnow()
        return True

    async def _heartbeat_loop(self) -> None:
        """Background task to send ping and clean up stale connections."""
        while True:
            try:
                await asyncio.sleep(self._heartbeat_interval)

                now = datetime.utcnow()
                stale_connections = []

                async with self._lock:
                    connections = list(self._connections.values())

                for conn in connections:
                    # Check if connection is stale (no pong for 2x heartbeat interval)
                    stale_threshold = self._heartbeat_interval * 2
                    if (now - conn.last_ping).total_seconds() > stale_threshold:
                        stale_connections.append(conn.connection_id)
                        continue

                    # Send ping
                    ping_msg = {"type": "ping", "timestamp": now.isoformat() + "Z"}
                    try:
                        await conn.websocket.send_json(ping_msg)
                    except Exception as e:
                        logger.warning(
                            "Ping failed for connection %s: %s",
                            conn.connection_id,
                            e,
                        )
                        stale_connections.append(conn.connection_id)

                # Disconnect stale connections
                for conn_id in stale_connections:
                    await self.disconnect(conn_id)
                    logger.info("Disconnected stale connection: %s", conn_id)

                # Clean up expired sessions
                await self._cleanup_expired_sessions()

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in heartbeat loop")

    async def _cleanup_expired_sessions(self) -> None:
        """Remove expired sessions from store."""
        now = time.time()
        expired_sessions = []

        async with self._lock:
            for session_id, session in self._sessions.items():
                if now - session.updated_at > self._session_ttl:
                    expired_sessions.append(session_id)

            for session_id in expired_sessions:
                self._sessions.pop(session_id, None)
                logger.debug("Cleaned up expired session: %s", session_id)

    def get_session(self, session_id: str) -> SessionData | None:
        """Get session data by ID."""
        return self._sessions.get(session_id)

    def get_stats(self) -> dict[str, Any]:
        """Get connection manager statistics."""
        return {
            "total_connections": len(self._connections),
            "total_sessions": len(self._sessions),
            "connections_by_source": {
                str(source_id): self.get_source_connection_count(source_id)
                for source_id in set(c.source.id for c in self._connections.values() if c.source)
            },
            "heartbeat_interval_seconds": self._heartbeat_interval,
            "session_ttl_seconds": self._session_ttl,
        }


# Global connection manager instance
connection_manager = ConnectionManager(
    heartbeat_interval=settings.frontend_ws_heartbeat_seconds,
    session_ttl=3600,  # 1 hour
)


async def get_ws_source(
    websocket: WebSocket,
    api_key_query: str | None = Query(None, alias="api_key"),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """
    WebSocket authentication dependency.

    Supports multiple authentication methods (in priority order):
    1. Authorization: Bearer <key> header
    2. X-API-Key header
    3. Query parameter: ?api_key=<key>
    """
    # Extract API key from headers (priority order)
    api_key = None

    # 1. Check Authorization: Bearer header
    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        api_key = auth_header[7:].strip()  # Remove "Bearer " prefix

    # 2. Check X-API-Key header
    if not api_key:
        api_key = websocket.headers.get("x-api-key")

    # 3. Fallback to query parameter
    if not api_key:
        api_key = api_key_query

    if not api_key:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="API key required")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="API key required")

    from hawkeye.core.auth import hash_api_key

    key_hash = hash_api_key(api_key)

    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.scalars().first()

    if not api_key_obj:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid API key")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid API key")

    result = await session.execute(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.scalars().first()

    if not source or not source.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Source inactive")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Source inactive")

    return source


@router.websocket("")
async def websocket_endpoint(
    websocket: WebSocket,
    source: ApplicationSource = Depends(get_ws_source),
    subscribe: str = Query(
        "alerts,incidents",
        description="Comma-separated subscriptions: alerts,incidents",
    ),
) -> None:
    """
    WebSocket endpoint for real-time alerts and incidents.

    Authentication (one of):
        - Authorization: Bearer <api_key> header
        - X-API-Key: <api_key> header
        - Query parameter: ?api_key=<api_key>

    Query Parameters:
        subscribe: Comma-separated event types to subscribe to (default: "alerts,incidents")
                   Valid values: "alerts", "incidents"

    Message Format (Server -> Client):
        {
            "type": "alert" | "incident" | "ping" | "pong" | "connected" | "error",
            "timestamp": "2026-01-01T00:00:00Z",
            "data": { ... }  // Present for alert/incident types
        }

    Message Format (Client -> Server):
        {
            "type": "pong" | "subscribe" | "unsubscribe",
            "data": { ... }  // For subscribe/unsubscribe: {"types": ["alerts", "incidents"]}
        }
    """
    # Parse subscriptions
    sub_types = {s.strip() for s in subscribe.split(",") if s.strip()}
    valid_types = {"alerts", "incidents"}
    subscriptions = sub_types & valid_types

    if not subscriptions:
        subscriptions = {"alerts", "incidents"}

    connection_id = await connection_manager.connect(websocket, source, subscriptions)

    # Send connection confirmation
    try:
        conn_info = connection_manager.get_connection(connection_id)
        session_id = conn_info.session_id if conn_info else None
        await websocket.send_json(_connected_message(connection_id, source, subscriptions, session_id))
    except Exception:
        await connection_manager.disconnect(connection_id)
        return

    try:
        while True:
            # Receive message from client
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning("WebSocket receive error for %s: %s", connection_id, e)
                break

            await _handle_ws_message(connection_id, data, subscriptions, valid_types)

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error for connection %s", connection_id)
    finally:
        await connection_manager.disconnect(connection_id)


def _connected_message(
    connection_id: str,
    source: ApplicationSource,
    subscriptions: set[str],
    session_id: str | None = None,
) -> dict[str, Any]:
    """Create connected confirmation message."""
    data = {
        "connection_id": connection_id,
        "source_id": source.id,
        "source_name": source.name,
        "subscriptions": list(subscriptions),
    }
    if session_id:
        data["session_id"] = session_id
    return {
        "type": "connected",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "data": data,
    }


async def _handle_ws_message(
    connection_id: str,
    data: dict[str, Any],
    subscriptions: set[str],
    valid_types: set[str],
) -> None:
    """Handle incoming WebSocket message."""
    msg_type = data.get("type")
    msg_data = data.get("data", {})

    if msg_type == "pong":
        await connection_manager.handle_pong(connection_id)

    elif msg_type == "subscribe":
        new_subs = set(msg_data.get("types", [])) & valid_types
        if new_subs:
            await connection_manager.update_subscriptions(
                connection_id, subscriptions | new_subs
            )
            subscriptions |= new_subs

    elif msg_type == "unsubscribe":
        remove_subs = set(msg_data.get("types", [])) & valid_types
        if remove_subs:
            await connection_manager.update_subscriptions(
                connection_id, subscriptions - remove_subs
            )
            subscriptions -= remove_subs

    elif msg_type == "ping":
        # Respond to client ping
        await connection_manager.send_to_connection(
            connection_id,
            {
                "type": "pong",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )

    elif msg_type == "reconnect":
        # Handle client reconnection request
        await _handle_reconnect(connection_id, msg_data, subscriptions, valid_types)

    else:
        logger.debug("Unknown WebSocket message type: %s", msg_type)


async def _handle_reconnect(
    connection_id: str,
    msg_data: dict[str, Any],
    subscriptions: set[str],
    valid_types: set[str],
) -> None:
    """Handle client reconnection request with session resume."""
    session_id = msg_data.get("session_id")
    last_event_id = msg_data.get("last_event_id", 0)

    if not session_id:
        logger.warning("Reconnect request from %s missing session_id", connection_id)
        await connection_manager.send_to_connection(
            connection_id,
            {
                "type": "error",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "data": {"code": "INVALID_RECONNECT", "message": "session_id required"},
            },
        )
        return

    # Get the session
    session = connection_manager.get_session(session_id)
    if not session:
        logger.info("Reconnection failed for session %s: session not found", session_id)
        await connection_manager.send_to_connection(
            connection_id,
            {
                "type": "error",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "data": {"code": "SESSION_EXPIRED", "message": "Session not found or expired"},
            },
        )
        return

    # Check session TTL
    if time.time() - session.updated_at > connection_manager._session_ttl:
        logger.info("Reconnection failed for session %s: session expired", session_id)
        await connection_manager.send_to_connection(
            connection_id,
            {
                "type": "error",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "data": {"code": "SESSION_EXPIRED", "message": "Session not found or expired"},
            },
        )
        async with connection_manager._lock:
            connection_manager._sessions.pop(session_id, None)
        return

    # Get current connection
    conn_info = connection_manager.get_connection(connection_id)
    if not conn_info:
        logger.warning("Reconnect request from unknown connection %s", connection_id)
        return

    # Get missed messages before updating session
    missed_messages = session.get_messages_since(last_event_id)

    # Update current connection to use the old session
    conn_info.session_id = session.session_id
    conn_info.last_event_id = session.last_event_id

    # Update session to point to current connection
    session.connection_id = connection_id
    session.subscriptions = subscriptions.copy()
    session.updated_at = time.time()

    # Send reconnected confirmation (with same connection_id but updated session)
    if conn_info.source:
        await connection_manager.send_to_connection(
            connection_id,
            _connected_message(connection_id, conn_info.source, subscriptions, session_id),
        )

    # Replay missed messages
    for msg in missed_messages:
        await connection_manager.send_to_connection(connection_id, msg)

    logger.info(
        "Client reconnected: connection=%s, session=%s, replayed=%d messages",
        connection_id,
        session_id,
        len(missed_messages),
    )


@router.get("/stats", tags=["websocket"])
async def websocket_stats() -> dict[str, Any]:
    """Get WebSocket connection statistics."""
    return {
        "total_connections": connection_manager.get_connection_count(),
        "connections_by_source": {
            str(source_id): connection_manager.get_source_connection_count(source_id)
            for source_id in set(c.source.id for c in connection_manager.get_all_connections())
        },
        "heartbeat_interval_seconds": connection_manager._heartbeat_interval,
    }


def get_connection_manager() -> ConnectionManager:
    """Dependency to get the connection manager instance."""
    return connection_manager
