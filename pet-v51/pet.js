/* 小拉 2.5D V5: animated from the approved V2 PNG layers, NOT the rejected V3/V4 model. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const els={body:$('body-bob'),head:$('head-node'),larm:$('arm-left-node'),rarm:$('arm-right-node'),
 lleg:$('leg-left-node'),rleg:$('leg-right-node'),leftEye:$('left-eye-node'),rightEye:$('right-eye-node'),
 leftClosed:$('left-closed'),rightClosed:$('right-closed'),animatedMouth:$('animated-mouth'),
 mouthShape:$('dynamic-mouth-shape'),tongue:$('tongue'),sad:$('sad-mouth'),
 bottle:$('water-prop'),food:$('food-prop'),petHand:$('pet-hand'),heart:$('heart-particles'),
 music:$('dance-particles'),banner:$('banner-node'),fabric:$('banner-fabric'),rollL:$('banner-roll-left'),rollR:$('banner-roll-right'),pawL:$('banner-paw-left'),pawR:$('banner-paw-right'),lettering:$('banner-lettering'),
 thinking:$('thinking-particles'),confetti:$('success-particles'),cloud:$('failure-particles'),shake:$('shake-particles'),ball:$('soccer-ball'),
 ground:$('svg-ground'),faceHit:$('head-hit')};
const $speech=$('speech'),$caption=$('scene-status'),$mode=$('current-mode');
if(new URLSearchParams(location.search).get('mini')==='1') document.body.classList.add('mini');
const buttons=[...document.querySelectorAll('[data-pet]')];
const D={
 idle:{label:'待机',note:'呼吸、眨眼、轻轻摇摆',speech:'嗨，我是小拉，随时陪你一起工作～'},
 welcome:{label:'欢迎',note:'挥手、歪头、微笑',speech:'你好呀！今天也一起加油！ 👋',duration:3300},
 thinking:{label:'思考',note:'托腮、歪头、眼神变化',speech:'正在认真帮你想办法呢… 🤔'},
 success:{label:'成功',note:'举手庆祝、眯眼微笑',speech:'完成啦！我们真棒！ 🎉',duration:3400},
 failure:{label:'失败',note:'低头、垂手、轻微沮丧',speech:'这次没成功，我再帮你试试～',duration:3400},
 sidestep:{label:'闪身步',note:'身体侧滑、腿部交替抬落',speech:'看我一个漂亮的闪身步！ ✨',duration:4250},
 shake:{label:'狗熊哆嗦毛',note:'头耳与身体高频错位晃动',speech:'抖一抖～精神满满！ 🐨',duration:3250},
 kick:{label:'浪子踢球',note:'抬腿踢球、足球飞出',speech:'这一脚，漂亮！ ⚽',duration:3750},
 drink:{label:'喝水',note:'抬手、闭眼、仰头',speech:'咕噜咕噜～补充水分！ 💧',duration:4100},
 eat:{label:'吃饭',note:'抬手送食物、嘴巴张合',speech:'啊呜～好好吃！ 🍚',duration:4100},
 pet:{label:'摸摸头',note:'闭眼、歪头、开心回应',speech:'好舒服呀～再摸摸我！ ♥',duration:3100},
 dance:{label:'自由跳舞',note:'双臂交替、头部摇摆',speech:'跟着节奏一起摇摆！ ♪',duration:3800}
};
let mode='idle',start=performance.now(),last=0,frameId=0,autoReturn=true,hold=null,bannerTarget=0,bannerVal=0,bannerVelocity=0,requestToken=0,speechCustom=false;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
function key(t,ks){if(t<=ks[0][0])return ks[0][1];for(let i=1;i<ks.length;i++)if(t<=ks[i][0])return mix(ks[i-1][1],ks[i][1],smooth((t-ks[i-1][0])/(ks[i][0]-ks[i-1][0])));return ks.at(-1)[1]}
const sin=Math.sin,PI=Math.PI;
const pose=()=>({head:0,headX:0,headY:0,left:0,right:0,legLeft:0,legRight:0,lLift:0,rLift:0,lShift:0,rShift:0,bodyY:0,bodyX:0,bodyR:0,eyes:0,eyeX:0,eyeY:0,mouth:0,sad:0,bottle:0,food:0,pet:0,heart:0,music:0,thinking:0,confetti:0,cloud:0,shake:0,ball:0,ballX:850,ballY:1165,ballR:0,banner:0});
function setSpeech(message){$speech.textContent=String(message);$speech.classList.remove('pop');void $speech.offsetWidth;$speech.classList.add('pop')}
function highlight(){buttons.forEach(el=>{let yes=el.dataset.pet===mode;el.classList.toggle('active',yes);el.setAttribute('aria-pressed',yes?'true':'false')})}
function status(){const d=D[mode];$caption.textContent=d.label+' · '+d.note;$mode.textContent=d.label;highlight()}
function begin(name,customMessage){if(!D[name])return false;mode=name;start=performance.now();hold=null;bannerTarget=0;requestToken++;status();setSpeech(customMessage||D[name].speech);return true}
function setState(name,msg){return begin(name,msg)}
function play(name){return begin(name)}
function reset(){begin('idle')}
function dispatch(event,payload={}){const map={open:'welcome',assistant_open:'welcome',query_start:'thinking',query_success:'success',query_error:'failure',query_failure:'failure',close:'idle',assistant_close:'idle',ready:'idle'};const target=map[event];if(!target)return false;return begin(target,payload.message)}
function banner(open){if(open){begin('idle','给每个梦想一个机会 ✨');bannerTarget=1}else{bannerTarget=0;setSpeech('梦想卷轴收好啦！还有什么想看的？')}const btn=$('banner-toggle');btn.textContent=open?'✦ 收起梦想卷轴':'✦ 双手拉开梦想卷轴';btn.setAttribute('aria-pressed',String(open))}
function draw(p,now){
 const n=v=>(Math.round(v*100)/100);
 els.body.setAttribute('transform',`translate(${n(p.bodyX)} ${n(p.bodyY)}) rotate(${n(p.bodyR)} 610 1060)`);
 els.head.setAttribute('transform',`translate(${n(p.headX)} ${n(p.headY)}) rotate(${n(p.head)} 630 705)`);
 els.larm.setAttribute('transform',`rotate(${n(p.left)} 513 788)`);
 els.rarm.setAttribute('transform',`rotate(${n(p.right)} 825 776)`);
 // Independent lower leg sprites, split from the original V2 body art, rotate at knee.
 els.lleg.setAttribute('transform',`translate(${n(p.lShift)} ${n(-p.lLift)}) rotate(${n(p.legLeft)} 528 1086)`);
 els.rleg.setAttribute('transform',`translate(${n(p.rShift)} ${n(-p.rLift)}) rotate(${n(p.legRight)} 751 1086)`);
 els.leftEye.setAttribute('transform',`translate(${n(p.eyeX)} ${n(p.eyeY)})`);
 els.rightEye.setAttribute('transform',`translate(${n(p.eyeX)} ${n(p.eyeY)})`);
 const eyes=clamp(p.eyes);els.leftEye.setAttribute('opacity',n(1-eyes));els.rightEye.setAttribute('opacity',n(1-eyes));
 els.leftClosed.setAttribute('opacity',n(eyes));els.rightClosed.setAttribute('opacity',n(eyes));
 els.animatedMouth.setAttribute('opacity',p.mouth>.01?'1':'0');
 if(p.mouth>.01){let scale=mix(.35,1.06,clamp(p.mouth)),cy=607;let tr=`translate(0 ${n(cy*(1-scale))}) scale(1 ${n(scale)})`;
 els.mouthShape.setAttribute('transform',tr);els.tongue.setAttribute('transform',tr);els.tongue.setAttribute('opacity',n(clamp(p.mouth*.94)))}
 els.sad.setAttribute('opacity',n(clamp(p.sad)));
 const r=p.right*PI/180,wristX=825+211*Math.cos(r)+123*Math.sin(r),wristY=776+211*Math.sin(r)-123*Math.cos(r);
 els.bottle.setAttribute('opacity',n(p.bottle));els.bottle.setAttribute('transform',`translate(${n(wristX+53)} ${n(wristY+117)}) rotate(${n(p.right*.3)})`);
 els.food.setAttribute('opacity',n(p.food));els.food.setAttribute('transform',`translate(${n(wristX+57)} ${n(wristY+116)}) rotate(${n(p.right*.14)})`);
 els.petHand.setAttribute('opacity',n(p.pet));els.petHand.setAttribute('transform',`translate(${n(675+sin(now/210)*12)} ${n(272+sin(now/240)*4)}) rotate(-16)`);
 els.heart.setAttribute('opacity',n(p.heart));els.heart.setAttribute('transform',`translate(0 ${n(-p.heart*43)})`);
 els.music.setAttribute('opacity',n(p.music));els.music.setAttribute('transform',`translate(0 ${n(sin(now/220)*18)})`);
 els.thinking.setAttribute('opacity',n(p.thinking));els.thinking.setAttribute('transform',`translate(0 ${n(sin(now/450)*13)})`);
 els.confetti.setAttribute('opacity',n(p.confetti));els.confetti.setAttribute('transform',`translate(0 ${n(-p.confetti*25)})`);
 els.cloud.setAttribute('opacity',n(p.cloud));
 els.shake.setAttribute('opacity',n(p.shake));els.shake.setAttribute('transform',`translate(${n(sin(now/76)*10)} ${n(sin(now/91)*5)})`);
 els.ball.setAttribute('opacity',n(p.ball));els.ball.setAttribute('transform',`translate(${n(p.ballX)} ${n(p.ballY)}) rotate(${n(p.ballR)})`);
 // A physical-looking two-hand scroll: arm poses and scroll rollers share the same progress.
 const opened=clamp(p.banner), openEase=smooth(opened),span=180+415*openEase;
 const centerX=705+5*openEase;
 const leftX=centerX-span/2,rightX=centerX+span/2;
 const baseY=908,rollYL=929-8*openEase,rollYR=929-49*openEase;
 els.banner.setAttribute('opacity',n(clamp(opened*6)));
 els.fabric.setAttribute('transform',`translate(${n(centerX)} ${baseY}) rotate(${n(-4*openEase)}) scale(${n(Math.max(.002,span/600))} 1)`);
 els.rollL.setAttribute('transform',`translate(${n(leftX)} ${n(rollYL)}) rotate(${n(-4*openEase)})`);
 els.rollR.setAttribute('transform',`translate(${n(rightX)} ${n(rollYR)}) rotate(${n(-4*openEase)})`);
 els.pawL.setAttribute('transform',`translate(${n(leftX-7)} ${n(rollYL+4)}) rotate(${n(-10+12*openEase)})`);
 els.pawR.setAttribute('transform',`translate(${n(rightX+4)} ${n(rollYR+2)}) rotate(${n(8-15*openEase)})`);
 els.lettering.setAttribute('opacity',n(smooth((opened-.28)/.45)));
 els.ground.setAttribute('cx',String(n(615+p.bodyX*.35)));els.ground.setAttribute('rx',String(n(302-p.bodyY*.3)));
}
function evaluate(now){
 const p=pose(),e=(now-start)/1000,t=clamp(e/((D[mode].duration||1000)/1000)),s=sin;
 const breathe=s(now/930),bounce=s(now/1430);
 // Even engaged states retain a little breathing and animation, except the rapid shake.
 p.bodyY=1.6*breathe;p.head=1.2*bounce;p.headY=1*breathe;p.left=.8*s(now/1200);p.right=1.3*s(now/1060+.6);
 if(mode==='idle'){
   let b=now%4850;p.eyes=b<170?smooth(b/85)*(b<85?1:smooth((170-b)/85)):0;
 } else if(mode==='welcome'){
   const k=key(t,[[0,0],[.17,1],[.82,1],[1,0]]);
   p.right=(-69+11*s(now/140))*k;p.head=-8*k;p.headY=-4*k;p.bodyY=-10*k+3*s(now/160)*k;p.mouth=.40*k;
 } else if(mode==='thinking'){
   const k=key(clamp(e/.65),[[0,0],[1,1]]);
   p.right=-71*k+3*s(now/410)*k;p.head=7*k+2*s(now/620);p.headY=6*k;p.eyeX=5*k;p.eyeY=-4*k;p.thinking=.75+.20*s(now/480);
   p.mouth=0;
 } else if(mode==='success'){
   const k=key(t,[[0,0],[.18,1],[.79,1],[1,0]]);
   // Celebratory open arms stay *outside* the cheeks, never cross the nose or mouth.
   const cheer=Math.sin((now-start)/240);
   p.left=(48+6*cheer)*k;p.right=(5+8*Math.sin((now-start)/280+1.2))*k;
   p.bodyY=-24*k+4*Math.sin((now-start)/160)*k;p.head=-4*k;p.eyes=.78*k;
   p.mouth=.82*k;p.confetti=k;p.heart=.5*k;
 } else if(mode==='failure'){
   const k=key(t,[[0,0],[.24,1],[.79,1],[1,0]]);
   p.left=-9*k;p.right=12*k;p.head=11*k;p.headY=15*k;p.bodyY=20*k;p.eyes=.16*k;p.eyeY=4*k;p.sad=k;p.cloud=.75*k;
 } else if(mode==='sidestep'){
   const k=key(t,[[0,0],[.10,1],[.89,1],[1,0]]);
   const step=s(e*7),shift=s(e*3.5);
   p.bodyX=65*shift*k;p.bodyR=(6*step+4*shift)*k;p.head=-4*step*k;
   p.legLeft=22*s(e*7+.2)*k;p.legRight=-20*s(e*7+.2)*k;
   p.lLift=18*Math.max(0,s(e*7))*k;p.rLift=18*Math.max(0,-s(e*7))*k;
   p.left=-22*k+9*step*k;p.right=24*k-12*step*k;p.bodyY=-7*Math.abs(step)*k;p.mouth=.25*k;
 } else if(mode==='shake'){
   const k=key(t,[[0,0],[.11,1],[.88,1],[1,0]]);
   p.bodyX=7*s(e*40)*k;p.bodyR=6*s(e*33)*k;p.head=8*s(e*38+1.3)*k;p.headX=9*s(e*43)*k;
   p.left=22*s(e*37)*k;p.right=-19*s(e*39)*k;p.bodyY=5*s(e*53)*k;p.eyes=.5*k;p.mouth=.38*k;
   p.shake=k;
 } else if(mode==='kick'){
   const k=key(t,[[0,0],[.17,1],[.74,1],[1,0]]);
   p.head=-7*k;p.bodyR=-8*k;p.bodyY=-10*k;p.left=-15*k;p.right=-15*k;p.mouth=.35*k;
   p.legRight=key(t,[[0,0],[.23,0],[.40,-43],[.60,-43],[.83,-7],[1,0]]);
   p.rLift=key(t,[[0,0],[.29,3],[.44,39],[.62,37],[1,0]]);
   const travel=clamp((t-.39)/.52);
   p.ball=key(t,[[0,0],[.12,1],[.94,1],[1,0]]);
   p.ballX=865+295*smooth(travel);p.ballY=1182-145*s(travel*PI)*clamp((t-.38)*6);p.ballR=travel*730;
 } else if(mode==='drink'){
   p.right=key(t,[[0,0],[.12,-5],[.27,-89],[.64,-89],[.84,-30],[1,0]]);
   p.head=key(t,[[0,0],[.28,-5],[.68,-8],[1,0]]);p.headY=key(t,[[0,0],[.3,3],[.64,3],[1,0]]);
   p.bottle=key(t,[[0,0],[.13,1],[.8,1],[.99,0]]);p.eyes=(t>.38&&t<.73)?(.55+.35*s(t*30)**2):0;
 } else if(mode==='eat'){
   p.right=key(t,[[0,0],[.16,-20],[.34,-77],[.76,-77],[.92,-20],[1,0]]);
   p.head=key(t,[[0,0],[.3,5],[.8,3],[1,0]]);p.food=key(t,[[0,0],[.16,1],[.86,1],[1,0]]);
   p.mouth=t>.26&&t<.82?.25+.75*(.5+.5*s((t-.26)*76)):0;
 } else if(mode==='pet'){
   const k=key(t,[[0,0],[.16,1],[.8,1],[1,0]]);
   p.eyes=k;p.pet=k;p.heart=k;p.head=10*k+3*s(now/250)*k;p.headY=7*k;p.left=-10*k;
 } else if(mode==='dance'){
   const k=key(t,[[0,0],[.13,1],[.86,1],[1,0]]);
   // Alternating dance arms move at the sides, instead of swinging across the face.
   const beat=s((now-start)*.0105);
   p.left=(35+17*beat)*k;p.right=(17-13*beat)*k;
   p.head=8*s((now-start)*.0075)*k;p.bodyY=-9*(.5+.5*s((now-start)*.014))*k;
   p.bodyR=4*s((now-start)*.009)*k;p.bodyX=9*s((now-start)*.006)*k;
   p.mouth=.24*k;p.music=k;
 }
 p.banner=bannerVal;
 if(hold)Object.assign(p,hold);
 return {p,t};
}
function frame(now){const dt=Math.min(60,now-last||16);last=now;
 // Damped spring gives the cloth a small natural settle at the end of the pull.
 bannerVelocity+=(bannerTarget-bannerVal)*.004*(dt/16);
 bannerVelocity*=Math.pow(.83,dt/16);
 bannerVal=clamp(bannerVal+bannerVelocity,-.025,1.025);
 if(Math.abs(bannerVal-bannerTarget)<.0004 && Math.abs(bannerVelocity)<.0004){bannerVal=bannerTarget;bannerVelocity=0;}
 let v=evaluate(now);v.p.banner=bannerVal;
 if(D[mode].duration && v.t>=1){if(autoReturn){mode='idle';start=now;hold=null;status()}else{hold={...v.p,ball:0,music:0,confetti:0,shake:0,pet:0};}}
 if(bannerVal>.005){
   const b=smooth(clamp(bannerVal));
   v.p.banner=bannerVal;
   v.p.left=mix(-42,11,b);v.p.right=mix(119,66,b);
   v.p.head=-3*b;v.p.headY=-4*b;v.p.bodyY=-3*b;
 }
 draw(v.p,now);frameId=requestAnimationFrame(frame);
}
buttons.forEach(btn=>btn.addEventListener('click',()=>{const name=btn.dataset.pet;D[name].duration?play(name):setState(name)}));
$('banner-toggle').addEventListener('click',()=>banner(!bannerTarget));
$('reset').addEventListener('click',()=>{banner(false);reset()});
els.faceHit.addEventListener('click',()=>play('pet'));
els.faceHit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play('pet')}});
$('auto-toggle').addEventListener('click',e=>{autoReturn=!autoReturn;e.currentTarget.classList.toggle('off',!autoReturn);e.currentTarget.setAttribute('aria-pressed',String(autoReturn));e.currentTarget.setAttribute('aria-checked',String(autoReturn))});
['success','failure'].forEach(outcome=>$('demo-'+outcome).addEventListener('click',()=>{
  setState('thinking','正在模拟查询业务状态…');let token=++requestToken;
  setTimeout(()=>{if(token===requestToken)setState(outcome,outcome==='success'?'模拟查询成功（演示数据） ✅':'模拟查询失败（演示数据） ⚠️')},1650);
}));
window.XiaoLaPet={setState,play,dispatch,setSpeech,reset,openBanner:()=>banner(true),closeBanner:()=>banner(false),getStatus:()=>({mode,autoReturn,bannerOpen:!!bannerTarget}),version:'2.5D-V5.1'};
// Allow a same-page or embedded floating mini-pet host to request known events.
window.addEventListener('message',event=>{
 if(event.source!==window.parent || !event.data || typeof event.data!=='object')return;
 const {type,name,message}=event.data;
 if(type==='xiaola:state' && D[name])setState(name,typeof message==='string'?message.slice(0,180):undefined);
 else if(type==='xiaola:play' && D[name])play(name);
 else if(type==='xiaola:dispatch')dispatch(name,{message:typeof message==='string'?message.slice(0,180):undefined});
 else if(type==='xiaola:banner')banner(!!event.data.open);
});
status();setSpeech(D.idle.speech);frameId=requestAnimationFrame(frame);
})();
/* RANDOM_ACTIONS */
(()=>{
 const params=new URLSearchParams(location.search);
 if(params.get('mini')!=='1'||params.get('random')==='0'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const actions=['welcome','sidestep','shake','kick','drink','eat','pet','dance'];
 let enabled=true,last='';
 window.addEventListener('message',event=>{
  if(event.source===window.parent&&event.data?.type==='xiaola:autoplay')enabled=event.data.enabled===true;
 });
 function run(){
  const pet=window.XiaoLaPet;
  const status=pet.getStatus();
  if(enabled&&!document.hidden&&status.mode==='idle'&&!status.bannerOpen){
   const choices=actions.filter(name=>name!==last);
   last=choices[Math.floor(Math.random()*choices.length)];
   pet.play(last);
  }
  setTimeout(run,8000+Math.floor(Math.random()*7000));
 }
 setTimeout(run,3000+Math.floor(Math.random()*3000));
})();
