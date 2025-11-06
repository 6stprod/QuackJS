<img width="1189" height="339" alt="QuackJS" src="https://github.com/user-attachments/assets/cff11e3e-4f18-4872-9970-9ed841be2d0f" />



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

<img width="1302" height="421" alt="изображение" src="https://github.com/user-attachments/assets/3aac100b-d027-49aa-98fe-5661967b242c" />


Send to only one user:

```
curl -X POST http://127.0.0.1:3000/notify   -H "Content-Type: application/json"   -d '{"login":"test","title":"Notice","body":"Message"}'
```

<img width="1402" height="358" alt="изображение" src="https://github.com/user-attachments/assets/66dc715c-5883-4fd8-b1cd-a1b32681b1a3" />


