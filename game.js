(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const menu = document.querySelector('#menu'), hud = document.querySelector('#hud'), result = document.querySelector('#result'), touchControls = document.querySelector('#touchControls');
  const tracks = [
    {name:'SKYLINE SPRINT',short:'SKYLINE',place:'CLOUDTOP CITY',color:'#53e4e6',sky:'#8ce7f1',ground:'#48bd8a',road:'#55546c',curve:1.04, scenery:'city', length:7200},
    {name:'SUNSET BOARDWALK',short:'SUNSET',place:'GOLDEN COAST',color:'#ff9c6c',sky:'#ffb38d',ground:'#39b997',road:'#655867',curve:.88,scenery:'coast',length:6800},
    {name:'FROSTLINE PASS',short:'FROSTLINE',place:'FROSTLINE PEAK',color:'#9bafff',sky:'#a7d6f1',ground:'#d8ebef',road:'#546477',curve:1.25,scenery:'snow',length:7600}
  ];
  const karts = [
    {name:'VOLT RACER',color:'#54e4e7',speed:88,grip:76,boost:70,max:270},
    {name:'PINK COMET',color:'#ff579f',speed:78,grip:91,boost:81,max:255},
    {name:'SUNSPARK GT',color:'#ffd56e',speed:94,grip:63,boost:65,max:282},
    {name:'NIGHT OWL',color:'#9a8cff',speed:83,grip:82,boost:92,max:263}
  ];
  const rivals = [
    {name:'MICA',color:'#ff5f8c',skill:1.01}, {name:'JUNO',color:'#ffd46b',skill:.98},
    {name:'KAI',color:'#9d8bff',skill:.96}, {name:'ROOK',color:'#62dca8',skill:.93}
  ];
  let kartIndex=0, trackIndex=0, running=false, finished=false, last=0, raceStart=0, countdown=0, frame=0;
  let distance=0,speed=0,playerX=0,boost=0,boostFuel=0,lap=1,coins=0,driftCharge=0,steerLean=0,place=5;
  let racers=[], keys={}, width=innerWidth,height=innerHeight,dpr=1, scenerySeed=1;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mod=(n,m)=>((n%m)+m)%m;
  const track=()=>tracks[trackIndex], kart=()=>karts[kartIndex];
  const $=s=>document.querySelector(s);
  function resize(){dpr=Math.min(devicePixelRatio||1,2);width=innerWidth;height=innerHeight;canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize);resize();
  function renderMenu(){
    $('#kartName').textContent=kart().name;$('#kartCount').textContent=`0${kartIndex+1} / 04`;
    $('#kartPreview').style.setProperty('--kart',kart().color);$('#kartPreview').querySelector('.kart-body').style.setProperty('--kart',kart().color);
    $('#speedStat').style.width=kart().speed+'%';$('#gripStat').style.width=kart().grip+'%';$('#boostStat').style.width=kart().boost+'%';
    document.querySelectorAll('.track-card').forEach((el,i)=>el.classList.toggle('selected',i===trackIndex));
  }
  $('#trackGrid').innerHTML=tracks.map((t,i)=>`<button class="track-card ${i===trackIndex?'selected':''}" style="--track-color:${t.color}" data-track="${i}"><b>${t.short}</b><small>${t.place}</small></button>`).join('');
  document.querySelectorAll('.track-card').forEach(el=>el.addEventListener('click',()=>{trackIndex=+el.dataset.track;renderMenu()}));
  $('#prevKart').onclick=()=>{kartIndex=mod(kartIndex-1,karts.length);renderMenu()};$('#nextKart').onclick=()=>{kartIndex=mod(kartIndex+1,karts.length);renderMenu()};
  function makeRacers(){racers=rivals.map((r,i)=>({ ...r,progress:70+i*145,speed:178+i*8,offset:(i%2?-.4:.4),phase:i*2.7 }))}
  function startRace(){
    distance=0;speed=0;playerX=0;boost=0;boostFuel=0;lap=1;coins=0;driftCharge=0;place=5;finished=false;countdown=3.3;raceStart=performance.now();last=0;
    makeRacers();menu.classList.add('hidden');result.classList.add('hidden');hud.classList.remove('hidden');touchControls.classList.remove('hidden');$('#trackTitle').textContent=track().name;$('#toast').textContent='3';$('#toast').style.opacity=1;
    running=true;requestAnimationFrame(loop);
  }
  $('#raceButton').onclick=startRace;$('#againButton').onclick=startRace;$('#menuButton').onclick=()=>{running=false;result.classList.add('hidden');menu.classList.remove('hidden');hud.classList.add('hidden');touchControls.classList.add('hidden');renderMenu()};
  function keyDown(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Shift'].includes(e.key))e.preventDefault();keys[e.key.toLowerCase()]=true;if(e.key===' '&&running)driftCharge=Math.min(100,driftCharge+2)}
  function keyUp(e){keys[e.key.toLowerCase()]=false}
  addEventListener('keydown',keyDown,{passive:false});addEventListener('keyup',keyUp);
  function bindTouch(id,key){const el=$(id);if(!el)return;const down=e=>{e.preventDefault();keys[key]=true},up=e=>{e.preventDefault();keys[key]=false};el.addEventListener('pointerdown',down);['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,up))}
  bindTouch('#touchLeft','arrowleft');bindTouch('#touchRight','arrowright');bindTouch('#touchDrift',' ');bindTouch('#touchBoost','shift');
  function curveAt(d){const t=mod(d,track().length)/track().length;const a=Math.sin(t*Math.PI*2+0.3)*.65+Math.sin(t*Math.PI*4+1.1)*.28+Math.sin(t*Math.PI*6)*.1;return a*track().curve}
  function curveDistance(from,forward){let total=0,steps=Math.max(1,Math.ceil(forward/70)),step=forward/steps;for(let i=0;i<steps;i++)total+=curveAt(from+i*step)*step;return total}
  function landscape(){
    const t=track(),horizon=height*.43;
    const sky=ctx.createLinearGradient(0,0,0,horizon+40);sky.addColorStop(0,t.sky);sky.addColorStop(1,t.scenery==='coast'?'#ffcd9c':t.scenery==='snow'?'#e4f2ee':'#d4fbf1');ctx.fillStyle=sky;ctx.fillRect(0,0,width,horizon+50);
    // sun, haze, and distant silhouette
    const sunX=width*(t.scenery==='coast'?.72:.76),sunY=height*.16;ctx.fillStyle=t.scenery==='coast'?'#fff0c8':'#fffbd8';ctx.globalAlpha=.78;ctx.beginPath();ctx.arc(sunX,sunY,Math.min(width,height)*.052,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle=t.scenery==='snow'?'#a9c5d5':t.scenery==='coast'?'#e59186':'#7db8c1';ctx.beginPath();ctx.moveTo(0,horizon);for(let x=0;x<=width+50;x+=50){let yy=horizon-22-Math.sin(x*.006+1)*25-Math.cos(x*.011)*11;ctx.lineTo(x,yy)}ctx.lineTo(width,horizon);ctx.fill();
    ctx.fillStyle=t.ground;ctx.fillRect(0,horizon,width,height-horizon);
    // scenic skyline, palms, or snowy ridges
    if(t.scenery==='city'){
      for(let x=0;x<width;x+=Math.max(28,width/24)){let seed=Math.sin(x*5.31)*.5+.5;let bw=18+seed*28,bh=35+seed*105;ctx.fillStyle=seed>.6?'#498c9b':'#518c91';ctx.globalAlpha=.72;ctx.fillRect(x,horizon-bh,bw,bh);ctx.globalAlpha=.25;ctx.fillStyle='#f9ebad';for(let wy=horizon-bh+10;wy<horizon-6;wy+=12)for(let wx=x+5;wx<x+bw-4;wx+=9)ctx.fillRect(wx,wy,3,4)}ctx.globalAlpha=1;
    }else if(t.scenery==='coast'){
      ctx.fillStyle='#56d1c6';ctx.fillRect(0,horizon+10,width,Math.min(58,height-horizon));ctx.fillStyle='#fff4d5';for(let i=0;i<width;i+=70){ctx.globalAlpha=.3;ctx.fillRect(i,horizon+23+Math.sin(i)*10,35,2)}ctx.globalAlpha=1;
      for(let x=25;x<width;x+=90){ctx.fillStyle='#5e7559';ctx.fillRect(x,horizon-42,4,43);ctx.fillStyle='#397a5a';ctx.beginPath();ctx.ellipse(x,horizon-44,18,6,-.4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+8,horizon-50,16,5,.3,0,Math.PI*2);ctx.fill()}
    }else{
      ctx.fillStyle='#eff8f5';ctx.beginPath();ctx.moveTo(0,horizon+5);for(let x=0;x<=width+80;x+=80)ctx.lineTo(x,horizon-30-Math.abs(Math.sin(x*.009))*80);ctx.lineTo(width,horizon+10);ctx.fill();
      for(let x=20;x<width;x+=70){let y=horizon+10;ctx.fillStyle='#547d83';ctx.beginPath();ctx.moveTo(x,y-48);ctx.lineTo(x-16,y);ctx.lineTo(x+17,y);ctx.fill();ctx.fillStyle='#e7f4f0';ctx.beginPath();ctx.moveTo(x,y-48);ctx.lineTo(x-7,y-23);ctx.lineTo(x+4,y-29);ctx.lineTo(x+10,y-10);ctx.fill()}
    }
  }
  function road(){
    const horizon=height*.43,bottom=height+20,near=3200,seg=65,segments=Math.ceil(near/seg);
    // Draw furthest segment first; curvature shifts the ribbon toward the bends.
    for(let i=segments;i>=0;i--){let z=i*seg,z2=(i+1)*seg,scale=1/(1+z/570),scale2=1/(1+z2/570);let y=horizon+(bottom-horizon)*scale,y2=horizon+(bottom-horizon)*scale2;let bend=curveDistance(distance,z)*.055;let bend2=curveDistance(distance,z2)*.055;let cx=width/2-bend*scale, cx2=width/2-bend2*scale2;let half=width*(.045+.39*scale),half2=width*(.045+.39*scale2);let world=Math.floor((distance+z)/seg);let dark=(world%2)===0;
      ctx.fillStyle=dark?(track().scenery==='snow'?'#c9e2e8':'#57bd8b'):(track().scenery==='snow'?'#d8edf0':'#4bb581');ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.lineTo(width,y2);ctx.lineTo(0,y2);ctx.fill();
      ctx.fillStyle=dark?'#f8f2e4':'#e5487c';ctx.beginPath();ctx.moveTo(cx-half*1.12,y);ctx.lineTo(cx+half*1.12,y);ctx.lineTo(cx2+half2*1.12,y2);ctx.lineTo(cx2-half2*1.12,y2);ctx.fill();
      ctx.fillStyle=dark?track().road:'#5c5a70';ctx.beginPath();ctx.moveTo(cx-half,y);ctx.lineTo(cx+half,y);ctx.lineTo(cx2+half2,y2);ctx.lineTo(cx2-half2,y2);ctx.fill();
      if(world%2===0){ctx.fillStyle='#ffffffb8';for(let lane=-1;lane<=1;lane+=2){let lw=Math.max(1.3,scale*4);ctx.beginPath();ctx.moveTo(cx+lane*half*.33-lw,y);ctx.lineTo(cx+lane*half*.33+lw,y);ctx.lineTo(cx2+lane*half2*.33+lw,y2);ctx.lineTo(cx2+lane*half2*.33-lw,y2);ctx.fill()}}
      // Outer track edge stripes
      if(world%4===0){ctx.fillStyle='#ffe77e';let rw=Math.max(1,scale*5);ctx.fillRect(cx-half*1.1-rw/2,y-rw/2,rw,Math.max(1,y2-y+1));ctx.fillRect(cx+half*1.1-rw/2,y-rw/2,rw,Math.max(1,y2-y+1))}
    }
    return {horizon,bottom};
  }
  function drawKart(x,y,s,color,player=false){
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);if(player)ctx.rotate(steerLean*.09);
    // soft shadow
    ctx.fillStyle='#11132488';ctx.beginPath();ctx.ellipse(0,4,43,12,0,0,Math.PI*2);ctx.fill();
    // wheels
    ctx.fillStyle='#181a27';rounded(-38,-13,15,28,5);rounded(23,-13,15,28,5);rounded(-32,14,13,22,5);rounded(19,14,13,22,5);
    // chassis
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-29,-4);ctx.lineTo(-22,-24);ctx.lineTo(22,-24);ctx.lineTo(30,-3);ctx.lineTo(24,22);ctx.lineTo(-24,22);ctx.closePath();ctx.fill();
    ctx.fillStyle=shade(color,-25);ctx.beginPath();ctx.moveTo(-20,-20);ctx.lineTo(0,-29);ctx.lineTo(20,-20);ctx.lineTo(13,-6);ctx.lineTo(-14,-6);ctx.closePath();ctx.fill();
    ctx.fillStyle='#eafaff';ctx.beginPath();ctx.moveTo(-13,10);ctx.lineTo(-9,0);ctx.lineTo(10,0);ctx.lineTo(16,10);ctx.closePath();ctx.fill();ctx.globalAlpha=.5;ctx.fillStyle='#fff';ctx.fillRect(-18,-3,36,2);ctx.globalAlpha=1;
    if(player){ctx.fillStyle='#fff4a8';ctx.shadowColor='#fff4a8';ctx.shadowBlur=15;ctx.fillRect(-22,12,7,3);ctx.fillRect(15,12,7,3);ctx.shadowBlur=0}
    else{ctx.fillStyle='#fff';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText('RIVAL',0,-32)}
    ctx.restore();
  }
  function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function shade(hex,amt){let n=parseInt(hex.slice(1),16),r=clamp((n>>16)+amt,0,255),g=clamp(((n>>8)&255)+amt,0,255),b=clamp((n&255)+amt,0,255);return `rgb(${r},${g},${b})`}
  function drawSceneryProps(horizon){
    const t=track();for(let side of [-1,1])for(let i=0;i<8;i++){let z=200+i*390+mod(distance*1.1,390),scale=1/(1+z/570);if(scale<.11)continue;let bend=curveDistance(distance,z)*.055;let cx=width/2-bend*scale,half=width*(.045+.39*scale),x=cx+side*(half+22+22*scale),y=horizon+(height-horizon)*scale;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
      if(t.scenery==='city'){ctx.fillStyle=i%2?'#f6c478':'#ff8295';ctx.fillRect(-12,-47,24,48);ctx.fillStyle='#252e50';ctx.fillRect(-16,-51,32,8);ctx.fillStyle='#fff4ba';for(let wy=-39;wy<-8;wy+=12){ctx.fillRect(-7,wy,4,5);ctx.fillRect(3,wy,4,5)}}
      else if(t.scenery==='coast'){ctx.fillStyle='#6b554d';ctx.fillRect(-3,-40,6,40);ctx.fillStyle='#36895c';ctx.beginPath();ctx.ellipse(0,-41,21,7,-.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(-6,-47,15,6,.4,0,Math.PI*2);ctx.fill()}
      else{ctx.fillStyle='#5e8790';ctx.beginPath();ctx.moveTo(0,-58);ctx.lineTo(-21,0);ctx.lineTo(20,0);ctx.fill();ctx.fillStyle='#e9f8f6';ctx.beginPath();ctx.moveTo(0,-58);ctx.lineTo(-9,-27);ctx.lineTo(0,-33);ctx.lineTo(10,-16);ctx.fill()}
      ctx.restore();}
  }
  function drawRivals(horizon,bottom){
    racers.forEach(r=>{let ahead=r.progress-distance;if(ahead<0)ahead+=track().length*2;if(ahead<60||ahead>3000)return;let scale=1/(1+ahead/570),bend=curveDistance(distance,ahead)*.055,cx=width/2-bend*scale,half=width*(.045+.39*scale);let x=cx+r.offset*half*.72,y=horizon+(bottom-horizon)*scale-4;drawKart(x,y,Math.max(.24,scale*.88),r.color,false)})
  }
  function drawPlayer(){let y=height*.83,x=width/2+playerX*width*.32;drawKart(x,y,1.12,kart().color,true);if(boost>0){ctx.save();ctx.globalCompositeOperation='screen';for(let side of [-1,1]){let flame=ctx.createLinearGradient(x+side*14,y+16,x+side*14,y+75);flame.addColorStop(0,'#fff');flame.addColorStop(.28,kart().color);flame.addColorStop(1,'transparent');ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(x+side*12,y+16);ctx.lineTo(x+side*22,y+16);ctx.lineTo(x+side*18,y+58+Math.random()*22);ctx.closePath();ctx.fill()}ctx.restore()}}
  function update(dt){
    if(countdown>0){countdown-=dt;let n=Math.ceil(countdown);$('#toast').textContent=countdown<.45?'GO!':String(n);$('#toast').style.opacity=countdown<.15?0:1;if(countdown<=0){raceStart=performance.now();$('#toast').style.opacity=0}return}
    const accel=keys.arrowup||keys.w||keys[' '],brake=keys.arrowdown||keys.s,left=keys.arrowleft||keys.a,right=keys.arrowright||keys.d,drifting=keys[' '];
    if(accel)speed+=130*dt;else speed-=36*dt;if(brake)speed-=145*dt;
    let max=kart().max;if(boost>0){speed+=175*dt;boost-=dt}speed=clamp(speed,0,max*(1+boost*.16));
    const turn=(left?-1:0)+(right?1:0);steerLean+=(turn*speed/160-steerLean)*Math.min(1,dt*7);
    let handling=.62+kart().grip/120;if(drifting&&turn){driftCharge=clamp(driftCharge+dt*(14+speed*.04),0,100);handling*=.67}else if(driftCharge>0){if(driftCharge>56)boost=Math.max(boost,.75+driftCharge/100);driftCharge=Math.max(0,driftCharge-dt*42)}
    playerX+=turn*dt*(.72+speed/205)*handling;playerX-=curveAt(distance)*dt*(speed/230)*.20;playerX=clamp(playerX,-1.23,1.23);
    if(Math.abs(playerX)>1){speed=Math.max(60,speed-190*dt);playerX=clamp(playerX,-1.23,1.23)}
    if(keys.shift&&boostFuel>0){boost=Math.max(boost,.12);boostFuel=Math.max(0,boostFuel-dt*45)}else if(!keys.shift)boostFuel=clamp(boostFuel+dt*(drifting?13:5),0,100);
    distance+=speed*dt*.94;
    racers.forEach(r=>{let wobble=Math.sin(frame*.001+r.phase)*.12;r.progress+=speed*dt*r.skill*(.66+wobble*.12);r.offset=clamp(r.offset+Math.sin(frame*.0008+r.phase)*dt*.025,-.67,.67)});
    const progress=distance/track().length;lap=Math.floor(progress)+1;if(lap>3){lap=3;finishRace()}
    place=1+racers.filter(r=>r.progress>distance).length;
    $('#position').innerHTML=`${place}<sup>${place===1?'ST':place===2?'ND':place===3?'RD':'TH'}</sup>`;$('#lap').innerHTML=`${Math.min(3,lap)}<span>/3</span>`;$('#speedValue').textContent=String(Math.round(speed)).padStart(3,'0');$('#boostFill').style.width=boostFuel+'%';$('#boostHint').textContent=boost>0?'ACTIVE':boostFuel>98?'READY':'CHARGING';
  }
  function finishRace(){if(finished)return;finished=true;running=false;const elapsed=(performance.now()-raceStart)/1000;const mm=String(Math.floor(elapsed/60)).padStart(2,'0'),ss=(elapsed%60).toFixed(2).padStart(5,'0');$('#finalPlace').textContent=`${place}${place===1?'ST':place===2?'ND':place===3?'RD':'TH'}`;$('#finalTrack').textContent=track().short;$('#finalTime').textContent=`${mm}:${ss}`;$('#resultTitle').innerHTML=place===1?'PODIUM<br><span>FINISH!</span>':place<=3?'ON THE<br><span>PODIUM!</span>':'RACE<br><span>COMPLETE</span>';$('#resultCopy').textContent=place===1?'A brilliant drive. The crowd is on its feet.':place<=3?'A fantastic finish. You raced your way onto the podium.':'Every finish line is a victory. Take another lap!';hud.classList.add('hidden');touchControls.classList.add('hidden');result.classList.remove('hidden')}
  function drawFrame(){frame++;landscape();const bounds=road();drawSceneryProps(bounds.horizon);drawRivals(bounds.horizon,bounds.bottom);drawPlayer();if(countdown>0){$('#toast').style.opacity=countdown<.15?0:1}}
  function loop(now){if(!running)return;const dt=Math.min(.04,last?((now-last)/1000):.016);last=now;update(dt);drawFrame();if(running)requestAnimationFrame(loop)}
  function idle(){if(running)return;frame++;const t=performance.now()/1000;landscape();const bounds=road();drawSceneryProps(bounds.horizon);drawPlayer();requestAnimationFrame(idle)}
  function init(){renderMenu();distance=0;playerX=0;requestAnimationFrame(idle)}
  init();
})();
