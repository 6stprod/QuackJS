// server.js

const express = require("express");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("."));
app.use(express.json());

// Clients map: Map<token, ws>
const clients = new Map();

wss.on("connection", ws => {
  console.log("🟢 New connection");

  ws.on("message", message => {
    try {
      const data = JSON.parse(message);
      if (data.type === "auth" && data.token) {
        ws.token = String(data.token);
        clients.set(ws.token, ws);
        console.log(`✅ New token is authorize: ${ws.token}`);
      }
    } catch (err) {
      console.error("Parse error:", err);
    }
  });

  ws.on("close", () => {
    if (ws.token) clients.delete(ws.token);
    console.log(`🔴 Client disconnected: ${ws.token || "(no_token)"}`);
  });
});

// REST endpoint for send notify
app.post("/notify", (req, res) => {
  const data = req.body;

  const notification = {
    id: Date.now().toString(),
    title: data.title || "Notify",
    body: data.body || "Quack, quack!",
    duration: data.duration ?? 3500,
    actions: data.actions || [],
  };

  const msg = JSON.stringify(notification);
  let sent = 0;

  if (data.token) {
    const ws = clients.get(String(data.token)); // <── find by token
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(msg);
      sent = 1;
      console.log(`📨 Sent notification to token ${data.token}`);
    } else {
      console.log(`⚠️ No active client for token ${data.token}`);
    }
  } else {
    for (const ws of clients.values()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
        sent++;
      }
    }
    console.log(`📨 Sent notification to ${sent} clients`);
  }

  res.json({ ok: true, sent });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});

