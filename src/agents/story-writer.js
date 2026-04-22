const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

const SCENE_COUNTS = { "0-3": 10, "3-6": 14, "6-9": 14 };

// 3-6 ve 6-9 aynı "gelişmiş" kuralları paylaşır (kullanıcı kararı 2026-04-13).
// Sadece 0-3 farklı (ritmik, duyusal, bebek tonu).
const ADVANCED_RULES = {
  maxWordsPerScene: null,      // kelime limiti YOK — metin doğal olsun, ne kadar gerekiyorsa
  style: "Dünya klasiği Türk çocuk edebiyatı tonunda, 3-9 yaş arası için. Anne babanın zevk alarak sesli okuyacağı, çocuğun hayalinde yaşayacağı zengin metin. İç çatışma, karakter gelişimi, gerçek dramatic arc. Diyalog + iç monolog + duyusal betimleme dengeli. Edebi ifadeler, benzetmeler, duygusal derinlik. Kazanım plot çözümünde organik olarak açığa çıkmalı. Her sahne bir küçük hikaye — öz-yeter, eksik hissettirmez.",
  vocabularyNote: "Zengin Türkçe. Metafor, benzetme, deyim, doğa betimlemesi serbest. Çocuk edebiyatı klasikleri seviyesi — Behiç Ak, Sara Şahinkanat, Feridun Oral dokusu. Çocuğa biraz yukarı çeken sözcükler OK (bağlamdan anlaşılır).",
  acts: "Tam 3-act (14 sahne): (1) setup + karakterin iç dünyası + istek, (2) engeller + denemeler + iç çatışma + yan karakter/yardımcı + hata, (3) gerçek engel + karakter dönüşümü + climax + sıcak resolution. Alt-plot, küçük karakter ilişkileri zenginleştirir.",
};

const AGE_RULES = {
  "0-3": {
    maxWordsPerScene: 45,
    style: "Bebek/yürümeye başlayan çocuk için — AMA kaliteli çocuk edebiyatı. Ritmik tekrar, duyusal dil (yumuşacık, sıcacık, mis gibi), ses kelimeleri (cıvıl cıvıl, şırıl şırıl, hop). Her sahne MIN 4 cümle, zengin duyusal atmosfer. Anne/babanın zevk alarak okuyacağı, çocuğun sesten ve ritimden keyif alacağı metin. Kısa ve kuru YASAK — sıcak ve dolu olsun.",
    vocabularyNote: "Günlük yaşamda sık geçen 500-800 kelime. Soyut kavram yok. Karmaşık fiil çekimi yok. Ama betim+ritim+ses zengin — Sara Şahinkanat bebek kitapları dokusu.",
    acts: "Basit 3-adım: başlangıç (merak+duyusal detay) → karşılaşma (keşif+duygu) → sıcak son (sevgi+huzur).",
  },
  "3-6": ADVANCED_RULES,
  "6-9": ADVANCED_RULES,
};

const OUTFIT_PLANS = {
  "0-3": ["pajamas"],
  "3-6": ["casual", "hoodie", "party"],
  "6-9": ["pajamas", "casual", "training", "pro-uniform"],
};

function makeClient() {
  const key = config.google.apiKey;
  if (!key) throw new Error("GOOGLE_API_KEY yok — .env dosyasini kontrol edin");
  return new GoogleGenAI({ apiKey: key });
}

