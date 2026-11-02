import express from "express";
const app = express();
const API_KEY = process.env.STEAM_API_KEY;

function validSteamId(value) { return /^\d{17}$/.test(String(value || "")); }
async function steamJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "SteamInventoryTracker/1.0" } });
  if (!response.ok) throw new Error(`Steam zwrócił HTTP ${response.status}`);
  return response.json();
}
app.get("/api/games/:steamId", async (req, res) => {
  try {
    if (!validSteamId(req.params.steamId)) return res.status(400).json({ error: "Podaj 17-cyfrowy SteamID64." });
    if (!API_KEY) return res.status(503).json({ error: "Brak STEAM_API_KEY. Dodaj ją w ustawieniach projektu Vercel." });
    const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
    url.search = new URLSearchParams({ key: API_KEY, steamid: req.params.steamId, include_appinfo: "1", include_played_free_games: "1", format: "json" });
    const data = await steamJson(url);
    const games = data.response?.games || [];
    res.json({ games: games.sort((a,b) => (a.name || "").localeCompare(b.name || "")), total: games.length });
  } catch (error) { res.status(502).json({ error: error.message || "Nie udało się pobrać listy gier." }); }
});
app.get("/api/inventory/:steamId/:appId", async (req, res) => {
  try {
    if (!validSteamId(req.params.steamId)) return res.status(400).json({ error: "Nieprawidłowy SteamID64." });
    const appId = Number(req.params.appId);
    if (!Number.isSafeInteger(appId) || appId <= 0) return res.status(400).json({ error: "Nieprawidłowy AppID." });
    const allAssets = [], descriptions = new Map();
    let start = 0, pages = 0, more = true;
    while (more && pages < 20) {
      const url = `https://steamcommunity.com/inventory/${req.params.steamId}/${appId}/2?l=english&count=5000${start ? `&start_assetid=${start}` : ""}`;
      const data = await steamJson(url);
      if (data.success !== 1) throw new Error("Ekwipunek jest prywatny, niedostępny lub gra nie udostępnia kontekstu 2.");
      allAssets.push(...(data.assets || []));
      for (const d of data.descriptions || []) descriptions.set(`${d.classid}_${d.instanceid}`, d);
      more = Boolean(data.more_items); start = data.last_assetid || 0; pages++;
    }
    const items = allAssets.map(asset => {
      const d = descriptions.get(`${asset.classid}_${asset.instanceid}`) || {};
      return { assetid: asset.assetid, amount: Number(asset.amount || 1), name: d.market_hash_name || d.name || "Nieznany przedmiot",
        type: d.type || "", icon: d.icon_url ? `https://steamcommunity-a.akamaihd.net/economy/image/${d.icon_url}/160fx160f` : "",
        marketable: Boolean(d.marketable), tradable: Boolean(d.tradable), market_hash_name: d.market_hash_name || "" };
    });
    res.json({ items, total: items.length, truncated: more });
  } catch (error) { res.status(502).json({ error: error.message || "Nie udało się pobrać ekwipunku." }); }
});
app.get("/api/price", async (req, res) => {
  try {
    const appId = Number(req.query.appid), name = String(req.query.name || "");
    if (!Number.isSafeInteger(appId) || appId <= 0 || !name || name.length > 200) return res.status(400).json({ error: "Brak poprawnych parametrów ceny." });
    const url = new URL("https://steamcommunity.com/market/priceoverview/");
    url.search = new URLSearchParams({ appid: String(appId), currency: "6", market_hash_name: name });
    const data = await steamJson(url);
    res.json({ success: Boolean(data.success), price: data.lowest_price || data.median_price || null, volume: data.volume || null });
  } catch { res.json({ success: false, price: null }); }
});
export default app;
