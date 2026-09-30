(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,RM?0:ms));
let lang=localStorage.getItem('bk-lang')||'tr';
const M={
tr:{invalid:'Kullanıcı adı ya da şifre hatalı.',invalidSg:'Şifreni unuttuysan',invalidLnk:'şifremi unuttum →',rate:'Postane biraz yoğun.',rateSg:'Çok deneme oldu, {n} sn sonra tekrar dene.',net:'Mektup postaneye ulaşmadı.',netSg:'Bağlantını kontrol edip tekrar dene.',needEmail:'Bilkent mailin lazım.',needEmailSg:'@bilkent.edu.tr ya da @ug.bilkent.edu.tr ile biten bir adres.',mismatch:'Şifreler aynı değil.',mismatchSg:'İkisini de bir daha kontrol et.',empty:'Boş kalan yer var.',emptySg:'Bütün satırları doldurup gönder.',user:'Kullanıcı adı 3–24 karakter, harf ve rakam.',userSg:'Boşluk ve özel karakter olmadan.',weak:'Şifre henüz yeterince güçlü değil.',weakSg:'Yukarıdaki 4 maddeden en az 3’ü işaretlenmeli.',regFail:'Başvurun postaneye ulaşmadı.',regFailSg:'Kayıt API’sine istek gönderilemedi — sunucu şu an yanıt vermiyor. Biraz sonra tekrar dene.',str:['şifre gücü','zayıf','orta','iyi','güçlü'],fTitle:'Kısa bir not yaz',fBody:'Bilkent adresini yaz; sana yeni bir şifre bağlantısı postalayalım.',fSend:'GÖNDER',fFail:'Not gönderilemedi.',fFailSg:'Şifre sıfırlama API’sine istek gönderilemedi. Biraz sonra tekrar dene.',show:'göster',hide:'gizle',
kLbl:'ÜYE KARTI',kHolder:'KART SAHİBİ',kR1:'yetki',kV1:'terminal · tam erişim',kR2:'oturum',kR3:'giriş',hEb:'erişim',hTitle:'İZİN VERİLDİ',hSub:'hoş geldin, {u} · terminal açılıyor',hSkip:'geçmek için bir tuşa bas',
lReq:'oturum isteği',lUser:'kullanıcı',lPw:'parola özeti',lMatch:'eşleşti',lSig:'imza',lCookie:'çerez',lGate:'kapı',lTty:'terminal',lReady:'hazır',lRtt:'yanıt'},
en:{invalid:'Username or password is wrong.',invalidSg:'Forgot your password?',invalidLnk:'reset it →',rate:'The post office is a bit busy.',rateSg:'Too many attempts, try again in {n}s.',net:'The letter never reached the post office.',netSg:'Check your connection and try again.',needEmail:'You need a Bilkent e-mail.',needEmailSg:'An address ending in @bilkent.edu.tr or @ug.bilkent.edu.tr.',mismatch:'Passwords do not match.',mismatchSg:'Check both once more.',empty:'Something is left blank.',emptySg:'Fill every line, then send.',user:'Username is 3–24 letters and digits.',userSg:'No spaces or special characters.',weak:'Password is not strong enough yet.',weakSg:'At least 3 of the 4 checks above.',regFail:'Your application never arrived.',regFailSg:'The sign-up API request could not be sent — the server is not responding. Try again later.',str:['password strength','weak','fair','good','strong'],fTitle:'Write a short note',fBody:'Enter your Bilkent address; we will mail you a new password link.',fSend:'SEND',fFail:'The note could not be sent.',fFailSg:'The password reset API request could not be sent. Try again later.',show:'show',hide:'hide',
kLbl:'MEMBER CARD',kHolder:'CARD HOLDER',kR1:'access',kV1:'terminal · full',kR2:'session',kR3:'signed in',hEb:'access',hTitle:'ACCESS GRANTED',hSub:'welcome, {u} · opening terminal',hSkip:'press any key to skip',
lReq:'session request',lUser:'user',lPw:'password hash',lMatch:'match',lSig:'signature',lCookie:'cookie',lGate:'gate',lTty:'terminal',lReady:'ready',lRtt:'rtt'}};
const t=(k,v={})=>Object.entries(v).reduce((s,[a,b])=>s.replace('{'+a+'}',b),M[lang][k]);
const escH=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* language */
$$('[data-en]').forEach(el=>{el.dataset.tr=el.textContent});
function applyLang(){document.documentElement.lang=lang;$$('[data-en]').forEach(el=>{el.textContent=lang==='en'?el.dataset.en:el.dataset.tr});const b=$('#lang');if(b)b.textContent=lang==='en'?'TR':'EN';}
applyLang();
$('#lang')?.addEventListener('click',()=>{lang=lang==='en'?'tr':'en';localStorage.setItem('bk-lang',lang);applyLang();$$('.note:not([hidden])').forEach(n=>n.hidden=true);});

