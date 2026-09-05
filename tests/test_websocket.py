"""Tests for WebSocket API."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from hawkeye.api.websocket import ConnectionManager, connection_manager
from hawkeye.core.auth import generate_api_key
from hawkeye.database import get_session
from hawkeye.main import app
from hawkeye.models.events import ApiKey, ApplicationSource


@pytest.fixture(scope="function")
async def test_source():
    """Create a test application source with API key."""
    async for session in get_session():
        source = ApplicationSource(name="Test Source", description="Test source for WebSocket")
        session.add(source)
        await session.commit()
        await session.refresh(source)

        api_key, key_hash = generate_api_key()
        key_prefix = api_key.split("_")[0] + "_" if "_" in api_key else api_key[:8]
        api_key_obj = ApiKey(
            source_id=source.id,
            key_hash=key_hash,
            key_prefix=key_prefix,
            name="Test Key",
            is_active=True,
        )
        session.add(api_key_obj)
        await session.commit()
        await session.refresh(api_key_obj)

        yield source, api_key


@pytest.fixture
async def ws_manager():
    """Create a fresh ConnectionManager for testing."""
    manager = ConnectionManager(heartbeat_interval=1)
    yield manager
    # Cleanup
    for conn_id in list(manager._connections.keys()):
        await manager.disconnect(conn_id)
    await manager.stop()


class TestConnectionManager:
    """Tests for ConnectionManager class."""

    @pytest.mark.asyncio
    async def test_connect_and_disconnect(self, ws_manager, test_source):
        """Test basic connection and disconnection."""
        source, _ = test_source

        # Mock WebSocket
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.close = AsyncMock()
        mock_ws.send_json = AsyncMock()

        connection_id = await ws_manager.connect(mock_ws, source, {"alerts"})

        assert connection_id in ws_manager._connections
        assert ws_manager.get_connection_count() == 1
        assert ws_manager.get_source_connection_count(source.id) == 1

        conn = ws_manager.get_connection(connection_id)
        assert conn is not None
        assert conn.source.id == source.id
        assert conn.subscriptions == {"alerts"}

        mock_ws.accept.assert_called_once()

        # Disconnect
        result = await ws_manager.disconnect(connection_id)
        assert result is True
        assert ws_manager.get_connection_count() == 0
        assert connection_id not in ws_manager._connections

    @pytest.mark.asyncio
    async def test_multiple_connections_same_source(self, ws_manager, test_source):
        """Test multiple connections from the same source."""
        source, _ = test_source

        mock_ws1 = AsyncMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.close = AsyncMock()
        mock_ws1.send_json = AsyncMock()

        mock_ws2 = AsyncMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.close = AsyncMock()
        mock_ws2.send_json = AsyncMock()

        conn_id1 = await ws_manager.connect(mock_ws1, source, {"alerts"})
        conn_id2 = await ws_manager.connect(mock_ws2, source, {"incidents"})

        assert conn_id1 != conn_id2
        assert ws_manager.get_connection_count() == 2
        assert ws_manager.get_source_connection_count(source.id) == 2

        connections = ws_manager.get_connections_for_source(source.id)
        assert len(connections) == 2

    @pytest.mark.asyncio
    async def test_subscription_filtering(self, ws_manager, test_source):
        """Test that broadcasts only go to subscribed connections."""
        source, _ = test_source

        # Connection subscribed to alerts only
        mock_ws_alerts = AsyncMock()
        mock_ws_alerts.accept = AsyncMock()
        mock_ws_alerts.close = AsyncMock()
        mock_ws_alerts.send_json = AsyncMock()

        # Connection subscribed to incidents only
        mock_ws_incidents = AsyncMock()
        mock_ws_incidents.accept = AsyncMock()
        mock_ws_incidents.close = AsyncMock()
        mock_ws_incidents.send_json = AsyncMock()

        # Connection subscribed to both
        mock_ws_both = AsyncMock()
        mock_ws_both.accept = AsyncMock()
        mock_ws_both.close = AsyncMock()
        mock_ws_both.send_json = AsyncMock()

        await ws_manager.connect(mock_ws_alerts, source, {"alerts"})
        await ws_manager.connect(mock_ws_incidents, source, {"incidents"})
        await ws_manager.connect(mock_ws_both, source, {"alerts", "incidents"})

        # Broadcast alert - should go to alerts and both
        alert_data = {"id": 1, "title": "Test Alert"}
        sent = await ws_manager.broadcast_alert(alert_data, source.id)

        assert sent == 2  # alerts + both
        mock_ws_alerts.send_json.assert_called_once()
        mock_ws_both.send_json.assert_called_once()
        mock_ws_incidents.send_json.assert_not_called()

        # Reset mocks
        mock_ws_alerts.send_json.reset_mock()
        mock_ws_incidents.send_json.reset_mock()
        mock_ws_both.send_json.reset_mock()

        # Broadcast incident - should go to incidents and both
        incident_data = {"id": 1, "title": "Test Incident"}
        sent = await ws_manager.broadcast_incident(incident_data, source.id)

        assert sent == 2  # incidents + both
        mock_ws_incidents.send_json.assert_called_once()
        mock_ws_both.send_json.assert_called_once()
        mock_ws_alerts.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_broadcast_to_all_sources(self, ws_manager):
        """Test broadcasting to all sources when source_id is None."""
        async for session in get_session():
            source1 = ApplicationSource(name="Source 1")
            source2 = ApplicationSource(name="Source 2")
            session.add_all([source1, source2])
            await session.commit()
            await session.refresh(source1)
            await session.refresh(source2)

        mock_ws1 = AsyncMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.close = AsyncMock()
        mock_ws1.send_json = AsyncMock()

        mock_ws2 = AsyncMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.close = AsyncMock()
        mock_ws2.send_json = AsyncMock()

        await ws_manager.connect(mock_ws1, source1, {"alerts"})
        await ws_manager.connect(mock_ws2, source2, {"alerts"})

        alert_data = {"id": 1, "title": "Broadcast Alert"}
        sent = await ws_manager.broadcast_alert(alert_data)  # No source_id

        assert sent == 2
        mock_ws1.send_json.assert_called_once()
        mock_ws2.send_json.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_subscriptions(self, ws_manager, test_source):
        """Test updating connection subscriptions."""
        source, _ = test_source

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.close = AsyncMock()
        mock_ws.send_json = AsyncMock()

        conn_id = await ws_manager.connect(mock_ws, source, {"alerts"})
        assert ws_manager.get_connection(conn_id).subscriptions == {"alerts"}

        # Add incidents subscription
        result = await ws_manager.update_subscriptions(conn_id, {"alerts", "incidents"})
        assert result is True
        assert ws_manager.get_connection(conn_id).subscriptions == {"alerts", "incidents"}

        # Remove alerts subscription
        result = await ws_manager.update_subscriptions(conn_id, {"incidents"})
        assert result is True
        assert ws_manager.get_connection(conn_id).subscriptions == {"incidents"}

        # Update non-existent connection
        result = await ws_manager.update_subscriptions("non-existent", {"alerts"})
        assert result is False

    @pytest.mark.asyncio
    async def test_send_to_connection(self, ws_manager, test_source):
        """Test sending message to specific connection."""
        source, _ = test_source

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.close = AsyncMock()
        mock_ws.send_json = AsyncMock()

        conn_id = await ws_manager.connect(mock_ws, source, {"alerts"})

        message = {"type": "custom", "data": "test"}
        result = await ws_manager.send_to_connection(conn_id, message)

        assert result is True
        mock_ws.send_json.assert_called_once_with(message)

        # Non-existent connection
        result = await ws_manager.send_to_connection("non-existent", message)
        assert result is False

    @pytest.mark.asyncio
    async def test_cleanup_on_send_failure(self, ws_manager, test_source):
        """Test that failed connections are cleaned up on broadcast."""
        source, _ = test_source

        mock_ws_good = AsyncMock()
        mock_ws_good.accept = AsyncMock()
        mock_ws_good.close = AsyncMock()
        mock_ws_good.send_json = AsyncMock()

        mock_ws_bad = AsyncMock()
        mock_ws_bad.accept = AsyncMock()
        mock_ws_bad.close = AsyncMock()
        mock_ws_bad.send_json = AsyncMock(side_effect=Exception("Connection lost"))

        await ws_manager.connect(mock_ws_good, source, {"alerts"})
        await ws_manager.connect(mock_ws_bad, source, {"alerts"})

        assert ws_manager.get_connection_count() == 2

        alert_data = {"id": 1, "title": "Test"}
        sent = await ws_manager.broadcast_alert(alert_data, source.id)

        assert sent == 1  # Only good connection received
        assert ws_manager.get_connection_count() == 1  # Bad connection cleaned up

    @pytest.mark.asyncio
    async def test_heartbeat_loop(self, ws_manager, test_source):
        """Test heartbeat ping/pong mechanism."""
        source, _ = test_source

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.close = AsyncMock()
        mock_ws.send_json = AsyncMock()

        conn_id = await ws_manager.connect(mock_ws, source, {"alerts"})

        # Start heartbeat (short interval for test)
        ws_manager._heartbeat_interval = 0.1
        await ws_manager.start()

        # Wait for at least one heartbeat cycle
        await asyncio.sleep(0.3)

        # Verify ping was sent
        ping_calls = [call for call in mock_ws.send_json.call_args_list
                      if call[0][0].get("type") == "ping"]
        assert len(ping_calls) >= 1

        await ws_manager.stop()


class TestWebSocketEndpoint:
    """Integration tests for WebSocket endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_websocket_requires_api_key(self, client):
        """Test that WebSocket requires API key."""
        # Connect without API key - should be rejected
        with pytest.raises(Exception), client.websocket_connect("/ws") as ws:
            pass  # Connection should be rejected

    def test_websocket_with_invalid_api_key(self, client):
        """Test WebSocket with invalid API key."""
        with pytest.raises(Exception):
            with client.websocket_connect("/ws?api_key=invalid_key") as ws:
                pass

    def test_websocket_with_bearer_token(self, client, test_source):
        """Test WebSocket with Authorization: Bearer header."""
        source, api_key = test_source

        with client.websocket_connect(
            "/ws",
            headers={"Authorization": f"Bearer {api_key}"},
        ) as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
            assert data["data"]["source_id"] == source.id
            assert "connection_id" in data["data"]

    def test_websocket_with_x_api_key_header(self, client, test_source):
        """Test WebSocket with X-API-Key header."""
        source, api_key = test_source

        with client.websocket_connect(
            "/ws",
            headers={"X-API-Key": api_key},
        ) as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
            assert data["data"]["source_id"] == source.id
            assert "connection_id" in data["data"]

    def test_websocket_with_query_param(self, client, test_source):
        """Test WebSocket with query parameter (backward compatibility)."""
        source, api_key = test_source

        with client.websocket_connect(f"/ws?api_key={api_key}") as ws:
            data = ws.receive_json()
            assert data["type"] == "connected"
            assert data["data"]["source_id"] == source.id
            assert "connection_id" in data["data"]

    def test_websocket_header_priority(self, client, test_source):
        """Test that Authorization header takes priority over X-API-Key over query param."""
        source, api_key = test_source

        # Create another source with different key
        from hawkeye.core.auth import generate_api_key
        from hawkeye.database import get_session
        from hawkeye.models.events import ApplicationSource, ApiKey
        import asyncio

        async def create_second_source():
            async for session in get_session():
                source2 = ApplicationSource(name="Source 2", description="Second source")
                session.add(source2)
                await session.commit()
                await session.refresh(source2)

                api_key2, key_hash2 = generate_api_key()
                api_key_obj2 = ApiKey(
                    source_id=source2.id,
                    key_hash=key_hash2,
                    name="Test Key 2",
                    is_active=True,
                )
                session.add(api_key_obj2)
                await session.commit()
                await session.refresh(api_key_obj2)
                return source2, api_key2

        source2, api_key2 = asyncio.run(create_second_source())

        # When both Authorization and X-API-Key are provided, Authorization should win
        with client.websocket_connect(
            "/ws",
            headers={
                "Authorization": f"Bearer {api_key}",
                "X-API-Key": api_key2,
            },
        ) as ws:
            data = ws.receive_json()
            # Should authenticate as source (first key), not source2
            assert data["data"]["source_id"] == source.id


