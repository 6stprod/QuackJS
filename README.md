<img width="1189" height="339" alt="QuackJS" src="https://github.com/user-attachments/assets/cff11e3e-4f18-4872-9970-9ed841be2d0f" />



# QuackJS
🦆 What is QuackJS? It's a client-side JavaScript library that: communicates with the server (in this case, via WebSocket);
receives new notifications and displays them to the user as pop-up notifications.

You can send a message to all connected clients or to a specific client using its token.

Examples:

Send to everyone: curl -X POST http://localhost:3000/notify -H "Content-Type: application/json" -d '{"title":"Notification","body":"Hello world!"}'

Send to only one user:

curl -X POST http://localhost:3000/notify -H "Content-Type: application/json" -d '{"token":"f54df5g4df6g4d6fg4d65f4g6d45fg65d4","title":"Private notification!","body":"Hello world!"}'


Install:

npm init -y
npm install express ws
_______________________

Run server:

node server.js
_______________________

