import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { formatPlaytime, parseSteamProfileInput, steamArtworkUrl } from './steam';
import { loadState, makeState, moveGames } from './tierState';
import type { Game, TierState } from './types';
import './styles.css';

type Sort = 'az' | 'za' | 'most' | 'least' | 'recent';
type Filter = 'all' | 'played' | 'never';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function GameCard({ game, selected, onClick, onPointerDown }: {
  game: Game;
  selected: boolean;
  onClick: (event: React.MouseEvent) => void;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(apiBaseUrl ? null : steamArtworkUrl(game.appid));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !apiBaseUrl) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: '600px 0px' });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!apiBaseUrl || !nearViewport) return;
    setImageFailed(false);
    setImageUrl(`${apiBaseUrl}/api/artwork?appid=${game.appid}&format=image`);
  }, [game.appid, nearViewport]);

  return (
    <button
      ref={cardRef}
      className={`game-card ${selected ? 'selected' : ''}`}
      draggable={false}
      title={`${game.name} — ${formatPlaytime(game.playtimeForever)}`}
      aria-label={`Drag ${game.name}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {imageUrl && !imageFailed && <img loading="lazy" src={imageUrl} alt={game.name} onError={() => imageUrl === steamArtworkUrl(game.appid) ? setImageFailed(true) : setImageUrl(steamArtworkUrl(game.appid))} />}
      {(!imageUrl || imageFailed) && <div className="missing-art" aria-label={`${game.name} artwork unavailable`}>{game.name}</div>}
      <span>{game.name}</span>
    </button>
  );
}


function App() {
  const [profile, setProfile] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [tierState, setTierState] = useState<TierState | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('az');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<TierState[]>([]);
  const [showTierEditor, setShowTierEditor] = useState(false);
  const [cardSize, setCardSize] = useState(184);
  const boardRef = useRef<HTMLDivElement>(null);
  const loadedCardSizeFor = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const dragYRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const pointerDragRef = useRef<{ ids: number[]; startX: number; startY: number; imageUrl: string | null } | null>(null);
  const ignoreNextClickRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ count: number; imageUrl: string | null; x: number; y: number } | null>(null);

  const gamesById = useMemo(() => new Map(games.map((game) => [game.appid, game])), [games]);

  const visibleUnranked = useMemo(() => {
    if (!tierState) return [];

    return tierState.unranked
      .map((id) => gamesById.get(id))
      .filter((game): game is Game => Boolean(game))
      .filter((game) => {
        const matchesSearch = game.name.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filter === 'all'
          || (filter === 'played' && game.playtimeForever > 0)
          || (filter === 'never' && game.playtimeForever === 0);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (sort === 'az') return a.name.localeCompare(b.name);
        if (sort === 'za') return b.name.localeCompare(a.name);
        if (sort === 'most') return b.playtimeForever - a.playtimeForever;
        if (sort === 'least') return a.playtimeForever - b.playtimeForever;
        return (b.playtime2Weeks || 0) - (a.playtime2Weeks || 0);
      });
  }, [filter, gamesById, search, sort, tierState]);

  useEffect(() => {
    if (tierState) {
      localStorage.setItem(`steam-tier-list:${tierState.steamId}`, JSON.stringify(tierState));
    }
  }, [tierState]);

  useEffect(() => {
    if (!tierState) return;
    const key = `steam-tier-list-banner-width:${tierState.steamId}`;
    if (loadedCardSizeFor.current !== tierState.steamId) {
      loadedCardSizeFor.current = tierState.steamId;
      const savedSize = Number(localStorage.getItem(key));
      if (savedSize >= 120 && savedSize <= 320) setCardSize(savedSize);
      return;
    }
    localStorage.setItem(key, String(cardSize));
  }, [cardSize, tierState?.steamId]);

  useEffect(() => {
    function scrollWithWheel(event: WheelEvent) {
      if (!draggingRef.current) return;
      if (event.cancelable) event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
    }

    document.addEventListener('wheel', scrollWithWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', scrollWithWheel, true);
  }, []);

  async function loadLibrary() {
    if (!parseSteamProfileInput(profile)) {
      setMessage('Please enter a valid Steam profile URL, vanity name, or SteamID64.');
      return;
    }
    if (!apiBaseUrl) {
      setMessage('The site has not been connected to its library service.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/library?profile=${encodeURIComponent(profile.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Steam is temporarily unavailable. Please try again.');
      if (!data.games?.length) throw new Error('No publicly visible games were found for this Steam profile.');

      const loadedGames = data.games as Game[];
      setGames(loadedGames);
      setTierState(loadState(data.steamId, loadedGames.map((game) => game.appid)));
      setSelected(new Set());
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Steam is temporarily unavailable. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function move(ids: number[], destination: string) {
    if (!tierState) return;
    setHistory((entries) => [tierState, ...entries].slice(0, 40));
    setTierState(moveGames(tierState, ids, destination));
    setSelected(new Set());
  }

  function stopDragging() {
    draggingRef.current = false;
    pointerDragRef.current = null;
    setDragPreview(null);
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function beginPointerDrag(event: React.PointerEvent, appid: number) {
    if (event.button !== 0) return;
    const imageUrl = (event.currentTarget.querySelector('img') as HTMLImageElement | null)?.currentSrc || null;
    pointerDragRef.current = { ids: selected.has(appid) ? [...selected] : [appid], startX: event.clientX, startY: event.clientY, imageUrl };
  }

  useEffect(() => {
    function movePointer(event: PointerEvent) {
      const drag = pointerDragRef.current;
      if (!drag) return;
      if (!draggingRef.current && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      if (!draggingRef.current) {
        draggingRef.current = true;
        ignoreNextClickRef.current = true;
        startEdgeScroll();
      }
      dragYRef.current = event.clientY;
      setDragPreview({ count: drag.ids.length, imageUrl: drag.imageUrl, x: event.clientX, y: event.clientY });
    }

    function releasePointer(event: PointerEvent) {
      const drag = pointerDragRef.current;
      if (draggingRef.current && drag) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-dropzone]');
        const destination = target?.dataset.dropzone;
        if (destination) move(drag.ids, destination);
      }
      stopDragging();
    }

    window.addEventListener('pointermove', movePointer);
    window.addEventListener('pointerup', releasePointer);
    return () => {
      window.removeEventListener('pointermove', movePointer);
      window.removeEventListener('pointerup', releasePointer);
    };
  }, [selected, tierState]);

  function startEdgeScroll() {
    if (scrollFrameRef.current !== null) return;

    function scrollFrame() {
      if (!draggingRef.current) {
        scrollFrameRef.current = null;
        return;
      }

      const edge = 90;
      const topDistance = dragYRef.current;
      const bottomDistance = window.innerHeight - dragYRef.current;
      let amount = 0;

      if (topDistance < edge) amount = -Math.max(4, Math.ceil(((edge - topDistance) / edge) * 28));
      if (bottomDistance < edge) amount = Math.max(4, Math.ceil(((edge - bottomDistance) / edge) * 28));
      if (amount) window.scrollBy({ top: amount, behavior: 'auto' });

      scrollFrameRef.current = requestAnimationFrame(scrollFrame);
    }

    scrollFrameRef.current = requestAnimationFrame(scrollFrame);
  }

  function toggleSelection(event: React.MouseEvent, appid: number) {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    setSelected((current) => {
      const next = new Set(event.ctrlKey || event.metaKey ? current : []);
      if (next.has(appid)) next.delete(appid);
      else next.add(appid);
      return next;
    });
  }

  function renderCards(ids: number[]) {
    return ids.map((id) => {
      const game = gamesById.get(id);
      if (!game) return null;
      return <GameCard key={id} game={game} selected={selected.has(id)} onClick={(event) => toggleSelection(event, id)} onPointerDown={(event) => beginPointerDrag(event, id)} />;
    });
  }

  function undo() {
    if (!history.length) return;
    const [previous, ...remaining] = history;
    setTierState(previous);
    setHistory(remaining);
  }

  function reset() {
    if (!tierState || !confirm('Reset all tier assignments for this profile?')) return;
    setHistory((entries) => [tierState, ...entries]);
    setTierState(makeState(tierState.steamId, games.map((game) => game.appid)));
  }

  function changeTierLabel(tierId: string, label: string) {
    if (!tierState) return;
    setTierState({
      ...tierState,
      tiers: tierState.tiers.map((tier) => tier.id === tierId ? { ...tier, label } : tier),
      updatedAt: new Date().toISOString(),
    });
  }

  function changeTierColor(tierId: string, color: string) {
    if (!tierState) return;
    setTierState({
      ...tierState,
      tiers: tierState.tiers.map((tier) => tier.id === tierId ? { ...tier, color } : tier),
      updatedAt: new Date().toISOString(),
    });
  }

  function addTier() {
    if (!tierState) return;
    const id = `custom-${crypto.randomUUID()}`;
    setTierState({
      ...tierState,
      tiers: [...tierState.tiers, { id, label: 'New tier', gameIds: [], color: '#c5c5c5', custom: true }],
      updatedAt: new Date().toISOString(),
    });
  }

  function moveTier(tierId: string, direction: -1 | 1) {
    if (!tierState) return;
    const index = tierState.tiers.findIndex((tier) => tier.id === tierId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= tierState.tiers.length) return;
    const tiers = [...tierState.tiers];
    [tiers[index], tiers[destination]] = [tiers[destination], tiers[index]];
    setTierState({ ...tierState, tiers, updatedAt: new Date().toISOString() });
  }

  function deleteTier(tierId: string) {
    if (!tierState) return;
    const tier = tierState.tiers.find((item) => item.id === tierId);
    if (!tier || !confirm(`Delete ${tier.label || 'this tier'}? Its games will return to Unranked.`)) return;
    setTierState({
      ...tierState,
      tiers: tierState.tiers.filter((item) => item.id !== tierId),
      unranked: [...tierState.unranked, ...tier.gameIds],
      updatedAt: new Date().toISOString(),
    });
  }

  async function exportBoard() {
    if (!boardRef.current) return;
    if (games.length > 1500 && !confirm('This may take a while for a large library. Continue?')) return;

    try {
      const image = await toPng(boardRef.current, { cacheBust: true, includeQueryParams: true, pixelRatio: 1 });
      const link = document.createElement('a');
      link.href = image;
      link.download = 'steam-tier-list.png';
      link.click();
    } catch (error) {
      console.error(error);
      setMessage('Could not export this tier list. Try reducing the number of ranked games.');
    }
  }

  if (!tierState) {
    return <main className="welcome"><h1>Steam Library Tier List</h1><p className="muted">Load a public Steam library and sort the games into a tier list.</p><label className="field-label" htmlFor="profile">Steam profile URL, vanity name, or SteamID64</label><div className="load-row"><input id="profile" value={profile} placeholder="https://steamcommunity.com/id/yourname" onChange={(event) => setProfile(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && loadLibrary()} /><button onClick={loadLibrary} disabled={isLoading}>{isLoading ? 'Loading…' : 'Load library'}</button></div>{message && <p className="error" role="alert">{message}</p>}<p className="muted"><small>Your Steam profile and Game Details must be public. Rankings are saved in this browser.</small></p></main>;
  }

  return (
    <main style={{ '--card-width': `${cardSize}px`, '--card-height': `${Math.round(cardSize * 0.467)}px` } as React.CSSProperties} onClick={(event) => event.target === event.currentTarget && setSelected(new Set())}>
      <header className="page-header">
        <div><h1>Steam Library Tier List</h1><p className="muted">{games.length.toLocaleString()} games loaded</p></div>
        <div className="actions">
          <button onClick={undo} disabled={!history.length}>Undo</button>
          <button onClick={reset}>Reset</button>
          <button onClick={() => { if (confirm('Clear saved progress for this profile?')) { localStorage.removeItem(`steam-tier-list:${tierState.steamId}`); setTierState(makeState(tierState.steamId, games.map((game) => game.appid))); } }}>Clear saved</button>
          <button className="primary" onClick={exportBoard}>Export PNG</button>
        </div>
      </header>
      <p className="help">Hold Ctrl or Cmd while clicking to select several games, then drag one of them.</p>
      {message && <p className="error" role="alert">{message}</p>}
      <section className="board" ref={boardRef}>
        {tierState.tiers.map((tier) => (
          <div className="tier-row" key={tier.id}>
            <div className="tier-label" style={{ backgroundColor: tier.color }}>{tier.label || 'Tier'}</div>
            <div className="dropzone" data-dropzone={tier.id}>{renderCards(tier.gameIds)}</div>
          </div>
        ))}
        <div className="tier-row">
          <div className="tier-label na-label">N/A</div>
          <div className="dropzone" data-dropzone="notRanking">{renderCards(tierState.notRanking)}</div>
        </div>
      </section>
      <section className="tier-editor">
        <div className="tier-editor-heading">
          <div><h2>Edit tiers</h2><p className="muted">Changes are saved automatically.</p></div>
          <div className="editor-controls">
            <label className="size-control">Banner size <input type="range" min="120" max="320" step="8" value={cardSize} onChange={(event) => setCardSize(Number(event.target.value))} /> <output>{cardSize}px</output></label>
            <button onClick={() => setShowTierEditor((open) => !open)} aria-expanded={showTierEditor}>{showTierEditor ? 'Hide editor' : 'Edit tiers'}</button>
          </div>
        </div>
        {showTierEditor && <div className="tier-editor-list">
          {tierState.tiers.map((tier, index) => (
            <div className="tier-editor-row" key={tier.id}>
              <input aria-label="Tier name" value={tier.label} onChange={(event) => changeTierLabel(tier.id, event.target.value)} />
              <label className="color-control">Color <input aria-label={`${tier.label || 'Tier'} color`} type="color" value={tier.color || '#c5c5c5'} onChange={(event) => changeTierColor(tier.id, event.target.value)} /></label>
              <button aria-label="Move tier up" disabled={index === 0} onClick={() => moveTier(tier.id, -1)}>Move up</button>
              <button aria-label="Move tier down" disabled={index === tierState.tiers.length - 1} onClick={() => moveTier(tier.id, 1)}>Move down</button>
              <button className="delete" onClick={() => deleteTier(tier.id)}>Delete</button>
            </div>
          ))}
          <button className="add-tier" onClick={addTier}>Add tier</button>
        </div>}
      </section>
      <section className="library">
        <div className="library-head">
          <div><h2>Unranked</h2><p>{visibleUnranked.length} shown · {tierState.unranked.length} unranked · {games.length} total</p></div>
          <div className="controls"><input aria-label="Search unranked games" value={search} placeholder="Search games" onChange={(event) => setSearch(event.target.value)} /><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All games</option><option value="played">Played</option><option value="never">Never played</option></select><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="az">A–Z</option><option value="za">Z–A</option><option value="most">Most played</option><option value="least">Least played</option><option value="recent">Recently played</option></select></div>
        </div>
        <div className="pool" data-dropzone="unranked">{visibleUnranked.map((game) => <GameCard key={game.appid} game={game} selected={selected.has(game.appid)} onClick={(event) => toggleSelection(event, game.appid)} onPointerDown={(event) => beginPointerDrag(event, game.appid)} />)}</div>
      </section>
      {dragPreview && <div className="pointer-drag-preview" style={{ left: dragPreview.x + 14, top: dragPreview.y + 14 }}><div>{dragPreview.imageUrl && <img src={dragPreview.imageUrl} alt="" />}</div>{dragPreview.count > 1 && <b>{dragPreview.count}</b>}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
