(()=>{
const P=window.KUTUPHANE_POSTS,CATS=window.KUTUPHANE_CATS,LOCKED=window.KUTUPHANE_LOCKED;
const $=s=>document.querySelector(s),el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e};
const LS='bk-kutuphane';let store={};try{store=JSON.parse(localStorage.getItem(LS)||'{}')}catch(e){}
const save=()=>localStorage.setItem(LS,JSON.stringify(store));
store.read=store.read||{};store.marks=store.marks||{};
let cat='all',q='',view=store.view||'shelf';
/* nav */
const nav=$('#nav');addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>24),{passive:true});
const dd=$('#dd'),ddBtn=$('#ddBtn'),ddNote=$('#ddNote');
const closeDD=()=>{dd.classList.remove('open');ddNote.hidden=true;ddBtn.setAttribute('aria-expanded','false')};
ddBtn.onclick=e=>{e.stopPropagation();const o=ddNote.hidden;if(o){dd.classList.add('open');ddNote.hidden=false;ddBtn.setAttribute('aria-expanded','true')}else closeDD()};
document.addEventListener('click',e=>{if(!dd.contains(e.target))closeDD()});
const mm=$('#mmenu');$('#hb').onclick=()=>mm.hidden=false;$('#mx').onclick=$('#mscrim').onclick=()=>mm.hidden=true;
/* footer soul stamp */
$('#soul').onclick=function(){const w=this.parentNode;w.querySelectorAll('.pn,.mh').forEach(n=>n.remove());const again=w.dataset.hit==='1';w.dataset.hit='1';const n=el('span','pn','ekibimize katılmak ister misin?');w.appendChild(n);setTimeout(()=>n.remove(),2700);if(again)[[-22,-14],[-6,10],[10,-8],[24,12]].forEach(([x,r],k)=>{const m=el('span','mh','♥');m.style.setProperty('--x',x+'px');m.style.setProperty('--r',r+'deg');m.style.animationDelay=(k*70)+'ms';w.appendChild(m);setTimeout(()=>m.remove(),1700)})};
/* filters */
const tabs=$('#tabs');
function renderTabs(){tabs.innerHTML='';Object.entries(CATS).forEach(([k,v])=>{const n=k==='all'?P.length:P.filter(p=>p.cat===k).length;const b=el('button','tab'+(k===cat?' on':''),v+'<small>'+n+'</small>');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',k===cat);b.onclick=()=>{cat=k;renderTabs();renderList()};tabs.appendChild(b)})}
const norm=s=>s.toLowerCase().replace(/ı/g,'i').replace(/İ/g,'i');
const bodyText=p=>p.body.map(b=>Array.isArray(b.x)?b.x.flat().join(' '):b.x).join(' ').replace(/<[^>]+>/g,'');
function filtered(){const nq=norm(q.trim());return P.filter(p=>(cat==='all'||p.cat===cat)&&(!nq||norm(p.title+' '+p.sub+' '+p.no+' '+bodyText(p)).includes(nq)))}
$('#q').oninput=e=>{q=e.target.value;renderList()};
addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus()}if(e.key==='Escape'){closeDD();mm.hidden=true;if(!$('#vRead').hidden)go('')}});
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{view=b.dataset.view;store.view=view;save();document.querySelectorAll('.seg button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',on)});renderList()});
/* shelf */
function book(p,i){const b=el('button','book '+p.paper+(p.cat==='zabbix'?' z':'')+(store.read[p.slug]?' read':''));b.type='button';b.style.setProperty('--h',p.h+'px');b.style.setProperty('--i',i);
b.innerHTML='<span class="band"></span><span class="sp">'+p.title+'</span><span class="no">'+p.no.split(' ')[0]+'<b>'+p.no.split(' ')[1]+'</b></span><span class="peek"><b>'+p.title+'</b>'+p.sub+'<i>'+p.min+' dk · '+p.dateTr+'</i></span>';
b.setAttribute('aria-label',p.title);b.onclick=()=>go(p.slug);return b}
function renderShelf(list){const s1=$('#shelf1'),s2=$('#shelf2');s1.querySelectorAll('.book,.bookend,.gap,.empty,.lean').forEach(n=>n.remove());s2.querySelectorAll('.book,.locknote,.gap').forEach(n=>n.remove());
const plank1=s1.querySelector('.plank');
if(!list.length){const e=el('div','empty','Bu rafta öyle bir şey yok.<span class="hand">başka bir kelime dene ya da “Tümü”ye dön</span>');s1.insertBefore(e,plank1)}
list.forEach((p,i)=>{const b=book(p,i);if(i===list.length-1&&list.length>2)b.classList.add('lean');s1.insertBefore(b,plank1)});
if(list.length){s1.insertBefore(el('span','bookend'),plank1);s1.insertBefore(el('span','gap'),plank1)}
const plank2=s2.querySelector('.plank');
LOCKED.forEach((l,i)=>{const b=el('div','book locked '+l.paper);b.style.setProperty('--h',l.h+'px');b.innerHTML='<span class="sp">'+l.title+'</span><span class="no">'+l.no.split(' ')[0]+'<b>'+l.no.split(' ')[1]+'</b></span>';s2.insertBefore(b,plank2)});
const n=el('aside','paper locknote','<span class="tape top"></span><p class="eb">ÜYELERE</p><h3>Daha fazla yazı için giriş yap</h3><p>Bu raftaki '+LOCKED.length+' yazı ve yeni eklenenler üyelere açık. Bilkent mailin yeter.</p><a class="btn" href="/giris">Giriş Yap</a><span class="hand">hesabın yoksa 1 dakikada açılır</span>');
s2.insertBefore(n,plank2)}
/* catalog */
function renderCatalog(list){const c=$('#catRows');c.innerHTML='';if(!list.length){c.appendChild(el('p','hand','öyle bir kart yok — başka bir kelime dene'))}
list.forEach(p=>{const r=el('button','row','<span class="rno">'+p.no+'</span><span class="rt">'+p.title+'<small>'+p.sub+'</small></span><span class="ld"></span><span class="rm">'+p.dateTr+' · '+p.min+' dk'+(store.read[p.slug]?' · <span style="color:var(--bk-stamp-green)">✓</span>':'')+'</span><span class="arr">→</span>');r.type='button';r.onclick=()=>go(p.slug);c.appendChild(r)});
LOCKED.forEach(l=>c.appendChild(el('div','row locked','<span class="rno">'+l.no+'</span><span class="rt">'+l.title+'<small>üyelere açık</small></span><span class="ld"></span><span class="rm"><a href="/giris" style="color:var(--bk-blue-ink);border:0">giriş yap →</a></span>')))}
function renderList(){const list=filtered();$('#cnt').textContent=P.length;$('#lockcnt').textContent=LOCKED.length;const sh=view==='shelf';$('#shelfView').hidden=!sh;$('#catalogView').hidden=sh;sh?renderShelf(list):renderCatalog(list)}
/* reader */
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
function hi(code){return esc(code).split('\n').map(l=>{const m=l.match(/^([^#]*?)(\s*#.*)?$/);let a=m[1],c=m[2]||'';a=a.replace(/^(\s*)(sudo|apt|systemctl|journalctl|ssh|ssh-keygen|ssh-copy-id|scp|cd|ls|pwd|find|grep|chmod|chown|du|wget|curl|echo|cat|zcat|tail|nano|dpkg|zabbix_get)(?=\s|$)/,'$1<span class="k">$2</span>');return a+(c?'<span class="c">'+c+'</span>':'')}).join('\n')}
let cur=-1,slugs=[];
function renderBody(p){const b=$('#aBody');b.innerHTML='';const toc=$('#toc');toc.innerHTML='';let hi_=0;
p.body.forEach(k=>{if(k.t==='p')b.appendChild(el('p',null,k.x));
else if(k.t==='h'){const id='h'+(++hi_);const h=el('h3',null,k.x);h.id=id;b.appendChild(h);const a=el('a',null,k.x.replace(/^\d+ · /,''));a.href='#'+id;a.onclick=e=>{e.preventDefault();const y=h.getBoundingClientRect().top+scrollY-84;scrollTo({top:y,behavior:'smooth'})};toc.appendChild(a)}
else if(k.t==='code'){const w=el('div','cb','<div class="ch"><span class="lang">'+k.lang+'</span><button class="copy" type="button">kopyala →</button></div><pre></pre>');w.querySelector('pre').innerHTML=hi(k.x);const cb=w.querySelector('.copy');cb.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(k.x);cb.textContent='kopyalandı ✓';cb.classList.add('ok');setTimeout(()=>{cb.textContent='kopyala →';cb.classList.remove('ok')},1800)};b.appendChild(w)}
else if(k.t==='note')b.appendChild(el('p','hn',k.x));
else if(k.t==='ul'||k.t==='ol')b.appendChild(el(k.t,null,k.x.map(x=>'<li>'+x+'</li>').join('')));
else if(k.t==='dl')b.appendChild(el('dl',null,k.x.map(([a,c])=>'<div><dt>'+a+'</dt><dd>'+c+'</dd></div>').join('')))});
if(!hi_)toc.appendChild(el('p','hand','tek nefeste okunur, başlık yok'))}
const NAMES=['ayse.k','mert.d','selin.y','kaan.o','deniz.t'];
function renderCheckout(p){const c=$('#chk');const seed=p.no.charCodeAt(4)+p.min;const rows=[];for(let i=0;i<3;i++){const d=new Date(p.date);d.setDate(d.getDate()+1+((seed*(i+3))%9));rows.push('<div class="ln"><span>'+NAMES[(seed+i)%NAMES.length]+'</span><span>'+d.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})+'</span></div>')}
rows.push('<div class="ln you"><span>sen</span><span>'+new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'short'})+'</span></div>');rows.push('<div class="ln rest"></div><div class="ln rest"></div>');c.innerHTML=rows.join('');
const m=$('#mark'),on=!!store.marks[p.slug];m.textContent=on?'işaretli ★':'işaretle →';m.classList.toggle('on',on);m.onclick=()=>{store.marks[p.slug]=!store.marks[p.slug];save();renderCheckout(p)};
const st=$('#chkStamp');st.textContent=store.read[p.slug]?'OKUNDU':'ÖDÜNÇTE';st.className='stamp sm '+(store.read[p.slug]?'green':'blue')}
function openPost(slug){const i=P.findIndex(p=>p.slug===slug);if(i<0)return false;cur=i;const p=P[i];
$('#vList').hidden=true;$('#vRead').hidden=false;
$('#crumbCat').textContent=CATS[p.cat];$('#crumbNo').textContent=p.no;$('#aCat').textContent=CATS[p.cat].toUpperCase();$('#aCat').className='sticker '+({linux:'amber',ubuntu:'green',zabbix:'teal',ag:'blue'}[p.cat]||'');
$('#aDate').textContent=p.dateTr;$('#aMin').textContent=p.min+' dk okuma';$('#aAuthor').textContent=p.author;$('#aTitle').textContent=p.title;$('#aSub').textContent=p.sub;$('#tocTitle').textContent=p.no;
renderBody(p);renderCheckout(p);
const pr=$('#prev'),nx=$('#next');pr.disabled=i===0;nx.disabled=i===P.length-1;pr.querySelector('b').textContent=i>0?P[i-1].title:'raf başı';nx.querySelector('b').textContent=i<P.length-1?P[i+1].title:'raf sonu';pr.onclick=()=>go(P[i-1].slug);nx.onclick=()=>go(P[i+1].slug);
$('#done').classList.toggle('in',!!store.read[p.slug]);const a=$('#article');a.style.animation='none';a.offsetHeight;a.style.animation='';$('#ribbon').style.height='0px';
document.title=p.title+' — Kütüphane — bilkenters';scrollTo({top:0});return true}
function go(slug){location.hash=slug?'#/yazi/'+slug:'#'}
function route(){const m=location.hash.match(/^#\/yazi\/([\w-]+)/);if(m&&openPost(m[1]))return;$('#vRead').hidden=true;$('#vList').hidden=false;cur=-1;document.title='Kütüphane — bilkenters';renderList()}
addEventListener('hashchange',route);$('#back').onclick=()=>go('');
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>go(b.dataset.open));
/* progress ribbon + read stamp + toc highlight */
addEventListener('scroll',()=>{if(cur<0)return;const a=$('#article'),r=a.getBoundingClientRect();const total=r.height-innerHeight*.6;const pct=Math.max(0,Math.min(1,(-r.top+innerHeight*.35)/Math.max(total,1)));$('#ribbon').style.height=Math.round(pct*(r.height-40))+'px';
if(pct>=.98&&!store.read[P[cur].slug]){store.read[P[cur].slug]=1;save();$('#done').classList.add('in');const st=$('#chkStamp');st.textContent='OKUNDU';st.className='stamp sm green'}
const hs=[...a.querySelectorAll('h3')];let on=null;hs.forEach(h=>{if(h.getBoundingClientRect().top<140)on=h.id});$('#toc').querySelectorAll('a').forEach(x=>x.classList.toggle('on',x.getAttribute('href')==='#'+on))},{passive:true});
renderTabs();route();
})();
