// server.js

const express = require("express");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });


app.use(express.static("."));
app.use(express.json());

// Clients
const clients = new Set();

//  New client
wss.on("connection", ws => {
  console.log("🟢 New connection");
  clients.add(ws);

  ws.on("close", () => {
    clients.delete(ws);
    console.log("🔴 Client disconnect");
  });
});

// REST endpoint for send notification
app.post("/notify", (req, res) => {
  const data = req.body;

  const notification = {
    id: Date.now().toString(),
    title: data.title || "Notify",
    body: data.body || "Quack, quack!",
    duration: data.duration ?? 7000,
    actions: data.actions || [],
  };

  const msg = JSON.stringify(notification);

  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  console.log("📨 Notification send:", notification);
  res.json({ ok: true, sent: clients.size });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`POST notification: curl -X POST http://localhost:${PORT}/notify -H 'Content-Type: application/json' -d '{\"title\":\"Hello!\",\"body\":\"Its is server notification\"}'`);
});
