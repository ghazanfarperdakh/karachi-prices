/* Camera identify API (Vercel serverless function).
   The citizen's phone sends a small JPEG (~50KB); we ask Google Gemini which
   catalog group it shows and return {group, confidence, second}.
   The API key lives ONLY in Vercel -> Settings -> Environment Variables
   (GEMINI_API_KEY) — never in this public repo.
   GEMINI_MODEL env var can override the model (default gemini-2.5-flash-lite). */

const GROUPS = {
  aloo: "Potato / آلو", pyaz: "Onion / پیاز", tamatar: "Tomato / ٹماٹر",
  bandgobhi: "Cabbage / بند گوبھی", phoolgobhi: "Cauliflower / پھول گوبھی",
  loki: "Bottle Gourd (lauki) / لوکی", tori: "Ridge Gourd (turai) / توری",
  baingan: "Eggplant / بینگن", bhindi: "Okra (lady finger) / بھنڈی",
  karela: "Bitter Gourd / کریلا", kheera: "Cucumber / کھیرا",
  tinda: "Tinda (apple gourd) / ٹنڈا", gajar: "Carrot / گاجر",
  lehsan: "Garlic / لہسن", adrak: "Ginger / ادرک",
  shimla: "Capsicum (bell pepper) / شملہ مرچ", mirch: "Green Chilli / مرچ",
  limu: "Lemon-Lime / لیموں", shalgham: "Turnip / شلغم",
  chukandar: "Beetroot / چقندر", haripyaz: "Spring Onion / ہری پیاز",
  palak: "Spinach / پالک", dhania: "Fresh Coriander bundle / دھنیا",
  podina: "Mint bundle / پودینہ", matar: "Green Peas / مٹر", mooli: "Radish (daikon) / مولی",
  kela: "Banana / کیلا", papita: "Papaya / پپیتہ", saib: "Apple / سیب",
  grapefruit: "Grapefruit / گریپ فروٹ", kharbooza: "Muskmelon or Garma melon / خربوزہ گرما",
  tarbooz: "Watermelon / تربوز", aloobukhara: "Plum (aloo bukhara) / آلو بخارہ",
  mosambi: "Mosambi (sweet lime) / موسمی", chikoo: "Chikoo (sapodilla) / چیکو",
  khajoor: "Dates / کھجور", khubani: "Apricot / خوبانی", aaroo: "Peach / آڑو",
  aam: "Mango (any variety) / آم", falsa: "Falsa berry / فالسہ",
  jamun: "Jamun (black plum) / جامن", amrood: "Guava / امرود",
  anar: "Pomegranate / انار", angoor: "Grapes / انگور",
  other_fruit: "Golarchi (small local melon) / گولارچی"
};
const CATALOG = Object.entries(GROUPS).map(([k, v]) => `${k}: ${v}`).join("\n");
const ENUM = Object.keys(GROUPS).concat(["none"]);

const PROMPT =
  "You identify produce for Karachi's official fruit & vegetable price-list app. " +
  "Look at the photo and decide which ONE catalog item is the main subject.\n" +
  "Catalog (id: name):\n" + CATALOG + "\n" +
  "Rules: if no fruit/vegetable is clearly visible, or it is not in the catalog, " +
  'use group="none". confidence: high = certain; medium = likely but "second" is ' +
  'plausible; low = unsure between options. "second" = next most plausible catalog id, else null.';

/* Best-effort abuse brake. In-memory, so it resets when Vercel recycles the
   instance — the real spending cap is the prepaid credit in Google AI Studio. */
const PER_IP_DAY = 40;
const PER_INSTANCE_DAY = 4000;
let day = "", perIp = new Map(), instanceCount = 0;
function allow(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; perIp = new Map(); instanceCount = 0; }
  if (instanceCount >= PER_INSTANCE_DAY) return false;
  const n = (perIp.get(ip) || 0) + 1;
  if (n > PER_IP_DAY) return false;
  if (perIp.size > 20000) perIp.clear();
  perIp.set(ip, n); instanceCount++;
  return true;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "no_key" });

  let img = (req.body && req.body.image) || "";
  const m = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/.exec(img);
  if (m) img = m[1];
  // ~50-300KB base64 expected from the app; hard-reject anything huge
  if (typeof img !== "string" || img.length < 1000 || img.length > 1500000)
    return res.status(400).json({ error: "image" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (!allow(ip)) return res.status(429).json({ error: "quota" });

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: "image/jpeg", data: img } },
      { text: PROMPT }
    ]}],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 100,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          group: { type: "STRING", enum: ENUM },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
          second: { type: "STRING", enum: ENUM, nullable: true }
        },
        required: ["group", "confidence"]
      }
    }
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let g;
  try {
    g = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body) });
  } catch (e) {
    clearTimeout(timer);
    return res.status(504).json({ error: "timeout" });
  }
  clearTimeout(timer);

  if (g.status === 429) return res.status(503).json({ error: "upstream_quota" });
  if (!g.ok) return res.status(502).json({ error: "upstream", status: g.status });

  let out;
  try {
    const j = await g.json();
    out = JSON.parse(j.candidates[0].content.parts[0].text);
  } catch (e) {
    return res.status(502).json({ error: "parse" });
  }

  const group = GROUPS[out.group] ? out.group : "none";
  const second = out.second && GROUPS[out.second] && out.second !== group ? out.second : null;
  const confidence = ["high", "medium", "low"].includes(out.confidence) ? out.confidence : "low";
  return res.status(200).json({ group, confidence, second });
};
