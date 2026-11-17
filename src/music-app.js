const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
const lerp = (a,b,t) => a+(b-a)*t;
const TAU = Math.PI*2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mask = s => `<span class="mask"><span class="ln">${esc(s)}</span></span>`;
const ui = {info:$('.info'),quotes:$('.testimonials'),nav:$('.nav-links'),loading:$('.nav-loading'),index:$('#film-index'),toggle:$('.index-toggle'),pre:$('.pre'),veil:$('#veil'),canvas:$('#gl'),path:$('#scrib path')};
const state = {phase:'loading',target:0,pos:0,intro:1,loaderScale:.35,loaderSpin:-3*Math.PI,exit:{others:0,pose:0,out:0,pos:0},ready:false};
let W=innerWidth,H=innerHeight,layoutScale=1,portrait=false,swapTimeline,transition,hovered=false,drag=null;
let scene,renderer,camera,discs=[],detail,rafId,lastFrame=performance.now();
const scribble={draw:0,erase:0,owner:0};
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
const scratch=new THREE.Vector3();
let loopPoints=[];
let contextLost=false;
let pendingRoute=false;
let TRACKS=[],DISPLAY_TRACKS=[],library,player,discGeometry,sharedBackMap,coverGeneration=0;
const emptyTrack={id:'empty',title:'第一张收藏',artist:'从一首喜欢的歌开始',album:'',year:'',lyrics:'',coverUrl:'',audioUrl:'',externalUrl:'',note:'',empty:true};
function syncCollection(tracks){TRACKS=tracks;DISPLAY_TRACKS=tracks.length?tracks:[emptyTrack];}
function notify(message){const el=$('#asset-status');el.textContent=message;el.hidden=false;gsap.delayedCall(5,()=>{if(el.textContent===message)el.hidden=true;});}
history.scrollRestoration='manual';