/* postmark date */
const d=new Date(),pad=n=>String(n).padStart(2,'0');$$('.pm b').forEach(b=>b.textContent=`${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`);

/* show / hide password */
$$('[data-eye]').forEach(b=>b.addEventListener('click',()=>{const i=$('#'+b.dataset.eye);const show=i.type==='password';i.type=show?'text':'password';b.textContent=t(show?'hide':'show');i.focus();}));

/* parallax (barely there) */
if(!RM&&matchMedia('(pointer:fine)').matches)addEventListener('mousemove',e=>{document.body.style.setProperty('--px',(e.clientX/innerWidth-.5).toFixed(3));document.body.style.setProperty('--py',(e.clientY/innerHeight-.5).toFixed(3));});

/* notes */
function note(el,type,msg,sg,lnk,onLnk){if(!el)return;el.className='note '+type;el.hidden=false;const stamp=type==='red'?`<span class="stamp red">İADE</span>`:type==='amber'?`<span class="stamp amber">YOĞUN</span>`:'';el.innerHTML=`${stamp}<p>${msg}${sg?`<span class="sg">${sg}${lnk?` <button type="button" class="lnk">${lnk}</button>`:''}</span>`:''}</p>`;const b=$('.lnk',el);if(b&&onLnk)b.addEventListener('click',onLnk);const f=el.previousElementSibling;if(f&&f.classList.contains('fld')&&type==='red')f.classList.add('bad');}
function clearNotes(form){$$('.note',form).forEach(n=>{n.hidden=true;n.innerHTML=''});$$('.fld.bad',form).forEach(f=>f.classList.remove('bad'));}
const isBilkent=e=>/^[^\s@]+@(ug\.)?bilkent\.edu\.tr$/i.test(e.trim());
function shake(el){el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');el.addEventListener('animationend',()=>el.classList.remove('shake'),{once:true});}
function busy(btn,on){btn.classList.toggle('busy',on);btn.disabled=on;}
function settleHeight(letter,fn){const h0=letter.offsetHeight;letter.style.height=h0+'px';fn();letter.style.height='auto';const h1=letter.offsetHeight;letter.style.height=h0+'px';requestAnimationFrame(()=>{letter.style.height=h1+'px';setTimeout(()=>letter.style.height='',RM?0:280);});}

/* strength */
function strength(pw){const c={length:pw.length>=8,uppercase:/[A-Z]/.test(pw),number:/\d/.test(pw),special:/[!@#$%^&*(),.?":{}|<>_\-+=\[\];'\/\\~`]/.test(pw)};return{c,pct:Object.values(c).filter(Boolean).length*25};}
function bindStrength(input,box,bar,lbl,send,minPct){const upd=()=>{const {c,pct}=strength(input.value);$$('li',box).forEach(li=>li.classList.toggle('ok',!!c[li.dataset.k]));bar.style.width=pct+'%';bar.className='s'+(pct/25);lbl.textContent=t('str')[pct/25];if(send)send.disabled=pct<minPct;};input.addEventListener('input',upd);upd();return()=>strength(input.value).pct;}

/* envelope send sequence */
async function sendLetter(letter,env,{wax=false}={}){letter.classList.add('fold');await wait(120);env.classList.add('show');if(wax)env.classList.add('wax');await wait(240);env.classList.add('closed');await wait(200);env.classList.add('stamped');await wait(260);env.classList.add('whoosh');await wait(420);}

/* ===== GİRİŞ / KAYIT ===== */
const letter=$('#letter'),env=$('#env'),fLogin=$('#fLogin'),fReg=$('#fReg'),tabs={login:$('#tabLogin'),reg:$('#tabReg')};
function go(which){clearNotes(letter);settleHeight(letter,()=>{fLogin.hidden=which!=='login';fReg.hidden=which!=='reg';tabs.login.setAttribute('aria-selected',which==='login');tabs.reg.setAttribute('aria-selected',which==='reg');});setTimeout(()=>$('input',which==='login'?fLogin:fReg)?.focus(),RM?0:200);}
tabs.login.addEventListener('click',()=>go('login'));tabs.reg.addEventListener('click',()=>go('reg'));
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$$('input',letter).forEach(i=>i.addEventListener('input',()=>{const n=i.closest('.fld').nextElementSibling;if(n?.classList.contains('note')){n.hidden=true;i.closest('.fld').classList.remove('bad');}$('#nLoginForm').hidden=true;$('#nRegForm').hidden=true;}));
setTimeout(()=>$('#loginUser').focus(),RM?0:300);

/* gerçek giriş: kutuphane-api doğrular, oturum çerezini o yazar */
async function login(kullanici,sifre){
try{const res=await fetch('/api/giris',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Kutuphane':'1'},body:JSON.stringify({kullanici,sifre})});
const j=await res.json().catch(()=>({}));if(res.ok&&j.ok)return j;return{code:j.error||'NETWORK',retryAfter:j.retryAfter};}
catch(e){return{code:'NETWORK'}}}

let cdTimer;
function rateNote(el,n){clearInterval(cdTimer);const draw=()=>{note(el,'amber',t('rate'),t('rateSg',{n:`<span class="cd">${n}</span>`}));};draw();cdTimer=setInterval(()=>{n--;if(n<=0){clearInterval(cdTimer);el.hidden=true;return;}const cd=$('.cd',el);if(cd)cd.textContent=n;},1000);}

fLogin.addEventListener('submit',async ev=>{ev.preventDefault();clearNotes(fLogin);clearInterval(cdTimer);const user=$('#loginUser').value.trim(),pass=$('#loginPass').value,send=$('#sendLogin');if(!user||!pass){shake(letter);note($('#nLoginForm'),'red',t('empty'),t('emptySg'));return;}busy(send,true);const t0=performance.now();const [r]=await Promise.all([login(user,pass).then(x=>(x.rtt=performance.now()-t0,x)),wait(650)]);busy(send,false);
if(r.ok){await sendLetter(letter,env,{wax:true});gecis(r.kullanici||user,r.rtt);return;}
shake(letter);$('#loginPass').select();
if(r.code==='INVALID_CREDENTIALS')note($('#nLoginPass'),'red',t('invalid'),t('invalidSg'),t('invalidLnk'),openForgot);
else if(r.code==='RATE_LIMIT_EXCEEDED')rateNote($('#nLoginForm'),r.retryAfter||60);
else note($('#nLoginForm'),'red',t('net'),t('netSg'));
});

/* ===== GİRİŞ BAŞARILI: bilkenters kartı → kesinti → erişim ekranı → terminal ===== */
const HEX='0123456789abcdef',GLY='ABCDEF0123456789#%&*/\\<>=+$@';
const rnd=n=>Array.from({length:n},()=>HEX[Math.random()*16|0]).join('');
async function sha(txt){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return rnd(64)}}
function scramble(el,text,ms){return new Promise(res=>{const t0=performance.now(),n=[...text];(function f(){const p=Math.min(1,(performance.now()-t0)/ms),k=Math.floor(p*n.length);
el.innerHTML=n.map((c,i)=>i<k||c===' '?escH(c):'<span class="s">'+escH(GLY[Math.random()*GLY.length|0])+'</span>').join('');p<1?requestAnimationFrame(f):res()})()})}
async function gecis(user,rtt){
const gate=$('#gate'),hack=$('#hack'),log=$('#hLog'),hex=$('#hHex');
const u=user.toLocaleLowerCase('tr'),name=user.charAt(0).toLocaleUpperCase('tr')+user.slice(1);
let gone=false;const enter=()=>{if(gone)return;gone=true;hack.classList.add('out');setTimeout(()=>location.replace('/'),RM?0:260);};
/* 1 · kâğıt dünya: her zamanki bilkenters animasyonu geliyormuş gibi */
['kLbl','kHolder','kR1','kV1','kR2','kR3'].forEach(k=>{$('#'+k).textContent=t(k)});
$('#kName').textContent=name;$('#kNo').textContent=String(d.getFullYear()%100).padStart(2,'0')+'-'+String(Math.floor(Math.random()*9000)+1000);
$('#kWhen').textContent=`${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
const dig=sha(`${u}.${Date.now()}.${Math.random()}`);
gate.hidden=false;void gate.offsetWidth;gate.classList.add('on');
await wait(1050);
/* 2 · kesinti: tek karede siyah, ortadan ışık çizgisi */
hack.hidden=false;document.body.classList.add('cut');hack.classList.add('cut');
addEventListener('keydown',enter);hack.addEventListener('click',enter);
$('#hSkip').textContent=t('hSkip');$('#hEb').textContent=t('hEb');
await wait(230);
/* 3 · erişim ekranı: loglar ve hex akışı hızla geçer */
let rows=[],hexOn=true,off=Math.random()*0xffff|0;
(function hx(){if(!hexOn||gone)return;for(let i=0;i<3;i++){off=(off+16)&0xffffff;rows.push('<b>'+off.toString(16).padStart(6,'0')+'</b>  '+rnd(32).match(/../g).join(' '));}rows=rows.slice(-60);hex.innerHTML=rows.join('\n');setTimeout(hx,RM?400:28)})();
const h=await dig,T0=performance.now(),ts=()=>{const s=((performance.now()-T0)/1000).toFixed(3);return`<span class="t">[${s.padStart(8,' ')}]</span> `};
const dots=(a,n)=>escH(a)+' '+'.'.repeat(Math.max(2,n-a.length))+' ';
const L=[
 ()=>`bilkenters-auth <span class="k">${t('lReq')}</span>`,
 ()=>dots(t('lUser'),22)+`<span class="v">${escH(u)}</span>`,
 ()=>dots(t('lPw'),22)+`scrypt n=16384 r=8 p=1 <span class="ok">${t('lMatch')}</span>`,
 ()=>dots(t('lSig'),22)+`hmac-sha256 <span class="v">${h.slice(0,16)}…${h.slice(-8)}</span>`,
 ()=>dots(t('lCookie'),22)+`bk_oturum · httponly · samesite=lax · 30d`,
 ()=>dots(t('lRtt'),22)+`<span class="v">${Math.max(1,Math.round(rtt||0))} ms</span>`,
 ()=>dots(t('lGate'),22)+`forward_auth /api/yetki <span class="ok">204</span>`,
 ()=>dots(t('lTty'),22)+`ttyd · tmux attach -t main <span class="ok">${t('lReady')}</span>`];
for(const line of L){if(gone)return;log.innerHTML+=ts()+line()+'\n';await wait(70+Math.random()*50);}
/* ortada "İZİN VERİLDİ" harf harf çözülür */
hack.classList.add('grant');
const tm=new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
$('#hSub').innerHTML=escH(t('hSub',{u:'\u0000'})).replace('\u0000',`<span class="u">${escH(u)}@bilkenters</span>`)+` · ${tm}`;
requestAnimationFrame(()=>{$('#hBar').style.width='100%'});
await scramble($('#hTitle'),t('hTitle'),RM?0:520);
await wait(900);hexOn=false;
/* 4 · zemin terminalin rengine döner */
enter();}
/* terminalden geri gelinirse sayfa önbellekten açılmasın, formla başlasın */
addEventListener('pageshow',e=>{if(e.persisted)location.reload()});

/* kayıt: tasarımdaki kontroller aynı, ama kayıt API'si yok — her başvuru hatayla döner */
const regPct=bindStrength($('#regPass'),$('#str'),$('#strBar'),$('#strLbl'),$('#sendReg'),75);
$('#regEmail').addEventListener('blur',()=>{const v=$('#regEmail').value;if(v&&!isBilkent(v))note($('#nRegEmail'),'red',t('needEmail'),t('needEmailSg'));});
fReg.addEventListener('submit',async ev=>{ev.preventDefault();clearNotes(fReg);const u=$('#regUser').value.trim(),e=$('#regEmail').value.trim(),p=$('#regPass').value,p2=$('#regPass2').value,send=$('#sendReg');
if(!u||!e||!p||!p2){shake(letter);note($('#nRegForm'),'red',t('empty'),t('emptySg'));return;}
if(!/^[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]{3,24}$/.test(u)){shake(letter);note($('#nRegUser'),'red',t('user'),t('userSg'));return;}
if(!isBilkent(e)){shake(letter);note($('#nRegEmail'),'red',t('needEmail'),t('needEmailSg'));return;}
if(regPct()<75){shake(letter);note($('#nRegForm'),'red',t('weak'),t('weakSg'));return;}
if(p!==p2){shake(letter);note($('#nRegPass2'),'red',t('mismatch'),t('mismatchSg'));return;}
busy(send,true);await wait(900);busy(send,false);
shake(letter);note($('#nRegForm'),'red',t('regFail'),t('regFailSg'));
});

/* şifremi unuttum: aynı şekilde API yok */
function modal(html){const sc=document.createElement('div');sc.className='scrim';sc.innerHTML=html;document.body.appendChild(sc);sc.addEventListener('click',e=>{if(e.target===sc)sc.remove()});return sc;}
function openForgot(){const sc=modal(`<form class="card paper kraft ruled" id="fForgot" novalidate><span class="tape teal"></span><button class="x" type="button" aria-label="kapat">✕</button><h3 class="ttl">${t('fTitle')}</h3><p class="body">${t('fBody')}</p><label class="fld"><span class="cap"><span>${lang==='en'?'E-mail':'E-posta'}</span></span><input type="email" name="email" autocomplete="email" placeholder="ad.soyad@ug.bilkent.edu.tr"><i class="pen"></i></label><div class="note" hidden></div><div class="foot" style="justify-content:flex-end"><button class="send" type="submit"><span class="t">${t('fSend')}</span><span class="arr">→</span><span class="spin"></span></button></div></form>`);
const f=$('#fForgot',sc);$('.x',f).addEventListener('click',()=>sc.remove());setTimeout(()=>$('input',f).focus(),50);
f.addEventListener('submit',async e=>{e.preventDefault();const em=$('input',f).value.trim();if(!isBilkent(em)){shake(f);note($('.note',f),'red',t('needEmail'),t('needEmailSg'));return;}const b=$('.send',f);busy(b,true);await wait(800);busy(b,false);shake(f);note($('.note',f),'red',t('fFail'),t('fFailSg'));});}
$('#btnForgot').addEventListener('click',openForgot);
})();
