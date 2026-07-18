(function() {
    const HAWKEYE_URL = "https://hawkeye-i1bt.onrender.com"; 

    function sendEvent(type, metadata = {}) {
        fetch(`${HAWKEYE_URL}/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source: "frontend",
                event_type: type,
                severity: "low",
                metadata: metadata
            })
        }).catch(() => {}); 
    }

    let lastClick = Date.now();
    document.addEventListener("click", () => {
        const now = Date.now();
        if (now - lastClick < 300) sendEvent("rapid_ui_activity");
        lastClick = now;
    });

    document.addEventListener("mousemove", e => {
        if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) {
            sendEvent("bot_like_behavior");
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "F12") sendEvent("devtools_detected");
    });

    const honeypot = document.getElementById("admin-panel");
    if (honeypot) {
        honeypot.addEventListener("click", () =>
            sendEvent("honeypot_access", { element: "admin-panel" })
        );
    }

    sendEvent("page_load", { url: location.href, user_agent: navigator.userAgent });
})();

