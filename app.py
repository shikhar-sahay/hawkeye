from flask import Flask, request, jsonify, render_template
from datetime import datetime
import threading
import time
import random
import os

app = Flask(__name__)

EVENTS = []
RISK_SCORE = 0
SOURCES = {}
ATTACK_PATHS = []
LOCK = threading.Lock()

@app.route("/")
def index():
    return render_template("index.html")

def calculate_risk(severity):
    if severity == "high":
        return 10
    if severity == "medium":
        return 5
    return 1

def correlate_event(event):
    source = event["source"]
    if source not in SOURCES:
        SOURCES[source] = []
    SOURCES[source].append(event)
    if len(SOURCES[source]) >= 3:
        chain = [e["event_type"] for e in SOURCES[source][-3:]]
        ATTACK_PATHS.append({
            "source": source,
            "path": chain,
            "timestamp": datetime.utcnow().isoformat()
        })
        return 15
    return 0

@app.route("/ingest", methods=["POST"])
def ingest_event():
    global RISK_SCORE
    data = request.json or {}
    event = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": data.get("source", request.remote_addr),
        "event_type": data.get("event_type", "unknown"),
        "severity": data.get("severity", "low"),
        "metadata": data.get("metadata", {})
    }
    with LOCK:
        EVENTS.append(event)
        RISK_SCORE += calculate_risk(event["severity"])
        RISK_SCORE += correlate_event(event)
    return jsonify({"status": "ingested"})

@app.route("/events")
def get_events():
    with LOCK:
        return jsonify(EVENTS[-50:])

@app.route("/risk")
def get_risk():
    return jsonify({"risk_score": RISK_SCORE})

@app.route("/attack-paths")
def get_attack_paths():
    with LOCK:
        return jsonify(ATTACK_PATHS[-10:])

@app.route("/honeypot")
def honeypot():
    global RISK_SCORE
    event = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": request.remote_addr,
        "event_type": "honeypot_access",
        "severity": "high",
        "metadata": {
            "path": request.path,
            "user_agent": request.headers.get("User-Agent")
        }
    }
    with LOCK:
        EVENTS.append(event)
        RISK_SCORE += calculate_risk("high")
        RISK_SCORE += correlate_event(event)
    return jsonify({"status": "ok"})

def simulate_attacks():
    global RISK_SCORE
    patterns = [
        ("route_probe", "low"),
        ("rapid_cart_activity", "medium"),
        ("bot_like_behavior", "medium"),
        ("honeypot_access", "high")
    ]
    while True:
        event_type, severity = random.choice(patterns)
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "source": "simulator",
            "event_type": event_type,
            "severity": severity,
            "metadata": {}
        }
        with LOCK:
            EVENTS.append(event)
            RISK_SCORE += calculate_risk(severity)
            RISK_SCORE += correlate_event(event)
        time.sleep(4)

if __name__ == "__main__":
    threading.Thread(target=simulate_attacks, daemon=True).start()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
