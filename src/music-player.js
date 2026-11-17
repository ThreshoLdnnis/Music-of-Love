function createMusicPlayer({ onState = () => {}, onOpenSong = () => {}, onNeedAudio = () => {} } = {}) {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.setAttribute('playsinline', '');
  const dock = document.createElement('section');
  dock.className = 'music-player';
  dock.setAttribute('aria-label', '音乐播放器');
  dock.hidden = true;
  dock.innerHTML = `<div class="player-top"><button class="player-song" type="button" aria-label="打开当前歌曲"><span class="player-cover"><img alt="" hidden><span class="player-cover-empty" aria-hidden="true">♪</span></span><span class="player-song-copy"><span class="player-title"></span><span class="player-artist"></span></span></button><div class="player-actions"><button class="player-skip player-prev" type="button" aria-label="播放上一首"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4v12M15 4 6 10l9 6Z"/></svg></button><button class="player-toggle" type="button" aria-label="播放"><svg class="player-play-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7Z"/></svg><svg class="player-pause-icon" viewBox="0 0 20 20" aria-hidden="true" hidden><path d="M5 4h3v12H5zM12 4h3v12h-3z"/></svg></button><button class="player-skip player-next" type="button" aria-label="播放下一首"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 4v12M5 4l9 6-9 6Z"/></svg></button></div><button class="player-close" type="button" aria-label="关闭播放器并停止播放">×</button></div><div class="player-timeline"><span class="player-time-current">0:00</span><input class="player-seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="播放进度" disabled><span class="player-time-total">0:00</span></div><p class="player-status" role="status" aria-live="polite" hidden></p>`;
  document.body.append(audio, dock);
  const find = selector => dock.querySelector(selector);
  const title = find('.player-title'), artist = find('.player-artist'), cover = find('.player-cover img');
  const emptyCover = find('.player-cover-empty'), seek = find('.player-seek');
  const playButton = find('.player-toggle'), playIcon = find('.player-play-icon'), pauseIcon = find('.player-pause-icon');
  const timeCurrent = find('.player-time-current'), timeTotal = find('.player-time-total'), status = find('.player-status');
  const previous = find('.player-prev'), next = find('.player-next');
  let tracks = [], active = null, loadedSource = '', serial = 0, destroyed = false, isSeeking = false;
  let playing = false, error = '', message = '', lastNotified = '';
  const cleanAudio = value => {
    if (!value || typeof value !== 'string') return '';
    try { const url = new URL(value, location.href); return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const cleanExternal = value => {
    if (!value || typeof value !== 'string') return '';
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const cleanCover = value => {
    if (typeof value !== 'string') return '';
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(value)) return value;
    return cleanAudio(value);
  };
  const seconds = value => Number.isFinite(value) && value >= 0 ? value : 0;
  const formatTime = value => { const s = Math.floor(seconds(value)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function getState() { return { id: active?.id ?? null, playing, currentTime: loadedSource ? seconds(audio.currentTime) : 0, duration: loadedSource ? seconds(audio.duration) : 0, error }; }
  function publish(force = false) {
    if (destroyed) return;
    const state = getState();
    const key = JSON.stringify(state);
    if (force || key !== lastNotified) { lastNotified = key; onState(state); }
  }
  function render() {
    if (destroyed) return;
    dock.hidden = !active;
    document.body.classList.toggle('has-music-player', !!active);
    if (!active) { publish(); return; }
    title.textContent = active.title || '未命名歌曲';
    artist.textContent = active.artist || '未知歌手';
    find('.player-song').setAttribute('aria-label', `打开《${active.title || '未命名歌曲'}》歌词`);
    const coverSource = cleanCover(active.coverUrl);
    if (coverSource && cover.getAttribute('src') !== coverSource) { cover.src = coverSource; cover.hidden = false; emptyCover.hidden = true; }
    else if (!coverSource) { cover.removeAttribute('src'); cover.hidden = true; emptyCover.hidden = false; }
    playButton.setAttribute('aria-label', loadedSource ? (playing ? '暂停' : '播放') : (cleanExternal(active.externalUrl) ? '在音乐平台播放' : '添加音频'));
    playButton.title = playButton.getAttribute('aria-label');
    playIcon.hidden = playing; pauseIcon.hidden = !playing;
    const state = getState();
    timeCurrent.textContent = formatTime(isSeeking ? Number(seek.value) : state.currentTime);
    timeTotal.textContent = formatTime(state.duration);
    seek.disabled = !loadedSource || !state.duration;
    seek.max = String(state.duration || 1);
    if (!isSeeking) seek.value = String(Math.min(state.currentTime, state.duration || 0));
    seek.setAttribute('aria-valuetext', `${formatTime(Number(seek.value))}，共 ${formatTime(state.duration)}`);
    seek.style.setProperty('--player-progress', `${state.duration ? Number(seek.value) / state.duration * 100 : 0}%`);
    const playable = tracks.filter(t => cleanAudio(t.audioUrl));
    const canSkip = playable.length > 1 || (playable.length === 1 && playable[0].id !== active.id);
    previous.disabled = next.disabled = !canSkip;
    status.textContent = error || message;
    status.hidden = !(error || message);
    dock.classList.toggle('player-has-error', !!error);
    publish();
  }
  function clearAudio() {
    serial++;
    playing = false;
    loadedSource = '';
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    isSeeking = false;
  }
  function choose(track) {
    const source = cleanAudio(track?.audioUrl);
    if (!active || active.id !== track.id || loadedSource !== source) {
      clearAudio();
      active = track;
      error = ''; message = '';
      if (source) { loadedSource = source; audio.src = source; audio.load(); }
    } else active = track;
    return source;
  }
  function externalPlay(track) {
    const url = cleanExternal(track.externalUrl);
    if (!url) { onNeedAudio(track.id); return false; }
    choose(track);
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.click();
    message = '已打开音乐平台，在新页面收听。';
    error = ''; playing = false; render();
    return true;
  }
  async function startAudio() {
    if (destroyed || !active || !loadedSource) return false;
    const request = ++serial;
    error = ''; message = '正在载入音乐…'; render();
    if (audio.ended) audio.currentTime = 0;
    try {
      await audio.play();
      if (destroyed || request !== serial) return false;
      playing = !audio.paused && !audio.ended; message = ''; render(); return playing;
    } catch (failure) {
      if (destroyed || request !== serial || failure?.name === 'AbortError') return false;
      playing = false; message = '';
      error = failure?.name === 'NotAllowedError' ? '浏览器暂未允许播放，请再次点击播放。' : '这首音乐暂时无法播放，请检查音频文件或链接。';
      render(); return false;
    }
  }
  function pauseAudio() { serial++; audio.pause(); playing = false; message = ''; render(); }
  function play(track) {
    if (destroyed || !track?.id) return Promise.resolve(false);
    const source = cleanAudio(track.audioUrl);
    if (!source) return Promise.resolve(externalPlay(track));
    const same = active?.id === track.id && loadedSource === source;
    choose(track);
    if (same && !audio.paused && !audio.ended) { pauseAudio(); return Promise.resolve(false); }
    return startAudio();
  }
  function toggle() {
    if (!active || destroyed) return Promise.resolve(false);
    return play(active);
  }
  function setTracks(nextTracks) {
    tracks = Array.isArray(nextTracks) ? nextTracks.slice() : [];
    if (!active) return;
    const updated = tracks.find(track => track.id === active.id);
    if (!updated) { clearAudio(); active = null; error = message = ''; render(); return; }
    const nextSource = cleanAudio(updated.audioUrl);
    if (nextSource !== loadedSource) {
      choose(updated);
      message = nextSource ? '音频已更新，点击播放。' : '音频已移除，可在歌曲设置中重新添加。';
      error = '';
    } else active = updated;
    render();
  }
  function skip(direction) {
    const playable = tracks.filter(track => cleanAudio(track.audioUrl));
    if (!playable.length) return;
    const at = playable.findIndex(track => track.id === active?.id);
    const target = at < 0 ? (direction > 0 ? 0 : playable.length - 1) : (at + direction + playable.length) % playable.length;
    play(playable[target]);
  }
  const handlers = [];
  function listen(target, type, fn) { target.addEventListener(type, fn); handlers.push(() => target.removeEventListener(type, fn)); }
  listen(playButton, 'click', toggle);
  listen(previous, 'click', () => skip(-1));
  listen(next, 'click', () => skip(1));
  listen(find('.player-song'), 'click', () => { if (active) onOpenSong(active.id); });
  listen(find('.player-close'), 'click', () => { clearAudio(); active = null; error = message = ''; render(); });
  listen(cover, 'error', () => { cover.hidden = true; emptyCover.hidden = false; });
  listen(seek, 'input', () => { isSeeking = true; render(); });
  listen(seek, 'change', () => { if (loadedSource && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, Number(seek.value))); isSeeking = false; render(); });
  listen(seek, 'blur', () => { isSeeking = false; render(); });
  ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'].forEach(event => listen(audio, event, render));
  listen(audio, 'playing', () => { if (!loadedSource) return; playing = true; error = message = ''; render(); });
  listen(audio, 'pause', () => { playing = false; render(); });
  listen(audio, 'waiting', () => { if (!loadedSource || audio.paused) return; message = '正在缓冲…'; render(); });
  listen(audio, 'canplay', () => { if (!error) message = ''; render(); });
  listen(audio, 'ended', () => { playing = false; message = '播放完毕'; render(); });
  listen(audio, 'error', () => {
    if (!loadedSource || !active || !audio.error) return;
    playing = false; message = '';
    error = audio.error.code === 4 ? '浏览器无法播放这个音频格式，请换一个音频文件。' : '音频读取失败，请检查文件或音乐链接。';
    render();
  });
  function destroy() {
    if (destroyed) return;
    clearAudio(); active = null; error = message = ''; publish(true);
    handlers.forEach(remove => remove());
    destroyed = true;
    audio.remove(); dock.remove(); document.body.classList.remove('has-music-player');
  }
  return { play, toggle, setTracks, getState, destroy };
}
