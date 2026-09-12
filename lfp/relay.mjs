// LAN relay so a phone can be the mirror: rebroadcasts every WebSocket message to all other clients.
// Usage: npm run relay   (then: npm run dev:lan, and open the printed URL on the phone)
import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'node:os';

const PORT = 5200;
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', (data) => { const s = data.toString(); for (const c of clients) if (c !== ws && c.readyState === 1) c.send(s); });
  ws.on('close', () => clients.delete(ws));
});
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
console.log(`relay on ws://${lan}:${PORT}`);
console.log(`main screen:  http://${lan}:5199/#overview?relay=${lan}`);
console.log(`phone mirror: http://${lan}:5199/#mirror?relay=${lan}`);
