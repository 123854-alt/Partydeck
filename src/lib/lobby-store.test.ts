import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { LobbyStore } = require('./lobby-store.cjs');

const folders: string[] = [];
function makeStore() {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'partydeck-test-'));
  folders.push(folder);
  return new LobbyStore(path.join(folder, 'lobbies.json'));
}
afterEach(() => { while (folders.length) { const folder = folders.pop(); if (folder) rmSync(folder, { recursive: true, force: true }); } });

describe('database-free shared lobby store', () => {
  it('creates and joins the same lobby, then restores it after a server restart', () => {
    const store = makeStore();
    const host = store.create({ name: 'Friday night', displayName: 'Alex', maxPlayers: 3 });
    const guest = store.join(host.lobby.code, 'Sam');
    expect(guest.lobby.code).toBe(host.lobby.code);
    expect(guest.lobby.players.map((player: { name: string }) => player.name)).toEqual(['Alex', 'Sam']);
    expect(JSON.stringify(host.lobby)).not.toContain(host.token);

    const saved = readFileSync(store.filePath, 'utf8');
    expect(saved).not.toContain(host.token);
    const restarted = new LobbyStore(store.filePath);
    const hostSession = restarted.authenticate(host.lobby.code, host.token);
    expect(hostSession.name).toBe('Alex');
    expect(restarted.get(host.lobby.code, hostSession.id).players).toHaveLength(2);
  });

  it('enforces unique names and the lobby capacity', () => {
    const store = makeStore();
    const host = store.create({ name: 'Party', displayName: 'Alex', maxPlayers: 2 });
    expect(() => store.join(host.lobby.code, 'alex')).toThrow('NAME_TAKEN');
    store.join(host.lobby.code, 'Sam');
    expect(() => store.join(host.lobby.code, 'Jamie')).toThrow('LOBBY_FULL');
  });

  it('invalidates approvals when the host changes lobby settings', () => {
    const store = makeStore();
    const host = store.create({ name: 'Party', displayName: 'Alex', maxPlayers: 4 });
    const guest = store.join(host.lobby.code, 'Sam');
    store.approve(host.lobby.code, host.lobby.currentPlayerId, true);
    store.approve(host.lobby.code, guest.lobby.currentPlayerId, true);
    const updated = store.updateSettings(host.lobby.code, host.lobby.currentPlayerId, { maxPlayers: 3 });
    expect(updated.settingsRevision).toBe(2);
    expect(updated.players.every((player: { approved: boolean }) => !player.approved)).toBe(true);
  });

  it('blocks joining after the session starts or ends', () => {
    const store = makeStore();
    const host = store.create({ name: 'Party', displayName: 'Alex' });
    const lobby = store.lobbies.get(host.lobby.code);
    lobby.status = 'playing';
    expect(() => store.join(host.lobby.code, 'Sam')).toThrow('LOBBY_NOT_JOINABLE');
  });
});
