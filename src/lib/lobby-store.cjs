/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_AGE = 48 * 60 * 60 * 1000;
const clean = (value, max) => String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const makeToken = () => crypto.randomBytes(32).toString('base64url');

class LobbyStore {
  constructor(filePath = process.env.PARTYDECK_STATE_FILE || path.join(process.cwd(), 'data', 'lobbies.json')) {
    this.filePath = filePath;
    this.lobbies = new Map();
    this.load();
  }
  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const lobby of data.lobbies || []) if (Date.now() - lobby.updatedAt < MAX_AGE) this.lobbies.set(lobby.code, lobby);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, lobbies: [...this.lobbies.values()] }), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }
  create({ name, displayName, maxPlayers = 9, initialBalance = 1000 }) {
    const lobbyName = clean(name, 60), playerName = clean(displayName, 24);
    if (!lobbyName || !playerName) throw new Error('NAME_REQUIRED');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 9) throw new Error('INVALID_MAX_PLAYERS');
    if (!Number.isSafeInteger(initialBalance) || initialBalance < 0 || initialBalance > 1000000) throw new Error('INVALID_BALANCE');
    let code;
    do { code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (this.lobbies.has(code));
    const playerId = crypto.randomUUID(), token = makeToken(), now = Date.now();
    const lobby = {
      code, name: lobbyName, hostPlayerId: playerId, status: 'lobby', game: null,
      settings: { maxPlayers, initialBalance }, settingsRevision: 1,
      players: [{ id: playerId, name: playerName, balance: initialBalance, approvalRevision: null, tokenHash: hashToken(token), joinedAt: now }],
      results: [], ledger: [{ playerId, amount: initialBalance, reason: 'Starting balance', game: null, at: now }], createdAt: now, updatedAt: now
    };
    this.lobbies.set(code, lobby); this.save();
    return { token, lobby: this.publicLobby(lobby, playerId) };
  }
  join(codeValue, displayName) {
    const code = clean(codeValue, 6).toUpperCase(), lobby = this.mustGet(code), playerName = clean(displayName, 24);
    if (!playerName) throw new Error('NAME_REQUIRED');
    if (!['lobby', 'between_games'].includes(lobby.status)) throw new Error('LOBBY_NOT_JOINABLE');
    if (lobby.players.length >= lobby.settings.maxPlayers) throw new Error('LOBBY_FULL');
    if (lobby.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) throw new Error('NAME_TAKEN');
    const id = crypto.randomUUID(), token = makeToken(), now = Date.now();
    lobby.players.push({ id, name: playerName, balance: lobby.settings.initialBalance, approvalRevision: null, tokenHash: hashToken(token), joinedAt: now });
    lobby.ledger.push({ playerId: id, amount: lobby.settings.initialBalance, reason: 'Starting balance', game: null, at: now });
    lobby.updatedAt = now; this.save();
    return { token, lobby: this.publicLobby(lobby, id) };
  }
  authenticate(codeValue, token) {
    const lobby = this.lobbies.get(clean(codeValue, 6).toUpperCase());
    if (!lobby || !token) return null;
    const digest = hashToken(token);
    return lobby.players.find(player => crypto.timingSafeEqual(Buffer.from(player.tokenHash, 'hex'), Buffer.from(digest, 'hex'))) || null;
  }
  get(code, playerId) {
    const lobby = this.mustGet(code);
    if (!lobby.players.some(player => player.id === playerId)) throw new Error('LOBBY_NOT_FOUND');
    return this.publicLobby(lobby, playerId);
  }
  approve(code, playerId, approved) {
    const lobby = this.mustGet(code), player = lobby.players.find(item => item.id === playerId);
    if (!player || !['lobby', 'between_games'].includes(lobby.status)) throw new Error('NOT_ALLOWED');
    player.approvalRevision = approved ? lobby.settingsRevision : null;
    lobby.updatedAt = Date.now(); this.save(); return this.publicLobby(lobby, playerId);
  }
  updateSettings(code, playerId, settings) {
    const lobby = this.mustGet(code);
    if (lobby.hostPlayerId !== playerId || !['lobby', 'between_games'].includes(lobby.status)) throw new Error('NOT_ALLOWED');
    const maxPlayers = settings.maxPlayers;
    if (!Number.isInteger(maxPlayers) || maxPlayers < lobby.players.length || maxPlayers > 9) throw new Error('INVALID_MAX_PLAYERS');
    lobby.settings = { ...lobby.settings, maxPlayers };
    lobby.settingsRevision++;
    lobby.players.forEach(player => { player.approvalRevision = null; });
    lobby.updatedAt = Date.now(); this.save(); return this.publicLobby(lobby, playerId);
  }
  start(code, playerId, game) {
    const lobby = this.mustGet(code);
    if (lobby.hostPlayerId !== playerId) throw new Error('NOT_HOST');
    if (game !== 'poker') throw new Error('GAME_UNAVAILABLE');
    if (lobby.players.length < 2) throw new Error('NEED_MORE_PLAYERS');
    if (lobby.players.some(player => player.approvalRevision !== lobby.settingsRevision)) throw new Error('APPROVALS_REQUIRED');
    throw new Error('POKER_NOT_READY');
  }
  mustGet(code) {
    const key = clean(code, 6).toUpperCase(), lobby = this.lobbies.get(key);
    if (!lobby || Date.now() - lobby.updatedAt >= MAX_AGE) { this.lobbies.delete(key); this.save(); throw new Error('LOBBY_NOT_FOUND'); }
    return lobby;
  }
  publicLobby(lobby, currentPlayerId) {
    return { code: lobby.code, name: lobby.name, status: lobby.status, game: lobby.game, settings: lobby.settings, settingsRevision: lobby.settingsRevision, hostPlayerId: lobby.hostPlayerId, currentPlayerId, players: lobby.players.map(({ id, name, balance, approvalRevision }) => ({ id, name, balance, approved: approvalRevision === lobby.settingsRevision, isHost: id === lobby.hostPlayerId })), results: lobby.results, createdAt: lobby.createdAt, updatedAt: lobby.updatedAt };
  }
}

module.exports = { LobbyStore, hashToken };
