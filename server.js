const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const server = http.createServer((req, res) => {
  let file = '';
  if (req.url === '/' || req.url === '/host') {
    file = path.join(__dirname, 'host.html');
  } else if (req.url.startsWith('/guest')) {
    file = path.join(__dirname, 'guest.html');
  } else {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); res.end('Error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

let state = {
  phase: 'waiting',
  players: {},
  pressOrder: [],
};

const COLORS = ['#e63946','#457b9d','#2dc653','#f4a261','#9b5de5','#f15bb5'];
let colorIdx = 0;

function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(str); });
}

function broadcastState() {
  broadcast({ type: 'state', state });
}

wss.on('connection', (ws) => {
  let playerId = null;
  ws.send(JSON.stringify({ type: 'state', state }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      playerId = msg.id;
      const color = COLORS[colorIdx % COLORS.length];
      colorIdx++;
      state.players[playerId] = { name: msg.name, color };
      ws.send(JSON.stringify({ type: 'joined', id: playerId, color }));
      broadcastState();
    } else if (msg.type === 'host') {
      playerId = '__host__';
    } else if (msg.type === 'open') {
      state.phase = 'open';
      state.pressOrder = [];
      broadcastState();
    } else if (msg.type === 'reset') {
      state.phase = 'waiting';
      state.pressOrder = [];
      broadcastState();
    } else if (msg.type === 'buzz') {
      if (state.phase !== 'open') return;
      if (state.pressOrder.find(p => p.id === msg.id)) return;
      const player = state.players[msg.id];
      if (!player) return;
      state.pressOrder.push({ id: msg.id, name: player.name, color: player.color, time: Date.now() });
      broadcastState();
    } else if (msg.type === 'kick') {
      delete state.players[msg.id];
      broadcastState();
    }
  });

  ws.on('close', () => {
    if (playerId && playerId !== '__host__' && state.players[playerId]) {
      delete state.players[playerId];
      broadcastState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`早押しサーバー起動！ポート:${PORT}`);
});
