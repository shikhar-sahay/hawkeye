"""WebSocket API for real-time alerts and incidents."""

import asyncio
import contextlib
import logging
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
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

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


class ConnectionManager:
    """
    Manages WebSocket connections for real-time alert/incident broadcasting.

    Supports:
    - Multiple simultaneous connections
    - Per-source authentication and isolation
    - Subscription-based filtering (alerts, incidents, or both)
    - Heartbeat/ping-pong for connection health
    - Graceful connection cleanup
    """

    def __init__(self, heartbeat_interval: int = 30) -> None:
        """Initialize the connection manager.

        Args:
            heartbeat_interval: Seconds between heartbeat pings
        """
        self._connections: dict[str, ConnectionInfo] = {}
        self._heartbeat_interval = heartbeat_interval
        self._heartbeat_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

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

        logger.info(
            "WebSocket connected: connection_id=%s, source_id=%s, source_name=%s, subscriptions=%s",
            connection_id,
            source.id,
            source.name,
            subscriptions,
        )
        return connection_id

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
                conn_info.source.id,
            )
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
        message = {
            "type": "alert",
            "timestamp": datetime.utcnow().isoformat() + "Z",
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
        message = {
            "type": "incident",
            "timestamp": datetime.utcnow().isoformat() + "Z",
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
        message = {
            "type": message_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
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

        if sent_count > 0:
            logger.debug(
                "Broadcast %s to %d connections (type=%s, source_id=%s)",
                message["type"],
                sent_count,
                subscription_type,
                source_id,
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

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in heartbeat loop")


# Global connection manager instance
connection_manager = ConnectionManager(heartbeat_interval=settings.frontend_ws_heartbeat_seconds)


async def get_ws_source(
    websocket: WebSocket,
    api_key: str = Query(..., alias="api_key"),
    session: AsyncSession = Depends(get_db_session),
) -> ApplicationSource:
    """
    WebSocket authentication dependency.

    Validates API key from query parameter and returns the associated source.
    """
    if not api_key:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="API key required")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="API key required")

    from hawkeye.core.auth import hash_api_key

    key_hash = hash_api_key(api_key)

    result = await session.exec(
        select(ApiKey)
        .where(ApiKey.key_hash == key_hash)
        .where(ApiKey.is_active)
    )
    api_key_obj = result.first()

    if not api_key_obj:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid API key")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid API key")

    result = await session.exec(
        select(ApplicationSource).where(ApplicationSource.id == api_key_obj.source_id)
    )
    source = result.first()

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

    Query Parameters:
        api_key: API key for authentication (required)
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
        await websocket.send_json(_connected_message(connection_id, source, subscriptions))
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
    connection_id: str, source: ApplicationSource, subscriptions: set[str]
) -> dict[str, Any]:
    """Create connected confirmation message."""
    return {
        "type": "connected",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "data": {
            "connection_id": connection_id,
            "source_id": source.id,
            "source_name": source.name,
            "subscriptions": list(subscriptions),
        },
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

    else:
        logger.debug("Unknown WebSocket message type: %s", msg_type)


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
