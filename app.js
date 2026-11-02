const $ = id => document.getElementById(id);
const state = { games: [], items: [], steamId: "" };
const money = value => value == null ? null : new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN"}).format(value);
function status(message, error=false){ $("status").textContent=message; $("status").className="status"+(error?" error":""); }
async function api(url){const r=await fetch(url);const d=await r.json();if(!r.ok)throw new Error(d.error||"Wystąpił błąd.");return d;}
async function loadPrice(appid,name){try{const d=await api(`/api/price?appid=${appid}&name=${encodeURIComponent(name)}`);if(!d.price)return null;const n=Number(d.price.replace(/[^\d,.-]/g,"").replace(/\s/g,"").replace(",", "."));return Number.isFinite(n)?n:null;}catch{return null;}}
async function mapLimit(items,limit,fn){let i=0;const workers=Array.from({length:limit},async()=>{while(i<items.length){const current=i++;await fn(items[current],current);}});await Promise.all(workers);}
async function loadInventory(steamId,games){
  state.items=[]; $("items").innerHTML=""; $("gameCount").textContent=games.length;
  const filter=$("gameFilter");filter.innerHTML='<option value="all">Wszystkie gry</option>'+games.map(g=>`<option value="${g.appid}">${escapeHtml(g.name||`Gra ${g.appid}`)}</option>`).join("");
  let completed=0;
  // Wczytujemy po kolei, aby nie przeciążać Steam Community.
  for(const game of games){
    $("gameProgress").textContent=`Pobieranie: ${game.name} (${++completed}/${games.length})…`;
    try{
      const inv=await api(`/api/inventory/${steamId}/${game.appid}`);
      const enriched=inv.items.map(item=>({...item,appid:game.appid,game:game.name||`App ${game.appid}`,price:null}));
      state.items.push(...enriched); render();
      const marketable=enriched.filter(x=>x.marketable&&x.market_hash_name);
      await mapLimit(marketable,3,async item=>{item.price=await loadPrice(item.appid,item.market_hash_name);renderStats();});
      render();
    }catch(e){console.warn(`Pominięto ${game.name}:`,e.message);}
  }
  $("gameProgress").textContent=`Gotowe. Pobrano ${state.items.length} przedmiotów z dostępnych ekwipunków.`;
  render();
}
$("profileForm").addEventListener("submit",async e=>{
  e.preventDefault();const id=$("steamId").value.trim();if(!/^\d{17}$/.test(id)){status("SteamID64 musi zawierać dokładnie 17 cyfr.",true);return;}
  $("loadBtn").disabled=true;$("dashboard").classList.add("hidden");status("Pobieranie listy gier…");
  try{const result=await api(`/api/games/${id}`);if(!result.games.length)throw new Error("Nie znaleziono gier. Sprawdź SteamID64, widoczność profilu i klucz API.");
    state.steamId=id;state.games=result.games;$("dashboard").classList.remove("hidden");status(`Znaleziono ${result.games.length} gier. Rozpoczynam pobieranie dostępnych ekwipunków…`);await loadInventory(id,result.games);status("Synchronizacja zakończona.");}
  catch(err){status(err.message,true);}finally{$("loadBtn").disabled=false;}
});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderStats(){const priced=state.items.filter(x=>x.price!=null);const total=priced.reduce((s,x)=>s+x.price*x.amount,0);$("totalValue").textContent=money(total)||"—";$("itemCount").textContent=state.items.reduce((s,x)=>s+x.amount,0).toLocaleString("pl-PL");}
function render(){
  renderStats();const q=$("search").value.toLowerCase();const game=$("gameFilter").value;const sort=$("sort").value;
  let list=state.items.filter(x=>(game==="all"||String(x.appid)===game)&&x.name.toLowerCase().includes(q));
  list.sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="value-asc"?(a.price??Infinity)-(b.price??Infinity):(b.price??-1)-(a.price??-1));
  $("items").innerHTML=list.map(x=>`<article class="item"><div class="item-art">${x.icon?`<img loading="lazy" src="${x.icon}" alt="">`:"<span>◆</span>"}</div><div class="item-info"><div class="item-game">${escapeHtml(x.game)}</div><div class="item-name">${escapeHtml(x.name)}</div><div class="item-meta"><span>${x.marketable?"RYNKOWY":"NIERYNKOWY"}</span><span>${x.amount>1?`Ilość: ${x.amount}`:""}</span></div><div class="item-price">${x.price!=null?money(x.price*x.amount):'<span class="no-price">Brak ceny rynkowej</span>'}</div></div></article>`).join("");
  $("empty").classList.toggle("hidden",list.length>0);
}
["search","sort","gameFilter"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