function renderInfo(index){
 const f=DISPLAY_TRACKS[index]||emptyTrack;
 const row=(label,values)=>`<div class="info-row"><i class="info-rule"></i><div class="lab">${mask(label)}</div><div class="info-value">${values.map(mask).join('')}</div></div>`;
 ui.info.innerHTML=`<h2 class="info-title disp mask"><span class="ln"><span class="title-fit">${esc(f.empty?library.getName():f.title)}</span></span></h2>${row('歌手',[f.empty?'等待一首喜欢的歌':f.artist])}${row('专辑',[f.empty?'你的私人唱片架':f.album||'单曲收藏'])}${row('收藏',[f.empty?'00 首':`${String(index+1).padStart(2,'0')} / ${String(TRACKS.length).padStart(2,'0')}`])}${f.empty?'':`<button class="info-edit" data-edit-track="${esc(f.id)}">编辑这首歌</button>`}`;
 ui.quotes.innerHTML=`<div class="music-thought"><span class="lab">${mask(f.empty?'A LITTLE SPACE FOR YOUR FAVORITES':'ON MY RECORD SHELF')}</span><p>${mask(f.empty?'把喜欢的声音，留在这里。':f.note||'一张封面，一段反复回来的旋律。')}</p></div><div class="home-actions">${f.empty?'<button class="home-action primary" data-add-track>收藏第一首 ＋</button>':`<button class="home-action primary" data-open-track>展开歌词 ↗</button><button class="home-action" data-play-track>${f.audioUrl?'播放这首歌 ▷':f.externalUrl?'去音乐平台听 ↗':'添加音频 ＋'}</button>`}</div>`;
 $('#announcement').textContent=f.empty?'音乐角还没有收藏，点击光盘添加第一首歌':`${f.title}，${f.artist}，第 ${index+1} 首，共 ${TRACKS.length} 首`;
 $$('.index-row').forEach((el,i)=>el.setAttribute('aria-current',String(i===index)));fitTitle();
}
function fitTitle(){}
function renderIndex(){
 $$('.track-count').forEach(el=>el.textContent=TRACKS.length);
 ui.index.innerHTML=TRACKS.length?TRACKS.map((f,i)=>`<button class="index-row" data-film="${i}" aria-current="${i===state.target}"><span>${esc(f.title)}</span><span class="year">${esc(f.artist)}</span></button>`).join(''):'<div class="index-empty">唱片架还是空的。<br><button data-add-track>收藏第一首歌 ＋</button></div>';
}
document.addEventListener('click',e=>{if(e.target.closest('[data-add-track], .add-track')){toggleIndex(false);library?.openEditor();}const edit=e.target.closest('[data-edit-track]');if(edit)library.openEditor(edit.dataset.editTrack);if(e.target.closest('[data-open-track]'))openTrack(state.target);if(e.target.closest('[data-play-track]'))playTrack(TRACKS[state.target]?.id);});
function playTrack(id){const track=TRACKS.find(t=>t.id===id);if(track)player.play(track);}
function updatePlayback(playback){detail?.updatePlayback(playback);const track=TRACKS[state.target],button=$('[data-play-track]');if(button&&track?.audioUrl)button.textContent=playback.id===track.id&&playback.playing?'暂停播放 Ⅱ':'播放这首歌 ▷';}
async function handleLibraryChange(tracks){
 const previousId=DISPLAY_TRACKS[state.target]?.id,oldCount=TRACKS.length,wasDetail=state.phase==='detail';
 syncCollection(tracks);if(!renderer)return;state.ready=false;swapTimeline?.kill();transition?.kill();gsap.killTweensOf(state);eraseScribble();
 state.target=tracks.length>oldCount?tracks.length-1:Math.max(0,tracks.findIndex(t=>t.id===previousId));state.pos=state.target;state.intro=0;
 rebuildDiscs();player.setTracks(tracks);renderIndex();renderInfo(state.target);state.ready=true;
 if(wasDetail&&tracks.length){mountDetail(state.target);writeRoute(state.target);}else{detail?.destroy();document.body.classList.remove('is-detail');ui.canvas.tabIndex=0;state.phase='home';gsap.set(ui.veil,{opacity:0});gsap.set($$('.hero .ln'),{yPercent:0});navReady();writeRoute(null);document.title=library.getName();}
}
function toggleIndex(open=!ui.index.classList.contains('open')){if(state.phase!=='home'&&state.phase!=='detail')open=false;ui.index.classList.toggle('open',open);ui.index.inert=!open;ui.toggle.setAttribute('aria-expanded',String(open));}
ui.toggle.addEventListener('click',()=>toggleIndex());
ui.index.addEventListener('click',e=>{const row=e.target.closest('[data-film]');if(!row)return;toggleIndex(false);const index=Number(row.dataset.film);state.phase==='detail'?openTrack(index):selectTrack(index);ui.canvas.focus({preventScroll:true});});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.nav'))toggleIndex(false)});
$('.brand').addEventListener('click',()=>goHome());$('.reels').addEventListener('click',()=>goHome());
function navLoading(text){ui.loading.firstElementChild.textContent=text;ui.loading.hidden=false;ui.nav.hidden=true;toggleIndex(false);}
function navReady(){ui.loading.hidden=true;ui.nav.hidden=false;gsap.set(ui.nav,{opacity:1});if(!reduced)gsap.fromTo($$('.nav-link .roll-pair'),{yPercent:100},{yPercent:0,duration:.7,ease:'expo.out',stagger:.04});}
function interactive(){return state.phase==='home'&&state.intro<.02&&state.ready&&!contextLost&&!document.querySelector('dialog[open]');}
function selectTrack(index){
 if(!interactive())return;
 index=clamp(index,0,DISPLAY_TRACKS.length-1);if(index===state.target)return;
 const dir=index>state.target?1:-1;state.target=index;eraseScribble();hovered=false;
 if(reduced){state.pos=index;renderInfo(index);return;}
 swapTimeline?.kill();gsap.killTweensOf($$('.hero .ln'));
 // Create the incoming tween only after replacing the outgoing nodes.
 swapTimeline=gsap.timeline().to($$('.hero .ln'),{yPercent:-105*dir,duration:.35,ease:'power2.in',stagger:.012}).call(()=>{if(index!==state.target)return;renderInfo(index);gsap.fromTo($$('.hero .ln'),{yPercent:105*dir},{yPercent:0,duration:.9,ease:'expo.out',stagger:.025});});
}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>{img.src='';reject(new Error('封面加载超时'));},12000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(new Error('封面无法加载'))};img.src=url;});}
function hubAndRim(ctx){
 const C=512;ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(C,C,.215*C,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';
 let g=ctx.createRadialGradient(C,C,.135*C,C,C,.215*C);g.addColorStop(0,'rgba(206,208,212,.96)');g.addColorStop(.35,'rgba(236,237,239,.92)');g.addColorStop(.8,'rgba(214,216,220,.88)');g.addColorStop(1,'rgba(190,193,198,.9)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(C,C,.215*C,0,TAU);ctx.arc(C,C,.135*C,0,TAU,true);ctx.fill('evenodd');
 [[.145,'rgba(120,124,130,.55)'],[.165,'rgba(255,255,255,.8)'],[.19,'rgba(150,154,160,.35)'],[.212,'rgba(110,114,120,.5)']].forEach(([r,color])=>{ctx.beginPath();ctx.arc(C,C,r*C,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();});
 g=ctx.createLinearGradient(0,0,1024,1024);g.addColorStop(0,'#f4f5f7');g.addColorStop(.45,'#a9adb3');g.addColorStop(.6,'#eef0f2');g.addColorStop(1,'#8e9298');ctx.strokeStyle=g;ctx.lineWidth=12.3;ctx.beginPath();ctx.arc(C,C,.988*C,0,TAU);ctx.stroke();
 ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(C,C,.135*C,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';
}
function canvasTexture(canvas){const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;}
function frontTexture(img,track){
 const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.save();ctx.beginPath();ctx.arc(512,512,.992*512,0,TAU);ctx.clip();
 if(img){const size=Math.min(img.naturalWidth,img.naturalHeight);ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,1024,1024);}else{
  ctx.fillStyle='#ddd9d1';ctx.fillRect(0,0,1024,1024);ctx.strokeStyle='#1b1b1b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(512,512,430,0,TAU);ctx.stroke();ctx.fillStyle='#242424';ctx.textAlign='center';
  ctx.font='22px Grot, sans-serif';ctx.fillText('A PRIVATE COLLECTION',512,184);
  const text=track.empty?'YOUR NEXT':track.title;let font=90;ctx.font=`${font}px Display, SimSun, serif`;while(ctx.measureText(text).width>760&&font>28){font-=2;ctx.font=`${font}px Display, SimSun, serif`;}ctx.fillText(text,512,350);
  ctx.font='74px Display, SimSun, serif';if(track.empty)ctx.fillText('FAVORITE',512,426);
  ctx.font='24px Grot, sans-serif';ctx.fillText(track.empty?'把喜欢的歌放在这里':track.artist,512,742);ctx.font='20px Grot, sans-serif';ctx.fillText('SIDE A  /  MUSIC CORNER',512,825);
 }
 const g=ctx.createLinearGradient(0,0,1024,1024);g.addColorStop(0,'rgba(255,255,255,.05)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.05)');ctx.fillStyle=g;ctx.fillRect(0,0,1024,1024);ctx.restore();hubAndRim(ctx);return canvasTexture(c);
}
function backTexture(){const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d'),C=512;ctx.save();ctx.beginPath();ctx.arc(C,C,.992*C,0,TAU);ctx.clip();const g=ctx.createRadialGradient(.8*C,.7*C,0,C,C,C);g.addColorStop(0,'#6d7076');g.addColorStop(.5,'#2a2c30');g.addColorStop(1,'#141517');ctx.fillStyle=g;ctx.fillRect(0,0,1024,1024);for(let r=.26*C;r<.97*C;r+=2.2){ctx.strokeStyle=`rgba(${Math.random()>.5?'255,255,255':'0,0,0'},${Math.random()*.05})`;ctx.lineWidth=.65;ctx.beginPath();ctx.arc(C,C,r,0,TAU);ctx.stroke();}const rainbow=ctx.createConicGradient(0,C,C);['#ff6a6a','#ffd36a','#7dff8a','#6ad9ff','#a86aff','#ff6a6a'].forEach((color,i)=>rainbow.addColorStop(i/5,color));ctx.globalAlpha=.07;ctx.fillStyle=rainbow;ctx.fillRect(0,0,1024,1024);ctx.globalAlpha=1;ctx.restore();hubAndRim(ctx);return canvasTexture(c);}
function initScene(){
 renderer=new THREE.WebGLRenderer({canvas:ui.canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(W,H);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);
 scene=new THREE.Scene();const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(env,.04).texture;env.dispose();pmrem.dispose();scene.add(new THREE.AmbientLight(0xffffff,.55));const light=new THREE.DirectionalLight(0xffffff,.9);light.position.set(-4,6,10);scene.add(light);
 camera=new THREE.PerspectiveCamera(38.5,W/H,.1,200);camera.position.z=5/Math.tan(THREE.MathUtils.degToRad(19.25));camera.updateMatrixWorld();
 const R=3,ring=new THREE.RingGeometry(R*.135,R,160,1);const p=ring.attributes.position,uv=ring.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/(2*R)+.5,p.getY(i)/(2*R)+.5);uv.needsUpdate=true;
 const outer=new THREE.CylinderGeometry(R*.998,R*.998,.03,160,1,true);outer.rotateX(Math.PI/2);const inner=new THREE.CylinderGeometry(R*.135,R*.135,.03,160,1,true);inner.rotateX(Math.PI/2);const hitGeometry=new THREE.CircleGeometry(R,80),backMap=backTexture();
 discGeometry={ring,outer,inner,hit:hitGeometry};sharedBackMap=backMap;rebuildDiscs();
 const phi=Math.random()*TAU;loopPoints=Array.from({length:151},(_,i)=>{const t=i/150,a=2.15+t*1.32*TAU,r=1.075+.028*Math.sin(2*a+phi)+.016*Math.sin(5*a+1.3)+(t-.5)*.07+(t>.9?(t-.9)*.5:0);return new THREE.Vector3(Math.cos(a)*r*R*(1+.02*Math.sin(3*a)),Math.sin(a)*r*R,0);});
 resize();
}
function rebuildDiscs(){
 const generation=++coverGeneration;
 discs.forEach(d=>{scene.remove(d.anchor);d.mats[0].map.dispose();d.mats.forEach(m=>m.dispose());d.hit.material.dispose();});
 discs=DISPLAY_TRACKS.map((f,i)=>{const anchor=new THREE.Group(),tilt=new THREE.Group(),spin=new THREE.Group();tilt.rotation.order='YXZ';anchor.add(tilt);tilt.add(spin);scene.add(anchor);
  const frontMat=new THREE.MeshStandardMaterial({map:frontTexture(null,f),transparent:true,alphaTest:.02,roughness:.42,metalness:0,envMapIntensity:.55});
  const backMat=new THREE.MeshStandardMaterial({map:sharedBackMap,transparent:true,alphaTest:.02,roughness:.22,metalness:.85,envMapIntensity:1.1});
  const edgeMat=new THREE.MeshStandardMaterial({color:'#d9dcdf',metalness:.9,roughness:.3,transparent:true}),holeMat=edgeMat.clone();holeMat.side=THREE.DoubleSide;
  const front=new THREE.Mesh(discGeometry.ring,frontMat);front.position.z=.015;const back=new THREE.Mesh(discGeometry.ring,backMat);back.rotation.y=Math.PI;back.position.z=-.015;spin.add(front,back,new THREE.Mesh(discGeometry.outer,edgeMat),new THREE.Mesh(discGeometry.inner,holeMat));
  const hit=new THREE.Mesh(discGeometry.hit,new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));hit.userData.index=i;spin.add(hit);
  return {anchor,tilt,spin,hit,mats:[frontMat,backMat,edgeMat,holeMat],a:0,v:0};
 });

 TRACKS.forEach((track,i)=>{if(!track.coverUrl)return;loadImage(track.coverUrl).then(img=>{if(generation!==coverGeneration)return;const map=frontTexture(img,track);discs[i].mats[0].map.dispose();discs[i].mats[0].map=map;discs[i].mats[0].needsUpdate=true;}).catch(()=>{if(generation===coverGeneration)notify('有封面暂时无法显示，可编辑歌曲并上传封面图片。');});});
}
function setOpacity(d,opacity){d.anchor.visible=opacity>.002;d.mats.forEach(m=>m.opacity=opacity);}
function carouselPose(offset){return portrait?{x:2.5*offset,y:-.25+3.9*offset,z:1.2*offset,scale:1.1335*layoutScale*(offset<0?Math.max(.5,1+.1*offset):1)}:{x:.0054+5.75*offset,y:.174+1.7*offset,z:2.33*offset,scale:1.1335*(offset<0?Math.max(.5,1+.1*offset):1)};}
function animateDiscs(dt){
 if(state.phase==='transition')return;
 if(state.phase==='detail'){
  discs.forEach(d=>d.anchor.visible=false);const pose=detail?.getNextPose();if(pose){const d=discs[pose.index],q=pose.q;setOpacity(d,q>.02?1:0);d.anchor.position.set(0,lerp(-10.5,portrait?-3.2:-4.3,q),0);d.anchor.scale.setScalar(.95*layoutScale);d.tilt.rotation.set(-.32,.18*(1-q),.22,'YXZ');d.spin.rotation.y=-1.4*(1-q);}return;
 }
 if(state.phase==='loading'){discs.forEach((d,i)=>{setOpacity(d,i===state.target?1:0);d.anchor.position.set(0,.15,-1.2);d.anchor.scale.setScalar(state.loaderScale*layoutScale);d.tilt.rotation.set(-.18,.22,.28,'YXZ');d.spin.rotation.y=state.loaderSpin;});return;}
 if(reduced)state.pos=state.target;else if(state.phase!=='opening')state.pos+=(state.target-state.pos)*(1-Math.pow(.0016,dt));
 const c=carouselPose(state.target-state.pos);
 discs.forEach((d,i)=>{
  if(!(drag?.axis==='x'&&i===state.target)&&!gsap.isTweening(d)&&Math.abs(d.a)+Math.abs(d.v)>0){
   if(Math.abs(d.v)>2.2){d.a+=d.v*dt;d.v*=Math.pow(.18,dt);}else{const goal=Math.round(d.a/TAU)*TAU;d.v+=((goal-d.a)*26-d.v*2*Math.sqrt(26)*.78)*dt;d.a+=d.v*dt;if(Math.abs(goal-d.a)<1e-4&&Math.abs(d.v)<1e-3){d.a=0;d.v=0;}}
  }
  const o=i-state.pos,p=carouselPose(o);let {x,y,z,scale}=p,opacity=clamp(2.6-Math.abs(o)),rx=-.4436,ry=-.5813,rz=.32;
  if(state.intro>0){const t=state.intro;if(i===state.target){x=lerp(x,0,t);y=lerp(y,.15,t);z=lerp(z,-1.2,t);scale=lerp(scale,layoutScale,t);rx=lerp(rx,-.18,t);ry=lerp(ry,.22,t);rz=lerp(rz,.28,t);}else{x+=2.2*o*t;y+=.8*o*t;opacity*=clamp(1-t*1.4);}}
  if(state.phase==='opening'){
   const e=state.exit;if(i===state.target){rx=lerp(rx,-.3,e.pose);ry=lerp(ry,-.36,e.pose);rz=lerp(rz,.32,e.pose);scale*=lerp(1,.9,e.pose)*lerp(1,.55,e.out);z-=16*e.out;y-=1.4*e.out;opacity*=1-clamp((e.out-.55)/.45);}else if(Math.abs(i-state.target)===1){x=lerp(x,c.x+(x-c.x)*.9,e.others);y=lerp(y,c.y+(y-c.y)*.15,e.others);z-=9*e.others;scale*=lerp(1,.75,e.others);opacity*=1-clamp((e.others-.8)/.2);}else opacity=0;
  }
  d.anchor.position.set(x,y,z);d.anchor.scale.setScalar(scale);d.tilt.rotation.set(rx,ry,rz,'YXZ');d.spin.rotation.y=d.a;setOpacity(d,opacity);
 });
}
function drawScribble(){if(scribble.draw-scribble.erase<.001||state.phase==='detail')return;const disc=discs[scribble.owner];const points=loopPoints.map(p=>{scratch.copy(p).applyMatrix4(disc.spin.matrixWorld).project(camera);return {x:(scratch.x*.5+.5)*W,y:(-.5*scratch.y+.5)*H};});let path=`M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];path+=`C${(b.x+(c.x-a.x)/6).toFixed(2)},${(b.y+(c.y-a.y)/6).toFixed(2)} ${(c.x-(d.x-b.x)/6).toFixed(2)},${(c.y-(d.y-b.y)/6).toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`;}ui.path.setAttribute('d',path);}
function updateDash(){ui.path.style.strokeDasharray=`${Math.max(0,scribble.draw-scribble.erase)} 2`;ui.path.style.strokeDashoffset=-scribble.erase;}
function showScribble(){gsap.killTweensOf(scribble);scribble.owner=state.target;if(reduced){scribble.draw=1;scribble.erase=0;updateDash();return;}scribble.draw=0;scribble.erase=0;gsap.to(scribble,{draw:1,duration:.85,ease:'power2.inOut',onUpdate:updateDash});}
function eraseScribble(){hovered=false;gsap.killTweensOf(scribble);if(reduced){scribble.draw=scribble.erase=0;updateDash();return;}gsap.to(scribble,{erase:scribble.draw,duration:.55,ease:'power2.inOut',onUpdate:updateDash,onComplete:()=>{scribble.draw=scribble.erase=0;updateDash();}});}
function pick(x,y){if(!renderer)return null;mouse.set(x/W*2-1,-y/H*2+1);scene.updateMatrixWorld(true);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(discs.filter(d=>d.anchor.visible&&d.mats[0].opacity>.1).map(d=>d.hit));return hits[0]?.object.userData.index??null;}
function updateHover(e){if(!interactive())return;const index=pick(e.clientX,e.clientY),active=index===state.target;ui.canvas.style.cursor=index===null?'default':'pointer';if(active&&!hovered){hovered=true;showScribble();}else if(!active&&hovered)eraseScribble();}
ui.canvas.addEventListener('pointerdown',e=>{if(!interactive()||e.button!==0)return;const now=performance.now();drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastTime:now,lastMove:now,max:0,axis:e.pointerType==='touch'?null:'x',touch:e.pointerType==='touch',hit:pick(e.clientX,e.clientY)};discs[state.target].v=0;ui.canvas.setPointerCapture(e.pointerId);ui.canvas.style.cursor='grabbing';});
ui.canvas.addEventListener('pointermove',e=>{
 if(!drag){updateHover(e);return;}if(e.pointerId!==drag.id)return;
 const now=performance.now(),dx=e.clientX-drag.lastX,sx=e.clientX-drag.startX,sy=e.clientY-drag.startY;drag.max=Math.max(drag.max,Math.hypot(sx,sy));
 if(!drag.axis&&drag.max>8)drag.axis=Math.abs(sx)>Math.abs(sy)?'x':'y';
 if(drag.axis==='x'&&drag.max>3){const d=discs[state.target];d.a+=dx*.011/layoutScale;d.v=lerp(d.v,dx*.011/Math.max(1,now-drag.lastTime)*1000,.5);if(dx!==0)drag.lastMove=now;}
 drag.lastX=e.clientX;drag.lastTime=now;
});
function endDrag(e,cancelled=false){
 if(!drag||drag.id!==e.pointerId)return;const previous=drag;drag=null;ui.canvas.style.cursor='default';if(ui.canvas.hasPointerCapture(e.pointerId))ui.canvas.releasePointerCapture(e.pointerId);
 const d=discs[state.target];if(performance.now()-previous.lastMove>80)d.v*=.2;
 if(cancelled){d.v=0;eraseScribble();return;}
 if(previous.axis==='y'&&Math.abs(e.clientY-previous.startY)>40){selectTrack(state.target+(e.clientY<previous.startY?1:-1));return;}
 if(previous.max<5&&previous.hit!==null){if(previous.hit===state.target)openTrack(state.target);else selectTrack(previous.hit);}else if(!previous.touch)updateHover(e);
}
ui.canvas.addEventListener('pointerup',e=>endDrag(e));ui.canvas.addEventListener('pointercancel',e=>endDrag(e,true));ui.canvas.addEventListener('lostpointercapture',e=>{if(drag)endDrag(e,true)});ui.canvas.addEventListener('pointerleave',()=>{if(!drag)eraseScribble()});
let wheelAcc=0,wheelAt=0,wheelLockedUntil=0;
window.addEventListener('wheel',e=>{if(state.phase==='detail')return;if(e.target.closest?.('.index-panel, dialog, .music-player'))return;e.preventDefault();if(!interactive()||drag)return;const now=performance.now();if(now<wheelLockedUntil)return;if(now-wheelAt>220)wheelAcc=0;wheelAt=now;wheelAcc+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?16:e.deltaMode===2?H:1);if(Math.abs(wheelAcc)>30){selectTrack(state.target+Math.sign(wheelAcc));wheelLockedUntil=now+650;wheelAcc=0;}},{passive:false});
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){toggleIndex(false);return;}if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,dialog'))return;
 if(!interactive()||drag)return;const dir={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(dir){e.preventDefault();if(!e.repeat)selectTrack(state.target+dir);}else if(e.key==='Enter'&&(e.target===document.body||e.target===ui.canvas)){e.preventDefault();openTrack(state.target);}
});
function drum(){return `<span class="drum"><span class="drum-column">${Array.from({length:30},(_,i)=>`<span>${i%10}</span>`).join('')}</span></span>`;}
function heroEnter(quick=false){state.phase='home';state.intro=reduced?0:1;renderInfo(state.target);navReady();if(reduced){gsap.set($$('.hero .ln'),{yPercent:0});gsap.set($$('.info-rule'),{scaleX:1});return;}gsap.set($$('.info-rule'),{scaleX:0,transformOrigin:'left'});gsap.set($$('.hero .ln'),{yPercent:105});gsap.to(state,{intro:0,duration:quick?1.3:1.6,ease:'expo.inOut'});gsap.to($$('.info-rule'),{scaleX:1,duration:1.2,ease:'expo.inOut',stagger:.06,delay:.35});gsap.to($$('.hero .ln'),{yPercent:0,duration:1,ease:'expo.out',stagger:.02,delay:.6});}
function startLoader(){
 if(reduced){ui.pre.remove();state.loaderSpin=0;heroEnter();return;}
 gsap.set($('.pre-count'),{opacity:1});const digits=String(TRACKS.length).padStart(2,'0');
 $('.pre-count').insertAdjacentHTML('beforeend',Array.from(digits,drum).join(''));$('.bottom-spinner')?.remove();
 gsap.set($$('.pre-count > *, .pre-left .ln, .pre-right'),{yPercent:105});
 const tl=gsap.timeline();tl.to($$('.pre-count > *, .pre-left .ln, .pre-right'),{yPercent:0,duration:.8,ease:'expo.out',stagger:.04},0);
 $$('.pre-count .drum-column').forEach((el,i)=>tl.to(el,{y:`-${10+Number(digits[i])}em`,duration:1.35+i*.1,ease:'expo.inOut'},.05));
 tl.to(state,{loaderScale:1,duration:1.4,ease:'expo.out'},0).to(state,{loaderSpin:0,duration:1.8,ease:'expo.out'},0).to($$('.pre-count, .pre-side'),{yPercent:60,opacity:0,duration:.4,ease:'power3.in'},1.65).call(()=>heroEnter(),[],1.7).call(()=>ui.pre.remove(),[],2.1);
}
function slug(i){return encodeURIComponent(DISPLAY_TRACKS[i].id);}
function writeRoute(index){const hash=index===null?'':`#song/${slug(index)}`;if(location.hash!==hash)history.pushState({song:index},'',location.pathname+location.search+hash);}

function mountDetail(index){
 swapTimeline?.kill();gsap.killTweensOf($$('.hero .ln'));state.target=index;state.pos=index;state.phase='detail';state.intro=0;scribble.draw=scribble.erase=0;updateDash();document.body.classList.add('is-detail');ui.canvas.tabIndex=-1;window.scrollTo(0,0);detail.mount(index,TRACKS);detail.updatePlayback(player.getState());document.title=`${DISPLAY_TRACKS[index].title} — ${library.getName()}`;discs.forEach(d=>{d.a=d.v=0;d.anchor.visible=false;});
}
function withVeil(action,label){state.phase='transition';toggleIndex(false);eraseScribble();navLoading(label);transition?.kill();transition=gsap.timeline().to(ui.veil,{opacity:1,duration:reduced?0:.45,ease:'power2.inOut'}).call(action).to(ui.veil,{opacity:0,duration:reduced?0:.4,ease:'power2.out'});}
function openTrack(index,push=true){
 if(!TRACKS.length){library.openEditor();return;}
 if(!state.ready||!['home','detail'].includes(state.phase)||state.phase==='home'&&!interactive())return;index=clamp(index,0,DISPLAY_TRACKS.length-1);if(push)writeRoute(index);
 if(state.phase==='detail'||reduced){withVeil(()=>mountDetail(index),'展开歌词');return;}
 toggleIndex(false);swapTimeline?.kill();gsap.killTweensOf($$('.hero .ln'));state.target=index;state.phase='opening';Object.assign(state.exit,{others:0,pose:0,out:0});
 transition=gsap.timeline().to($$('.hero .ln'),{yPercent:-105,duration:.5,ease:'expo.out',stagger:.008},0).to($$('.info-rule'),{scaleX:0,transformOrigin:'right',duration:.5,ease:'power3.inOut'},0).to(ui.nav,{opacity:0,duration:.25},0).to(state.exit,{others:1,duration:.58,ease:'power4.in'},0).to(state.exit,{pose:1,duration:.65,ease:'power3.inOut'},0).call(()=>navLoading('展开歌词'),[],.48).call(eraseScribble,[],.55).to(state.exit,{out:1,duration:.25,ease:'power2.in'},.72).call(()=>mountDetail(index),[],.95);
}
function goHome(push=true){
 if(!state.ready||!['home','detail'].includes(state.phase))return;if(state.phase==='home'){toggleIndex(false);return;}if(push)writeRoute(null);
 withVeil(()=>{detail.destroy();$('#main').replaceChildren();document.body.classList.remove('is-detail');ui.canvas.tabIndex=0;window.scrollTo(0,0);state.pos=state.target;discs.forEach(d=>d.a=d.v=0);heroEnter(true);document.title=library.getName();if(!reduced){const d=discs[state.target];d.a=-TAU;gsap.to(d,{a:0,duration:1.6,ease:'expo.out'});}ui.canvas.focus({preventScroll:true});},'翻回唱片架');
}
window.addEventListener('popstate',()=>{pendingRoute=true;});
function reconcileRoute(){if(!pendingRoute||!state.ready||!['home','detail'].includes(state.phase)||transition?.isActive()||state.intro>.02)return;pendingRoute=false;const index=DISPLAY_TRACKS.findIndex((f,i)=>location.hash===`#song/${slug(i)}`);if(index>=0){if(state.phase!=='detail'||state.target!==index)openTrack(index,false);}else if(state.phase==='detail')goHome(false);}
function resize(){W=innerWidth;H=innerHeight;portrait=W/H<1;layoutScale=portrait?clamp(W/H*1.2,.48,1):1;renderer?.setSize(W,H);if(camera){camera.aspect=W/H;camera.updateProjectionMatrix();}$('#scrib').setAttribute('viewBox',`0 0 ${W} ${H}`);fitTitle();detail?.resize();}
window.addEventListener('resize',resize);
function frame(now){rafId=requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;if(document.hidden||contextLost)return;reconcileRoute();if(state.phase==='detail')detail.frame(now/1000);animateDiscs(dt);scene.updateMatrixWorld(true);drawScribble();renderer.render(scene,camera);}
ui.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;$('#asset-status').hidden=false;$('#asset-status').textContent='光盘显示正在恢复…';});
ui.canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;$('#asset-status').hidden=true;lastFrame=performance.now();});
async function boot(){
 const started=performance.now();
 library=createMusicLibrary({onChange:handleLibraryChange});
 try{
  syncCollection(await library.ready());renderIndex();renderInfo(0);document.title=library.getName();
  gsap.set($$('.hero .ln'),{yPercent:105});gsap.set($$('.info-rule'),{scaleX:0});gsap.set($$('.pre-side, .pre-count'),{opacity:0});if(reduced)ui.pre.remove();
  initScene();
  player=createMusicPlayer({onState:updatePlayback,onOpenSong:id=>{const index=TRACKS.findIndex(t=>t.id===id);if(index>=0)openTrack(index);},onNeedAudio:id=>library.openEditor(id)});player.setTracks(TRACKS);
  detail=createMusicDetail({main:$('#main'),reduced,gsap,onNext:index=>openTrack(index),onReady:navReady,onEdit:id=>library.openEditor(id),onPlay:playTrack});
  await document.fonts.ready;await new Promise(resolve=>setTimeout(resolve,Math.max(0,450-(performance.now()-started))));
  state.ready=true;if(ui.pre.isConnected)gsap.set($$('.pre-side'),{opacity:1});lastFrame=performance.now();rafId=requestAnimationFrame(frame);
  const index=TRACKS.findIndex((f,i)=>location.hash===`#song/${slug(i)}`);if(index>=0){ui.pre.remove();mountDetail(index);}else startLoader();
 }catch(error){console.error('Music Corner:',error);ui.loading.firstElementChild.textContent='暂时无法打开';$('#asset-status').hidden=false;$('#asset-status').innerHTML='音乐角暂时无法打开，请检查网络与浏览器的 WebGL 支持。<button type="button">重试</button>';$('#asset-status button').onclick=()=>location.reload();$('.bottom-spinner')?.remove();}
}

boot();

