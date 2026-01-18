from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from datetime import datetime, timezone
import threading
import time
import random
import os

app = Flask(__name__)
CORS(app)

EVENTS = []
ATTACK_CHAINS = []
RISK_SCORE = 0
LOCK = threading.Lock()

MITRE_MAP = {
    "route_probe": ("Reconnaissance", "T1595"),
    "port_scan": ("Reconnaissance", "T1046"),
    "login_failure": ("Credential Access", "T1110"),
    "brute_force": ("Credential Access", "T1110"),
    "privilege_escalation": ("Privilege Escalation", "T1068"),
    "lateral_movement": ("Lateral Movement", "T1021"),
    "honeypot_access": ("Command and Control", "T1071"),
    "page_view": ("Discovery", "T1082"),
    "click": ("Collection", "T1115")
}

ATTACK_ORDER = [
    "route_probe",
    "port_scan",
    "login_failure",
    "brute_force",
    "privilege_escalation",
    "lateral_movement",
    "honeypot_access"
]

def progression_risk():
    if not ATTACK_CHAINS:
        return 0
    chain = ATTACK_CHAINS[-1]
    return int((len(chain) / len(ATTACK_ORDER)) * 100)

def calculate_risk(severity):
    if severity == "high":
        return 20
    if severity == "medium":
        return 10
    return 3

def enrich_event(event_type, severity, source, ip=None):
    tactic, technique = MITRE_MAP.get(event_type, ("Unknown", "N/A"))
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "event_type": event_type,
        "severity": severity,
        "ip": ip or "internal",
        "geo": random.choice(["IN", "US", "RU", "CN", "DE"]),
        "threat_score": random.randint(20, 90),
        "mitre_tactic": tactic,
        "mitre_technique": technique
    }


def correlate_event(event):
    if not ATTACK_CHAINS:
        ATTACK_CHAINS.append([event])
        return

    last_chain = ATTACK_CHAINS[-1]
    last_event = last_chain[-1]

    if event["event_type"] in ATTACK_ORDER and last_event["event_type"] in ATTACK_ORDER:
        if ATTACK_ORDER.index(event["event_type"]) >= ATTACK_ORDER.index(last_event["event_type"]):
            last_chain.append(event)
            return

    ATTACK_CHAINS.append([event])

def simulator():
    global RISK_SCORE
    stage = 0
    while True:
        event_type = ATTACK_ORDER[stage]
        severity = "low"
        if event_type in ["brute_force", "privilege_escalation"]:
            severity = "medium"
        if event_type == "honeypot_access":
            severity = "high"

        event = enrich_event(event_type, severity, "simulator", ip="127.0.0.1")

        with LOCK:
            EVENTS.append(event)
            correlate_event(event)
            RISK_SCORE = min(RISK_SCORE + calculate_risk(severity), 100)

        stage = (stage + 1) % len(ATTACK_ORDER)
        time.sleep(3)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/events")
def get_events():
    with LOCK:
        return jsonify({"events": EVENTS[-100:]})

@app.route("/risk")
def risk():
    return jsonify({
        "risk_score": RISK_SCORE,
        "progression_risk": progression_risk()
    })

@app.route("/attack-graph")
def attack_graph():
    if not ATTACK_CHAINS:
        return jsonify({"nodes": [], "edges": []})

    chain = ATTACK_CHAINS[-1]
    nodes = [f'{e["event_type"]}\n{e["mitre_technique"]}' for e in chain]
    edges = [(i, i + 1) for i in range(len(nodes) - 1)]

    return jsonify({"nodes": nodes, "edges": edges})

@app.route("/honeypot")
def honeypot():
    global RISK_SCORE
    event = enrich_event(
    "honeypot_access",
    "high",
    "honeypot",
    ip=request.headers.get("X-Forwarded-For", request.remote_addr)
)
    with LOCK:
        EVENTS.append(event)
        correlate_event(event)
        RISK_SCORE = min(RISK_SCORE + calculate_risk("high"), 100)
    return jsonify({"status": "ok"})

@app.route("/logs", methods=["POST"])
def upload_logs():
    return jsonify({"message": "Log upload not implemented yet"})

@app.route("/ingest", methods=["POST"])
def ingest():
    data = request.json or {}

    event_type = data.get("event_type", "web_event")
    severity = "low"

    event = enrich_event(
        event_type,
        "low",
        "shwikky_frontend",
        ip=request.headers.get("X-Forwarded-For", request.remote_addr)
    )
    event["details"] = data

    with LOCK:
        EVENTS.append(event)

    return jsonify({"status": "ok"})

if __name__ == "__main__":
    threading.Thread(target=simulator, daemon=True).start()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
