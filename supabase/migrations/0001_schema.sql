-- HawkEye Supabase migration 0001: base schema.
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   python scripts/generate_supabase_migration.py
-- Source of truth: SQLModel models in hawkeye/models/events.py
-- JSON columns stay JSON (not JSONB): all application queries use CAST
-- to VARCHAR for text matching, which works on both types.



CREATE TABLE application_sources (
	id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	api_key_hash VARCHAR(128), 
	description VARCHAR(500), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
)

;

CREATE INDEX ix_application_sources_name ON application_sources (name);

CREATE UNIQUE INDEX ix_application_sources_api_key_hash ON application_sources (api_key_hash);


CREATE TABLE api_keys (
	id SERIAL NOT NULL, 
	source_id INTEGER NOT NULL, 
	key_hash VARCHAR(128) NOT NULL, 
	key_prefix VARCHAR(20) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description VARCHAR(500), 
	is_active BOOLEAN NOT NULL, 
	last_used_at TIMESTAMP WITHOUT TIME ZONE, 
	expires_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(source_id) REFERENCES application_sources (id)
)

;

CREATE INDEX ix_api_keys_source_id ON api_keys (source_id);

CREATE UNIQUE INDEX ix_api_keys_key_hash ON api_keys (key_hash);


CREATE TABLE incidents (
	id SERIAL NOT NULL, 
	source_id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description TEXT, 
	severity VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	confidence FLOAT NOT NULL, 
	affected_ips JSON, 
	affected_users JSON, 
	affected_routes JSON, 
	mitre_tactics JSON, 
	mitre_techniques JSON, 
	first_event_at TIMESTAMP WITHOUT TIME ZONE, 
	last_event_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	closed_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(source_id) REFERENCES application_sources (id)
)

;

CREATE INDEX ix_incidents_first_event_at ON incidents (first_event_at);

CREATE INDEX ix_incidents_source_id ON incidents (source_id);

CREATE INDEX ix_incidents_created_at ON incidents (created_at);

CREATE INDEX ix_incidents_status ON incidents (status);

CREATE INDEX ix_incidents_severity ON incidents (severity);

CREATE INDEX ix_incidents_last_event_at ON incidents (last_event_at);


CREATE TABLE raw_events (
	id SERIAL NOT NULL, 
	source_id INTEGER NOT NULL, 
	received_at TIMESTAMP WITHOUT TIME ZONE, 
	event_timestamp TIMESTAMP WITHOUT TIME ZONE, 
	payload JSON, 
	headers JSON, 
	client_ip VARCHAR(45), 
	user_agent VARCHAR(500), 
	processed BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(source_id) REFERENCES application_sources (id)
)

;

CREATE INDEX ix_raw_events_processed ON raw_events (processed);

CREATE INDEX ix_raw_events_source_id ON raw_events (source_id);

CREATE INDEX ix_raw_events_event_timestamp ON raw_events (event_timestamp);

CREATE INDEX ix_raw_events_received_at ON raw_events (received_at);


CREATE TABLE normalized_events (
	id SERIAL NOT NULL, 
	raw_event_id INTEGER, 
	source_id INTEGER NOT NULL, 
	timestamp TIMESTAMP WITHOUT TIME ZONE, 
	category VARCHAR(50) NOT NULL, 
	event_type VARCHAR(100) NOT NULL, 
	severity VARCHAR(20) NOT NULL, 
	user_id VARCHAR(100), 
	session_id VARCHAR(100), 
	ip VARCHAR(45), 
	user_agent VARCHAR(500), 
	route VARCHAR(500), 
	method VARCHAR(10), 
	status_code INTEGER, 
	event_metadata JSON, 
	mitre_tactic VARCHAR(100), 
	mitre_technique VARCHAR(50), 
	PRIMARY KEY (id), 
	FOREIGN KEY(raw_event_id) REFERENCES raw_events (id), 
	FOREIGN KEY(source_id) REFERENCES application_sources (id)
)

;

CREATE INDEX ix_normalized_events_event_type ON normalized_events (event_type);

CREATE INDEX ix_normalized_events_category ON normalized_events (category);

CREATE INDEX ix_normalized_events_source_id ON normalized_events (source_id);

CREATE UNIQUE INDEX ix_normalized_events_raw_event_id ON normalized_events (raw_event_id);

CREATE INDEX ix_normalized_events_user_id ON normalized_events (user_id);

CREATE INDEX ix_normalized_event_actor ON normalized_events (ip, user_id, session_id);

CREATE INDEX ix_normalized_events_route ON normalized_events (route);

CREATE INDEX ix_normalized_events_session_id ON normalized_events (session_id);

CREATE INDEX ix_normalized_events_timestamp ON normalized_events (timestamp);

CREATE INDEX ix_normalized_events_ip ON normalized_events (ip);

CREATE INDEX ix_normalized_event_lookup ON normalized_events (source_id, timestamp);

CREATE INDEX ix_normalized_events_severity ON normalized_events (severity);


CREATE TABLE alerts (
	id SERIAL NOT NULL, 
	source_id INTEGER NOT NULL, 
	event_id INTEGER NOT NULL, 
	detection_type VARCHAR(50) NOT NULL, 
	detector_name VARCHAR(100) NOT NULL, 
	severity VARCHAR(20) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description TEXT, 
	evidence JSON, 
	confidence FLOAT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(source_id) REFERENCES application_sources (id), 
	FOREIGN KEY(event_id) REFERENCES normalized_events (id)
)

;

CREATE INDEX ix_alerts_status ON alerts (status);

CREATE INDEX ix_alerts_source_id ON alerts (source_id);

CREATE INDEX ix_alerts_severity ON alerts (severity);

CREATE INDEX ix_alerts_created_at ON alerts (created_at);

CREATE INDEX ix_alerts_detection_type ON alerts (detection_type);

CREATE INDEX ix_alerts_event_id ON alerts (event_id);


CREATE TABLE incident_alerts (
	id SERIAL NOT NULL, 
	incident_id INTEGER NOT NULL, 
	alert_id INTEGER NOT NULL, 
	sequence INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_incident_alert UNIQUE (incident_id, alert_id), 
	FOREIGN KEY(incident_id) REFERENCES incidents (id), 
	FOREIGN KEY(alert_id) REFERENCES alerts (id)
)

;

CREATE INDEX ix_incident_alerts_alert_id ON incident_alerts (alert_id);

CREATE INDEX ix_incident_alerts_incident_id ON incident_alerts (incident_id);
