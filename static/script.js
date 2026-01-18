console.log("HawkEye script loaded");

const BASE_URL = "https://hawkeye-i1bt.onrender.com";

async function fetchEvents() {
    try {
        const res = await fetch(`${BASE_URL}/events`);
        const data = await res.json();
        updateLogTable(data.events);
        updateTimeline(data.events);
    } catch (e) {
        console.error("Failed to fetch events:", e);
    }
}

async function fetchRisk() {
    try {
        const res = await fetch(`${BASE_URL}/risk`);
        const data = await res.json();
        document.getElementById('risk-display').innerText =
            `Risk: ${data.risk_score}/100 | Attack Progress: ${data.progression_risk}%`;
    } catch (e) {
        console.error("Failed to fetch risk:", e);
    }
}

async function fetchAttackGraph() {
    try {
        const res = await fetch(`${BASE_URL}/attack-graph`);
        const data = await res.json();
        renderGraph(data);
    } catch (e) {
        console.error("Failed to fetch attack graph:", e);
    }
}

function updateLogTable(events) {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    events.slice(-20).reverse().forEach(e => {
        const ts = new Date(e.timestamp);
        const geoDisplay = e.geo ? (e.geo.city ? `${e.geo.city}, ${e.geo.country}` : e.geo.country) : "Unknown";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td title="${e.raw_line || ''}">${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}</td>
            <td>${e.source}</td>
            <td>${e.event_type}</td>
            <td>${e.ip}</td>
            <td>${e.severity}</td>
            <td>${geoDisplay}</td>
            <td>${e.threat_score}</td>
        `;
        tbody.appendChild(tr);
        tr.style.opacity = 0;
        setTimeout(() => tr.style.opacity = 1, 50); 
    });
}

function updateTimeline(events) {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    events.slice(-10).reverse().forEach(e => {
        const ts = new Date(e.timestamp);
        const timeStr = `${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`;
        const geoDisplay = e.geo ? (e.geo.city ? `${e.geo.city}, ${e.geo.country}` : e.geo.country) : "Unknown";

        const li = document.createElement('li');
        li.innerText = `${timeStr} → ${e.event_type} (${e.severity}) [${geoDisplay}]`;
        if(e.raw_line) li.title = e.raw_line;
        timeline.appendChild(li);
        li.style.opacity = 0;
        setTimeout(() => li.style.opacity = 1, 50);
    });
}

function renderGraph(graph) {
    if (!graph.nodes || graph.nodes.length === 0) return;

    const x = [], y = [];
    graph.nodes.forEach((_, i) => { x.push(i*2); y.push(1); });

    const trace = {
        x, y, text: graph.nodes, mode: 'markers+text',
        textposition: 'top center', marker: { size: 22, color: '#ff4d4d' }
    };

    const layout = { xaxis:{visible:false}, yaxis:{visible:false}, margin:{t:30,l:20,r:20,b:20} };
    Plotly.react('attack-path-graph', [trace], layout);
}

async function uploadLogs() {
    const fileInput = document.getElementById('log-file');
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch(`${BASE_URL}/logs`, { method: 'POST', body: formData });
        const data = await res.json();
        document.getElementById('upload-status').innerText = data.message;
        fetchEvents();
        fetchAttackGraph();
        fetchRisk();
    } catch (e) {
        console.error("Failed to upload logs:", e);
        document.getElementById('upload-status').innerText = "Upload failed";
    }
}

setInterval(() => {
    fetchEvents();
    fetchRisk();
    fetchAttackGraph();
}, 2000);

fetchEvents();
fetchRisk();
fetchAttackGraph();
