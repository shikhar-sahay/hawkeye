from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from datetime import datetime, timezone
import threading, time, random, os

app = Flask(__name__)
CORS(app)

EVENTS, ATTACK_CHAINS = [], []
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
    "route_probe","port_scan","login_failure","brute_force",
    "privilege_escalation","lateral_movement","honeypot_access"
]

SIMULATED_SOURCES = {
    "scanner_eu": {"ip":"185.220.101.45","geo":{"city":"Frankfurt","country":"Germany","lat":50.11,"lon":8.68}},
    "botnet_cn": {"ip":"103.21.244.10","geo":{"city":"Shenzhen","country":"China","lat":22.54,"lon":114.05}},
    "tor_exit": {"ip":"51.68.174.12","geo":{"city":"Paris","country":"France","lat":48.85,"lon":2.35}},
    "cloud_probe_us": {"ip":"34.207.112.98","geo":{"city":"Ashburn","country":"USA","lat":39.04,"lon":-77.48}},
    "credential_stuffer_in": {"ip":"49.207.36.112","geo":{"city":"Bengaluru","country":"India","lat":12.97,"lon":77.59}}
}

def progression_risk():
    return int((len(ATTACK_CHAINS[-1])/len(ATTACK_ORDER))*100) if ATTACK_CHAINS else 0

def calculate_risk(severity):
    return {"high":20,"medium":10,"low":3}.get(severity,"low")

def enrich_event(event_type,severity,source,ip,geo):
    tactic,technique = MITRE_MAP.get(event_type,("Unknown","N/A"))
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "event_type": event_type,
        "severity": severity,
        "ip": ip,
        "geo": geo,
        "threat_score": random.randint(30,95),
        "mitre_tactic": tactic,
        "mitre_technique": technique
    }

def correlate_event(event):
    if not ATTACK_CHAINS: ATTACK_CHAINS.append([event]); return
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
    source_names = list(SIMULATED_SOURCES.keys())
    while True:
        source = random.choice(source_names)
        infra = SIMULATED_SOURCES[source]
        event_type = ATTACK_ORDER[stage]
        severity = "high" if event_type=="honeypot_access" else "medium" if event_type in ["brute_force","privilege_escalation"] else "low"
        event = enrich_event(event_type,severity,source,infra["ip"],infra["geo"])
        with LOCK:
            EVENTS.append(event)
            correlate_event(event)
        stage = (stage+1) % len(ATTACK_ORDER)
        time.sleep(2.5)

@app.route("/")
def index(): return render_template("index.html")
@app.route("/events")
def get_events(): 
    with LOCK: return jsonify({"events": EVENTS[-100:]})
@app.route("/risk")
def risk():
    with LOCK:
        base_risk = 0
        if ATTACK_CHAINS:
            chain = ATTACK_CHAINS[-1]
            for e in chain:
                base_risk += calculate_risk(e["severity"])
        risk_score = min(base_risk, 100)
        progression = int((len(ATTACK_CHAINS[-1])/len(ATTACK_ORDER))*100) if ATTACK_CHAINS else 0
        return jsonify({"risk_score": risk_score, "progression_risk": progression})
@app.route("/attack-graph")
def attack_graph():
    if not ATTACK_CHAINS: return jsonify({"nodes":[],"edges":[]})
    chain = ATTACK_CHAINS[-1]
    nodes = [f'{e["event_type"]}\n{e["mitre_technique"]}' for e in chain]
    edges = [(i,i+1) for i in range(len(nodes)-1)]
    return jsonify({"nodes":nodes,"edges":edges})

@app.route("/ingest", methods=["POST"])
def ingest():
    data = request.json or {}
    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "shwikky_frontend",
        "event_type": data.get("event_type","web_event"),
        "severity": "low",
        "ip": ip,
        "geo":{"country":"Unknown"},
        "threat_score":10,
        "details":data
    }
    with LOCK: EVENTS.append(event)
    return jsonify({"status":"ok"})

@app.route("/logs", methods=["POST"])
def upload_logs():
    if "file" not in request.files: return jsonify({"message":"No file uploaded"}),400
    file = request.files["file"]
    try:
        lines = file.read().decode("utf-8").splitlines()
    except Exception:
        return jsonify({"message":"Failed to read file"}),400

    added = 0
    with LOCK:
        for line in lines:
            line=line.strip()
            if not line: continue
            if "fail" in line.lower() or "invalid" in line.lower(): event_type="login_failure"; severity="medium"
            elif "admin" in line.lower() or "privilege" in line.lower(): event_type="privilege_escalation"; severity="high"
            elif "scan" in line.lower() or "probe" in line.lower(): event_type="route_probe"; severity="low"
            else: event_type="click"; severity="low"
            geo = random.choice(list(s["geo"] for s in SIMULATED_SOURCES.values()))
            ip = f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"
            event = enrich_event(event_type,severity,"uploaded_log",ip,geo)
            event["raw_line"]=line
            EVENTS.append(event)
            correlate_event(event)
            global RISK_SCORE
            added += 1
    return jsonify({"message":f"{added} log events ingested successfully"})

if __name__ == "__main__":
    threading.Thread(target=simulator,daemon=True).start()
    port=int(os.environ.get("PORT",5000))
    app.run(host="0.0.0.0",port=port)
