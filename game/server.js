'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

/* ----------------------------- Oyun ayarları ----------------------------- */
const START_BUDGET = 20;   // Başlangıç bütçesi ($)
const TEAM_SIZE = 5;       // Kadro büyüklüğü
const ROUND_MS = 15000;    // Her kahraman için açık artırma süresi
const SNIPE_MS = 3000;     // Son saniye teklifinde süre en az bu kadar uzar
const BREAK_MS = 3500;     // Turlar arası bekleme
const INTRO_MS = 3500;     // Eşleşme sonrası geri sayım
const OPENING_BID = 1;     // Her kahraman 1$'dan başlar

/* ---------------------------- Kahraman havuzu ---------------------------- */
const HEROES = [
  { id: 'ironman', name: 'Iron Man', icon: '🦾', color: '#ff4d4d', power: 93, desc: 'Dahi mucit. Gelişmiş zırhı ve repulsor silahlarıyla gökyüzünün hâkimi.' },
  { id: 'cap', name: 'Captain America', icon: '🛡️', color: '#3b82f6', power: 88, desc: 'Süper asker serumu, kırılmaz kalkan ve ilham veren liderlik.' },
  { id: 'thor', name: 'Thor', icon: '⚡', color: '#7dd3fc', power: 95, desc: 'Asgard\'ın gök gürültüsü tanrısı. Mjölnir ile şimşekleri yönetir.' },
  { id: 'hulk', name: 'Hulk', icon: '💚', color: '#4ade80', power: 94, desc: 'Öfkelendikçe güçlenen yıkılmaz dev. Sınırsız fiziksel güç.' },
  { id: 'spiderman', name: 'Spider-Man', icon: '🕷️', color: '#ef4444', power: 90, desc: 'Örümcek duyusu, ağ atma ve inanılmaz çeviklik. Mahallenin kahramanı.' },
  { id: 'panther', name: 'Black Panther', icon: '🐾', color: '#a78bfa', power: 89, desc: 'Wakanda kralı. Vibranyum kostümü ve usta dövüş becerileri.' },
  { id: 'strange', name: 'Doctor Strange', icon: '🔮', color: '#f59e0b', power: 92, desc: 'Yüce Büyücü. Zamanı, boyutları ve gerçekliği büker.' },
  { id: 'marvel', name: 'Captain Marvel', icon: '🌟', color: '#fbbf24', power: 96, desc: 'Kozmik enerji emip fotonik patlamalara çevirir. Işık hızında uçar.' },
  { id: 'wanda', name: 'Scarlet Witch', icon: '🌀', color: '#f43f5e', power: 97, desc: 'Kaos büyüsüyle gerçekliği yeniden yazabilen en güçlü büyücülerden biri.' },
  { id: 'wolverine', name: 'Wolverine', icon: '🐺', color: '#facc15', power: 85, desc: 'Adamantyum pençeler ve inanılmaz iyileşme gücü. Durdurulamaz.' },
  { id: 'deadpool', name: 'Deadpool', icon: '🗡️', color: '#dc2626', power: 80, desc: 'Ölümsüz iyileşme, kılıç ustalığı ve dördüncü duvarı yıkan şakalar.' },
  { id: 'widow', name: 'Black Widow', icon: '🕸️', color: '#94a3b8', power: 74, desc: 'Usta casus ve suikastçı. Dövüş sanatlarında üst düzey.' },
  { id: 'hawkeye', name: 'Hawkeye', icon: '🏹', color: '#8b5cf6', power: 70, desc: 'Hiç ıskalamayan okçu. Ok çeşitleriyle her duruma hazır.' },
  { id: 'antman', name: 'Ant-Man', icon: '🐜', color: '#ef4444', power: 68, desc: 'Atom boyutuna küçülür, dev boyuta büyür. Karıncaları yönetir.' },
  { id: 'vision', name: 'Vision', icon: '🤖', color: '#fb923c', power: 91, desc: 'Yapay zekâ ve Zihin Taşı. Maddenin içinden geçer, enerji ışını atar.' },
  { id: 'starlord', name: 'Star-Lord', icon: '🚀', color: '#f97316', power: 72, desc: 'Galaksinin koruyucuları lideri. Element silahları ve kıvrak zekâ.' },
  { id: 'groot', name: 'Groot', icon: '🌳', color: '#84cc16', power: 78, desc: 'Dev ağaç gövdesi, uzayan dallar ve sarsılmaz sadakat.' },
  { id: 'rocket', name: 'Rocket', icon: '🦝', color: '#fb7185', power: 69, desc: 'Silah ve teknoloji dehası. Küçük ama çok tehlikeli.' },
  { id: 'loki', name: 'Loki', icon: '🎭', color: '#22c55e', power: 82, desc: 'Hile tanrısı. İllüzyonlar, büyü ve hesapsız planlar.' },
  { id: 'bucky', name: 'Winter Soldier', icon: '🔫', color: '#64748b', power: 79, desc: 'Metal kol, eğitimli suikastçı ve ölümcül nişancı.' },
  { id: 'falcon', name: 'Falcon', icon: '🦅', color: '#ef4444', power: 66, desc: 'Kanatlı zırhıyla havada manevra ustası. Güvenilir takım arkadaşı.' },
  { id: 'storm', name: 'Storm', icon: '⛈️', color: '#38bdf8', power: 88, desc: 'Hava durumunu yönetir. Fırtına, yıldırım ve kasırga çağırır.' },
  { id: 'daredevil', name: 'Daredevil', icon: '😈', color: '#dc2626', power: 71, desc: 'Gözleri görmez ama diğer duyuları insanüstü. Usta dövüşçü.' },
  { id: 'thanos', name: 'Thanos', icon: '💜', color: '#c084fc', power: 99, desc: 'Çılgın Titan. Devasa güç, taş savaşlarının efendisi.' },
  { id: 'gamora', name: 'Gamora', icon: '⚔️', color: '#34d399', power: 76, desc: 'Galaksinin en ölümcül kadını. Kılıç ve dövüş ustası.' },
  { id: 'fury', name: 'Nick Fury', icon: '🕶️', color: '#9ca3af', power: 60, desc: 'S.H.I.E.L.D. direktörü. Kadroyu bir araya getiren stratejist.' }
];

