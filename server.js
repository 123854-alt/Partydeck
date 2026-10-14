/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const next = require('next');
const { Server } = require('socket.io');
const { LobbyStore } = require('./src/lib/lobby-store.cjs');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const app = next({ dev });
const store = new LobbyStore();

function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) throw new Error('PAYLOAD_TOO_LARGE'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('INVALID_JSON'); }
}
function cookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
function setSessionCookie(code, token) {
  return `pd_${code}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=172800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function fail(res, error) {
  const errors = { NAME_REQUIRED:[400,'Vul een naam in.'], INVALID_MAX_PLAYERS:[400,'Kies een maximum van 2 tot 9 spelers.'], INVALID_BALANCE:[400,'Ongeldige startbalans.'], LOBBY_NOT_FOUND:[404,'Deze lobbycode bestaat niet.'], LOBBY_NOT_JOINABLE:[409,'Deze lobby is al gestart of beëindigd.'], LOBBY_FULL:[409,'Deze lobby zit vol.'], NAME_TAKEN:[409,'Deze naam wordt al gebruikt in deze lobby.'], NOT_ALLOWED:[403,'Je mag deze wijziging niet doen.'], NOT_HOST:[403,'Alleen de host kan dit doen.'], GAME_UNAVAILABLE:[409,'Dit spel is nog niet beschikbaar.'], NEED_MORE_PLAYERS:[409,'Er zijn minstens twee spelers nodig.'], APPROVALS_REQUIRED:[409,'Iedereen moet eerst de instellingen goedkeuren.'], POKER_NOT_READY:[409,'Poker is nog niet speelbaar.'], INVALID_JSON:[400,'Ongeldige aanvraag.'], PAYLOAD_TOO_LARGE:[413,'Aanvraag is te groot.'] };
  const [status, message] = errors[error.message] || [500, 'Er ging iets mis. Probeer het opnieuw.'];
  send(res, status, { error: error.message, message });
}

app.prepare().then(() => {
  const handle = app.getRequestHandler();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    try {
      if (req.method === 'POST' && url.pathname === '/api/lobbies') {
        const input = await body(req), created = store.create(input);
        return send(res, 201, { lobby: created.lobby }, { 'Set-Cookie': setSessionCookie(created.lobby.code, created.token) });
      }
      const join = url.pathname.match(/^\/api\/lobbies\/([A-Z0-9]{5,6})\/join$/i);
      if (req.method === 'POST' && join) {
        const code = join[1].toUpperCase(), joined = store.join(code, (await body(req)).displayName);
        io.to(code).emit('lobby:update', joined.lobby);
        return send(res, 200, { lobby: joined.lobby }, { 'Set-Cookie': setSessionCookie(joined.lobby.code, joined.token) });
      }
      const approval = url.pathname.match(/^\/api\/lobbies\/([A-Z0-9]{5,6})\/approval$/i);
      if (req.method === 'POST' && approval) {
        const code = approval[1].toUpperCase(), player = store.authenticate(code, cookie(req, `pd_${code}`));
        if (!player) return send(res, 401, { error: 'SESSION_REQUIRED', message: 'Join deze lobby opnieuw met de code.' });
        const result = store.approve(code, player.id, Boolean((await body(req)).approved)); io.to(code).emit('lobby:update', result);
        return send(res, 200, { lobby: result });
      }
      const settings = url.pathname.match(/^\/api\/lobbies\/([A-Z0-9]{5,6})\/settings$/i);
      if (req.method === 'POST' && settings) {
        const code = settings[1].toUpperCase(), player = store.authenticate(code, cookie(req, `pd_${code}`));
        if (!player) return send(res, 401, { error: 'SESSION_REQUIRED', message: 'Join deze lobby opnieuw met de code.' });
        const result = store.updateSettings(code, player.id, await body(req)); io.to(code).emit('lobby:update', result);
        return send(res, 200, { lobby: result });
      }
      const lobbyPath = url.pathname.match(/^\/api\/lobbies\/([A-Z0-9]{5,6})$/i);
      if (req.method === 'GET' && lobbyPath) {
        const code = lobbyPath[1].toUpperCase(), player = store.authenticate(code, cookie(req, `pd_${code}`));
        if (!player) return send(res, 401, { error: 'SESSION_REQUIRED', message: 'Voer je naam in en doe mee met deze code.' });
        return send(res, 200, { lobby: store.get(code, player.id) });
      }
      return handle(req, res);
    } catch (error) { return fail(res, error); }
  });
  const io = new Server(server, { maxHttpBufferSize: 16_384, pingInterval: 20_000, pingTimeout: 20_000 });
  io.use((socket, nextSocket) => {
    const code = String(socket.handshake.query.code || '').toUpperCase();
    const origin = socket.handshake.headers.origin;
    try { if (!origin || new URL(origin).host !== socket.handshake.headers.host) return nextSocket(new Error('Ongeldige verbindingsoorsprong.')); }
    catch { return nextSocket(new Error('Ongeldige verbindingsoorsprong.')); }
    const rawCookie = socket.handshake.headers.cookie || '';
    const token = rawCookie.split(';').map(part => part.trim()).find(part => part.startsWith(`pd_${code}=`))?.split('=').slice(1).join('=');
    const player = code && token ? store.authenticate(code, decodeURIComponent(token)) : null;
    if (!player) return nextSocket(new Error('Je sessie is verlopen. Doe opnieuw mee met de lobbycode.'));
    socket.data.code = code; socket.data.playerId = player.id; nextSocket();
  });
  io.on('connection', socket => {
    socket.join(socket.data.code);
    socket.emit('lobby:update', store.get(socket.data.code, socket.data.playerId));
    io.in(socket.data.code).fetchSockets().then(sockets => {
      socket.emit('presence:initial', [...new Set(sockets.map(client => client.data.playerId))]);
    });
    io.to(socket.data.code).emit('presence:update', { playerId: socket.data.playerId, connected: true });
    socket.on('disconnect', async () => {
      const others = await io.in(socket.data.code).fetchSockets();
      if (!others.some(client => client.data.playerId === socket.data.playerId)) io.to(socket.data.code).emit('presence:update', { playerId: socket.data.playerId, connected: false });
    });
  });
  server.listen(port, '0.0.0.0', () => console.log(`PartyDeck server listening on ${port}`));
}).catch(error => { console.error(error); process.exit(1); });
