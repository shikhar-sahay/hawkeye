# 🦅 HawkEye – Attack Simulation & Risk Visualization Platform

HawkEye is a lightweight cybersecurity simulation and visualization platform that models attack behavior, correlates events into attack paths, and computes real‑time risk scores. It is designed for learning, demonstrations, and security analytics experimentation.

The project combines a Flask backend with a JavaScript frontend to simulate attacker activity, ingest logs, and visualize how threats progress over time.

---

## 🚀 Features

* **Real‑time attack simulation**

  * Simulates attacker behavior following a realistic kill‑chain style sequence
  * Events are enriched with MITRE ATT&CK tactics and techniques

* **Attack path visualization**

  * Displays correlated events as a progressing attack graph
  * Helps visualize how reconnaissance escalates into compromise

* **Dynamic risk scoring**

  * Live risk score based on event severity
  * Separate progression risk based on attack chain completion

* **Log ingestion**

  * Upload `.txt` log files
  * Automatically classifies lines into security events
  * Injects them into the system as correlated attack activity

* **Event timeline & dashboard**

  * Recent events table
  * Timeline view with severity and geo context

---

## 🧠 How It Works (High Level)

1. **Event Generation / Ingestion**

   * Events come from:

     * A background simulator
     * Uploaded log files
     * Optional frontend ingestion scripts

2. **Event Correlation**

   * Events are matched against a predefined attack order
   * Related events are grouped into attack chains

3. **Risk Calculation**

   * Risk score increases based on severity
   * Progression risk reflects how far an attack chain has advanced

4. **Visualization**

   * Attack chains are rendered as node graphs
   * Events update live on the dashboard

---

## 🧱 Tech Stack

**Backend**

* Python
* Flask
* Flask‑CORS
* Threaded event simulation

**Frontend**

* JavaScript
* CSS
* HTML
* Fetch API
* Plotly.js for graphs

**Deployment**

* Render (Flask backend)
* Static frontend served via Flask templates

---

## 🛠️ Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/your-username/hawkeye.git
cd hawkeye
```

### 2. Install dependencies

```bash
pip install flask flask-cors
```

### 3. Run the app

```bash
python app.py
```

The app will be available at:

```
http://localhost:5000
```

---