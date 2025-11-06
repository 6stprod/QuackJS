// server.js

const express = require("express");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("."));
app.use(express.json());

// Map для хранения активных клиентов: Map<login, ws>
const clients = new Map();
// Map для хранения уведомлений, ожидающих подтверждения: Map<notificationId, { login: string, title: string, body: string, timeoutId: NodeJS.Timeout }>
const pendingNotifications = new Map();

// Функция для повторной отправки уведомления

function resendNotification(notificationId) {
  const notificationData = pendingNotifications.get(notificationId);
  if (!notificationData) return;

  const { login, title, body } = notificationData;
  const ws = clients.get(login);

  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      id: notificationId,
      title,
      body,
      duration: 5000,
      actions: [],
    }));
    console.log(`Resent notification ${notificationId} to login ${login}`);
  } else {
    console.log(`Client ${login} still offline — will retry later`);
  }

  // Повторяем каждые 30 сек, пока не будет ack
  notificationData.timeoutId = setTimeout(() => resendNotification(notificationId), 30000);
  pendingNotifications.set(notificationId, notificationData);
}

// WebSocket-соединения
wss.on("connection", (ws) => {
  console.log("New connection");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
	  
	  if (data.type === "auth" && data.login) {
		  ws.login = String(data.login);
		  clients.set(ws.login, ws);
		  console.log(`New login authorized: ${ws.login}`);

		  // ⏳ Через 5 секунд начинаем доставку отложенных уведомлений
		  setTimeout(() => {
			// Собираем все уведомления, которые ждут именно этого пользователя
			const userNotifications = Array.from(pendingNotifications.entries())
			  .filter(([_, notifData]) => notifData.login === ws.login);

			if (userNotifications.length === 0) {
			  console.log(`No pending notifications for login ${ws.login}`);
			  return;
			}

			console.log(`Delivering ${userNotifications.length} pending notifications to ${ws.login}...`);

			// Функция отправки по очереди
			function sendNext(index = 0) {
			  if (index >= userNotifications.length) return; // всё отправлено

			  const [notificationId, notifData] = userNotifications[index];
			  const notification = {
				id: notificationId,
				title: notifData.title,
				body: notifData.body,
				duration: 7000,
				actions: []
			  };

			  if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify(notification));
				console.log(`Delivered pending notification ${notificationId} to login ${ws.login}`);
			  }

			  // Следующее уведомление через 5 секунд
			  setTimeout(() => sendNext(index + 1), 5000);
			}

			// Начинаем цепочку отправки
			sendNext();

		  }, 5000); // ⏱ ждём 5 секунд после авторизации
		}

      // Подтверждение доставки/прочтения уведомления
      else if (data.type === "ack" && data.notificationId) {
        const notificationData = pendingNotifications.get(data.notificationId);
        if (notificationData) {
          clearTimeout(notificationData.timeoutId); // Очищаем таймер повторной отправки
          pendingNotifications.delete(data.notificationId);
          console.log(`Notification ${data.notificationId} confirmed (${data.status}). Removed from pending.`);
        }
      }
    } catch (err) {
      console.error("Ошибка парсинга сообщения:", err, "Сырое сообщение:", message);
    }
  });

  ws.on("close", () => {
    if (ws.login) {
      clients.delete(ws.login);
      console.log(`Client disconnected: ${ws.login}`);
    } else {
      console.log("Client disconnected: (no_login)");
    }
  });
});

// REST-эндпоинт для отправки уведомлений
app.post("/notify", (req, res) => {
  const data = req.body;
  const notificationId = Date.now().toString();
  const notification = {
    id: notificationId,
    title: data.title || "Notify",
    body: data.body || "Quack, quack!",
    duration: data.duration ?? 5000,
    actions: data.actions || [],
  };

  const msg = JSON.stringify(notification);
  let sent = 0;

  // Сохраняем уведомление в Map как ожидающее подтверждения
  const timeoutId = setTimeout(() => resendNotification(notificationId), 30000);
  pendingNotifications.set(notificationId, {
    login: data.login,
    title: notification.title,
    body: notification.body,
    timeoutId: timeoutId,
  });

  // Отправляем уведомление конкретному клиенту по логину
  if (data.login) {
    const ws = clients.get(String(data.login));
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(msg);
      sent = 1;
      console.log(`Sent notification ${notificationId} to login ${data.login}`);
    } else {
      console.log(`No active client for login ${data.login}`);
    }
  }
  // Отправляем уведомление всем клиентам
  else {
    for (const ws of clients.values()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
        sent++;
      }
    }
    console.log(`Sent notification ${notificationId} to ${sent} clients`);
  }

  res.json({ ok: true, sent, notificationId });
});

// Остальные эндпоинты остаются без изменений
app.get("/notify/status/:id", (req, res) => {
  const notification = pendingNotifications.get(req.params.id);
  if (notification) {
    res.json({
      ok: true,
      status: "pending",
      login: notification.login,
      title: notification.title,
      body: notification.body,
    });
  } else {
    res.json({
      ok: true,
      status: "confirmed",
    });
  }
});

app.get("/notify/pending", (req, res) => {
  const allPending = Array.from(pendingNotifications.entries()).map(([id, data]) => ({
    id,
    login: data.login,
    title: data.title,
    body: data.body,
  }));
  res.json({ ok: true, pendingNotifications: allPending });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket: ws://127.0.0.1:${PORT}`);
});