/* ------------------------------- Sunucu ---------------------------------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

const waitingQueue = [];      // Eşleşme bekleyen socket'ler
const matches = new Map();    // matchId -> match

/* ------------------------------ Yardımcılar ------------------------------ */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanName(raw) {
  const s = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || 'Oyuncu';
}

function broadcastStats() {
  io.emit('stats', { online: io.engine.clientsCount, waiting: waitingQueue.length });
}

function removeFromQueue(socket) {
  const i = waitingQueue.indexOf(socket);
  if (i !== -1) waitingQueue.splice(i, 1);
  return i !== -1;
}

function getMatch(socket) {
  return socket.data.matchId ? matches.get(socket.data.matchId) : null;
}

function snapshot(match) {
  return match.players.map((p) => ({
    name: p.name,
    budget: p.budget,
    spent: p.spent,
    team: p.team
  }));
}

/* ----------------------------- Eşleştirme -------------------------------- */
function tryMatch() {
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();
    if (!a.connected && !b.connected) continue;
    if (!a.connected) { waitingQueue.unshift(b); continue; }
    if (!b.connected) { waitingQueue.unshift(a); continue; }
    startMatch(a, b);
  }
  broadcastStats();
}

function startMatch(a, b) {
  const id = crypto.randomUUID();
  const nameA = a.data.name;
  let nameB = b.data.name;
  if (nameB === nameA) nameB = (nameB.slice(0, 13) + ' (2)');

  const match = {
    id,
    players: [
      { socket: a, name: nameA, budget: START_BUDGET, spent: 0, team: [] },
      { socket: b, name: nameB, budget: START_BUDGET, spent: 0, team: [] }
    ],
    deck: shuffle(HEROES.slice()),
    round: 0,
    current: null,
    timer: null,
    breakTimer: null,
    nextOpener: Math.random() < 0.5 ? 0 : 1,
    over: false
  };
  matches.set(id, match);

  match.players.forEach((p, idx) => {
    p.socket.data.matchId = id;
    p.socket.data.idx = idx;
    p.socket.join(id);
  });

  match.players.forEach((p, idx) => {
    p.socket.emit('matchFound', {
      matchId: id,
      you: idx,
      budget: START_BUDGET,
      teamSize: TEAM_SIZE,
      players: match.players.map((q) => ({ name: q.name, budget: q.budget, team: [] })),
      introMs: INTRO_MS
    });
  });

  match.breakTimer = setTimeout(() => nextRound(match), INTRO_MS);
}

/* --------------------------- Açık artırma motoru ------------------------- */
function nextRound(match) {
  if (match.over) return;

  const canAfford = (p) => p.team.length < TEAM_SIZE && p.budget >= OPENING_BID;
  if (match.deck.length === 0 || !match.players.some(canAfford)) {
    return endGame(match);
  }

  // Açılış teklifini sırası gelen oyuncu otomatik yapar; parası/kadro yeri yoksa diğeri
  let opener = match.nextOpener;
  match.nextOpener = 1 - match.nextOpener;
  if (!canAfford(match.players[opener])) opener = 1 - opener;

  const hero = match.deck.shift();
  match.round += 1;

  const cur = {
    hero,
    bid: OPENING_BID,
    leader: opener,
    passed: [false, false],
    endsAt: Date.now() + ROUND_MS,
    closed: false
  };
  // Açılıştan sonra artıramayacak durumda olan rakip otomatik pas geçmiş sayılır
  match.players.forEach((p, i) => {
    if (i !== opener && !(p.team.length < TEAM_SIZE && p.budget >= cur.bid + 1)) cur.passed[i] = true;
  });
  match.current = cur;

  io.to(match.id).emit('roundStart', {
    round: match.round,
    hero,
    bid: cur.bid,
    leader: cur.leader,
    endsAt: cur.endsAt,
    serverNow: Date.now(),
    roundMs: ROUND_MS,
    passed: cur.passed
  });

  clearTimeout(match.timer);
  match.timer = setTimeout(() => resolveRound(match), ROUND_MS);
  maybeFinishEarly(match);
}

