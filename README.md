<img width="1108" height="527" alt="изображение" src="https://github.com/user-attachments/assets/e8cf5305-22ef-4792-b243-4f9d63783fb6" />



# QuackJS - Realtime notification
🦆 What is QuackJS? It's a client-side JavaScript library that: communicates with the server (in this case, via WebSocket);
receives new notifications and displays them to the user as pop-up notifications.

Added the ability to store messages in memory if the user is not connected to WebSocket. Once the user is connected, they will receive accumulated notifications in order, at short intervals.

You can send a message to all connected clients or to a specific client using its login.
_______________________

Install:
```
npm init -y

npm install express ws
```
_______________________

Run server:
```
node server.js
```
_______________________


Examples:

Send to everyone: 
```
curl -X POST http://127.0.0.1:3000/notify   -H "Content-Type: application/json"   -d '{"login":"","title":"Notice","body":"Message"}'
```

Send to only one user:

```
curl -X POST http://127.0.0.1:3000/notify   -H "Content-Type: application/json"   -d '{"login":"test","title":"Notice","body":"Message"}'
```