class TestWebSocketStats:
    """Tests for WebSocket stats endpoint."""

    @pytest.mark.asyncio
    async def test_websocket_stats_endpoint(self, test_source):
        """Test /ws/stats endpoint returns connection statistics."""
        source, api_key = test_source

        # Create some connections
        mock_ws1 = AsyncMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.close = AsyncMock()
        mock_ws1.send_json = AsyncMock()

        mock_ws2 = AsyncMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.close = AsyncMock()
        mock_ws2.send_json = AsyncMock()

        await connection_manager.connect(mock_ws1, source, {"alerts"})
        await connection_manager.connect(mock_ws2, source, {"incidents"})

        # Get stats via HTTP
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/ws/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["total_connections"] == 2
        assert str(source.id) in data["connections_by_source"]
        assert data["connections_by_source"][str(source.id)] == 2
        assert data["heartbeat_interval_seconds"] == connection_manager._heartbeat_interval

        # Cleanup
        await connection_manager.disconnect(list(connection_manager._connections.keys())[0])
        await connection_manager.disconnect(list(connection_manager._connections.keys())[0])

class TestBroadcastSubscriptionRouting:
    """Event broadcasts must reach subscribers of the "events" bucket while
    keeping the wire message type "event" (singular). Regression tests for
    the singular/plural mismatch that silently dropped all live events."""

    def _source(self, source_id: int) -> ApplicationSource:
        return ApplicationSource(id=source_id, name=f"src-{source_id}")

    def _mock_ws(self) -> AsyncMock:
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.close = AsyncMock()
        mock_ws.send_json = AsyncMock()
        return mock_ws

    @pytest.mark.asyncio
    async def test_event_broadcast_reaches_events_subscribers(self, ws_manager):
        """broadcast_custom("event", ..., subscription_type="events") delivers
        to {"events"} subscribers with type "event" on the wire."""
        mock_ws = self._mock_ws()
        await ws_manager.connect(mock_ws, self._source(1), {"events"})

        sent = await ws_manager.broadcast_custom(
            "event", {"id": 1}, 1, subscription_type="events"
        )

        assert sent == 1
        payload = mock_ws.send_json.call_args[0][0]
        assert payload["type"] == "event"
        assert payload["data"] == {"id": 1}

    @pytest.mark.asyncio
    async def test_event_broadcast_skips_other_subscriptions(self, ws_manager):
        """An {"alerts"}-only subscriber must not receive event broadcasts."""
        mock_ws = self._mock_ws()
        await ws_manager.connect(mock_ws, self._source(1), {"alerts"})

        sent = await ws_manager.broadcast_custom(
            "event", {"id": 1}, 1, subscription_type="events"
        )

        assert sent == 0
        mock_ws.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_event_broadcast_scoped_to_source(self, ws_manager):
        """Event broadcasts only reach connections of the same source."""
        mock_ws = self._mock_ws()
        await ws_manager.connect(mock_ws, self._source(2), {"events"})

        sent = await ws_manager.broadcast_custom(
            "event", {"id": 1}, 1, subscription_type="events"
        )

        assert sent == 0
        mock_ws.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_default_subscription_type_matches_message_type(self, ws_manager):
        """Without subscription_type, the message type itself is the bucket
        (existing behavior for alerts/incidents)."""
        mock_ws = self._mock_ws()
        await ws_manager.connect(mock_ws, self._source(1), {"alerts"})

        sent = await ws_manager.broadcast_alert({"id": 7}, 1)

        assert sent == 1
        payload = mock_ws.send_json.call_args[0][0]
        assert payload["type"] == "alert"
