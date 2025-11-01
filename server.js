// server.js

const express = require("express");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");
const cookie = require("cookie");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("."));
app.use(express.json());

// Clients map: Map<token, ws>
const clients = new Map();

// New connection
wss.on("connection", (ws, req) => {
  console.log("🟢 New connection");

  // Parse cookie, if isset
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const tokenFromCookie = cookies.auth_token;

  // We'll store the token temporarily in case it arrives later.
  ws._token = tokenFromCookie || null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "auth" && data.token) {
        ws._token = data.token;
        clients.set(data.token, ws);
        console.log("✅ Authenticated client with token:", data.token);
      }
    } catch (err) {
      console.warn("Invalid WS message:", msg);
    }
  });

  ws.on("close", () => {
    if (ws._token && clients.has(ws._token)) {
      clients.delete(ws._token);
    }
    console.log("🔴 Client disconnected");
  });
});

// 🔔 REST endpoint for sending notifications
// You can specify a specific token in the JSON body
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

  //If a token is specified, we send it only to it.
  if (data.token) {
    const ws = clients.get(data.token);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(msg);
      sent = 1;
      console.log(`📨 Sent notification to token ${data.token}`);
    } else {
      console.log(`⚠️ No active client for token ${data.token}`);
    }
  } else {
    // Else seng all clients
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
