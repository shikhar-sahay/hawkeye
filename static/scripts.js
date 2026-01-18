async function fetchEvents() {
    try {
        const res = await fetch('/events');
        const data = await res.json();
        updateLogs(data.events);
        updateTimeline(data.events);
    } catch (e) {}
}

async function fetchRisk() {
    try {
        const res = await fetch('/risk');
        const data = await res.json();
        document.getElementById('risk-display').innerText = data.risk_score;
    } catch (e) {}
}

async function fetchAttackGraph() {
    try {
        const res = await fetch('/attack-graph');
        const data = await res.json();
        renderGraph(data);
    } catch (e) {}
}

function updateLogs(events) {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    events.slice(-20).reverse().forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.timestamp}</td>
            <td>${e.source}</td>
            <td>${e.event_type}</td>
            <td>${e.severity}</td>
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

    const trace = {
        x: graph.nodes.map((_, i) => i * 2),
        y: graph.nodes.map(() => Math.random() * 5),
        text: graph.nodes,
        mode: 'markers+text',
        textposition: 'top center',
        marker: { size: 22 }
    };

    Plotly.newPlot('attack-path-graph', [trace], { margin: { t: 20 } });
}

setInterval(() => {
    fetchEvents();
    fetchRisk();
    fetchAttackGraph();
}, 2000);

fetchEvents();
fetchRisk();
fetchAttackGraph();
