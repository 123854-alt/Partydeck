import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';

let serverProcess;
let port;
let folder;
let log = '';
const sockets = [];
const origin = () => `http://127.0.0.1:${port}`;

async function getPort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const selected = address.port;
  await new Promise(resolve => server.close(resolve));
  return selected;
}

async function startServer() {
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PARTYDECK_STATE_FILE: path.join(folder, 'lobbies.json') },
  });
  serverProcess.stdout.on('data', chunk => { log += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { log += chunk.toString(); });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`PartyDeck server stopped: ${log}`);
    try { if ((await fetch(`${origin()}/api/health`)).ok) return; } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`PartyDeck server did not become ready: ${log}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const processRef = serverProcess;
  processRef.kill();
  await Promise.race([new Promise(resolve => processRef.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie');
  if (!value) throw new Error('Expected a guest-session cookie');
  return value.split(';', 1)[0];
}

function connectSocket(code, cookie) {
  const socket = io(origin(), { query: { code }, extraHeaders: { Cookie: cookie, Origin: origin() }, transports: ['websocket'], reconnection: false, timeout: 5000 });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Socket connect timeout: ${log}`)), 8000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
  });
}

function waitForPlayerCount(socket, count) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('lobby:update', listener); reject(new Error(`Lobby did not reach ${count} players`)); }, 5000);
    const listener = lobby => { if (lobby.players.length === count) { clearTimeout(timer); socket.off('lobby:update', listener); resolve(lobby); } };
    socket.on('lobby:update', listener);
  });
}

beforeAll(async () => { port = await getPort(); folder = mkdtempSync(path.join(os.tmpdir(), 'partydeck-server-test-')); await startServer(); }, 60000);
afterAll(async () => { sockets.forEach(socket => socket.disconnect()); await stopServer(); if (folder) rmSync(folder, { recursive: true, force: true }); });

describe('shared multiplayer lobby server', () => {
  it('shares joins over sockets and restores the lobby after restart', async () => {
    const createdResponse = await fetch(`${origin()}/api/lobbies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test night', displayName: 'Host' }) });
    expect(createdResponse.status).toBe(201);
    const hostCookie = cookieFrom(createdResponse);
    const { lobby: created } = await createdResponse.json();
    const hostSocket = await connectSocket(created.code, hostCookie);

    const sharedUpdatePromise = waitForPlayerCount(hostSocket, 2);
    const joinedResponse = await fetch(`${origin()}/api/lobbies/${created.code}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Guest' }) });
    expect(joinedResponse.status).toBe(200);
    const { lobby: joined } = await joinedResponse.json();
    expect(joined.code).toBe(created.code);
    const sharedUpdate = await sharedUpdatePromise;
    expect(sharedUpdate.players.map(player => player.name)).toEqual(['Host', 'Guest']);

    const guestCookie = cookieFrom(joinedResponse);
    const guestSocket = await connectSocket(created.code, guestCookie);
    expect(guestSocket.connected).toBe(true);

    await stopServer();
    await startServer();
    const restoredResponse = await fetch(`${origin()}/api/lobbies/${created.code}`, { headers: { Cookie: hostCookie } });
    expect(restoredResponse.status).toBe(200);
    const { lobby: restored } = await restoredResponse.json();
    expect(restored.players.map(player => player.name)).toEqual(['Host', 'Guest']);
  }, 90000);
});
