console.log("HawkEye script loaded");
async function fetchEvents() {
    try {
        const res = await fetch('/events');
        const data = await res.json();
        updateLogTable(data.events);
        updateTimeline(data.events);
    } catch (e) {}
}

async function fetchRisk() {
    try {
        const res = await fetch('/risk');
        const data = await res.json();
        document.getElementById('risk-display').innerText =
    `Risk: ${data.risk_score}/100 | Attack Progress: ${data.progression_risk}%`;
    } catch (e) {}
}

async function fetchAttackGraph() {
    try {
        const res = await fetch('/attack-graph');
        const data = await res.json();
        renderGraph(data);
    } catch (e) {}
}

function updateLogTable(events) {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    events.slice(-20).reverse().forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.timestamp}</td>
            <td>${e.source}</td>
            <td>${e.event_type}</td>
            <td>${e.ip}</td>
            <td>${e.severity}</td>
            <td>${e.geo}</td>
            <td>${e.threat_score}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateTimeline(events) {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    events.slice(-10).reverse().forEach(e => {
        const li = document.createElement('li');
        li.innerText = `${e.timestamp} → ${e.event_type} (${e.severity})`;
        timeline.appendChild(li);
    });
}

function renderGraph(graph) {
    if (!graph.nodes || graph.nodes.length === 0) return;

    const x = [];
    const y = [];

    graph.nodes.forEach((_, i) => {
        x.push(i * 2);
        y.push(1);
    });

    const trace = {
        x,
        y,
        text: graph.nodes,
        mode: 'markers+text',
        textposition: 'top center',
        marker: { size: 22 }
    };

    const layout = {
        xaxis: { visible: false },
        yaxis: { visible: false },
        margin: { t: 30, l: 20, r: 20, b: 20 }
    };

    Plotly.react('attack-path-graph', [trace], layout);
}


async function uploadLogs() {
    const fileInput = document.getElementById('log-file');
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/logs', { method: 'POST', body: formData });
    const data = await res.json();
    document.getElementById('upload-status').innerText = data.message;
}

setInterval(() => {
    fetchEvents();
    fetchRisk();
    fetchAttackGraph();
}, 2000);

fetchEvents();
fetchRisk();
fetchAttackGraph();
