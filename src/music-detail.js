function createMusicDetail({main,reduced,gsap,onNext,onReady,onEdit,onPlay}) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const limit = (value,min,max) => Math.max(min,Math.min(max,value));
  const safeImage = value => /^(?:https?:|blob:|data:image\/(?:png|jpeg|webp|gif|avif|svg\+xml);)/i.test(String(value || '')) ? value : '';
  const timeLabel = time => { const seconds=Math.max(0,Math.floor(Number(time)||0)); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; };
  let tracks=[],current=null,index=-1,header=null,nextBlock=null,entrance=null;
  let nextPose=null,geometry={width:0,height:0,vh:0},revealItems=[],timedLines=[],activeLine=-1;
  let playButton=null,playStatus=null,playback={},imageListeners=[];
  const tear={amount:0};

  function parseLyrics(text) {
    const source=String(text||'').replace(/\r\n?/g,'\n');
    const offsetMatch=source.match(/^\[offset:([+-]?\d+)\]/im), offset=offsetMatch?Number(offsetMatch[1])/1000:0;
    const lines=[],credits=[];
    let stanza=0,pendingBreak=false,acceptingCredits=true;
    for (const raw of source.split('\n')) {
      if (/^\s*\[(?:ar|ti|al|by|re|ve|length|offset):[^\]]*\]\s*$/i.test(raw)) continue;
      if(acceptingCredits&&credits.length<2&&/^\s*作[词曲]\s*[:：]/.test(raw)){credits.push(raw.trim());continue;}
      if(raw.trim())acceptingCredits=false;
      const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      const text=raw.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g,'').trim();
      if (!text) {pendingBreak=true;lines.push({text:'',time:null,stanza});continue;}
      if(pendingBreak){stanza++;pendingBreak=false;}
      if (stamps.length) {
        for (const stamp of stamps) lines.push({text,time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+(stamp[3]?Number(`0.${stamp[3]}`):0)+offset),stanza});
      } else lines.push({text,time:null,stanza});
    }
    const isTimed=lines.some(line=>line.time!==null);
    if (isTimed) {
      const timed=lines.filter(line=>line.time!==null).sort((a,b)=>a.time-b.time);
      const untimed=lines.filter(line=>line.time===null&&line.text);
      const ordered=[...untimed,...timed];
      return {lines:annotateBilingual(ordered.map((line,n)=>({...line,breakBefore:n>0&&(line.stanza!==ordered[n-1].stanza||(line.time!==null&&ordered[n-1].time===null))}))),credits,isTimed:true};
    }
    return {lines:annotateBilingual(lines),credits,isTimed:false};
  }

  function annotateBilingual(lines) {
    const scriptOf=text=>{
      const lyric=String(text).replace(/[（(]\s*注\s*[:：][\s\S]*?[）)]/g,'');
      if(/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(lyric))return 'hangul';
      if(/[\u3400-\u4dbf\u4e00-\u9fff]/.test(lyric))return 'chinese';
      return /[A-Za-z]/.test(lyric)?'latin':'other';
    };
    const scripts=lines.map(line=>scriptOf(line.text));
    // English hooks can be part of a Chinese original; only a Korean/Chinese
    // collection enables automatic translation styling (including its English hooks).
    const hasBilingualSource=scripts.includes('hangul')&&scripts.includes('chinese');
    return lines.map((line,n)=>({...line,hangul:scripts[n]==='hangul',translation:hasBilingualSource&&scripts[n]==='chinese'&&n>0&&!line.breakBefore&&line.stanza===lines[n-1].stanza&&(scripts[n-1]==='hangul'||scripts[n-1]==='latin')}));
  }

  function lyricLineMarkup(text) {
    let markup='',cursor=0;
    for(const match of String(text).matchAll(/[（(]\s*注\s*[:：][\s\S]*?[）)]/g)){
      markup+=escape(text.slice(cursor,match.index));
      markup+=`<span class="music-lyric-annotation">${escape(match[0])}</span>`;
      cursor=match.index+match[0].length;
    }
    return markup+escape(text.slice(cursor));
  }

  function coverMarkup(track,extra='') {
    const source=safeImage(track.coverUrl);
    return source
      ? `<img class="music-cover-image ${extra}" src="${escape(source)}" alt="${escape(track.title)}的封面" decoding="async">`
      : `<div class="music-cover-blank ${extra}"><span class="music-overline">YOUR MUSIC</span><span class="music-cover-letter">${escape(Array.from(track.title||'音')[0])}</span><span class="music-cover-caption">为这首歌留一个位置</span></div>`;
  }

  function lyricMarkup(parsed) {
    const credits=parsed.credits?.length?`<div class="music-lyric-credits">${parsed.credits.map(line=>`<p>${escape(line)}</p>`).join('')}</div>`:'';
    if (!parsed.lines.some(line=>line.text)) return credits+`<div class="music-lyrics-empty"><span class="music-empty-mark" aria-hidden="true">…</span><p>这首歌的歌词，还等着你收藏。</p><button type="button" class="music-text-button" data-music-edit>添加歌词 <span aria-hidden="true">↗</span></button></div>`;
    let markup=credits,open=false;
    for (const line of parsed.lines) {
      if (!line.text) {if(open){markup+='</div>';open=false;}continue;}
      if(line.breakBefore&&open){markup+='</div>';open=false;}
      if (!open){markup+='<div class="music-lyric-stanza" data-music-reveal>';open=true;}
      markup+=`<p class="music-lyric-line${line.translation?' is-translation':''}${line.hangul?' is-hangul':''}"${line.hangul?' lang="ko"':line.translation?' lang="zh"':''}${line.time===null?'':` data-time="${line.time}"`}>${lyricLineMarkup(line.text)}</p>`;
    }
    if(open)markup+='</div>';
    return markup;
  }

  function handleClick(event) {
    if (!current) return;
    if (event.target.closest('[data-music-edit]')) onEdit?.(current.id);
    else if(event.target.closest('[data-music-play]')) onPlay?.(current.id);
    else if(event.target.closest('[data-music-next]')&&tracks.length>1) onNext?.((index+1)%tracks.length);
  }

  function drawTear(t) {
    if(!header)return;
    const {width:w,height:h,vh}=geometry;
    if(!w||!h)return;
    const seed=index*1.7,time=reduced?0:t;
    const base=h-16-Math.min(window.scrollY*.02,12),amplitude=Math.min(30,vh*.035)*tear.amount;
    const points=[];
    for(let x=-40;x<=w+48;x+=8){
      const u=x/w,hump=Math.exp(-(((u-.52)/.27)**2));
      const jag=.55*Math.sin(19*u+seed+.35*time)+.3*Math.sin(41*u-.5*time+2*seed)+.15*Math.sin(97*u+.8*time);
      const wob=.12*Math.sin(.9*time+3*u+seed)+.08*Math.sin(.55*time-5*u);
      points.push([x,base-amplitude*(hump*(1+wob)+.12*jag*(.3+hump))]);
    }
    let path=`M-48,-48H${w+48}V${h+48}H-48Z M${points[0][0]},${points[0][1].toFixed(2)}`;
    for(let n=1;n<points.length-1;n++){
      const p=points[n],q=points[n+1];path+=`Q${p[0]},${p[1].toFixed(2)} ${(p[0]+q[0])/2},${((p[1]+q[1])/2).toFixed(2)}`;
    }
    const last=points[points.length-1];path+=`L${last[0]},${last[1].toFixed(2)}V${h+48}H-40Z`;
    header.style.clipPath=`path(evenodd, "${path}")`;
  }

  function resize() {
    if(!header)return;
    geometry={width:header.clientWidth,height:header.offsetHeight,vh:innerHeight};
    drawTear(performance.now()/1000);
  }

  function updatePlayback(value={}) {
    playback=value;
    if(!current||!playButton)return;
    const playingId=value.trackId??value.id,owns=playingId===current.id;
    const playing=owns&&Boolean(value.playing??value.isPlaying);
    const hasAudio=Boolean(current.audioUrl),hasExternal=Boolean(current.externalUrl);
    playButton.disabled=!hasAudio&&!hasExternal;
    playButton.setAttribute('aria-pressed',String(playing));
    playButton.querySelector('[data-play-label]').textContent=hasAudio?(playing?'暂停播放':'播放这首歌'):(hasExternal?'去听这首歌':'添加音频后播放');
    playButton.querySelector('[data-play-symbol]').textContent=hasAudio?(playing?'Ⅱ':'▶'):(hasExternal?'↗':'＋');
    const time=Number(value.currentTime??value.time)||0,duration=Number(value.duration)||0;
    playStatus.textContent=owns&&hasAudio?`${playing?'正在播放':'已暂停'} · ${timeLabel(time)}${duration>0?` / ${timeLabel(duration)}`:''}`:'';
    let nextActive=-1;
    if(owns){for(let n=0;n<timedLines.length;n++){if(Number(timedLines[n].dataset.time)<=time)nextActive=n;else break;}}
    if(nextActive!==activeLine){
      timedLines[activeLine]?.classList.remove('is-current');
      timedLines[activeLine]?.removeAttribute('aria-current');
      if(nextActive>=0){timedLines[nextActive].classList.add('is-current');timedLines[nextActive].setAttribute('aria-current','true');}
      activeLine=nextActive;
    }
  }

  function frame(t) {
    if(!header)return;
    if(header.getBoundingClientRect().bottom>-50)drawTear(t);
    for(const item of revealItems){
      if(item.revealed)continue;
      if(reduced||item.el.getBoundingClientRect().top<innerHeight*.92){
        item.revealed=true;
        if(item.el.classList.contains('music-next-rule')) gsap.to(item.el,{scaleX:1,duration:reduced?0:1.2,ease:'expo.inOut'});
        else gsap.to(item.el,{opacity:1,y:0,duration:reduced?0:.8,ease:'expo.out'});
      }
    }
    if(nextBlock){const rect=nextBlock.getBoundingClientRect(),q=limit((innerHeight-rect.top)/rect.height,0,1.2);nextPose=q>.02?{index:(index+1)%tracks.length,q}:null;}
  }

  function mount(trackIndex,library) {
    destroy();
    tracks=Array.isArray(library)?library:[];index=trackIndex;current=tracks[index];
    if(!current){onReady?.();return;}
    const parsed=parseLyrics(current.lyrics),next=tracks.length>1?tracks[(index+1)%tracks.length]:null;
    main.innerHTML=`<article class="music-detail">
      <section class="music-sheet" aria-labelledby="music-title">
        <div class="music-sheet-grid"><div class="music-song-intro"><div class="music-sheet-number music-overline">RECORD ${String(index+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}</div>
          <h1 id="music-title" class="music-title" tabindex="-1"><span class="mask"><span class="ln">${escape(current.title)}</span></span></h1>
          <p class="music-artist"><span class="mask"><span class="ln">${escape(current.artist)}</span></span></p></div>
          <div class="music-cover">${coverMarkup(current)}</div>
          <div class="music-listen-controls"><button type="button" class="music-play" data-music-play aria-pressed="false"><span data-play-symbol aria-hidden="true">▶</span><span data-play-label>播放这首歌</span></button><button type="button" class="music-edit music-text-button" data-music-edit>编辑收藏 <span aria-hidden="true">↗</span></button></div>
          <p class="music-play-status" data-play-status></p></div>
        <dl class="music-meta">${[['ARTIST / 歌手',current.artist],['ALBUM / 专辑',current.album||'—'],['YEAR / 年份',current.year||'—']].map(([label,value])=>`<div><dt class="music-overline">${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      </section>
      <section class="music-lyrics" aria-labelledby="music-lyrics-heading"><div class="music-section-head"><span class="music-overline">WORDS TO KEEP</span><h2 id="music-lyrics-heading">歌词</h2><button type="button" class="music-text-button" data-music-edit>编辑歌词 <span aria-hidden="true">↗</span></button></div><div class="music-lyric-body${parsed.isTimed?' has-timestamps':''}">${lyricMarkup(parsed)}</div>${parsed.isTimed?'<p class="music-sync-note">播放时，正在唱的那一句会轻轻亮起。</p>':''}${current.note?`<aside class="music-note" data-music-reveal><span class="music-overline">A NOTE TO MYSELF / 听歌手记</span><p>${escape(current.note)}</p></aside>`:''}<div class="music-lyrics-foot"><span>${escape(current.title)}</span><span>${escape(current.artist)}</span></div></section>
      ${next?`<section class="music-next-block" aria-label="下一首收藏"><div class="music-next-rule rule-one" aria-hidden="true"></div><div class="music-next-rule rule-two" aria-hidden="true"></div><div class="music-next-rule rule-three" aria-hidden="true"></div><div class="music-next-rule rule-four" aria-hidden="true"></div><p class="music-next-label music-overline">NEXT RECORD / 下一首</p><button class="music-next-title" type="button" data-music-next aria-label="打开 ${escape(next.title)}"><span class="mask"><span class="ln">${escape(next.title)}</span></span><span class="music-next-artist">${escape(next.artist)}</span></button><div class="music-next-foot music-overline"><span>这一首，值得再听</span><span>${String((index+1)%tracks.length+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}</span></div></section>`:''}
    </article>`;
    header=main.querySelector('.music-sheet');nextBlock=main.querySelector('.music-next-block');
    playButton=main.querySelector('[data-music-play]');playStatus=main.querySelector('[data-play-status]');
    timedLines=[...main.querySelectorAll('.music-lyric-line[data-time]')];activeLine=-1;
    main.addEventListener('click',handleClick);
    imageListeners=[...main.querySelectorAll('img')].map(img=>{const handler=()=>{img.classList.add('is-unavailable');img.alt='封面暂时无法加载';};img.addEventListener('error',handler,{once:true});return [img,handler];});
    revealItems=[...main.querySelectorAll('[data-music-reveal],.music-next-rule,.music-next-title')].map(el=>({el,revealed:reduced}));
    if(!reduced){
      for(const item of revealItems){if(item.el.classList.contains('music-next-rule'))gsap.set(item.el,{scaleX:0});else gsap.set(item.el,{opacity:0,y:22});}
    }
    resize();tear.amount=reduced?1:0;updatePlayback(playback);
    if(reduced){onReady?.();drawTear(0);}else{
      const titleLines=header.querySelectorAll('.ln'),fadeTargets=header.querySelectorAll('.music-cover,.music-listen-controls,.music-meta,.music-sheet-number');
      gsap.set(titleLines,{yPercent:105});gsap.set(fadeTargets,{opacity:0,y:16});
      entrance=gsap.timeline().to(titleLines,{yPercent:0,duration:.85,stagger:.08,ease:'expo.out'},0).to(fadeTargets,{opacity:1,y:0,duration:.8,stagger:.06,ease:'expo.out'},.2).to(tear,{amount:1,duration:1.1,ease:'expo.out'},0).call(()=>onReady?.(),[],1.1);
    }
    main.querySelector('#music-title').focus({preventScroll:true});
    document.fonts.ready.then(()=>{if(header)resize();});
  }

  function destroy() {
    entrance?.kill();entrance=null;gsap.killTweensOf(tear);
    if(main.children.length)gsap.killTweensOf(main.querySelectorAll('*'));
    main.removeEventListener('click',handleClick);
    for(const [img,handler] of imageListeners)img.removeEventListener('error',handler);
    imageListeners=[];current=null;index=-1;header=nextBlock=null;nextPose=null;revealItems=[];timedLines=[];activeLine=-1;playButton=playStatus=null;
    main.replaceChildren();
  }
  return {mount,frame,resize,destroy,getNextPose:()=>nextPose,updatePlayback};
}
