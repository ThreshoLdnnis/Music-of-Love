function createMusicLibrary({ onChange = () => {} } = {}) {
  const DB_NAME = 'personal-music-corner', DB_VERSION = 1;
  const records = new Map(), hydrated = new Map(), ownedUrls = new Set();
  let db = null, persistent = true, loaded = false, name = typeof MUSIC_NAME !== 'undefined' ? MUSIC_NAME : '我的音乐角';
  let editor = null, form = null, editingId = null, lastFocus = null, busy = false, deleteArmed = false, previewUrl = null;
  const toast = document.createElement('div');
  toast.className = 'music-library-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.append(toast);
  let toastTimer;

  function announce(message, long = false) {
    clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, long ? 12000 : 4000);
  }
  function losePersistence() {
    persistent = false; db?.close(); db = null;
    announce('当前浏览器暂时无法保存收藏。你仍可在本次页面中使用，关闭后新增内容不会保留。', true);
    if (editor) editor.querySelector('[data-storage-note]').textContent = storageNote();
  }
  function storageNote() { return persistent ? '收藏保存在这台设备的当前浏览器中。封面、歌词和音频都由你自己选择。' : '本次页面可以正常使用，但关闭后新增内容不会保留。'; }
  function asUrl(value, label) {
    const input = String(value || '').trim(); if (!input) return '';
    let parsed; try { parsed = new URL(input); } catch { throw new Error(`${label}需要完整的 https:// 或 http:// 链接。`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label}只支持 https:// 或 http:// 链接。`);
    return parsed.href;
  }
  function defaultId(item) {
    if (typeof item.id === 'string' && item.id.trim()) return item.id.trim();
    // Stable across reordered defaults and rebuilds; explicit IDs remain preferred for alternate versions.
    const identity = `${String(item.title).trim()}\u0000${String(item.artist).trim()}\u0000${String(item.album || '').trim()}`.normalize('NFC');
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++) { hash ^= identity.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `default-${(hash >>> 0).toString(16)}`;
  }
  async function defaultMedia(value, kind, label) {
    const source = String(value || '').trim();
    if (source.startsWith(`data:${kind}/`)) {
      // Embedded media is accepted only from our built-in defaults; editor links still use asUrl().
      const response = await fetch(source), blob = await response.blob();
      if (!blob.type.startsWith(`${kind}/`)) throw new Error(`Invalid embedded ${kind}`);
      return { blob, remote: '' };
    }
    return { blob: null, remote: asUrl(source, label) };
  }
  function makeUrl(blob) { const url = URL.createObjectURL(blob); ownedUrls.add(url); return url; }
  function hydrate(record, previousRecord = null) {
    const previous = hydrated.get(record.id);
    const sameCover = previous && previousRecord && record.coverBlob === previousRecord.coverBlob && record.coverRemote === previousRecord.coverRemote;
    const sameAudio = previous && previousRecord && record.audioBlob === previousRecord.audioBlob && record.audioRemote === previousRecord.audioRemote;
    const track = { id: record.id, title: record.title, artist: record.artist, album: record.album || '', year: record.year || '', coverUrl: sameCover ? previous.coverUrl : record.coverBlob ? makeUrl(record.coverBlob) : record.coverRemote || '', lyrics: record.lyrics || '', audioUrl: sameAudio ? previous.audioUrl : record.audioBlob ? makeUrl(record.audioBlob) : record.audioRemote || '', externalUrl: record.externalUrl || '', note: record.note || '' };
    hydrated.set(record.id, track); return track;
  }
  function all() { return [...records.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(record => hydrated.get(record.id) || hydrate(record)); }
  async function emit(reason, id = null) {
    try { await onChange(all(), { name, reason, id, persistent }); }
    catch (error) { console.error('Music corner update:', error); announce('收藏已保存。页面更新遇到问题，刷新后可以重新打开。', true); }
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Storage unavailable')); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION); let settled = false;
      const fail = value => { if (!settled) { settled = true; clearTimeout(timer); reject(value); } };
      const timer = setTimeout(() => fail(new Error('Storage did not open')), 5000);
      request.onupgradeneeded = () => { const database = request.result; if (!database.objectStoreNames.contains('tracks')) database.createObjectStore('tracks', { keyPath: 'id' }); if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' }); };
      request.onsuccess = () => { if (settled) { request.result.close(); return; } settled = true; clearTimeout(timer); resolve(request.result); };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Storage is busy'));
    });
  }
  function readStore(store) {
    return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  async function persist(change) {
    if (!db) return;
    try { await new Promise((resolve, reject) => { const tx = db.transaction(['tracks', 'settings'], 'readwrite'); change(tx.objectStore('tracks'), tx.objectStore('settings')); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
    catch (error) { console.warn('Music corner local saving is unavailable:', error?.name || 'storage error'); losePersistence(); }
  }
  const initialLoad = (async () => {
    let settings = [];
    try {
      db = await openDatabase(); db.onversionchange = () => losePersistence();
      const [saved, savedSettings] = await Promise.all([readStore('tracks'), readStore('settings')]); settings = savedSettings;
      saved.forEach(record => { if (record && typeof record.id === 'string' && typeof record.title === 'string') records.set(record.id, record); });
      const savedName = settings.find(item => item.key === 'name')?.value;
      if (typeof savedName === 'string' && savedName.trim()) name = savedName;
    } catch (error) { losePersistence(); }
    const remembered = settings.find(item => item.key === 'seenDefaultIds')?.value;
    const seenDefaults = new Set(Array.isArray(remembered) ? remembered.filter(id => typeof id === 'string') : []);
    const defaults = typeof MUSIC_DEFAULTS !== 'undefined' && Array.isArray(MUSIC_DEFAULTS) ? MUSIC_DEFAULTS : [];
    const additions = []; let changed = !Array.isArray(remembered);
    for (let i = 0; i < defaults.length; i++) {
      const item = defaults[i]; if (!item?.title || !item?.artist) continue;
      const id = defaultId(item); if (seenDefaults.has(id)) continue;
      if (records.has(id)) { seenDefaults.add(id); changed = true; continue; }
      try {
        const [cover, audio] = await Promise.all([defaultMedia(item.coverUrl, 'image', '封面'), defaultMedia(item.audioUrl, 'audio', '音频')]);
        const record = { id, title: String(item.title), artist: String(item.artist), album: item.album || '', year: item.year || '', lyrics: item.lyrics || '', note: item.note || '', createdAt: Date.now() + i, coverBlob: cover.blob, coverRemote: cover.remote, coverFilename: cover.blob ? '内置封面' : '', audioBlob: audio.blob, audioRemote: audio.remote, audioFilename: audio.blob ? '内置音频' : '', externalUrl: asUrl(item.externalUrl, '音乐平台') };
        records.set(id, record); additions.push(record); seenDefaults.add(id); changed = true;
      } catch (error) { console.warn('Music corner skipped an invalid built-in song:', id, error?.message); }
    }
    if (changed || additions.length) await persist((songs, settingsStore) => {
      additions.forEach(record => songs.put(record));
      // Keep IDs after a song is removed so later site updates never resurrect that default.
      settingsStore.put({ key: 'seenDefaultIds', value: [...seenDefaults] });
      settingsStore.put({ key: 'initialized', value: true });
      settingsStore.put({ key: 'name', value: name });
    });
    const rememberedUpdates = settings.find(item => item.key === 'appliedContentUpdates')?.value;
    const appliedUpdates = new Set(Array.isArray(rememberedUpdates) ? rememberedUpdates.filter(key => typeof key === 'string') : []);
    const contentUpdates = typeof MUSIC_CONTENT_UPDATES !== 'undefined' && Array.isArray(MUSIC_CONTENT_UPDATES) ? MUSIC_CONTENT_UPDATES : [];
    const updatedRecords = new Map();
    for (const update of contentUpdates) {
      if (typeof update?.id !== 'string' || !update.id || typeof update.revision !== 'string' || !update.revision || typeof update.fields?.lyrics !== 'string') continue;
      const key = `${update.id}:${update.revision}`;
      if (appliedUpdates.has(key)) continue;
      const existing = records.get(update.id); if (!existing) continue;
      // Deliberately whitelist lyrics only. Keep personal edits to all other fields and media intact.
      const updated = { ...existing, lyrics: update.fields.lyrics };
      records.set(update.id, updated); updatedRecords.set(update.id, updated); appliedUpdates.add(key);
    }
    if (updatedRecords.size) await persist((songs, settingsStore) => {
      updatedRecords.forEach(record => songs.put(record));
      // Store revisions atomically with the edits so the same update cannot overwrite later manual changes.
      settingsStore.put({ key: 'appliedContentUpdates', value: [...appliedUpdates] });
    });
    loaded = true; return all();
  })();
  function ready() { return initialLoad; }
  async function setName(value) {
    await ready(); const trimmed = String(value || '').trim().slice(0, 40); if (!trimmed) return;
    name = trimmed; await persist((songs, settings) => settings.put({ key: 'name', value: name })); await emit('rename');
  }
  function clearPreview() { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } }
  function preview(src) {
    const image = editor.querySelector('[data-cover-preview]'), blank = editor.querySelector('[data-cover-blank]');
    image.hidden = !src; blank.hidden = !!src; if (src) image.src = src; else image.removeAttribute('src');
  }
  function error(message) { const box = editor.querySelector('[data-form-error]'); box.textContent = message; box.hidden = !message; }
  function setBusy(value) { busy = value; editor.querySelectorAll('button').forEach(button => { button.disabled = value; }); editor.querySelector('[data-save-label]').textContent = value ? '正在保存…' : editingId ? '保存修改' : '放入音乐角'; }
  function resetDelete() { deleteArmed = false; const button = editor?.querySelector('[data-delete-song]'); if (button) button.textContent = '移出收藏'; }
  function ensureEditor() {
    if (editor) return;
    editor = document.createElement('dialog'); editor.className = 'music-editor'; editor.setAttribute('aria-labelledby', 'music-editor-heading');
    editor.innerHTML = `<form class="music-editor-form"><header class="music-editor-head"><div><span class="music-editor-kicker">PERSONAL COLLECTION</span><h2 id="music-editor-heading">收藏一首歌</h2></div><button type="button" class="music-editor-close" data-close-editor aria-label="关闭歌曲编辑">×</button></header><p class="music-editor-intro">让封面成为唱片，让歌词留在这里。</p><div class="music-editor-grid"><div class="music-cover-column"><div class="music-cover-preview"><img data-cover-preview alt="歌曲封面预览" hidden><span data-cover-blank>YOUR<br>MUSIC<br><small>SIDE A / 01</small></span></div><label class="music-file-choice"><span>选择封面图片</span><input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif"></label><small data-cover-filename></small><label class="music-editor-field music-cover-link">或粘贴封面链接<input name="coverRemote" type="url" placeholder="https://…" autocomplete="off"></label><label class="music-check" data-cover-remove hidden><input name="removeCover" type="checkbox">移除当前封面</label></div><div class="music-track-fields"><label class="music-editor-field">歌名 <span class="music-required">必填</span><input name="title" required maxlength="120" placeholder="你想反复听的那首歌" autocomplete="off"></label><label class="music-editor-field">歌手 <span class="music-required">必填</span><input name="artist" required maxlength="120" placeholder="谁唱的" autocomplete="off"></label><div class="music-editor-pair"><label class="music-editor-field">专辑<input name="album" maxlength="150" placeholder="可稍后补充"></label><label class="music-editor-field">年份<input name="year" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="2026"></label></div><label class="music-editor-field">关于这首歌<textarea name="note" rows="3" maxlength="2000" placeholder="一段回忆，或者喜欢它的理由。"></textarea></label></div></div><label class="music-editor-field music-lyrics-field">歌词<textarea name="lyrics" rows="9" maxlength="100000" placeholder="粘贴你已有的歌词，空行会保留为段落。也支持带时间标记的 LRC 歌词。"></textarea></label><label class="music-file-choice music-lyrics-import"><span>或选择歌词文件</span><input name="lyricsFile" type="file" accept=".txt,.lrc,text/plain"></label><details class="music-audio-settings"><summary>为这首歌添加播放来源 <span>可稍后补充</span></summary><div class="music-audio-inner"><p>选择自己的音频文件，即可在音乐角中播放；也可以保留音乐平台链接。</p><label class="music-file-choice"><span>选择音频文件</span><input name="audioFile" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"></label><small data-audio-filename></small><label class="music-check" data-audio-remove hidden><input name="removeAudio" type="checkbox">移除当前音频</label><label class="music-editor-field">或填写音频直链<input name="audioRemote" type="url" placeholder="https://…/song.mp3" autocomplete="off"></label><label class="music-editor-field">音乐平台链接<input name="externalUrl" type="url" placeholder="这首歌在音乐平台上的分享链接" autocomplete="off"></label></div></details><details class="music-space-settings"><summary>给音乐角取个名字</summary><label class="music-editor-field">音乐角名称<input name="cornerName" maxlength="40" placeholder="我的音乐角"></label></details><p class="music-storage-note" data-storage-note></p><p class="music-editor-error" role="alert" data-form-error hidden></p><footer class="music-editor-actions"><button type="button" class="music-delete" data-delete-song hidden>移出收藏</button><div><button type="button" class="music-cancel" data-close-editor>取消</button><button type="submit" class="music-save"><span data-save-label>放入音乐角</span><span aria-hidden="true">↗</span></button></div></footer></form>`;
    document.body.append(editor); form = editor.querySelector('form');
    editor.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    editor.querySelectorAll('[data-close-editor]').forEach(button => button.addEventListener('click', () => { if (!busy) editor.close(); }));
    editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    editor.addEventListener('close', () => { clearPreview(); resetDelete(); lastFocus?.isConnected && lastFocus.focus({ preventScroll: true }); });
    editor.addEventListener('click', event => { if (event.target === editor && !busy) { const r = editor.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) editor.close(); } });
    form.elements.coverFile.addEventListener('change', () => { clearPreview(); const file = form.elements.coverFile.files[0]; editor.querySelector('[data-cover-filename]').textContent = file?.name || ''; if (file) { previewUrl = URL.createObjectURL(file); preview(previewUrl); form.elements.removeCover.checked = false; } });
    form.elements.coverRemote.addEventListener('change', () => { try { const url = asUrl(form.elements.coverRemote.value, '封面'); if (!form.elements.coverFile.files[0]) preview(url || hydrated.get(editingId)?.coverUrl || ''); error(''); } catch (err) { error(err.message); } });
    form.elements.audioFile.addEventListener('change', () => { const file = form.elements.audioFile.files[0]; editor.querySelector('[data-audio-filename]').textContent = file?.name || ''; if (file) form.elements.removeAudio.checked = false; });
    form.elements.lyricsFile.addEventListener('change', async () => {
      const file = form.elements.lyricsFile.files[0]; if (!file) return;
      try { if (file.size > 1024 * 1024) throw new Error('请选择 1 MB 以内的歌词文件。'); const text = await file.text(); if (text.length > 100000) throw new Error('歌词内容太长，请精简后再导入。'); form.elements.lyrics.value = text.replace(/\r\n?/g, '\n'); error(''); }
      catch (err) { error(err.message || '无法读取这个歌词文件。'); }
    });
    form.addEventListener('input', resetDelete);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      error('');
      try {
        const old = records.get(editingId), fields = form.elements, coverFile = fields.coverFile.files[0], audioFile = fields.audioFile.files[0];
        const title = fields.title.value.trim(), artist = fields.artist.value.trim(); if (!title || !artist) throw new Error('请填写歌名和歌手。');
        if (coverFile && (!coverFile.type.startsWith('image/') || coverFile.size > 20 * 1024 * 1024)) throw new Error('请选择 20 MB 以内的图片作为封面。');
        if (audioFile && audioFile.size > 250 * 1024 * 1024) throw new Error('请选择 250 MB 以内的音频文件。');
        if (audioFile && audioFile.type && !audioFile.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(audioFile.name)) throw new Error('这个文件看起来不是音频，请重新选择。');
        const coverRemote = asUrl(fields.coverRemote.value, '封面'), audioRemote = asUrl(fields.audioRemote.value, '音频'), externalUrl = asUrl(fields.externalUrl.value, '音乐平台');
        const record = { id: old?.id || `song-${crypto.randomUUID()}`, createdAt: old?.createdAt || Date.now(), title, artist, album: fields.album.value.trim(), year: fields.year.value.trim(), lyrics: fields.lyrics.value.replace(/\r\n?/g, '\n'), note: fields.note.value.trim(), externalUrl,
          coverBlob: fields.removeCover.checked ? null : coverFile || (coverRemote !== (old?.coverRemote || '') ? null : old?.coverBlob || null),
          coverRemote: fields.removeCover.checked || coverFile ? '' : coverRemote,
          coverFilename: fields.removeCover.checked ? '' : coverFile?.name || old?.coverFilename || '',
          audioBlob: fields.removeAudio.checked ? null : audioFile || (audioRemote !== (old?.audioRemote || '') ? null : old?.audioBlob || null),
          audioRemote: fields.removeAudio.checked || audioFile ? '' : audioRemote,
          audioFilename: fields.removeAudio.checked ? '' : audioFile?.name || old?.audioFilename || '' };
        const newName = fields.cornerName.value.trim() || name; setBusy(true);
        await persist((songs, settings) => { songs.put(record); settings.put({ key: 'name', value: newName }); });
        records.set(record.id, record); hydrate(record, old); name = newName;
        // Previously exposed blob URLs remain valid for any song still playing. They are released with the page.
        await emit(old ? 'edit' : 'add', record.id); setBusy(false); editor.close();
        announce(persistent ? old ? '已保存这首歌的修改。' : '已把这首歌放入音乐角。' : '已加入本次页面；当前浏览器无法保存，关闭后不会保留。', !persistent);
      } catch (err) { setBusy(false); error(err.message || '保存时出了点问题，请再试一次。'); }
    });
    editor.querySelector('[data-delete-song]').addEventListener('click', async () => {
      if (busy || !editingId) return;
      if (!deleteArmed) { deleteArmed = true; editor.querySelector('[data-delete-song]').textContent = '再次点击，确认移出'; return; }
      setBusy(true); const id = editingId; await persist(songs => songs.delete(id)); records.delete(id); hydrated.delete(id); await emit('delete', id); setBusy(false); editor.close(); announce('这首歌已移出收藏。');
    });
  }
  async function openEditor(id = null) {
    await ready(); ensureEditor(); if (busy) return;
    editingId = records.has(id) ? id : null; const record = records.get(editingId), fields = form.elements;
    form.reset(); error(''); resetDelete(); clearPreview();
    for (const key of ['title', 'artist', 'album', 'year', 'lyrics', 'note', 'coverRemote', 'audioRemote', 'externalUrl']) fields[key].value = record?.[key] || '';
    fields.cornerName.value = name;
    editor.querySelector('#music-editor-heading').textContent = editingId ? '编辑这首歌' : '收藏一首歌';
    editor.querySelector('[data-save-label]').textContent = editingId ? '保存修改' : '放入音乐角';
    editor.querySelector('[data-delete-song]').hidden = !editingId;
    editor.querySelector('[data-cover-remove]').hidden = !(record?.coverBlob || record?.coverRemote);
    editor.querySelector('[data-audio-remove]').hidden = !(record?.audioBlob || record?.audioRemote);
    editor.querySelector('[data-cover-filename]').textContent = record?.coverBlob ? record.coverFilename || '已保存封面图片' : '';
    editor.querySelector('[data-audio-filename]').textContent = record?.audioBlob ? record.audioFilename || '已保存音频文件' : '';
    editor.querySelector('[data-storage-note]').textContent = storageNote();
    preview(hydrated.get(editingId)?.coverUrl || (record ? hydrate(record).coverUrl : ''));
    editor.querySelectorAll('details').forEach(element => { element.open = false; });
    lastFocus = document.activeElement; if (!editor.open) editor.showModal(); editor.scrollTop = 0; fields.title.focus({ preventScroll: true });
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) { ownedUrls.forEach(url => URL.revokeObjectURL(url)); clearPreview(); db?.close(); } });
  return { ready, all, openEditor, getName: () => name, setName };
}

