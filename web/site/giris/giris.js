(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,RM?0:ms));
let lang=localStorage.getItem('bk-lang')||'tr';
const M={
tr:{invalid:'Kullanıcı adı ya da şifre hatalı.',invalidSg:'Şifreni unuttuysan',invalidLnk:'şifremi unuttum →',rate:'Postane biraz yoğun.',rateSg:'Çok deneme oldu, {n} sn sonra tekrar dene.',net:'Mektup postaneye ulaşmadı.',netSg:'Bağlantını kontrol edip tekrar dene.',needEmail:'Bilkent mailin lazım.',needEmailSg:'@bilkent.edu.tr ya da @ug.bilkent.edu.tr ile biten bir adres.',mismatch:'Şifreler aynı değil.',mismatchSg:'İkisini de bir daha kontrol et.',empty:'Boş kalan yer var.',emptySg:'Bütün satırları doldurup gönder.',user:'Kullanıcı adı 3–24 karakter, harf ve rakam.',userSg:'Boşluk ve özel karakter olmadan.',weak:'Şifre henüz yeterince güçlü değil.',weakSg:'Yukarıdaki 4 maddeden en az 3’ü işaretlenmeli.',regFail:'Başvurun postaneye ulaşmadı.',regFailSg:'Kayıt API’sine istek gönderilemedi — sunucu şu an yanıt vermiyor. Biraz sonra tekrar dene.',str:['şifre gücü','zayıf','orta','iyi','güçlü'],fTitle:'Kısa bir not yaz',fBody:'Bilkent adresini yaz; sana yeni bir şifre bağlantısı postalayalım.',fSend:'GÖNDER',fFail:'Not gönderilemedi.',fFailSg:'Şifre sıfırlama API’sine istek gönderilemedi. Biraz sonra tekrar dene.',show:'göster',hide:'gizle',
kLbl:'ÜYE KARTI',kHolder:'KART SAHİBİ',kR1:'yetki',kV1:'terminal · tam erişim',kR2:'oturum',kR3:'giriş',kStamp:'GİRİŞ BAŞARILI',kHand:'hoş geldin, {u} — terminal seni bekliyor',t2:'kimlik doğrulandı · oturum açıldı',t3:'terminale bağlanıyor',skip:'geçmek için bir tuşa bas'},
en:{invalid:'Username or password is wrong.',invalidSg:'Forgot your password?',invalidLnk:'reset it →',rate:'The post office is a bit busy.',rateSg:'Too many attempts, try again in {n}s.',net:'The letter never reached the post office.',netSg:'Check your connection and try again.',needEmail:'You need a Bilkent e-mail.',needEmailSg:'An address ending in @bilkent.edu.tr or @ug.bilkent.edu.tr.',mismatch:'Passwords do not match.',mismatchSg:'Check both once more.',empty:'Something is left blank.',emptySg:'Fill every line, then send.',user:'Username is 3–24 letters and digits.',userSg:'No spaces or special characters.',weak:'Password is not strong enough yet.',weakSg:'At least 3 of the 4 checks above.',regFail:'Your application never arrived.',regFailSg:'The sign-up API request could not be sent — the server is not responding. Try again later.',str:['password strength','weak','fair','good','strong'],fTitle:'Write a short note',fBody:'Enter your Bilkent address; we will mail you a new password link.',fSend:'SEND',fFail:'The note could not be sent.',fFailSg:'The password reset API request could not be sent. Try again later.',show:'show',hide:'hide',
kLbl:'MEMBER CARD',kHolder:'CARD HOLDER',kR1:'access',kV1:'terminal · full',kR2:'session',kR3:'signed in',kStamp:'ACCESS GRANTED',kHand:'welcome, {u} — your terminal is waiting',t2:'identity verified · session opened',t3:'connecting to terminal',skip:'press any key to skip'}};
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

fLogin.addEventListener('submit',async ev=>{ev.preventDefault();clearNotes(fLogin);clearInterval(cdTimer);const user=$('#loginUser').value.trim(),pass=$('#loginPass').value,send=$('#sendLogin');if(!user||!pass){shake(letter);note($('#nLoginForm'),'red',t('empty'),t('emptySg'));return;}busy(send,true);const [r]=await Promise.all([login(user,pass),wait(650)]);busy(send,false);
if(r.ok){await sendLetter(letter,env,{wax:true});gecis(r.kullanici||user);return;}
shake(letter);$('#loginPass').select();
if(r.code==='INVALID_CREDENTIALS')note($('#nLoginPass'),'red',t('invalid'),t('invalidSg'),t('invalidLnk'),openForgot);
else if(r.code==='RATE_LIMIT_EXCEEDED')rateNote($('#nLoginForm'),r.retryAfter||60);
else note($('#nLoginForm'),'red',t('net'),t('netSg'));
});

/* ===== GİRİŞ BAŞARILI: üye kartı → terminal ===== */
async function gecis(user){
const gate=$('#gate'),kart=$('#kart'),tty=$('#tty'),out=$('#ttyOut');
const name=user.charAt(0).toLocaleUpperCase('tr')+user.slice(1);
let gone=false;const enter=()=>{if(gone)return;gone=true;location.replace('/');};
['kLbl','kHolder','kR1','kV1','kR2','kR3','kStamp','skip'].forEach(k=>{const el=$('#'+k);if(el)el.textContent=t(k)});
$('#kName').textContent=name;$('#kHand').textContent=t('kHand',{u:user.toLocaleLowerCase('tr')});
$('#kNo').textContent=String(new Date().getFullYear()%100).padStart(2,'0')+'-'+String(Math.floor(Math.random()*9000)+1000);
$('#kWhen').textContent=`${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} · ${new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`;
gate.hidden=false;void gate.offsetWidth;gate.classList.add('on');
setTimeout(()=>{addEventListener('keydown',enter);gate.addEventListener('click',enter);},RM?0:900);
await wait(1500);gate.classList.add('slam');
await wait(170);kart.classList.add('thud');
await wait(330);gate.classList.add('greet');
await wait(380);gate.classList.add('tty-on');
const prompt=`<span class="u">${escH(user)}@bilkenters</span>:<span class="d">~</span>$ `,cmd='tmux attach -t main';
for(let i=0;i<=cmd.length;i++){if(gone)return;out.innerHTML=prompt+escH(cmd.slice(0,i))+'<span class="cur"></span>';await wait(i?26+Math.random()*30:260);}
await wait(160);out.innerHTML=prompt+cmd+`\n<span class="ok">✓</span> ${t('t2')}`;
await wait(300);out.innerHTML+=`\n<span class="m">→</span> ${t('t3')}<span class="cur"></span>`;
await wait(560);if(gone)return;
/* şerit olduğu yerden ekranı kaplayacak şekilde büyür */
const r=tty.getBoundingClientRect();Object.assign(tty.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px'});tty.classList.add('full');gate.classList.add('leave');void tty.offsetWidth;
tty.classList.add('grow');Object.assign(tty.style,{top:'0px',left:'0px',width:'100vw',height:'100vh'});
await wait(620);enter();}
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