async function generateText(ai, prompt, opts = {}) {
  // UPGRADE 2026-04-20: Pro + thinking. Cagrilari eski opts.maxTokens dusuk degerler iletiyor
  // (örn. 2048 brainstorm icin). Thinking 4000 token yiyince cikti icin yer kalmiyordu.
  // Cozum: effective = opts.maxTokens + thinkingBudget + safety_margin.
  const model = opts.model || "gemini-2.5-pro";
  const thinkingBudget = opts.thinkingBudget ?? 4000;
  const desiredOutput = opts.maxTokens || 4096;
  const maxOutputTokens = Math.max(desiredOutput + thinkingBudget + 2000, 8192);
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: opts.temperature ?? 0.85,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget },
    },
  });
  return res.text || "";
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const first = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start = first < 0 ? firstArr : (firstArr < 0 ? first : Math.min(first, firstArr));
  if (start < 0) throw new Error("JSON bulunamadi: " + text.slice(0, 400));
  // Strings icinde kacan tirnaklari hesaba kat
  let depth = 0, end = -1, openChar = candidate[start], closeChar = openChar === "{" ? "}" : "]";
  let inStr = false, esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === "\"") { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) {
    try { require("fs").writeFileSync("/tmp/story-writer-last-bad.txt", text); } catch {}
    throw new Error("JSON kapanisi yok (len=" + text.length + ", start=" + start + "). Raw: /tmp/story-writer-last-bad.txt");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function brainstorm({ ai, ageGroup, theme, heroName, lessons }) {
  const rules = AGE_RULES[ageGroup];
  const prompt = `Sen dünya standartlarında bir Türk çocuk edebiyatı yazarısın — Behiç Ak, Sara Şahinkanat, Fatih Erdoğan seviyesinde.

Yaş grubu: ${ageGroup}
Tema isteği: ${theme || "serbest"}
Kahraman adı: ${heroName}
Hedef kazanımlar: ${(lessons || []).join(", ") || "çocuğun duygusal gelişimine katkı"}

Yaş bandı kuralları:
- ${rules.style}
- Sözdağarcığı: ${rules.vocabularyNote}
- Olay örgüsü: ${rules.acts}

MASALSENSIN MARKA SÖZLÜK KURALI (MUTLAK):
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK.
- Yerine: "ışık", "yıldız", "kıvılcım", "hayal", "kalp", "rüya", "fısıltı" gibi yere basan kelimeler kullan.

Beş farklı hikaye fikri üret. Her fikir için:
- baslik (Türkçe, 2-5 kelime, pazarlama hissi yok, çocuk edebiyatı klasiği tonu)
- ozet (3-4 cümle, ne olup bittiği)
- ton (warm / adventurous / heartwarming / funny / mysterious gibi — "magical" KULLANMA)
- benzersizlik (diğerlerinden ayıran özellik: mekan, karakter, olay, duygu)

JSON dizisi olarak ver, başka metin yazma:
[
  {"baslik":"...","ozet":"...","ton":"...","benzersizlik":"..."},
  ...
]`;
  const text = await generateText(ai, prompt, { temperature: 0.95, maxTokens: 2048 });
  const ideas = extractJson(text);
  if (!Array.isArray(ideas) || ideas.length < 3) throw new Error("Brainstorm 5 fikir uretmedi");
  return ideas;
}

async function selectBest({ ai, ideas, ageGroup, theme, heroName }) {
  const prompt = `Aşağıdaki 5 hikaye fikri arasından, ${ageGroup} yaş grubu ve "${theme || "serbest tema"}" için EN İYİSİNİ seç. Seçim kriteri:
- Yaş bandına uygunluk
- Orijinallik (jenerik değil)
- Kahraman ${heroName} için özelleşme potansiyeli
- Duygusal derinlik
- Türk çocuk edebiyatı klasiği tonu

Fikirler:
${JSON.stringify(ideas, null, 2)}

JSON cevap:
{"secilen_index": 0-4 arası sayı, "gerekce":"bir-iki cümle"}`;
  const text = await generateText(ai, prompt, { temperature: 0.3 });
  const result = extractJson(text);
  const idx = Math.max(0, Math.min(4, result.secilen_index ?? 0));
  return { selected: ideas[idx], reason: result.gerekce };
}

async function expand({ ai, idea, ageGroup, heroName, heroAge, heroGender, lessons, theme }) {
  const rules = AGE_RULES[ageGroup];
  const sceneCount = SCENE_COUNTS[ageGroup];
  const outfits = OUTFIT_PLANS[ageGroup];
  const genderTr = heroGender === "kiz" ? "kız" : "erkek";

  const prompt = `Sen dünya standartlarında bir Türk çocuk edebiyatı yazarısın — Behiç Ak, Sara Şahinkanat, Fatih Erdoğan, Feridun Oral, Gülten Dayıoğlu seviyesinde. Bu kitabı anneler, babalar, büyükanneler/dedeler çocuklarına sesli okuyacak. Metin hem çocuğun hayalinde yaşamalı hem yetişkinin dudağında güzel dursun.

TÜRKÇE YAZIM VE DİL KURALLARI (MUTLAK):
- Noktalama eksiksiz (virgül, nokta, soru, ünlem, üç nokta, tırnak). Diyaloglar tırnak içinde.
- Ünsüz yumuşaması, ünlü uyumu, ekler doğru (kitabın DEĞİL kitap'ın; evden DEĞİL evdan).
- **DEVRİK CÜMLE KESİN YASAK.** Türkçe cümle yapısı: ÖZNE önce + diğer ögeler + YÜKLEM sonda. YANLIŞ: "Deniz kenarında Toprak yürüyordu." DOĞRU: "Toprak, deniz kenarında yürüyordu." Her cümleyi özneyle başlat (veya özne belliyse düşür). Yer/zaman zarfları özneden sonra virgülle gelebilir. Yüklem en sonda kalsın. Yardımcı fiiller/eylemler yazım düzenine uygun.
- "de/da", "ki", "mi" eklerini ayrı/birleşik doğru yaz.
- Eş anlamlı kelime çeşitliliği; aynı fiili arka arkaya kullanma.
- Yabancı kelime ve eğreti çeviri dilinden kaçın ("bir şekilde", "tam olarak" gibi).
- Pazarlama/reklam dili YASAK. Didaktik/dogmatik nutuk YASAK.
- Ton akışı kitap boyunca tutarlı olmalı. Aniden "epik stadyum" gibi ton kayması yok.

DÜNYA KLASİĞİ ÇOCUK EDEBİYATI KALİTESİ (MUTLAK):
- **Show, don't tell.** "Üzüldü" YAZMA, "gözleri doldu, sessizce parmağıyla yaprağı çizdi" yaz. "Korktu" DEMEDEN "eli titredi, kulakları uğuldadı" göster.
- Her sahnede EN AZ BİR somut duyusal detay (ses, koku, dokunuş, renk tonu, ısı). "Güneş ılıktı" değil "güneş, ensesine küçük bir ellik sıcaklığı bıraktı".
- Her sahnede EN AZ BİR canlı replik — karakter konuşmalı, sadece anlatıcı değil.
- "harika", "mükemmel", "muhteşem", "çok güzel" gibi BOŞ sıfatlar YASAK. Duyguyu ayrıntıyla kur.
- "sihir", "sihirli", "büyü", "büyülü", "mucize", "tılsım" KELİMELERİ YASAK (MasalSensin marka kuralı). Yerine "ışık", "yıldız", "kıvılcım", "hayal", "kalp", "rüya" gibi yere basan kelimeler kullan.
- Klişe ifadelerden uzak dur: "bir anda", "aniden", "o sırada" başlangıç tekrarı yok.
- Sessizlik ve boşluk kullan — her boşluğu doldurma, çocuk hayal kursun.
- Metaforlar doğal olsun: "kalbinde sonsuz şarkı" gibi süslü değil, "kuşun sesi hâlâ kulağındaydı" gibi sessiz.
- Dil ritmi olsun: kısa-uzun cümleler dönüşümlü, sesli okuyunca akıcı.

FUN FACT (BİLİYOR MUYDUN?) GEREKSİNİMİ:
Her kitapta 2 "Biliyor muydun?" ara sayfası olmalı. Bu sayfalar çocuğa hikayenin temasıyla ilgili İLGİNÇ ve DOĞRU bilgiler verir. Her ara sayfada 3-4 kısa bilgi, her biri 1-2 cümle, çocukça meraklandıran dille. Konu kitabın temasıyla örtüşsün (orman teması → ağaçlar, hayvanlar; futbol → spor, beslenme; uzay → gezegenler).

Seçilen hikaye:
Başlık: ${idea.baslik}
Özet: ${idea.ozet}
Ton: ${idea.ton}

═══ KONSEPT ÖZETİNE SADAKAT (MUTLAK) ═══
Yukarıdaki ÖZET bir sözleşmedir. Hikayeyi 14 sahneye genişletirken:
- ÖZETTE geçen her MEKÂN (orman / bahçe / mağara / atölye / sınıf / mutfak / ev / park / uzay / havaalanı / stadyum / gemi / çiftlik / hastane...) AYNI KELIMELERLE sahnelere ANCHOR olarak yerleştir. Başka bir mekân sözcüğüne ÇEVİRME.
  Örnek: Özet "mantar ormanlarında" diyorsa, sahnelerde "bahçe" değil ORMAN kullan. Özet "muayenehanede" diyorsa sahnelerde "hastane" değil MUAYENEHANE.
- ÖZETTE geçen her ANAHTAR METAFOR/NESNE (yumak / balık / bulut / kelebek / anahtar / ayna / bilezik / diploma / lamba...) sahnelerde aynı isimle yer alsın. Sinonimle değiştirme.
- ÖZETTE geçen her KİLIT EYLEM (çözmek / örmek / uçmak / iyileştirmek / barıştırmak / oynamak...) sahnelerin büyük kısmında görünsün.
- Son sahne (Scene ${sceneCount}) özetin sonundaki DÖNÜŞÜM/BARIŞ duygusunu tamamlamalı; özetteki son cümleyle tutarlı olmalı.
Bu sadakat zorunlu — aksi halde okur "özette 'orman' vardı, sahnelerde hiç orman yok" diyerek boşluk hisseder.

Kahraman: ${heroName}, ${heroAge} yaşında Türk ${genderTr} çocuk.
Yaş grubu: ${ageGroup} (${rules.acts})
Sahne sayısı: ${sceneCount}
Sahne başına max kelime: ${rules.maxWordsPerScene}
Kazanımlar: ${(lessons || []).join(", ")}
Stil: ${rules.style}
Sözdağarcığı: ${rules.vocabularyNote}

═══ SAHNE AKIŞI KURALLARI (MUTLAK) ═══

1. SAHNE-ARASI SÜREKLİLİK — **NEDENLİ KÖPRÜ** (MUTLAK, world-class standart):
   Her sahne geçişi "ne oldu da oraya geçtik?" sorusunu CEVAPLAMALI. Sadece zaman zarfı ("ardından", "sonra", "en sonunda", "yolculukları sürdü") YETMEZ — bu ZAYIF köprüdür. Dünya standardındaki çocuk kitaplarında bir FİZİKSEL EYLEM / DUYUSAL TETİKLEYİCİ / KARAKTER SEÇİMİ geçişi mümkün kılar.

   Her Scene N+1'in ilk cümlesi, Scene N'in son eyleminin/duygusunun **doğrudan sonucu** olmalı. Eğer mekan değişiyorsa, değişim için somut bir köprü ("kurbağa suya atladı, parmakları suya değdi, balıklar arasında buluverdi kendini" gibi) yaz.

   ZAYIF BRIDGE (BUNLARI KULLANMA):
   ❌ "Ardından kendilerini sualtı dünyasında buldular." (ne oldu da?)
   ❌ "Yolculukları bulutlar üzerinde sürdü." (nasıl uçtular?)
   ❌ "En sonunda yıldızlara ulaştılar." (neyle, nasıl?)
   ❌ "O sırada farklı bir yerdeydi." (teleport, gerekçesiz)

   GÜÇLÜ BRIDGE (BÖYLE YAZ):
   ✅ "Kurbağa damlaya atladı — {name} onu yakalamak için parmaklarını suya değdirdi ve kendini rengârenk balıkların arasında buldu."
   ✅ "Bir rüzgar Yeşilgöz'ü savurdu; {name} onun peşinden havalanıverdi, ayaklarının altındaki bulutlar pamuk gibi yumuşaktı."
   ✅ "Kurbağanın fısıltısı o kadar küçüldü ki bir yıldızın sesine karıştı — ve {name} kendini yıldızların arasında usul usul süzülürken buldu."

   KURAL: Fantastik/rüya sekansında bile her geçişin bir **TEMAS NOKTASI** olmalı (dokunmak, atlamak, ses, nefes, elini uzatmak, gözlerini kapamak vs.). Olmayan sahneyi YENIDEN YAZ.

   KENDINE SOR (her sahneyi yazdıktan sonra): "Çocuk 'nasıl oldu da buraya geçti?' diye sorabilir mi?" Eğer CEVAP VEREMİYORSAN bridge zayıf demektir — güçlendir.

2. ANNE-BABA MİNİMUM KURALI: Anne/baba karakterleri ${sceneCount} sahnenin EN FAZLA %30'unda görünsün (${Math.floor(sceneCount * 0.3)} sahne max). Setup + climax resolution + bir teselli anı yeterli. Hikayenin çoğunluğunda kahraman tek başına veya YAN KARAKTER DOSTU (sidekick/arkadaş/hayvan dostu) ile olsun.

3. YAN KARAKTER (SIDEKICK) — KATEGORIYE ÖZGÜ, ZORUNLU DEĞİL:
   Sidekick'i zorla yerleştirme — kategori DOĞAL gerekçesi varsa kullan:
   - hayvan-dostum → evcil hayvan zaten kitabın merkezi (pet_name HER sahnede)
   - duygu-kontrolleri → duygu metaforu (bulut/kelebek/yağmur) her sahnede görsel sembol (karakter değil, METAFOR)
   - yeni-kardes-hikayeleri → kardeş eşlik eder (action sidekick değil, duygusal referans)
   - ilkokul-masallari → okul/park arkadaşı doğal olabilir (zorunlu değil)
   - okul-oncesi-masallari → oyuncak ya da hayal arkadaşı OPSIYONEL
   - meslek-hikayeleri → mentor/meslek büyüğü OPSIYONEL (bazı hikayeler "ilk gün yalnızlığı" teması)
   - gunluk-degerler-egitimi → kahraman kendi öğrenir IDEALI (ebeveyn minimum, arkadaş opsiyonel)
   - 23-nisan → sidekick UYGUN DEĞİL (hikaye bayrak + Atatürk + sınıf çerçevesi)
   - anneler-gunu / dogum-gunu → aile ağırlıklı, sidekick yok
   - bebek-masallari → soft toy/animal OPSIYONEL
   - boyama → guide karakter OPSIYONEL
   KURAL: Hikayenin doğal akışına GİRMİYORSA sidekick yerleştirme. Kahraman tek başına da hikaye taşıyabilir.

4. SAHNE = TEK SAHNE (CRITICAL): Her sahne TEK bir anı/olayı anlatır. 3 farklı küçük olay bir sahnede toplanmaz. NO PANELS, NO GRIDS. Sahneler görsel tarafta TEK COHESIVE full-bleed illustrasyon olarak üretilecek — metin de TEK bir ana momente odaklansın.

5. PANEL YASAK: Action alanı (scene.action) "x happens and then y happens and then z" şeklinde DEĞİL — tek ana moment "child discovering the puppy in a wicker basket" şeklinde. 3 ayrı eylem bir action'da yok.

${sceneCount} sahne yaz. Her sahne:
- title: 2-4 kelime, Türkçe
- text: ${rules.maxWordsPerScene ? "MIN 4 cümle, MAX " + rules.maxWordsPerScene + " kelime. Kısa cümleler olabilir ama SAYI en az 4, zengin duyusal detay + bir duygu betimi içersin." : "MIN 5 cümle, doğal uzunluk (4 cümleden az ise REDDET). Her sahnede: somut duyusal detay (ses/koku/ısı/dokunuş), bir duygu betimi (show-don't-tell), ve mümkünse 1 kısa diyalog"}, kahraman adı en fazla 2 kez, akıcı Türkçe (devrik cümle yok), ${heroName} eki olarak {CHILD_NAME} kullan (yaygın değişecek)
- mood: dreamy, nervous-excited, joyful, mysterious, magical, determined, reflective, triumphant, magical-epic, inspirational, intense, climactic, triumphant-emotional, warm, curious (sahneye uygun)
- setting: mekan ve zaman (Türkçe kısa tarif)
- outfitId: ${outfits.join(" | ")} (sahneye uygun; yaş bandına göre değişebilir)
- action: tek satır İngilizce, sahnenin görsel aksiyonu (AI image prompt için)
- pace: "slow" (içe dönük, derin) | "medium" (akış halinde) | "fast" (montaj/hızlı geçiş) — sahnenin dramatik temposu
- interior: "deep" (kahramanın iç düşünce/duygusu MUTLAKA yazılmış olmalı) | "light" (dış olay ağırlıklı, iç sadece imada) — sahnenin iç dünya derinliği

İÇ DÜNYA DAĞILIMI (önemli): Hikayenin yaklaşık YARISI "deep" olsun. Setup sahneleri (1-3), karşılaşma/karar anları, climax, ve resolution genelde "deep". Montaj veya geçiş sahneleri "light" olabilir. Mekanik tekrardan kaçın — her sahne aynı dozda iç düşünce taşımasın, dramatik öneme göre dengeli dağılım yap.

İÇ DÜNYA NEDİR (deep sahnelerde):
Kahramanın kafasında ne geçtiği, ne hissettiği, hangi tereddütle ne yaptığı. Sadece "ne yaptığı" değil — "neden, ne hissederek, hangi düşünceyle yaptığı". Örnek: "Melis ayakkabılarını giydi" YETERSİZ. "Melis ayakkabılarını giydi. Bağcıkları bağlarken parmakları biraz titriyordu — annem uyanırsa diye düşündü, ama melodi onu çağırıyordu." → İÇ DÜNYA AÇIK.

Ayrıca şu alanlar:
- cover_action: kapak için kahramanın yaptığı İngilizce aksiyon (dinamik, sahnesel)
- cover_scene_desc: kapak sahnesi ortamı İngilizce (foreground/midground/background ipuçları)
- back_cover_summary: kitabın 2-3 cümlelik sıcak Türkçe kapanış özeti
- theme_primary_color: hex renk (kitap temasına uygun)
- theme_secondary_color: hex
- theme_accent_color: hex
- theme_icon: tek emoji
- camera_framing_note: 1 satır, sahne illustration'ları için ortak kamera kuralı (örn. "wide shot, character 30-40% of frame, environment dominant")
- fun_facts: 2 bölüm dizisi, her biri {"title":"Biliyor muydun? <emoji>", "facts":[3-4 Türkçe ilginç bilgi], "icon":"<emoji>"}.
  KRİTİK KURAL — fun_facts KAZANIMLARLA / KİTABIN ANA TEMASIYLA ilgili olmalı. Yan karakter, oyuncak veya prop'larla (örn. "çocuğun oyuncak ayısı" → ayılarla ilgili bilgi YAZMA) değil.
  Kitap hangi kazanımı öğretiyorsa funFacts da o kazanımın bilimsel/gerçek-dünya boyutunu anlatmalı:
    - "Zamanında uyuma" kitabı → uyku ve vücut ritmi bilgileri
    - "Temizlik" kitabı → mikroplar, el yıkama, diş sağlığı bilgileri
    - "Yemek bitirme" kitabı → beslenme, vitamin, enerji bilgileri
    - "Cesaret" kitabı → korkuyu yenen çocuk/insan örnekleri, beynin cesaret mekanizması
    - "Arkadaşlık" kitabı → farklı kültürlerde arkadaşlık, hayvanların dostlukları
    - "Doğa/hayvan" teması → o hayvan veya doğa olgusu hakkında
  Her bilgi çocuk için ilginç, doğrulanmış ve 3-6 yaş anlayabileceği sadelikte olsun.
- fun_fact_placements: 2 sayı dizisi, hangi sahnelerden sonra geleceği. Genelde [${Math.floor(sceneCount/3)}, ${Math.floor(2*sceneCount/3)}] gibi eşit aralık.

Çıktı TAM olarak şu JSON:
{
  "title":"${idea.baslik}",
  "description":"...",
  "scenes":[{"title":"","text":"","mood":"","setting":"","outfitId":"","action":"","pace":"","interior":""}],
  "cover_action":"","cover_scene_desc":"",
  "back_cover_summary":"",
  "camera_framing_note":"wide shot, character 30-40% of frame, environment dominant, consistent across all scenes",
  "theme":{"primaryColor":"#RRGGBB","secondaryColor":"#RRGGBB","accentColor":"#RRGGBB","icon":"🎨"},
  "fun_facts":[
    {"title":"Biliyor muydun? 🌿","facts":["...","...","..."],"icon":"🌿"},
    {"title":"Biliyor muydun? ⭐","facts":["...","...","..."],"icon":"⭐"}
  ],
  "fun_fact_placements":[${Math.floor(sceneCount/3)}, ${Math.floor(2*sceneCount/3)}]
}
Sadece JSON ver, başka metin yok.`;

  const text = await generateText(ai, prompt, { temperature: 0.85, maxTokens: 16384 });
  const data = extractJson(text);
  if (!data.scenes || data.scenes.length !== sceneCount) {
    throw new Error(`Sahne sayisi bekleniyor: ${sceneCount}, gelen: ${data.scenes?.length}`);
  }
  return data;
}

function qualityCheck({ expanded, ageGroup }) {
  const rules = AGE_RULES[ageGroup];
  const issues = [];
  for (const s of expanded.scenes) {
    const words = (s.text || "").split(/\s+/).filter(Boolean).length;
    if (rules.maxWordsPerScene && words > rules.maxWordsPerScene + 5) {
      issues.push(`Sahne "${s.title}": ${words} kelime (max ${rules.maxWordsPerScene})`);
    }
    // Isim tekrari
    const nameMatches = (s.text.match(/\{CHILD_NAME\}/g) || []).length;
    const nameLimit = ageGroup === "0-3" ? 2 : 3;
    if (nameMatches > nameLimit) issues.push(`Sahne "${s.title}": {CHILD_NAME} ${nameMatches} kez (max ${nameLimit})`);
  }
  return { ok: issues.length === 0, issues };
}

// "deep" olarak isaretlenmis sahnelerde ic dunya var mi kontrol et, eksikse Gemini'ye ekleme yaptir
async function reviseDeepScenes({ ai, expanded, heroName }) {
  const deepScenes = expanded.scenes.map((s, i) => ({ i, s })).filter(x => x.s.interior === "deep");
  if (deepScenes.length === 0) return expanded;
  for (const { i, s } of deepScenes) {
    const text = s.text;
    // Heuristik: ic dusunce gostergesi var mi? "düşündü", "hissetti", "kafasında", "içinde", "kalbi", "korktu", "merak etti"
    const hasInterior = /(düşün|hisset|kafas[ıi]nda|i[çc]inde|kalbi|korktu|merak|sandı|umdu|aklında|gözleri doldu|titre)/iu.test(text);
    if (hasInterior) continue;
    const revisePrompt = `Aşağıdaki sahne metnine kahramanın iç düşünce/duygusunu eklemen lazım. Mevcut anlamı KORU, sadece kahramanın kafasında ne geçtiğini gösteren 1-2 cümle ekle veya araya yedir. ${heroName} yerine {CHILD_NAME} kullanmaya devam et. Devrik yok, doğal Türkçe.

Mevcut metin:
"""
${text}
"""

Sadece DÜZELTILMIŞ metni ver, başka açıklama yazma. Tırnak içinde değil, düz metin olarak.`;
    try {
      const out = await generateText(ai, revisePrompt, { temperature: 0.6, maxTokens: 1024 });
      const cleaned = out.trim().replace(/^"""\s*|\s*"""$/g, "").replace(/^"|"$/g, "").trim();
      if (cleaned && cleaned.length > 10) expanded.scenes[i].text = cleaned;
    } catch (e) { console.warn(`[story-writer] reviseDeep s${i+1} fail:`, e.message); }
  }
  return expanded;
}

// Expand cikitisindaki metinleri Turkce devrik/yazim acisindan temizle
async function polishTurkish({ ai, expanded, ageGroup, heroName }) {
  const scenes = expanded.scenes.map((s, i) => ({ i, text: s.text }));
  const prompt = `Sen dünya standartlarında bir Türk editörsün. Aşağıdaki sahne metinleri bir çocuk kitabından. Görev: her metni Türkçe akıcılık ve dil kuralları açısından kontrol et, bulduğun sorunları düzelt:

1. DEVRİK CÜMLE: Özne + [diğer ögeler] + yüklem yapısına getir. Örn. "Deniz kenarında Toprak yürüyordu" → "Toprak, deniz kenarında yürüyordu".
2. Boş sıfat temizliği: "harika", "mükemmel", "çok güzel", "muhteşem" → somut duyusal detay ile değiştir.
3. Klişe başlangıç: "Bir anda", "Aniden", "O sırada" tekrarlarını azalt veya farklı geçişle değiştir.
4. Noktalama: eksik virgül, nokta, tırnak tamamla.
5. İsim tekrarı: {CHILD_NAME} aynı metinde 3'ten fazla geçiyorsa zamirle/başka ifadeyle azalt.
6. Metni uzatma veya kısaltma — orijinal anlamı koru, sadece dili parlat.
7. ${ageGroup === "0-3" ? "Bebek için kısa ritmik yapıyı bozma." : "Gelişmiş dil seviyesinde tut — çocuk edebiyatı klasiği tonunda."}

Girdi JSON (sadece metinler):
${JSON.stringify(scenes, null, 2)}

Çıktı TAM olarak aynı JSON formatında [{i, text}] dizisi ver, sadece text düzeltilmiş halde. Başka metin yok.`;
  try {
    const out = await generateText(ai, prompt, { temperature: 0.4, maxTokens: 16384 });
    const polished = extractJson(out);
    if (!Array.isArray(polished)) return expanded;
    for (const p of polished) {
      if (typeof p.i === "number" && typeof p.text === "string" && expanded.scenes[p.i]) {
        expanded.scenes[p.i].text = p.text;
      }
    }
    return expanded;
  } catch (e) {
    console.warn("[story-writer] polishTurkish failed:", e.message);
    return expanded;
  }
}

async function writeStory({ ageGroup, theme, heroName, heroAge, heroGender, lessons, physicalFeatures, onProgress, forcedIdea }) {
  if (!SCENE_COUNTS[ageGroup]) throw new Error("ageGroup 0-3 / 3-6 / 6-9 olmali");
  const ai = makeClient();

  let ideas, selected, reason;
  if (forcedIdea && forcedIdea.baslik) {
    // UrunStudio'dan gelen sabit konsept — brainstorm + select atlanır.
    // Bu sayede final başlık = UrunStudio başlığı, hikaye o hikaye olarak genişletilir.
    onProgress?.({ step: 1, message: "Sabit konsept alındı (UrunStudio) — brainstorm atlandı" });
    selected = {
      baslik: forcedIdea.baslik,
      ozet: forcedIdea.ozet || theme,
      anahtarNokta: forcedIdea.anahtarNokta || forcedIdea.ozet || "",
      duyguYayi: forcedIdea.duyguYayi || "",
      sembol: forcedIdea.sembol || "",
    };
    reason = "urunstudio-concept-forced";
    ideas = [selected];
  } else {
    onProgress?.({ step: 1, message: "Beş fikir üretiliyor..." });
    ideas = await brainstorm({ ai, ageGroup, theme, heroName, lessons });

    onProgress?.({ step: 2, message: "En iyi fikir seçiliyor..." });
    const result = await selectBest({ ai, ideas, ageGroup, theme, heroName });
    selected = result.selected;
    reason = result.reason;
  }

  onProgress?.({ step: 3, message: `"${selected.baslik}" genişletiliyor (${SCENE_COUNTS[ageGroup]} sahne)...` });
  let expanded = await expand({ ai, idea: selected, ageGroup, heroName, heroAge, heroGender, lessons, theme });

  if (ageGroup !== "0-3") {
    onProgress?.({ step: 4, message: "Derin sahnelere iç dünya pass..." });
    expanded = await reviseDeepScenes({ ai, expanded, heroName });
  }

  onProgress?.({ step: 5, message: "Türkçe editör pass (devrik ve yazım temizliği)..." });
  expanded = await polishTurkish({ ai, expanded, ageGroup, heroName });

  const quality = qualityCheck({ expanded, ageGroup });
  onProgress?.({ step: 4, message: `Kalite kontrol: ${quality.ok ? "GEÇTİ" : quality.issues.length + " uyari"}` });

  // Faz 2: Log-only validator (metni degistirmez, raporu console'a ve meta'ya yazar)
  try {
    const { validateStory, formatReport } = require("../rules/validators");
    const valReport = validateStory(expanded.scenes, ageGroup, heroName);
    if (valReport.total.errors + valReport.total.warnings + valReport.total.infos > 0) {
      console.log("  [story-writer] " + formatReport(valReport));
    }
    quality.report = valReport;
  } catch (e) { console.warn("[story-writer] validator error:", e.message); }

  // Bundle iskeletini olustur
  const id = `ai-${Date.now()}-${(selected.baslik || "hikaye").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
  const bundle = {
    id,
    source: "masal-ai-writer",
    createdAt: new Date().toISOString(),
    ageGroup,
    heroName, heroAge, heroGender,
    lessons: lessons || [],
    title: expanded.title,
    description: expanded.description,
    category: "hikaye",
    theme: expanded.theme,
    scenes: expanded.scenes.map((s, i) => ({
      sceneNumber: i + 1,
      outfitId: s.outfitId,
      title: s.title,
      text: s.text,
      mood: s.mood,
      setting: s.setting,
      action: s.action,
      prompt: `CHARACTER_DESC ${physicalFeatures ? "(physical features that MUST be preserved in every scene: " + physicalFeatures + ")" : ""} ${s.action}, setting: ${s.setting}, mood: ${s.mood}, ${expanded.camera_framing_note || "wide shot, character 30-40% of frame, environment dominant, consistent across all scenes"}, Ice Age and Shrek style 3D CGI animation with exaggerated cute proportions and hyper-detailed textures, ultra high detail render quality`,
    })),
    coverPrompt: null,
    funFacts: (expanded.fun_facts || []).map((f, i) => ({ id: "fact-" + (i + 1), title: f.title, facts: f.facts || [], icon: f.icon || "💡" })),
    funFactPlacements: (expanded.fun_fact_placements || [Math.floor(SCENE_COUNTS[ageGroup]/3), Math.floor(2*SCENE_COUNTS[ageGroup]/3)]).map((sc, i) => ({ afterScene: sc, factId: "fact-" + (i + 1) })),
    specialPagePrompts: {
      // UPGRADE 2026-04-20: {CHILD_NAME} placeholder used (swap at generation time),
      // AND "ABSOLUTELY NO CHILD/PEOPLE" enforced TWICE (AI was ignoring). Also NO baked text.
      heroPage: `A beautiful premium children's storybook HERO PAGE background in 2:3 portrait — themed decorative scene only. Themed environment: ${expanded.cover_scene_desc || "matching the story world"}.

CRITICAL RULES:
1. ABSOLUTELY NO HUMAN FIGURES, NO CHILD CHARACTER, NO ADULT, NO PEOPLE IN ANY FORM. If you draw any person, image is WRONG.
2. NO TEXT, NO LETTERS, NO WORDS anywhere in the image. No title, no captions, no typography. Text will be added later via Canvas.
3. CENTER AREA (roughly 50-60% middle) must be visually CALM — soft gradient, soft bokeh, or simple atmospheric color wash. No busy elements, no objects, no animals centered. This area reserves space for a photo frame to be composited on top.

ALLOWED ELEMENTS:
- Themed environment decoration on the edges (e.g. soft themed ornaments, sparkles, flowers, ribbons, stars, soft clouds, subtle pet silhouette in the BOTTOM corner ONLY if core to theme — never centered, never human)
- Atmospheric lighting (warm glow, soft moonlight, golden hour)
- Border decorations (top and bottom zones can have tasteful flourishes)

Ice Age and Shrek style 3D CGI / painterly storybook illustration blend, magazine-cover polish. Pure background ornament, no characters, no typography.`,
      funFactBg: "A warm decorative themed background with sparkles and soft glow, NO TEXT NO LETTERS, 3D CGI illustration.",
      senderNoteBg: "A cozy warm background with soft golden light, NO TEXT NO LETTERS, 3D CGI render.",
      backCover: `A warm artistic closing scene matching "${expanded.title}". ${expanded.back_cover_summary || ""}. NO TEXT NO LETTERS in image, 3D CGI render.`,
    },
    meta: {
      brainstormIdeas: ideas,
      selectionReason: reason,
      quality,
    },
  };

  return bundle;
}

module.exports = { writeStory, SCENE_COUNTS, AGE_RULES };
