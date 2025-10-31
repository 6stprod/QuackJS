# QuackJS
🦆 What is quackjs? quackjs is a client-side JavaScript library that: communicates with the server (e.g., via WebSocket); receives new notifications as soon as possible; displays them to the user (as toast labels and/or system calls); and allows listening for events (notifications, connections, errors, etc.).


Шnstall dependencies:
npm init -y
npm install express ws

Run server:
node server.js

Test notification via PowerShell:

Invoke-RestMethod -Uri "http://localhost:3000/notify" -Method POST -ContentType "application/json" -Body '{"title":"New notification!","body":"Quack, quack"}'  

Or Curl:

curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"New notification!","body":"Quack, quack"}'
