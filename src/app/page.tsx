'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Player = { id: string; name: string; balance: number; approved: boolean; isHost: boolean };
type Lobby = { code: string; name: string; status: string; settings: { maxPlayers: number; initialBalance: number }; settingsRevision: number; hostPlayerId: string; currentPlayerId: string; players: Player[] };
type View = 'home' | 'create' | 'join' | 'lobby';
const gameList = (nl: boolean) => [
  { name: 'Poker', icon: '♠', tag: nl ? 'IN ONTWIKKELING' : 'IN DEVELOPMENT', tone: 'purple', desc: nl ? 'Texas Hold’em · Multiplayer wordt gebouwd' : 'Texas Hold’em · Multiplayer is in development' },
  { name: 'UNO', icon: '＋4', tag: nl ? 'BINNENKORT BESCHIKBAAR' : 'COMING SOON', tone: 'red', desc: nl ? 'De klassieker voor de hele groep' : 'The classic for the whole group' },
  { name: 'Monopoly', icon: '⌂', tag: nl ? 'BINNENKORT BESCHIKBAAR' : 'COMING SOON', tone: 'green', desc: nl ? 'Bouw samen je imperium' : 'Build your empire together' },
  { name: nl ? 'Wie is de Impostor?' : 'Guess the Impostor', icon: '◉', tag: nl ? 'BINNENKORT BESCHIKBAAR' : 'COMING SOON', tone: 'orange', desc: nl ? 'Ontmasker de saboteur' : 'Uncover the saboteur' },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Er ging iets mis. Probeer het opnieuw.');
  return data;
}

