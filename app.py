from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import random, time, threading, datetime, json

app = Flask(__name__)
CORS(app)

logs = []
attack_paths = []

def enrich_log(log):
    log['geo'] = random.choice(['New York, USA','London, UK','Mumbai, India','Berlin, Germany'])
    log['threat_score'] = random.randint(10,90)
    return log

def simulate_logs():
    event_types = ['failed_login','api_request','honeypot_trigger','file_access','error_spike']
    sources = ['webserver','app','system','honeypot']
    while True:
        log = {
            'timestamp': datetime.datetime.now().isoformat(),
            'source': random.choice(sources),
            'event': random.choice(event_types),
            'ip': f"192.168.{random.randint(0,255)}.{random.randint(0,255)}",
            'severity': random.choice(['low','medium','high']),
            'message': 'Simulated event'
        }
        log = enrich_log(log)
        logs.append(log)
        time.sleep(random.randint(1,3))

threading.Thread(target=simulate_logs, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/logs', methods=['GET','POST'])
def handle_logs():
    global logs
    if request.method == 'POST':
        uploaded_file = request.files.get('file')
        if uploaded_file:
            try:
                file_logs = json.load(uploaded_file)
                for log in file_logs:
                    logs.append(enrich_log(log))
                return jsonify({"status":"success","message":"Logs uploaded successfully"})
            except Exception as e:
                return jsonify({"status":"error","message": str(e)})
        return jsonify({"status":"error","message":"No file uploaded"})
    else:  
        return jsonify(logs[-50:])  

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
