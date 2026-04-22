/**
 * concept-to-template.js
 *
 * UrunStudio'dan gelen BookConcept'i Masal book.json'a DÖNÜŞTÜRÜR.
 * Brainstorm YAPMAZ. UrunStudio'nun seçtiği başlık, özet, 6 sahne, kazanımlar AYNEN korunur.
 * Masal sadece 6 sahneyi 14 sahneye genişletir (aynı hikaye, daha detaylı).
 *
 * Bu modül writeStory()'nin alternatifidir; /api/story/import-concept tarafından çağrılır.
 */

const { GoogleGenAI, Type } = require("@google/genai");
const config = require("../config");

function ai() {
  return new GoogleGenAI({ apiKey: config.google.apiKey });
}

async function generateJSON(prompt, schema, maxTokens = 16000) {
  const r = await ai().models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.85,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 4000 },
    },
  });
  return JSON.parse((r.text || "").trim());
}

/**
 * 6-scene concept → 14-scene masal template.
 * Maintains concept's baslik, ozet, kahraman, kazanimlar — does NOT rewrite.
 */
async function importStoryFromConcept({ concept, ageGroup, heroAge, heroGender, physicalFeatures, onProgress }) {
  const age = ageGroup || concept.yasGrubu || "3-6";
  const name = concept.kahraman.isim;
  const gender = concept.kahraman.cinsiyet;
  const fizik = physicalFeatures || concept.kahraman.fizikselOzellikler || "";
  const kiyafet = concept.kahraman.kiyafet || "";
  const mood = concept.mood || "sıcak";

  onProgress?.({ step: 1, message: "UrunStudio sahneleri genisletiliyor (14 sahne)..." });

  const conceptScenes = (concept.sahneler || []).map((s, i) => `${i + 1}. ${s}`).join("\n");

  const expandPrompt = `UrunStudio'dan gelen 6 sahneli bir çocuk kitabı konseptini, AYNI HİKAYEYİ 14 sahneye genişletmen gerekiyor. YENİ bir hikaye YAZMA — var olan hikayeyi detaylandır.

═══ KONSEPT (KORUNACAK, DEĞİŞTİRME) ═══
Başlık: "${concept.baslik}"
Özet: ${concept.ozet}
Kahraman: ${name}, ${heroAge || concept.kahraman.yas} yaş, ${gender === "kız" || gender === "kiz" ? "kız" : "erkek"}. ${fizik}
Kıyafet: ${kiyafet}
Kazanımlar: ${(concept.kazanimlar || []).join(", ")}
Mood: ${mood}

═══ KONSEPT'İN 6 SAHNESİ (ANCHOR — bu akışı koru) ═══
${conceptScenes}

═══ GÖREV — 14 SAHNE ÜRET ═══
Bu 6 sahnenin akışını koruyarak 14 sahneye genişlet. Genellikle:
- 6 anchor sahne → 14 detaylı sahne (yaklaşık her anchor 2-3 sahneye açılır)
- Geçiş sahneleri ekle (bir anchor'dan diğerine duygusal/görsel köprü)
- Başlangıç ve bitiş sahneleri daha zengin olabilir
- ÖNEMLİ: concept.baslik'teki ana temayı (metafor/meslek/duygu) HER sahnede hissettir

Her sahne için:
- title: Kısa Türkçe sahne başlığı (2-4 kelime)
- text: 3-5 cümle Türkçe detaylı sahne metni. Çocuğun adı ({CHILD_NAME} placeholder ile — SEN YAZ, template swap'ı orchestrator yapar) en az 1 kez. Duygusal derinlik, görsel detay, duyu algıları (ses, koku, dokunma). Yaş grubu ${age} için uygun.
- mood: Tek kelime Türkçe (dreamy, peaceful, joyful, triumphant, nervous-excited, warm, vb. İngilizce de olabilir, prompt için)
- setting: Sahnenin geçtiği yer (Türkçe)
- prompt: İngilizce 3D Pixar illustration prompt. "wide shot, character 30-40% of frame, environment dominant" fraseli. Sahne aksiyonu + ambiance.

KURALLAR (ÖNEMLİ):
- {CHILD_NAME} placeholder kullan (Masal orchestrator runtime'da gerçek isimle swap eder)
- Metin "Yaren'nın" gibi yanlış ek yazma. Sadece {CHILD_NAME} koy, ek hesaplaması runtime'da yapılır
- Hiçbir sahneye "sihirli", "büyü", "mucize" kelimesi koyma — alternatif "ışık", "yıldız", "kıvılcım"
- Sahne sayısı TAM 14

Ek alanlar:
- description: Türkçe genel özet (3-4 cümle, concept.ozet genişletilmiş hali — YENİ yazmak yerine oradaki cümleyi koru ve 1-2 cümle ekle)
- funFacts: 2 grup (title + 3 facts + icon) — temaya uygun, kazanımlarla ilişkili
- funFactPlacements: 2 sayı [~4, ~9] hangi sahnelerden sonra
- cameraFramingNote: "wide shot, character 30-40% of frame, environment dominant, consistent across all scenes"
- theme: primaryColor, secondaryColor, accentColor (hex), icon (tek emoji)

JSON döndür.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            text: { type: Type.STRING },
            mood: { type: Type.STRING },
            setting: { type: Type.STRING },
            prompt: { type: Type.STRING },
          },
        },
      },
      description: { type: Type.STRING },
      funFacts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            facts: { type: Type.ARRAY, items: { type: Type.STRING } },
            icon: { type: Type.STRING },
          },
        },
      },
      funFactPlacements: { type: Type.ARRAY, items: { type: Type.NUMBER } },
      cameraFramingNote: { type: Type.STRING },
      theme: {
        type: Type.OBJECT,
        properties: {
          primaryColor: { type: Type.STRING },
          secondaryColor: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          icon: { type: Type.STRING },
        },
      },
    },
  };

  const result = await generateJSON(expandPrompt, schema);
  if (!result.scenes || result.scenes.length < 14) {
    throw new Error(`Expected 14 scenes, got ${result.scenes?.length}`);
  }

  onProgress?.({ step: 2, message: "Template bundle hazirlaniyor..." });

  const id = `urun-${Date.now()}-${(concept.baslik || "hikaye").toLowerCase().replace(/[^a-z0-9çğıöşü]+/gi, "-").replace(/(?:^-|-$)/g, "").slice(0, 40)}`;

  const bundle = {
    id,
    source: "urunstudio-imported",
    createdAt: new Date().toISOString(),
    ageGroup: age,
    heroName: name,
    heroAge: String(heroAge || concept.kahraman.yas || "6"),
    heroGender: gender,
    lessons: concept.kazanimlar || [],
    title: concept.baslik,                 // ← UrunStudio baslik KORUNDU
    description: result.description || concept.ozet,
    category: "hikaye",                    // orchestrator override edecek (category.id)
    theme: result.theme || { primaryColor: "#F4A261", secondaryColor: "#87CEEB", accentColor: "#FF69B4", icon: "✨" },
    cameraFramingNote: result.cameraFramingNote || "wide shot, character 30-40% of frame, environment dominant, consistent across all scenes",
    scenes: result.scenes.slice(0, 14).map((s, i) => ({
      sceneNumber: i + 1,
      title: s.title,
      text: s.text,
      mood: s.mood || "warm",
      setting: s.setting || "",
      prompt: s.prompt || `CHARACTER_DESC ${s.title}, setting: ${s.setting}, mood: ${s.mood}, wide shot, character 30-40% of frame, environment dominant, Ice Age and Shrek style 3D CGI animation with exaggerated cute proportions and hyper-detailed textures, ultra high detail render quality`,
    })),
    funFacts: (result.funFacts || []).slice(0, 2).map((f, i) => ({
      id: "fact-" + (i + 1),
      title: f.title,
      facts: f.facts || [],
      icon: f.icon || "💡",
    })),
    funFactPlacements: (result.funFactPlacements || [5, 10]).slice(0, 2).map((sc, i) => ({
      afterScene: sc,
      factId: "fact-" + (i + 1),
    })),
    coverPrompt: null,
    specialPagePrompts: {
      heroPage: `A beautiful premium children's storybook HERO PAGE background in 2:3 portrait — themed decorative scene matching "${concept.baslik}".

CRITICAL RULES:
1. ABSOLUTELY NO HUMAN FIGURES, NO CHILD CHARACTER, NO PEOPLE IN ANY FORM.
2. NO TEXT, NO LETTERS, NO WORDS anywhere in the image.
3. CENTER AREA (roughly 50-60% middle) must be visually CALM — soft gradient or soft bokeh. This area reserves space for a real photo frame.

Theme: ${concept.ozet.slice(0, 180)}. Ice Age and Shrek style 3D CGI / painterly storybook illustration blend, magazine-cover polish.`,
      funFactBg: "A warm decorative themed background with sparkles and soft glow, NO TEXT NO LETTERS, 3D CGI illustration.",
      senderNoteBg: "A cozy warm background with soft golden light, NO TEXT NO LETTERS, 3D CGI render.",
      backCover: `A warm artistic closing scene matching "${concept.baslik}". ${concept.ozet.slice(0, 200)}. NO TEXT NO LETTERS in image, 3D CGI render.`,
    },
    // UrunStudio source fields
    urunStudioSource: {
      concept: {
        baslik: concept.baslik,
        kahraman: concept.kahraman,
        ozet: concept.ozet,
        sahneler: concept.sahneler,
        kazanimlar: concept.kazanimlar,
        yasGrubu: concept.yasGrubu,
        mood: concept.mood,
      },
    },
    meta: {
      importedFromUrunStudio: true,
      originalSahneCount: concept.sahneler?.length || 0,
      expandedSahneCount: result.scenes.length,
    },
  };

  return bundle;
}

module.exports = { importStoryFromConcept };
