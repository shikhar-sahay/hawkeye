let logs = [];

async function fetchLogs() {
    try {
        const response = await fetch('/logs');
        logs = await response.json();
        updateLogTable();
        updateAttackPath();
        updateRisk();
    } catch (err) {
        console.error("Error fetching logs:", err);
    }
}

function updateLogTable() {
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';
    logs.slice(-20).reverse().forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.timestamp}</td>
            <td>${log.source}</td>
            <td>${log.event}</td>
            <td>${log.ip}</td>
            <td>${log.severity}</td>
            <td>${log.geo}</td>
            <td>${log.threat_score}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateRisk() {
    let risk = 0;
    logs.slice(-20).forEach(log => {
        if(log.severity === 'low') risk += 10;
        else if(log.severity === 'medium') risk += 30;
        else if(log.severity === 'high') risk += 60;
    });
    risk = Math.min(risk, 100);
    document.getElementById('risk-display').innerText = `Risk Score: ${risk}/100`;
}

function updateAttackPath() {
    const nodes = [];
    const edges = [];
    const lastLogs = logs.slice(-10); 
    lastLogs.forEach((log, index) => {
        nodes.push({id: index, label: log.event, color: log.severity==='high'?'red':log.severity==='medium'?'yellow':'green'});
        if(index>0) edges.push({from: index-1, to: index});
    });

    const data = [{
        type: 'scatter',
        x: nodes.map((_,i)=>i*2),
        y: nodes.map(()=>Math.random()*5),
        mode: 'markers+text',
        text: nodes.map(n=>n.label),
        marker: {size: 20, color: nodes.map(n=>n.color)},
        textposition: 'top center'
    }];
    Plotly.newPlot('attack-path-graph', data, {margin:{t:20}});
}

async function uploadLogs() {
    const fileInput = document.getElementById('log-file');
    const file = fileInput.files[0];
    if(!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/logs', {method:'POST', body: formData});
    const data = await res.json();
    document.getElementById('upload-status').innerText = data.message;
}

setInterval(fetchLogs, 2000);
fetchLogs();