export default function Home() {
  const [lang, setLang] = useState<'NL' | 'EN'>('NL');
  const [view, setView] = useState<View>('home');
  const [name, setName] = useState('');
  const [lobbyName, setLobbyName] = useState('');
  const [initialBalance, setInitialBalance] = useState(1000);
  const [room, setRoom] = useState('');
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const nl = lang === 'NL';
  const games = gameList(nl);
  const activeLobbyCode = lobby?.code;
  const activePlayerId = lobby?.currentPlayerId;
  const acceptLobby = useCallback((nextLobby: Lobby) => {
    setLobby(current => current ? { ...nextLobby, currentPlayerId: current.currentPlayerId } : nextLobby);
  }, []);

  const loadLobby = useCallback(async (code: string) => {
    const result = await api<{ lobby: Lobby }>(`/api/lobbies/${encodeURIComponent(code)}`);
    setLobby(result.lobby); setView('lobby'); setRoom(result.lobby.code);
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join')?.toUpperCase();
    if (!code) return;
    setRoom(code);
    loadLobby(code).catch(() => { setError(nl ? 'Lobby niet gevonden of server niet bereikbaar. Controleer de code en probeer opnieuw.' : 'Lobby not found or server unavailable. Check the code and try again.'); setView('join'); });
  }, [loadLobby, nl]);

  useEffect(() => {
    if (view !== 'lobby' || !activeLobbyCode || !activePlayerId) return;
    const socket = io({ query: { code: activeLobbyCode }, reconnection: true, reconnectionAttempts: Infinity, timeout: 8000 });
    socketRef.current = socket;
    socket.on('lobby:update', (nextLobby: Lobby) => acceptLobby(nextLobby));
    socket.on('presence:initial', (ids: string[]) => setOnline(ids));
    socket.on('presence:update', ({ playerId, connected }: { playerId: string; connected: boolean }) => setOnline(current => connected ? [...new Set([...current, playerId])] : current.filter(id => id !== playerId)));
    socket.on('connect', () => { setError(''); setOnline(current => [...new Set([...current, activePlayerId])]); });
    socket.on('connect_error', () => setError(nl ? 'Verbinding herstellen…' : 'Reconnecting…'));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [view, activeLobbyCode, activePlayerId, nl, acceptLobby]);

  async function createLobby() {
    setError(''); setBusy(true);
    try {
      const result = await api<{ lobby: Lobby }>('/api/lobbies', { method: 'POST', body: JSON.stringify({ name: lobbyName || 'Game night', displayName: name, initialBalance }) });
      setLobby(result.lobby); setRoom(result.lobby.code); setView('lobby');
      window.history.replaceState({}, '', `/?join=${result.lobby.code}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis.'); }
    finally { setBusy(false); }
  }

  async function joinLobby() {
    setError(''); setBusy(true);
    try {
      const code = room.trim().toUpperCase();
      if (!/^[A-Z0-9]{5,6}$/.test(code)) throw new Error(nl ? 'Vul een geldige lobbycode in.' : 'Enter a valid lobby code.');
      const result = await api<{ lobby: Lobby }>(`/api/lobbies/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
      setLobby(result.lobby); setView('lobby'); setRoom(result.lobby.code);
      window.history.replaceState({}, '', `/?join=${result.lobby.code}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis.'); }
    finally { setBusy(false); }
  }

  async function setApproval(approved: boolean) {
    if (!lobby) return;
    setError('');
    try {
      const result = await api<{ lobby: Lobby }>(`/api/lobbies/${lobby.code}/approval`, { method: 'POST', body: JSON.stringify({ approved }) });
      acceptLobby(result.lobby);
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis.'); }
  }

  async function changeMaxPlayers(maxPlayers: number) {
    if (!lobby) return;
    setError('');
    try {
      const result = await api<{ lobby: Lobby }>(`/api/lobbies/${lobby.code}/settings`, { method: 'POST', body: JSON.stringify({ maxPlayers }) });
      acceptLobby(result.lobby);
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis.'); }
  }

  function goHome() { setView('home'); setLobby(null); setError(''); window.history.replaceState({}, '', '/'); }

  return <main>
    <header className="top"><button className="brand" onClick={goHome}><span className="mark">P</span> partydeck</button><div className="top-right"><span className="online"><i/> {nl ? 'Jullie avond, één plek' : 'Your night, one place'}</span><button className="lang" onClick={() => setLang(nl ? 'EN' : 'NL')}>{lang}⌄</button></div></header>
    {view === 'home' && <><section className="hero"><div className="eyebrow"><span>✦</span> {nl ? 'MAAK ER EEN AVOND VAN' : 'MAKE A NIGHT OF IT'}</div><h1>{nl ? <>De avond begint<br/>met <em>PartyDeck.</em></> : <>Game night starts<br/>with <em>PartyDeck.</em></>}</h1><p>{nl ? 'Eén lobby voor je vrienden, je games en de verhalen van morgen.' : 'One lobby for your friends, your games, and tomorrow’s stories.'}</p><div className="actions"><button className="primary" onClick={() => { setError(''); setView('create'); }}>＋ {nl ? 'Lobby maken' : 'Create a lobby'} <span>↗</span></button><button className="secondary" onClick={() => { setError(''); setView('join'); }}>{nl ? 'Meedoen met code' : 'Join with a code'} <span>→</span></button></div><div className="faces"><div className="avatars"><b>J</b><b>M</b><b>S</b><b>+</b></div><span>{nl ? 'Klaar voor jullie game night' : 'Ready for your game night'}</span></div></section>
      <section className="games"><div className="section-title"><div><div className="eyebrow muted">✦ {nl ? 'KIES JULLIE SPEL' : 'PICK YOUR GAME'}</div><h2>{nl ? 'Wat gaan we spelen?' : 'What are we playing?'}</h2></div><span className="session-chip">{nl ? 'ÉÉN LOBBY · MEER SPELLETJES' : 'ONE LOBBY · MANY GAMES'}</span></div><div className="game-grid">{games.map(g => <article className={`game ${g.tone}`} key={g.name}><div className="game-head"><span className="game-icon">{g.icon}</span><span className="tag">{g.tag}</span></div><h3>{g.name}</h3><p>{g.desc}</p><button disabled>{nl ? 'Nog niet speelbaar' : 'Not playable yet'}</button></article>)}</div></section><footer><span>♠ ♥ ♦ ♣</span><span>{nl ? 'Gemaakt voor avonden die uitlopen.' : 'Made for nights that run late.'}</span><span>PARTYDECK © 2026</span></footer></>}
    {view === 'create' && <section className="panel"><button className="back" onClick={goHome}>← {nl ? 'Terug' : 'Back'}</button><div className="eyebrow muted">✦ {nl ? 'NIEUWE GAME NIGHT' : 'NEW GAME NIGHT'}</div><h2>{nl ? 'Start jullie avond' : 'Start your night'}</h2><p>{nl ? 'Maak een gedeelde lobby. Je vrienden kunnen meedoen met de code.' : 'Create a shared lobby. Friends can join with the code.'}</p><label>{nl ? 'Jouw naam' : 'Your name'}<input value={name} onChange={e => setName(e.target.value)} placeholder={nl ? 'Bijv. Sam' : 'e.g. Sam'} maxLength={24}/></label><label>{nl ? 'Naam van de lobby' : 'Lobby name'}<input value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder={nl ? 'Vrijdagavond' : 'Friday night'} maxLength={60}/></label><label>{nl ? 'Startbalans (virtuele punten)' : 'Starting balance (virtual points)'}<input type="number" min="0" max="1000000" step="100" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))}/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={busy || !name.trim()} onClick={createLobby}>{busy ? (nl ? 'Lobby maken…' : 'Creating lobby…') : (nl ? 'Lobby maken' : 'Create lobby')} <span>↗</span></button></section>}
    {view === 'join' && <section className="panel"><button className="back" onClick={goHome}>← {nl ? 'Terug' : 'Back'}</button><div className="eyebrow muted">✦ {nl ? 'DOE MEE' : 'JOIN THE NIGHT'}</div><h2>{nl ? 'Jouw plek wacht.' : 'Your seat is waiting.'}</h2><p>{nl ? 'Vul de code in die je host heeft gedeeld.' : 'Enter the code your host shared.'}</p><label>{nl ? 'Jouw naam' : 'Your name'}<input value={name} onChange={e => setName(e.target.value)} placeholder={nl ? 'Bijv. Sam' : 'e.g. Sam'} maxLength={24}/></label><label>{nl ? 'Lobbycode' : 'Lobby code'}<input value={room} onChange={e => setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABCDE" maxLength={6}/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={busy || !name.trim() || room.trim().length < 5} onClick={joinLobby}>{busy ? (nl ? 'Deelnemen…' : 'Joining…') : (nl ? 'Meedoen' : 'Join lobby')} <span>→</span></button></section>}
    {view === 'lobby' && lobby && <section className="panel lobby"><button className="back" onClick={goHome}>← {nl ? 'Lobby verlaten' : 'Leave lobby'}</button><div className="eyebrow muted">✦ {nl ? 'GEDEELDE GAME NIGHT' : 'SHARED GAME NIGHT'}</div><h2>{lobby.name}</h2><p>{nl ? 'Deel de code; iedereen ziet dezelfde lobby en spelers.' : 'Share the code; everyone sees the same lobby and players.'}</p><div className="code-box"><small>{nl ? 'LOBBYCODE' : 'LOBBY CODE'}</small><strong>{lobby.code}</strong><button onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/?join=${lobby.code}`); setCopied(true); } catch { setError(nl ? 'Kopiëren is niet gelukt.' : 'Could not copy the invite link.'); } }}>{copied ? (nl ? 'Gekopieerd ✓' : 'Copied ✓') : (nl ? 'Kopieer uitnodiging' : 'Copy invite')}</button></div>
      <div className="lobby-stats"><div><small>HOST</small><b>👑 {lobby.players.find(player => player.isHost)?.name || '—'}</b></div><div><small>{nl ? 'SPELERS' : 'PLAYERS'}</small><b>{lobby.players.length} / {lobby.settings.maxPlayers}</b></div><div><small>{nl ? 'VERBINDING' : 'CONNECTION'}</small><b><i className={`status-dot ${error ? 'is-disconnected' : ''}`}/> {error || (nl ? 'Verbonden' : 'Connected')}</b></div></div>
      {lobby.players.some(player => player.isHost && player.id === lobby.currentPlayerId) && <label className="setting-label">{nl ? 'Maximum aantal spelers' : 'Player limit'}<select value={lobby.settings.maxPlayers} onChange={e => changeMaxPlayers(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => i + 2).filter(n => n >= lobby.players.length).map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
      <div className="player-list"><h3>{nl ? 'Spelers · punten' : 'Players · points'}</h3>{lobby.players.map(player => <div className="player-row" key={player.id}><span><i className={`presence ${online.includes(player.id) ? 'is-online' : ''}`}/>{player.isHost && '👑 '}{player.name}{player.id === lobby.currentPlayerId && <small> ({nl ? 'jij' : 'you'})</small>}</span><b className="balance">{player.balance.toLocaleString()} pts</b><b className={player.approved ? 'ready' : 'waiting'}>{player.approved ? (nl ? 'Goedgekeurd' : 'Approved') : (nl ? 'Nog niet klaar' : 'Not ready')}</b></div>)}</div>
      {error && <p className="error" role="alert">{error}</p>}<button className="secondary wide" onClick={() => setApproval(!lobby.players.find(player => player.id === lobby.currentPlayerId)?.approved)}>{lobby.players.find(player => player.id === lobby.currentPlayerId)?.approved ? (nl ? 'Instellingen niet meer goedkeuren' : 'Unapprove settings') : (nl ? 'Instellingen goedkeuren' : 'Approve settings')}</button>
      <div className="game-choice"><h3>{nl ? 'Spellen' : 'Games'}</h3>{games.map(g => <div className="choice" key={g.name}><span>{g.icon} &nbsp;{g.name}</span><small>{g.tag}</small></div>)}</div><p className="notice">{nl ? 'Lobbies worden op de server gedeeld en als bestand bewaard. Games zijn nog niet speelbaar.' : 'Lobbies are shared by the server and saved as a file. Games are not playable yet.'}</p>
    </section>}
  </main>;
}