function maybeFinishEarly(match) {
  const cur = match.current;
  if (!cur || cur.closed) return;
  const minNext = cur.bid + 1;
  const someoneCanBid = match.players.some(
    (p, i) => i !== cur.leader && !cur.passed[i] && p.team.length < TEAM_SIZE && p.budget >= minNext
  );
  if (!someoneCanBid) {
    clearTimeout(match.timer);
    match.timer = setTimeout(() => resolveRound(match), 900);
  }
}

function resolveRound(match) {
  const cur = match.current;
  if (match.over || !cur || cur.closed) return;
  cur.closed = true;
  clearTimeout(match.timer);

  let winnerIdx = -1;
  if (cur.leader >= 0) {
    winnerIdx = cur.leader;
    const w = match.players[winnerIdx];
    w.budget -= cur.bid;
    w.spent += cur.bid;
    w.team.push({
      id: cur.hero.id,
      name: cur.hero.name,
      icon: cur.hero.icon,
      power: cur.hero.power,
      price: cur.bid
    });
  }

  io.to(match.id).emit('roundEnd', {
    hero: cur.hero,
    winner: winnerIdx,
    price: cur.leader >= 0 ? cur.bid : 0,
    players: snapshot(match)
  });

  match.breakTimer = setTimeout(() => nextRound(match), BREAK_MS);
}

function endGame(match) {
  if (match.over) return;
  const result = match.players.map((p) => ({
    name: p.name,
    team: p.team,
    spent: p.spent,
    budget: p.budget,
    power: p.team.reduce((s, h) => s + h.power, 0)
  }));

  let winner = -1;
  if (result[0].power !== result[1].power) winner = result[0].power > result[1].power ? 0 : 1;
  else if (result[0].budget !== result[1].budget) winner = result[0].budget > result[1].budget ? 0 : 1;

  io.to(match.id).emit('gameOver', { players: result, winner });
  cleanupMatch(match);
}

function cleanupMatch(match) {
  match.over = true;
  clearTimeout(match.timer);
  clearTimeout(match.breakTimer);
  match.players.forEach((p) => {
    if (p.socket.data.matchId === match.id) {
      p.socket.data.matchId = null;
      p.socket.leave(match.id);
    }
  });
  matches.delete(match.id);
}

/* ------------------------------ Socket olayları -------------------------- */
io.on('connection', (socket) => {
  socket.data.matchId = null;
  socket.data.idx = -1;
  socket.data.name = 'Oyuncu';
  broadcastStats();

  socket.on('findMatch', (payload) => {
    if (socket.data.matchId) return;
    if (waitingQueue.includes(socket)) return;
    socket.data.name = cleanName(payload && payload.name);
    waitingQueue.push(socket);
    socket.emit('searching');
    tryMatch();
    broadcastStats();
  });

  socket.on('cancelSearch', () => {
    if (removeFromQueue(socket)) {
      socket.emit('searchCancelled');
      broadcastStats();
    }
  });

  socket.on('bid', (data) => {
    const match = getMatch(socket);
    if (!match || match.over) return;
    const cur = match.current;
    if (!cur || cur.closed) return;

    const idx = socket.data.idx;
    const p = match.players[idx];
    const inc = Math.floor(Number(data && data.inc));
    if (!Number.isFinite(inc) || inc < 1) return;

    if (cur.leader === idx) return socket.emit('errorMsg', 'En yüksek teklif zaten sende.');
    if (cur.passed[idx]) return socket.emit('errorMsg', 'Bu kahraman için pas geçtin.');
    if (p.team.length >= TEAM_SIZE) return socket.emit('errorMsg', 'Kadron dolu.');

    const newBid = cur.bid + inc;
    if (newBid > p.budget) return socket.emit('errorMsg', 'Bütçen bu teklif için yetmiyor.');

    cur.bid = newBid;
    cur.leader = idx;

    const now = Date.now();
    if (cur.endsAt - now < SNIPE_MS) cur.endsAt = now + SNIPE_MS;

    io.to(match.id).emit('bidUpdate', {
      bid: cur.bid,
      leader: cur.leader,
      endsAt: cur.endsAt,
      serverNow: now
    });

    clearTimeout(match.timer);
    match.timer = setTimeout(() => resolveRound(match), Math.max(0, cur.endsAt - now));
    maybeFinishEarly(match);
  });

  socket.on('pass', () => {
    const match = getMatch(socket);
    if (!match || match.over) return;
    const cur = match.current;
    if (!cur || cur.closed) return;
    const idx = socket.data.idx;
    if (cur.leader === idx || cur.passed[idx]) return;

    cur.passed[idx] = true;
    io.to(match.id).emit('playerPassed', { idx });
    maybeFinishEarly(match);
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket);
    const match = getMatch(socket);
    if (match && !match.over) {
      const other = match.players.find((p) => p.socket !== socket);
      cleanupMatch(match);
      if (other && other.socket.connected) other.socket.emit('opponentLeft');
    }
    broadcastStats();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Süper Kahraman Açık Artırması ${PORT} portunda çalışıyor`);
});
