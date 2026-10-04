import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import penguinP from "./assets/penguin-p.png";
import {
  Bell,
  CalendarCheck,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  Cloud,
  Download,
  Languages,
  MapPin,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Tag,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siAirbnb, siBookingdotcom, siGoogle, siInstagram, siMessenger, siWhatsapp, type SimpleIcon } from "simple-icons";
import { useGuestThreads, ThreadList, Conversation } from "@/components/GuestChat";
import { languages, type LanguageCode } from "./languages";
import { hasLanguagePack, hasReverseLanguagePack, installLanguagePack, installReverseLanguagePack, translateEnglish, translateToEnglish } from "./local-translation";
import { decodeRecordedAudio, hasSpeechModel, installSpeechModel, transcribeAudio } from "./local-speech";
import { clearBusinessData, getProfile, listBookings, listPrices, listProducts, replaceCatalog, savePrice, saveProduct, saveProfile, type BookingRecord, type BusinessProfile, type PriceItem, type Product } from "./memory";
import { draftReply } from "./reply";
import { DEMO_SEED_KEY, NOOR_PRICES, NOOR_PRODUCTS, NOOR_PROFILE } from "./demo-data";
const lokalPinguIconAsset = { url: penguinP };
import { PenguinP } from "@/components/PenguinP";


type Tab = "assistant" | "speak" | "chat" | "business";
type BusinessView = "overview" | "kpi" | "context" | "prices" | "facts" | "interactions";
type AppLanguage = keyof typeof UI;
type UtilityView = "notifications" | "settings" | null;
export type ModelEventKind = "info" | "run" | "output" | "ready" | "error";
export type ModelEvent = { id: string; time: string; model: string; kind: ModelEventKind; message: string };
type DeviceProfile = { name: string; detail: string; factor: number; whisper: string; opus: string; reply: string };
const DEVICE_PROFILES: DeviceProfile[] = [
  { name: "Einsteiger", detail: "4 GB · 4 Kerne", factor: 2, whisper: "0,4×", opus: "~1,6 s", reply: "~0,9 s" },
  { name: "Mittelklasse", detail: "6 GB · 8 Kerne", factor: 1, whisper: "0,8×", opus: "~0,8 s", reply: "~0,45 s" },
  { name: "High-End", detail: "12 GB · NPU", factor: 0.45, whisper: "1,6×", opus: "~0,35 s", reply: "~0,2 s" },
];
const LOCAL_PRODUCTS_KEY = "lokalpingu-local-products";
const LOCAL_PRICES_KEY = "lokalpingu-local-prices";
const CONNECTORS: { name: string; icon: SimpleIcon }[] = [
  { name: "Google Business", icon: siGoogle },
  { name: "WhatsApp", icon: siWhatsapp },
  { name: "Instagram", icon: siInstagram },
  { name: "Messenger", icon: siMessenger },
  { name: "Booking.com", icon: siBookingdotcom },
  { name: "Airbnb", icon: siAirbnb },
];

function readLocal<T>(key: string): T[] {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T[]) : []; } catch { return []; }
}
function money(amount: number, from: string, _to: string) {
  return `${from} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
/** Offline assistant: understands simple add/change/reply requests without any account or network. */
function runLocalAssistant(text: string, language: AppLanguage, products: Product[], prices: PriceItem[], businessName: string, currency = "IDR"): { reply: string; products: Product[]; prices: PriceItem[] } {
  const de = language === "de";
  const lower = text.toLowerCase();
  const addMatch = text.match(/(?:add|create|new|füge?|hinzufügen|neu[e]?[rs]?|erstelle)\s+(.+?)\s+(?:for|für)\s+([\d.,]+)/i);
  if (addMatch) {
    const name = addMatch[1]!.trim();
    const amount = Number(addMatch[2]!.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(amount)) {
      const product: Product = { id: crypto.randomUUID(), name, category: "Offer", description: "", active: true };
      const price: PriceItem = { id: crypto.randomUUID(), label: name, price: amount, currency, unit: "item", active: true };
      return {
        reply: de ? `Erledigt: „${name}“ als Produkt angelegt mit Preis ${amount.toLocaleString("de-DE")} ${currency}. Offline auf diesem Gerät gespeichert.` : `Done: “${name}” added as a product at ${amount.toLocaleString("en-US")} ${currency}. Saved offline on this device.`,
        products: [...products, product], prices: [...prices, price],
      };
    }
  }
  const changeMatch = text.match(/(?:change|set|update|ändere|andere|aktualisiere)\s+(.+?)\s+(?:price\s+|preis\s+)?(?:to|auf)\s+([\d.,]+)/i);
  if (changeMatch) {
    const label = changeMatch[1]!.trim().toLowerCase();
    const amount = Number(changeMatch[2]!.replace(/\./g, "").replace(",", "."));
    const target = prices.find((p) => p.label.toLowerCase().includes(label));
    if (target && Number.isFinite(amount)) {
      const next = prices.map((p) => (p.id === target.id ? { ...p, price: amount, currency } : p));
      return {
        reply: de ? `Preis für „${target.label}“ auf ${amount.toLocaleString("de-DE")} ${currency} geändert.` : `Price for “${target.label}” changed to ${amount.toLocaleString("en-US")} ${currency}.`,
        products, prices: next,
      };
    }
    return { reply: de ? `Ich habe keinen Preiseintrag gefunden, der zu „${changeMatch[1]!.trim()}“ passt.` : `I couldn't find a price entry matching “${changeMatch[1]!.trim()}”.`, products, prices };
  }
  if (/(reply|antwort|guest|gast|draft|entwurf)/i.test(lower)) {
    const priceLines = prices.slice(0, 3).map((p) => `${p.label}: ${money(p.price, p.currency, currency)}`).join("; ");
    const draft = `Hello! Thank you for your message to ${businessName}. ${priceLines ? `Our current prices: ${priceLines}. ` : ""}We would be happy to welcome you. Please let us know your dates and the number of guests.`;
    return { reply: (de ? "Antwortentwurf für den Gast (Englisch):\n\n" : "Draft reply for the guest (English):\n\n") + draft, products, prices };
  }
  return {
    reply: de
      ? "Ich arbeite offline auf diesem Gerät. Beispiele: „Füge Kajaktour für 250000 hinzu“, „Ändere Frühstück auf 60000“, „Antwortentwurf für Gast“."
      : "I work offline on this device. Try: “Add kayak tour for 250000”, “Change breakfast to 60000”, “Draft guest reply”.",
    products, prices,
  };
}

const UI = {
  en: {
    notifications: "Notifications", settings: "Settings", assistant: "Assistant", speak: "Speak", chat: "Chat", business: "Business",
    live: "Live translation", start: "Start a conversation", guest: "Guest speaks", tap: "Tap to speak", listening: "Listening…", speakInput: "Input language", speakOutput: "Output language",
    device: "Your words stay on this device.", natural: "Speak naturally. Translation appears instantly.", micOn: "Microphone on", micOff: "Microphone muted",
    inbox: "Inbox", messages: "Guest messages", new: "2 new", smart: "Smart reply", smartText: "Draft a clear English reply using your saved business details.", reply: "Type a reply…",
    insights: "Useful insights", allCaught: "You’re all caught up", profileAlert: "Complete your Google profile", profileAlertText: "A complete profile helps LocalPingu answer guests accurately.",
    demand: "Demand is rising", demandText: "Friday and Saturday receive the most guest requests.", priceAlert: "Price list ready", priceAlertText: "Your saved prices can now be used in reply drafts.",
    appLanguage: "App language", localLanguage: "Your spoken language", preferences: "Preferences", currency: "Currency", reset: "Reset app", resetText: "Restart the demo and onboarding on this device.",
    suggestions: ["Add kayak tour for 250000", "Change breakfast to 60000", "Draft guest reply"],
    confirmReset: "Reset LocalPingu?", confirmResetText: "This clears demo preferences on this device. Your saved business data stays safe.", cancel: "Cancel", confirm: "Reset app",
    welcome: "Welcome to LocalPingu", welcomeText: "Understand guests, reply confidently, and keep your business knowledge in one place.", continue: "Continue", back: "Back",
    chooseApp: "Choose the app language", chooseAppText: "You can change this later in Settings.", chooseLocal: "Which language do you speak?", chooseLocalText: "Guests speak English. LocalPingu translates for you.",
    businessSetup: "Set up your business", businessSetupText: "Connect your Google profile and add products and prices after setup.", ready: "You’re ready", readyText: "Your English guest assistant is ready. Business details can be synchronized anytime.", startApp: "Start LocalPingu", skip: "Set up later",
    businessName: "Your business name", businessPlace: "e.g. Seaside Homestay", protected: "Private to your account", step: "Step",
    assistantFailed: "Failed. Please try again.", assistantEmpty: "Ask a question or pick a suggestion.", typing: "typing…", offlineMode: "Offline mode – saved on this device. Sign in with Google for cloud sync.", offlineModeShort: "Offline mode – saved locally.",
    assistantPlaceholder: "Product, price or guest reply…", unread: "unread", replyPlaceholder: "Reply in English…", translate: "Translate", hideTranslation: "Hide translation", draftReply: "Draft reply", noTranslation: "No offline translation available.",
  },
  de: {
    notifications: "Benachrichtigungen", settings: "Einstellungen", assistant: "Assistent", speak: "Sprechen", chat: "Chat", business: "Business",
    live: "Live-Übersetzung", start: "Gespräch starten", guest: "Gast spricht", tap: "Zum Sprechen tippen", listening: "Ich höre zu…", speakInput: "Eingabesprache", speakOutput: "Ausgabesprache",
    device: "Deine Worte bleiben auf diesem Gerät.", natural: "Sprich ganz natürlich. Die Übersetzung erscheint sofort.", micOn: "Mikrofon an", micOff: "Mikrofon stumm",
    inbox: "Posteingang", messages: "Gästenachrichten", new: "2 neu", smart: "Smarte Antwort", smartText: "Erstelle eine klare englische Antwort mit deinen gespeicherten Betriebsdaten.", reply: "Antwort eingeben…",
    insights: "Nützliche Hinweise", allCaught: "Alles angesehen", profileAlert: "Google-Profil vervollständigen", profileAlertText: "Ein vollständiges Profil hilft LocalPingu, Gästen korrekt zu antworten.",
    demand: "Nachfrage steigt", demandText: "Freitag und Samstag erhalten die meisten Gästeanfragen.", priceAlert: "Preisliste bereit", priceAlertText: "Gespeicherte Preise können jetzt in Antwortentwürfen genutzt werden.",
    appLanguage: "App-Sprache", localLanguage: "Deine Sprache", preferences: "Präferenzen", currency: "Währung", reset: "App zurücksetzen", resetText: "Demo und Onboarding auf diesem Gerät neu starten.",
    suggestions: ["Füge Kajaktour für 250000 hinzu", "Ändere Frühstück auf 60000", "Antwortentwurf für Gast"],
    confirmReset: "LocalPingu zurücksetzen?", confirmResetText: "Demo-Einstellungen werden gelöscht. Gespeicherte Betriebsdaten bleiben erhalten.", cancel: "Abbrechen", confirm: "App zurücksetzen",
    welcome: "Willkommen bei LocalPingu", welcomeText: "Verstehe Gäste, antworte sicher und verwalte dein Betriebswissen an einem Ort.", continue: "Weiter", back: "Zurück",
    chooseApp: "App-Sprache wählen", chooseAppText: "Du kannst sie später in den Einstellungen ändern.", chooseLocal: "Welche Sprache sprichst du?", chooseLocalText: "Gäste sprechen Englisch. LocalPingu übersetzt für dich.",
    businessSetup: "Betrieb einrichten", businessSetupText: "Verbinde nach der Einrichtung dein Google-Profil und ergänze Produkte und Preise.", ready: "Alles bereit", readyText: "Dein englischer Gästeassistent ist bereit. Betriebsdaten kannst du jederzeit synchronisieren.", startApp: "LocalPingu starten", skip: "Später einrichten",
    businessName: "Name deines Betriebs", businessPlace: "z. B. Seaside Homestay", protected: "Privat in deinem Konto", step: "Schritt",
    assistantFailed: "Fehlgeschlagen. Bitte erneut versuchen.", assistantEmpty: "Stelle eine Frage oder wähle einen Vorschlag.", typing: "schreibt…", offlineMode: "Offline-Modus – wird auf diesem Gerät gespeichert. Mit Google anmelden für Cloud-Sync.", offlineModeShort: "Offline-Modus – lokal gespeichert.",
    assistantPlaceholder: "Produkt, Preis oder Antwortentwurf…", unread: "ungelesen", replyPlaceholder: "Antwort auf Englisch…", translate: "Übersetzen", hideTranslation: "Übersetzung ausblenden", draftReply: "Antwort verfassen", noTranslation: "Keine Offline-Übersetzung verfügbar.",
  },
  id: {
    notifications: "Notifikasi", settings: "Pengaturan", assistant: "Asisten", speak: "Bicara", chat: "Obrolan", business: "Bisnis",
    live: "Terjemahan langsung", start: "Mulai percakapan", guest: "Tamu berbicara", tap: "Ketuk untuk bicara", listening: "Mendengarkan…", speakInput: "Bahasa masukan", speakOutput: "Bahasa keluaran",
    device: "Kata-kata Anda tetap di perangkat ini.", natural: "Bicara secara alami. Terjemahan muncul seketika.", micOn: "Mikrofon aktif", micOff: "Mikrofon mati",
    inbox: "Kotak masuk", messages: "Pesan tamu", new: "2 baru", smart: "Balasan cerdas", smartText: "Buat balasan bahasa Inggris yang jelas menggunakan data bisnis Anda.", reply: "Tulis balasan…",
    insights: "Info bermanfaat", allCaught: "Semua sudah dilihat", profileAlert: "Lengkapi profil Google Anda", profileAlertText: "Profil lengkap membantu LocalPingu menjawab tamu dengan akurat.",
    demand: "Permintaan meningkat", demandText: "Jumat dan Sabtu menerima permintaan terbanyak.", priceAlert: "Daftar harga siap", priceAlertText: "Harga tersimpan kini bisa dipakai dalam draf balasan.",
    appLanguage: "Bahasa aplikasi", localLanguage: "Bahasa Anda", preferences: "Preferensi", currency: "Mata uang", reset: "Atur ulang aplikasi", resetText: "Mulai ulang demo dan orientasi di perangkat ini.",
    suggestions: ["Tambah tur kayak 250000", "Ubah sarapan menjadi 60000", "Draf balasan untuk tamu"],
    confirmReset: "Atur ulang LocalPingu?", confirmResetText: "Ini menghapus preferensi demo di perangkat ini. Data bisnis Anda tetap aman.", cancel: "Batal", confirm: "Atur ulang",
    welcome: "Selamat datang di LocalPingu", welcomeText: "Pahami tamu, balas dengan percaya diri, dan simpan pengetahuan bisnis di satu tempat.", continue: "Lanjut", back: "Kembali",
    chooseApp: "Pilih bahasa aplikasi", chooseAppText: "Bisa diubah nanti di Pengaturan.", chooseLocal: "Bahasa apa yang Anda bicarakan?", chooseLocalText: "Tamu berbahasa Inggris. LocalPingu menerjemahkan untuk Anda.",
    businessSetup: "Siapkan bisnis Anda", businessSetupText: "Hubungkan profil Google dan tambahkan produk serta harga setelah penyiapan.", ready: "Anda siap", readyText: "Asisten tamu bahasa Inggris Anda siap. Data bisnis dapat disinkronkan kapan saja.", startApp: "Mulai LocalPingu", skip: "Atur nanti",
    businessName: "Nama bisnis Anda", businessPlace: "mis. Seaside Homestay", protected: "Privat di akun Anda", step: "Langkah",
    assistantFailed: "Gagal. Silakan coba lagi.", assistantEmpty: "Ajukan pertanyaan atau pilih saran.", typing: "menulis…", offlineMode: "Mode luring – tersimpan di perangkat ini. Masuk dengan Google untuk sinkronisasi cloud.", offlineModeShort: "Mode luring – tersimpan lokal.",
    assistantPlaceholder: "Produk, harga atau balasan…", unread: "belum dibaca", replyPlaceholder: "Balasan dalam bahasa Inggris…", translate: "Terjemahkan", hideTranslation: "Sembunyikan terjemahan", draftReply: "Tulis draf balasan", noTranslation: "Terjemahan luring tidak tersedia.",
  },
  bn: {
    notifications: "নোটিফিকেশন", settings: "সেটিংস", assistant: "অ্যাসিস্ট্যান্ট", speak: "বলুন", chat: "চ্যাট", business: "ব্যবসা",
    live: "লাইভ অনুবাদ", start: "কথোপকথন শুরু করুন", guest: "অতিথি কথা বলছেন", tap: "বলতে ট্যাপ করুন", listening: "শুনছি…", speakInput: "ইনপুট ভাষা", speakOutput: "আউটপুট ভাষা",
    device: "আপনার কথা এই ডিভাইসেই থাকে।", natural: "স্বাভাবিকভাবে বলুন। অনুবাদ তৎক্ষণাৎ দেখা যায়।", micOn: "মাইক্রোফোন চালু", micOff: "মাইক্রোফোন বন্ধ",
    inbox: "ইনবক্স", messages: "অতিথির বার্তা", new: "২টি নতুন", smart: "স্মার্ট উত্তর", smartText: "আপনার সংরক্ষিত ব্যবসার তথ্য দিয়ে স্পষ্ট ইংরেজি উত্তর তৈরি করুন।", reply: "উত্তর লিখুন…",
    insights: "দরকারি পরামর্শ", allCaught: "সব দেখা হয়েছে", profileAlert: "আপনার Google প্রোফাইল সম্পূর্ণ করুন", profileAlertText: "সম্পূর্ণ প্রোফাইল LocalPingu-কে অতিথিদের সঠিকভাবে উত্তর দিতে সাহায্য করে।",
    demand: "চাহিদা বাড়ছে", demandText: "শুক্রবার ও শনিবার সবচেয়ে বেশি অনুরোধ আসে।", priceAlert: "তালিকা প্রস্তুত", priceAlertText: "সংরক্ষিত দাম এখন উত্তরের খসড়ায় ব্যবহার করা যায়।",
    appLanguage: "অ্যাপের ভাষা", localLanguage: "আপনার ভাষা", preferences: "পছন্দসমূহ", currency: "মুদ্রা", reset: "অ্যাপ রিসেট", resetText: "এই ডিভাইসে ডেমো ও সেটআপ আবার শুরু করুন।",
    suggestions: ["২৫০০০০-এ কায়াক ট্যুর যোগ করুন", "নাস্তা ৬০০০০ করুন", "অতিথির উত্তরের খসড়া"],
    confirmReset: "LocalPingu রিসেট করবেন?", confirmResetText: "এতে এই ডিভাইসের ডেমো পছন্দ মুছে যায়। আপনার ব্যবসার তথ্য নিরাপদ থাকে।", cancel: "বাতিল", confirm: "রিসেট করুন",
    welcome: "LocalPingu-তে স্বাগতম", welcomeText: "অতিথিদের বুঝুন, নিশ্চিতভাবে উত্তর দিন এবং ব্যবসার তথ্য এক জায়গায় রাখুন।", continue: "পরবর্তী", back: "পেছনে",
    chooseApp: "অ্যাপের ভাষা বেছে নিন", chooseAppText: "পরে সেটিংসে বদলাতে পারবেন।", chooseLocal: "আপনি কোন ভাষায় কথা বলেন?", chooseLocalText: "অতিথিরা ইংরেজিতে কথা বলেন। LocalPingu আপনার জন্য অনুবাদ করে।",
    businessSetup: "ব্যবসা সেট আপ করুন", businessSetupText: "সেটআপের পর Google প্রোফাইল সংযোগ করে পণ্য ও দাম যোগ করুন।", ready: "আপনি প্রস্তুত", readyText: "আপনার ইংরেজি অতিথি সহকারী প্রস্তুত। ব্যবসার তথ্য যেকোনো সময় সিঙ্ক করা যায়।", startApp: "LocalPingu শুরু করুন", skip: "পরে সেট আপ করুন",
    businessName: "আপনার ব্যবসার নাম", businessPlace: "যেমন Seaside Homestay", protected: "আপনার অ্যাকাউন্টে ব্যক্তিগত", step: "ধাপ",
    assistantFailed: "ব্যর্থ হয়েছে। আবার চেষ্টা করুন।", assistantEmpty: "প্রশ্ন করুন বা পরামর্শ বেছে নিন।", typing: "লিখছে…", offlineMode: "অফলাইন মোড – এই ডিভাইসে সংরক্ষিত। ক্লাউড সিঙ্কের জন্য Google-এ সাইন ইন করুন।", offlineModeShort: "অফলাইন মোড – স্থানীয়ভাবে সংরক্ষিত।",
    assistantPlaceholder: "পণ্য, দাম বা উত্তর…", unread: "অপঠিত", replyPlaceholder: "ইংরেজিতে উত্তর…", translate: "অনুবাদ করুন", hideTranslation: "অনুবাদ লুকান", draftReply: "উত্তরের খসড়া", noTranslation: "অফলাইন অনুবাদ নেই।",
  },
  hi: {
    notifications: "सूचनाएँ", settings: "सेटिंग्स", assistant: "असिस्टेंट", speak: "बोलें", chat: "चैट", business: "बिज़नेस",
    live: "लाइव अनुवाद", start: "बातचीत शुरू करें", guest: "अतिथि बोल रहे हैं", tap: "बोलने के लिए टैप करें", listening: "सुन रहा हूँ…", speakInput: "इनपुट भाषा", speakOutput: "आउटपुट भाषा",
    device: "आपके शब्द इसी डिवाइस पर रहते हैं।", natural: "स्वाभाविक रूप से बोलें। अनुवाद तुरंत दिखता है।", micOn: "माइक्रोफोन चालू", micOff: "माइक्रोफोन बंद",
    inbox: "इनबॉक्स", messages: "अतिथि संदेश", new: "2 नए", smart: "स्मार्ट उत्तर", smartText: "सहेजे गए व्यवसाय विवरण से स्पष्ट अंग्रेज़ी उत्तर बनाएँ।", reply: "उत्तर लिखें…",
    insights: "उपयोगी सुझाव", allCaught: "सब देख लिया", profileAlert: "अपनी Google प्रोफ़ाइल पूरी करें", profileAlertText: "पूरी प्रोफ़ाइल LocalPingu को अतिथियों को सही उत्तर देने में मदद करती है।",
    demand: "मांग बढ़ रही है", demandText: "शुक्रवार और शनिवार को सबसे अधिक अनुरोध आते हैं।", priceAlert: "कीमत सूची तैयार", priceAlertText: "सहेजी गई कीमतें अब उत्तर ड्राफ़्ट में उपयोग हो सकती हैं।",
    appLanguage: "ऐप की भाषा", localLanguage: "आपकी भाषा", preferences: "प्राथमिकताएँ", currency: "मुद्रा", reset: "ऐप रीसेट करें", resetText: "इस डिवाइस पर डेमो और ऑनबोर्डिंग फिर से शुरू करें।",
    suggestions: ["250000 के लिए कायाक टूर जोड़ें", "नाश्ता 60000 करें", "अतिथि उत्तर ड्राफ़्ट"],
    confirmReset: "LocalPingu रीसेट करें?", confirmResetText: "इससे इस डिवाइस की डेमो प्राथमिकताएँ हट जाती हैं। व्यवसाय का डेटा सुरक्षित रहता है।", cancel: "रद्द करें", confirm: "रीसेट करें",
    welcome: "LocalPingu में आपका स्वागत है", welcomeText: "अतिथियों को समझें, भरोसे के साथ उत्तर दें और व्यवसाय की जानकारी एक जगह रखें।", continue: "आगे बढ़ें", back: "वापस",
    chooseApp: "ऐप की भाषा चुनें", chooseAppText: "आप बाद में सेटिंग्स में बदल सकते हैं।", chooseLocal: "आप कौन सी भाषा बोलते हैं?", chooseLocalText: "अतिथि अंग्रेज़ी बोलते हैं। LocalPingu आपके लिए अनुवाद करता है।",
    businessSetup: "व्यवसाय सेट अप करें", businessSetupText: "सेटअप के बाद अपनी Google प्रोफ़ाइल जोड़ें और प्रोडक्ट व कीमतें भरें।", ready: "आप तैयार हैं", readyText: "आपका अंग्रेज़ी अतिथि सहायक तैयार है। व्यवसाय विवरण कभी भी सिंक हो सकते हैं।", startApp: "LocalPingu शुरू करें", skip: "बाद में सेट अप करें",
    businessName: "आपके व्यवसाय का नाम", businessPlace: "जैसे Seaside Homestay", protected: "आपके खाते में निजी", step: "चरण",
    assistantFailed: "विफल। कृपया पुनः प्रयास करें।", assistantEmpty: "प्रश्न पूछें या सुझाव चुनें।", typing: "लिख रहा है…", offlineMode: "ऑफ़लाइन मोड – इस डिवाइस पर सहेजा गया। क्लाउड सिंक के लिए Google से साइन इन करें।", offlineModeShort: "ऑफ़लाइन मोड – लोकल सहेजा गया।",
    assistantPlaceholder: "प्रोडक्ट, कीमत या उत्तर…", unread: "अपठित", replyPlaceholder: "अंग्रेज़ी में उत्तर…", translate: "अनुवाद करें", hideTranslation: "अनुवाद छिपाएँ", draftReply: "उत्तर ड्राफ़्ट करें", noTranslation: "ऑफ़लाइन अनुवाद उपलब्ध नहीं।",
  },
  ta: {
    notifications: "அறிவிப்புகள்", settings: "அமைப்புகள்", assistant: "உதவியாளர்", speak: "பேசு", chat: "அரட்டை", business: "வணிகம்",
    live: "நேரடி மொழிபெயர்ப்பு", start: "உரையாடலைத் தொடங்கு", guest: "விருந்தினர் பேசுகிறார்", tap: "பேச தட்டவும்", listening: "கேட்கிறேன்…", speakInput: "உள்ளீட்டு மொழி", speakOutput: "வெளியீட்டு மொழி",
    device: "உங்கள் சொற்கள் இந்த சாதனத்திலேயே இருக்கும்.", natural: "இயல்பாக பேசுங்கள். மொழிபெயர்ப்பு உடனே தோன்றும்.", micOn: "மைக்ரோஃபோன் இயக்கம்", micOff: "மைக்ரோஃபோன் அணைக்கப்பட்டது",
    inbox: "இன்பாக்ஸ்", messages: "விருந்தினர் செய்திகள்", new: "2 புதியது", smart: "திறமையான பதில்", smartText: "சேமித்த வணிக விவரங்களுடன் தெளிவான ஆங்கில பதிலை உருவாக்குங்கள்.", reply: "பதிலை எழுதுங்கள்…",
    insights: "பயனுள்ள குறிப்புகள்", allCaught: "அனைத்தையும் பார்த்தீர்கள்", profileAlert: "உங்கள் Google சுயவிவரத்தை முடிக்கவும்", profileAlertText: "முழுமையான சுயவிவரம் LocalPingu விருந்தினருக்கு துல்லியமாக பதிலளிக்க உதவும்.",
    demand: "தேவை அதிகரிக்கிறது", demandText: "வெள்ளி மற்றும் சனி அதிக கோரிக்கைகள் பெறுகின்றன.", priceAlert: "விலைப்பட்டியல் தயார்", priceAlertText: "சேமித்த விலைகளை இப்போது பதில் வரைவுகளில் பயன்படுத்தலாம்.",
    appLanguage: "ஆப் மொழி", localLanguage: "உங்கள் மொழி", preferences: "விருப்பங்கள்", currency: "நாணயம்", reset: "ஆப்பை மீட்டமை", resetText: "இந்த சாதனத்தில் டெமோ மற்றும் அமைவை மீண்டும் தொடங்கு.",
    suggestions: ["கயாக் சுற்றுலா 250000 சேர்க்கவும்", "காலை உணவு 60000 என மாற்றவும்", "விருந்தினர் பதில் வரைவு"],
    confirmReset: "LocalPingu-ஐ மீட்டமைக்கவா?", confirmResetText: "இது இந்த சாதனத்தின் டெமோ விருப்பங்களை அழிக்கும். உங்கள் வணிகத் தரவு பாதுகாப்பாக இருக்கும்.", cancel: "ரத்து", confirm: "மீட்டமை",
    welcome: "LocalPingu-க்கு வரவேற்கிறோம்", welcomeText: "விருந்தினரை புரிந்துகொள்ளுங்கள், நம்பிக்கையுடன் பதிலளியுங்கள், வணிக அறிவை ஒரே இடத்தில் வையுங்கள்.", continue: "தொடர்க", back: "பின்",
    chooseApp: "ஆப் மொழியைத் தேர்வு செய்யவும்", chooseAppText: "பின்னர் அமைப்புகளில் மாற்றலாம்.", chooseLocal: "எந்த மொழியை பேசுகிறீர்கள்?", chooseLocalText: "விருந்தினர் ஆங்கிலம் பேசுகிறார்கள். LocalPingu உங்களுக்காக மொழிபெயர்க்கும்.",
    businessSetup: "வணிகத்தை அமைக்கவும்", businessSetupText: "அமைவுக்குப் பிறகு உங்கள் Google சுயவிவரத்தை இணைத்து பொருட்கள் மற்றும் விலைகளை சேர்க்கவும்.", ready: "நீங்கள் தயார்", readyText: "உங்கள் ஆங்கில விருந்தினர் உதவியாளர் தயார். வணிக விவரங்களை எப்போது வேண்டுமானாலும் ஒத்திசைக்கலாம்.", startApp: "LocalPingu தொடங்கு", skip: "பின்னர் அமைக்கவும்",
    businessName: "உங்கள் வணிகத்தின் பெயர்", businessPlace: "எ.கா. Seaside Homestay", protected: "உங்கள் கணக்கில் தனிப்பட்டது", step: "படி",
    assistantFailed: "தோல்வி. மீண்டும் முயற்சிக்கவும்.", assistantEmpty: "கேள்வி கேளுங்கள் அல்லது பரிந்துரையைத் தேர்வு செய்யுங்கள்.", typing: "எழுதுகிறது…", offlineMode: "ஆஃப்லைன் பயன்முறை – இந்த சாதனத்தில் சேமிக்கப்பட்டது. கிளவுட் ஒத்திசைவுக்கு Google உடன் உள்நுழையவும்.", offlineModeShort: "ஆஃப்லைன் பயன்முறை – உள்ளூரில் சேமிக்கப்பட்டது.",
    assistantPlaceholder: "பொருள், விலை அல்லது பதில்…", unread: "படிக்காதது", replyPlaceholder: "ஆங்கிலத்தில் பதில்…", translate: "மொழிபெயர்", hideTranslation: "மொழிபெயர்ப்பை மறை", draftReply: "பதில் வரைவு", noTranslation: "ஆஃப்லைன் மொழிபெயர்ப்பு இல்லை.",
  },
  sw: {
    notifications: "Arifa", settings: "Mipangilio", assistant: "Msaidizi", speak: "Zungumza", chat: "Mazungumzo", business: "Biashara",
    live: "Tafsiri ya moja kwa moja", start: "Anzisha mazungumzo", guest: "Mgeni anazungumza", tap: "Bofya ili uzungumze", listening: "Ninasikia…", speakInput: "Lugha ya kuingiza", speakOutput: "Lugha ya kutolea",
    device: "Maneno yako yabaki kwenye kifaa hiki.", natural: "Zungumza kwa kawaida. Tafsiri inaonekana mara moja.", micOn: "Maikrofoni imewashwa", micOff: "Maikrofoni imezimwa",
    inbox: "Kisanduku cha barua", messages: "Ujumbe wa wageni", new: "2 mapya", smart: "Jibu mahiri", smartText: "Andika jibu la Kiingereza kwa kutumia maelezo yako ya biashara.", reply: "Andika jibu…",
    insights: "Ushauri muhimu", allCaught: "Umeona yote", profileAlert: "Kamilisha wasifu wako wa Google", profileAlertText: "Wasifu kamili husaidia LocalPingu kujibu wageni kwa usahihi.",
    demand: "Mahitaji yanaongezeka", demandText: "Ijumaa na Jumamosi zinapokea maombi mengi zaidi.", priceAlert: "Orodha ya bei tayari", priceAlertText: "Bei zilizohifadhiwa sasa zinaweza kutumika kwenye majibu.",
    appLanguage: "Lugha ya programu", localLanguage: "Lugha yako", preferences: "Mapendeleo", currency: "Sarafu", reset: "Weka upya programu", resetText: "Anzisha upya jaribio na usanidi kwenye kifaa hiki.",
    suggestions: ["Ongeza safari ya kayak 250000", "Badilisha kifungua kinywa kuwa 60000", "Andaa jibu kwa mgeni"],
    confirmReset: "Weka upya LocalPingu?", confirmResetText: "Hii hufuta mapendeleo ya jaribio kwenye kifaa hiki. Data yako ya biashara inasalama.", cancel: "Ghairi", confirm: "Weka upya",
    welcome: "Karibu LocalPingu", welcomeText: "Fahamu wageni, jibu kwa uhakika, na uhifadhi maarifa ya biashara mahali pamoja.", continue: "Endelea", back: "Nyuma",
    chooseApp: "Chagua lugha ya programu", chooseAppText: "Unaweza kuibadilisha baadaye kwenye Mipangilio.", chooseLocal: "Unazungumza lugha gani?", chooseLocalText: "Wageni wanazungumza Kiingereza. LocalPingu inatafsiri kwa ajili yako.",
    businessSetup: "Weka biashara", businessSetupText: "Baada ya usanidi, unganisha wasifu wako wa Google na ongeza bidhaa na bei.", ready: "Uko tayari", readyText: "Msaidizi wako wa wageni wa Kiingereza yuko tayari. Maelezo ya biashara yanaweza kusawazishwa wakati wowote.", startApp: "Anza LocalPingu", skip: "Weka baadaye",
    businessName: "Jina la biashara yako", businessPlace: "kwa mf. Seaside Homestay", protected: "Binafsi kwenye akaunti yako", step: "Hatua",
    assistantFailed: "Imeshindikana. Tafadhali jaribu tena.", assistantEmpty: "Uliza swali au chagua mapendekezo.", typing: "anaandika…", offlineMode: "Hali ya nje ya mtandao – imehifadhiwa kwenye kifaa hiki. Ingia kwa Google kwa usawazishaji wa wingu.", offlineModeShort: "Hali ya nje ya mtandao – imehifadhiwa hapa.",
    assistantPlaceholder: "Bidhaa, bei au jibu…", unread: "hayajasomwa", replyPlaceholder: "Jibu kwa Kiingereza…", translate: "Tafsiri", hideTranslation: "Ficha tafsiri", draftReply: "Andaa jibu", noTranslation: "Hakuna tafsiri ya nje ya mtandao.",
  },
  vi: {
    notifications: "Thông báo", settings: "Cài đặt", assistant: "Trợ lý", speak: "Nói", chat: "Trò chuyện", business: "Kinh doanh",
    live: "Dịch trực tiếp", start: "Bắt đầu cuộc trò chuyện", guest: "Khách đang nói", tap: "Chạm để nói", listening: "Đang nghe…", speakInput: "Ngôn ngữ vào", speakOutput: "Ngôn ngữ ra",
    device: "Lời của bạn chỉ nằm trên thiết bị này.", natural: "Nói tự nhiên. Bản dịch hiện ngay lập tức.", micOn: "Micro đang bật", micOff: "Micro đã tắt",
    inbox: "Hộp thư", messages: "Tin nhắn của khách", new: "2 mới", smart: "Trả lời thông minh", smartText: "Soạn câu trả lời tiếng Anh rõ ràng từ thông tin kinh doanh đã lưu.", reply: "Nhập trả lời…",
    insights: "Thông tin hữu ích", allCaught: "Bạn đã xem hết", profileAlert: "Hoàn tất hồ sơ Google", profileAlertText: "Hồ sơ đầy đủ giúp LocalPingu trả lời khách chính xác.",
    demand: "Nhu cầu đang tăng", demandText: "Thứ Sáu và Thứ Bảy nhận nhiều yêu cầu nhất.", priceAlert: "Danh sách giá sẵn sàng", priceAlertText: "Giá đã lưu giờ có thể dùng trong bản nháp trả lời.",
    appLanguage: "Ngôn ngữ ứng dụng", localLanguage: "Ngôn ngữ của bạn", preferences: "Tùy chọn", currency: "Tiền tệ", reset: "Đặt lại ứng dụng", resetText: "Khởi động lại demo và hướng dẫn trên thiết bị này.",
    suggestions: ["Thêm tour chèo kayak 250000", "Đổi bữa sáng thành 60000", "Soạn trả lời cho khách"],
    confirmReset: "Đặt lại LocalPingu?", confirmResetText: "Thao tác này xóa tùy chọn demo trên thiết bị. Dữ liệu kinh doanh của bạn vẫn an toàn.", cancel: "Hủy", confirm: "Đặt lại",
    welcome: "Chào mừng đến với LocalPingu", welcomeText: "Hiểu khách, trả lời tự tin và giữ kiến thức kinh doanh tại một nơi.", continue: "Tiếp tục", back: "Quay lại",
    chooseApp: "Chọn ngôn ngữ ứng dụng", chooseAppText: "Bạn có thể đổi sau trong Cài đặt.", chooseLocal: "Bạn nói ngôn ngữ nào?", chooseLocalText: "Khách nói tiếng Anh. LocalPingu dịch giúp bạn.",
    businessSetup: "Thiết lập kinh doanh", businessSetupText: "Sau thiết lập, kết nối hồ sơ Google và thêm sản phẩm, giá.", ready: "Bạn đã sẵn sàng", readyText: "Trợ lý khách tiếng Anh đã sẵn sàng. Thông tin kinh doanh có thể đồng bộ bất cứ lúc nào.", startApp: "Mở LocalPingu", skip: "Thiết lập sau",
    businessName: "Tên doanh nghiệp của bạn", businessPlace: "vd. Seaside Homestay", protected: "Riêng tư trong tài khoản của bạn", step: "Bước",
    assistantFailed: "Thất bại. Vui lòng thử lại.", assistantEmpty: "Đặt câu hỏi hoặc chọn gợi ý.", typing: "đang viết…", offlineMode: "Chế độ ngoại tuyến – đã lưu trên thiết bị này. Đăng nhập Google để đồng bộ đám mây.", offlineModeShort: "Chế độ ngoại tuyến – lưu trên máy.",
    assistantPlaceholder: "Sản phẩm, giá hoặc trả lời…", unread: "chưa đọc", replyPlaceholder: "Trả lời bằng tiếng Anh…", translate: "Dịch", hideTranslation: "Ẩn bản dịch", draftReply: "Soạn trả lời", noTranslation: "Không có bản dịch ngoại tuyến.",
  },
  th: {
    notifications: "การแจ้งเตือน", settings: "การตั้งค่า", assistant: "ผู้ช่วย", speak: "พูด", chat: "แชท", business: "ธุรกิจ",
    live: "แปลสด", start: "เริ่มบทสนทนา", guest: "แขกกำลังพูด", tap: "แตะเพื่อพูด", listening: "กำลังฟัง…", speakInput: "ภาษาเข้า", speakOutput: "ภาษาออก",
    device: "คำพูดของคุณอยู่บนอุปกรณ์นี้เท่านั้น", natural: "พูดตามธรรมชาติ คำแปลจะปรากฏทันที", micOn: "ไมค์เปิด", micOff: "ไมค์ปิด",
    inbox: "กล่องข้อความ", messages: "ข้อความจากแขก", new: "ใหม่ 2", smart: "ตอบฉลาด", smartText: "ร่างคำตอบภาษาอังกฤษที่ชัดเจนจากข้อมูลธุรกิจที่บันทึกไว้", reply: "พิมพ์คำตอบ…",
    insights: "ข้อมูลที่เป็นประโยชน์", allCaught: "ดูครบแล้ว", profileAlert: "ทำโปรไฟล์ Google ให้สมบูรณ์", profileAlertText: "โปรไฟล์ที่ครบช่วย LocalPingu ตอบแขกได้แม่นยำ",
    demand: "ความต้องการเพิ่มขึ้น", demandText: "วันศุกร์และเสาร์มีคำขอมากที่สุด", priceAlert: "ราคาพร้อมแล้ว", priceAlertText: "ราคาที่บันทึกไว้ใช้ในร่างคำตอบได้แล้ว",
    appLanguage: "ภาษาของแอป", localLanguage: "ภาษาของคุณ", preferences: "การตั้งค่าภาษา", currency: "สกุลเงิน", reset: "รีเซ็ตแอป", resetText: "เริ่มเดโมและการตั้งค่าใหม่บนอุปกรณ์นี้",
    suggestions: ["เพิ่มทัวร์คายัค 250000", "เปลี่ยนอาหารเช้าเป็น 60000", "ร่างตอบแขก"],
    confirmReset: "รีเซ็ต LocalPingu?", confirmResetText: "จะลบการตั้งค่าเดโมบนอุปกรณ์นี้ ข้อมูลธุรกิจของคุณปลอดภัย", cancel: "ยกเลิก", confirm: "รีเซ็ต",
    welcome: "ยินดีต้อนรับสู่ LocalPingu", welcomeText: "เข้าใจแขก ตอบอย่างมั่นใจ และเก็บข้อมูลธุรกิจไว้ที่เดียว", continue: "ต่อไป", back: "ย้อนกลับ",
    chooseApp: "เลือกภาษาของแอป", chooseAppText: "เปลี่ยนภายหลังได้ในการตั้งค่า", chooseLocal: "คุณพูดภาษาอะไร?", chooseLocalText: "แขกพูดภาษาอังกฤษ LocalPingu แปลให้คุณ",
    businessSetup: "ตั้งค่าธุรกิจ", businessSetupText: "หลังตั้งค่า เชื่อมโปรไฟล์ Google และเพิ่มสินค้าและราคา", ready: "คุณพร้อมแล้ว", readyText: "ผู้ช่วยแขกภาษาอังกฤษพร้อมใช้งาน ซิงก์ข้อมูลธุรกิจได้ตลอดเวลา", startApp: "เริ่ม LocalPingu", skip: "ตั้งค่าภายหลัง",
    businessName: "ชื่อธุรกิจของคุณ", businessPlace: "เช่น Seaside Homestay", protected: "ส่วนตัวในบัญชีของคุณ", step: "ขั้น",
    assistantFailed: "ล้มเหลว โปรดลองอีกครั้ง", assistantEmpty: "ถามคำถามหรือเลือกคำแนะนำ", typing: "กำลังพิมพ์…", offlineMode: "โหมดออฟไลน์ – บันทึกบนอุปกรณ์นี้ ลงชื่อด้วย Google เพื่อซิงก์คลาวด์", offlineModeShort: "โหมดออฟไลน์ – บันทึกในเครื่อง",
    assistantPlaceholder: "สินค้า ราคา หรือคำตอบ…", unread: "ยังไม่อ่าน", replyPlaceholder: "ตอบเป็นภาษาอังกฤษ…", translate: "แปล", hideTranslation: "ซ่อนคำแปล", draftReply: "ร่างคำตอบ", noTranslation: "ไม่มีคำแปลออฟไลน์",
  },
  ar: {
    notifications: "الإشعارات", settings: "الإعدادات", assistant: "المساعد", speak: "تحدث", chat: "محادثة", business: "الأعمال",
    live: "ترجمة فورية", start: "ابدأ محادثة", guest: "الضيف يتحدث", tap: "اضغط للتحدث", listening: "أسمع…", speakInput: "لغة الإدخال", speakOutput: "لغة الإخراج",
    device: "كلماتك تبقى على هذا الجهاز.", natural: "تحدث بشكل طبيعي. تظهر الترجمة فوراً.", micOn: "الميكروفون مفتوح", micOff: "الميكروفون مغلق",
    inbox: "صندوق الوارد", messages: "رسائل الضيوف", new: "2 جديد", smart: "رد ذكي", smartText: "اكتب رداً واضحاً بالإنجليزية باستخدام بيانات عملك المحفوظة.", reply: "اكتب رداً…",
    insights: "معلومات مفيدة", allCaught: "شاهدت كل شيء", profileAlert: "أكمل ملفك على Google", profileAlertText: "الملف الكامل يساعد LocalPingu على الرد على الضيوف بدقة.",
    demand: "الطلب يزداد", demandText: "الجمعة والسبت تحصلان على معظم الطلبات.", priceAlert: "قائمة الأسعار جاهزة", priceAlertText: "الأسعار المحفوظة يمكن استخدامها الآن في مسودات الردود.",
    appLanguage: "لغة التطبيق", localLanguage: "لغتك", preferences: "التفضيلات", currency: "العملة", reset: "إعادة تعيين التطبيق", resetText: "إعادة تشغيل العرض التجريبي والإعداد على هذا الجهاز.",
    suggestions: ["أضف جولة كاياك بـ 250000", "غيّر الإفطار إلى 60000", "مسودة رد للضيف"],
    confirmReset: "إعادة تعيين LocalPingu؟", confirmResetText: "يؤدي هذا إلى مسح تفضيلات العرض التجريبي على هذا الجهاز. بيانات عملك تبقى آمنة.", cancel: "إلغاء", confirm: "إعادة تعيين",
    welcome: "مرحباً بك في LocalPingu", welcomeText: "افهم الضيوف، ورد بثقة، واحتفظ بمعرفة عملك في مكان واحد.", continue: "متابعة", back: "رجوع",
    chooseApp: "اختر لغة التطبيق", chooseAppText: "يمكنك تغييرها لاحقاً في الإعدادات.", chooseLocal: "أي لغة تتحدث؟", chooseLocalText: "الضيوف يتحدثون الإنجليزية. LocalPingu يترجم لك.",
    businessSetup: "إعداد عملك", businessSetupText: "بعد الإعداد، اربط ملفك على Google وأضف المنتجات والأسعار.", ready: "أنت جاهز", readyText: "مساعد الضيوف بالإنجليزية جاهز. يمكن مزامنة بيانات العمل في أي وقت.", startApp: "ابدأ LocalPingu", skip: "الإعداد لاحقاً",
    businessName: "اسم عملك", businessPlace: "مثال Seaside Homestay", protected: "خاص في حسابك", step: "خطوة",
    assistantFailed: "فشل. حاول مجدداً.", assistantEmpty: "اطرح سؤالاً أو اختر اقتراحاً.", typing: "يكتب…", offlineMode: "وضع بلا اتصال – محفوظ على هذا الجهاز. سجّل الدخول عبر Google للمزامنة السحابية.", offlineModeShort: "وضع بلا اتصال – محفوظ محلياً.",
    assistantPlaceholder: "منتج أو سعر أو رد…", unread: "غير مقروءة", replyPlaceholder: "رد بالإنجليزية…", translate: "ترجم", hideTranslation: "إخفاء الترجمة", draftReply: "اكتب مسودة الرد", noTranslation: "لا توجد ترجمة بلا اتصال.",
  },
  fr: {
    notifications: "Notifications", settings: "Réglages", assistant: "Assistant", speak: "Parler", chat: "Chat", business: "Commerce",
    live: "Traduction en direct", start: "Démarrer une conversation", guest: "Le client parle", tap: "Appuyez pour parler", listening: "J'écoute…", speakInput: "Langue d'entrée", speakOutput: "Langue de sortie",
    device: "Vos mots restent sur cet appareil.", natural: "Parlez naturellement. La traduction apparaît instantanément.", micOn: "Micro activé", micOff: "Micro coupé",
    inbox: "Boîte de réception", messages: "Messages des clients", new: "2 nouveaux", smart: "Réponse intelligente", smartText: "Rédigez une réponse claire en anglais à partir de vos données d'entreprise.", reply: "Saisir une réponse…",
    insights: "Conseils utiles", allCaught: "Vous êtes à jour", profileAlert: "Complétez votre profil Google", profileAlertText: "Un profil complet aide LocalPingu à répondre aux clients avec précision.",
    demand: "La demande augmente", demandText: "Vendredi et samedi reçoivent le plus de demandes.", priceAlert: "Liste de prix prête", priceAlertText: "Vos prix enregistrés peuvent maintenant être utilisés dans les brouillons de réponses.",
    appLanguage: "Langue de l'application", localLanguage: "Votre langue", preferences: "Préférences", currency: "Devise", reset: "Réinitialiser l'application", resetText: "Redémarrer la démo et l'introduction sur cet appareil.",
    suggestions: ["Ajouter kayak pour 250000", "Modifier le petit-déjeuner à 60000", "Rédiger une réponse client"],
    confirmReset: "Réinitialiser LocalPingu ?", confirmResetText: "Les préférences de démo sont effacées sur cet appareil. Vos données d'entreprise restent en sécurité.", cancel: "Annuler", confirm: "Réinitialiser",
    welcome: "Bienvenue sur LocalPingu", welcomeText: "Comprenez les clients, répondez avec assurance et gardez vos données d'entreprise au même endroit.", continue: "Continuer", back: "Retour",
    chooseApp: "Choisissez la langue de l'application", chooseAppText: "Vous pourrez la modifier plus tard dans les Réglages.", chooseLocal: "Quelle langue parlez-vous ?", chooseLocalText: "Les clients parlent anglais. LocalPingu traduit pour vous.",
    businessSetup: "Configurez votre commerce", businessSetupText: "Connectez votre profil Google et ajoutez produits et prix après la configuration.", ready: "Tout est prêt", readyText: "Votre assistant clients en anglais est prêt. Les données d'entreprise peuvent être synchronisées à tout moment.", startApp: "Démarrer LocalPingu", skip: "Configurer plus tard",
    businessName: "Nom de votre commerce", businessPlace: "ex. Seaside Homestay", protected: "Privé dans votre compte", step: "Étape",
    assistantFailed: "Échec. Veuillez réessayer.", assistantEmpty: "Posez une question ou choisissez une suggestion.", typing: "écrit…", offlineMode: "Mode hors ligne – enregistré sur cet appareil. Connectez-vous avec Google pour la synchronisation.", offlineModeShort: "Mode hors ligne – enregistré localement.",
    assistantPlaceholder: "Produit, prix ou réponse client…", unread: "non lus", replyPlaceholder: "Réponse en anglais…", translate: "Traduire", hideTranslation: "Masquer la traduction", draftReply: "Rédiger une réponse", noTranslation: "Pas de traduction hors ligne disponible.",
  },
  es: {
    notifications: "Notificaciones", settings: "Ajustes", assistant: "Asistente", speak: "Hablar", chat: "Chat", business: "Negocio",
    live: "Traducción en vivo", start: "Iniciar una conversación", guest: "El huésped habla", tap: "Toca para hablar", listening: "Te escucho…", speakInput: "Idioma de entrada", speakOutput: "Idioma de salida",
    device: "Tus palabras se quedan en este dispositivo.", natural: "Habla con naturalidad. La traducción aparece al instante.", micOn: "Micrófono activado", micOff: "Micrófono silenciado",
    inbox: "Bandeja de entrada", messages: "Mensajes de huéspedes", new: "2 nuevos", smart: "Respuesta inteligente", smartText: "Redacta una respuesta clara en inglés con los datos de tu negocio.", reply: "Escribe una respuesta…",
    insights: "Consejos útiles", allCaught: "Estás al día", profileAlert: "Completa tu perfil de Google", profileAlertText: "Un perfil completo ayuda a LocalPingu a responder a los huéspedes con precisión.",
    demand: "La demanda aumenta", demandText: "Viernes y sábado reciben la mayoría de solicitudes.", priceAlert: "Lista de precios lista", priceAlertText: "Tus precios guardados ya se pueden usar en borradores de respuestas.",
    appLanguage: "Idioma de la aplicación", localLanguage: "Tu idioma", preferences: "Preferencias", currency: "Moneda", reset: "Restablecer la aplicación", resetText: "Reiniciar la demo y la configuración en este dispositivo.",
    suggestions: ["Añadir tour en kayak por 250000", "Cambiar desayuno a 60000", "Borrador de respuesta para huésped"],
    confirmReset: "¿Restablecer LocalPingu?", confirmResetText: "Esto borra las preferencias de demo en este dispositivo. Tus datos del negocio quedan a salvo.", cancel: "Cancelar", confirm: "Restablecer",
    welcome: "Bienvenido a LocalPingu", welcomeText: "Entiende a los huéspedes, responde con seguridad y mantén tu información del negocio en un solo lugar.", continue: "Continuar", back: "Atrás",
    chooseApp: "Elige el idioma de la aplicación", chooseAppText: "Puedes cambiarlo más tarde en Ajustes.", chooseLocal: "¿Qué idioma hablas?", chooseLocalText: "Los huéspedes hablan inglés. LocalPingu traduce por ti.",
    businessSetup: "Configura tu negocio", businessSetupText: "Conecta tu perfil de Google y añade productos y precios tras la configuración.", ready: "Todo listo", readyText: "Tu asistente de huéspedes en inglés está listo. Los datos del negocio se pueden sincronizar en cualquier momento.", startApp: "Iniciar LocalPingu", skip: "Configurar más tarde",
    businessName: "Nombre de tu negocio", businessPlace: "p. ej. Seaside Homestay", protected: "Privado en tu cuenta", step: "Paso",
    assistantFailed: "Falló. Inténtalo de nuevo.", assistantEmpty: "Haz una pregunta o elige una sugerencia.", typing: "escribiendo…", offlineMode: "Modo sin conexión – guardado en este dispositivo. Inicia sesión con Google para sincronizar.", offlineModeShort: "Modo sin conexión – guardado localmente.",
    assistantPlaceholder: "Producto, precio o respuesta…", unread: "sin leer", replyPlaceholder: "Respuesta en inglés…", translate: "Traducir", hideTranslation: "Ocultar traducción", draftReply: "Redactar respuesta", noTranslation: "No hay traducción sin conexión disponible.",
  },
};

const LOCAL_LANGUAGES: string[] = languages.map((language) => language.name);
function languageCode(name: string): LanguageCode {
  return languages.find((language) => language.name === name)?.code ?? "id";
}
function whisperLanguage(name: string): string | undefined {
  if (name === "English") return "en";
  const code = languageCode(name);
  return code === "bi" ? undefined : code;
}
function blankProfile(language: LanguageCode): BusinessProfile {
  return { id: "main", language, name: "", owner: "", description: "", openingHours: "", service: "", price: null, currency: "IDR", checkIn: "", capacity: null, location: "", allergyPolicy: "", cancellationPolicy: "", updatedAt: new Date().toISOString() };
}
const CURRENCIES = ["USD", "TZS", "IDR", "EUR", "SGD", "MYR", "AUD", "GBP"];
const APP_LANGUAGE_OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" }, { code: "de", label: "Deutsch" }, { code: "id", label: "Bahasa Indonesia" }, { code: "bn", label: "বাংলা" }, { code: "hi", label: "हिन्दी" }, { code: "ta", label: "தமிழ்" }, { code: "sw", label: "Kiswahili" }, { code: "vi", label: "Tiếng Việt" }, { code: "th", label: "ไทย" }, { code: "ar", label: "العربية" }, { code: "fr", label: "Français" }, { code: "es", label: "Español" },
];


export default function ZipFrontend() {
  const [tab, setTab] = useState<Tab>("speak");
  const [utilityView, setUtilityView] = useState<UtilityView>(null);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [onboardingBusiness, setOnboardingBusiness] = useState(NOOR_PROFILE.name);
  const [speakText, setSpeakText] = useState("");
  const [speakTranslation, setSpeakTranslation] = useState("");
  const [speakBusy, setSpeakBusy] = useState(false);
  const [speakNotice, setSpeakNotice] = useState("");
  const [translateMode, setTranslateMode] = useState<"voice" | "text">("text");
  const [micMuted, setMicMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const [speechModelBusy, setSpeechModelBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [speakInputOpen, setSpeakInputOpen] = useState(false);
  const [speakInputLanguage, setSpeakInputLanguage] = useState("English");
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [textInputLanguage, setTextInputLanguage] = useState("English");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [localLanguage, setLocalLanguage] = useState("Kiswahili");
  const localLanguageRef = useRef(localLanguage);
  localLanguageRef.current = localLanguage;
  const [packReady, setPackReady] = useState(false);
  const [reversePackReady, setReversePackReady] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [packNotice, setPackNotice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [profile, setProfile] = useState<BusinessProfile>(() => ({ ...NOOR_PROFILE }));
  const [message, setMessage] = useState("");
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [businessView, setBusinessView] = useState<BusinessView>("overview");
  const [businessName, setBusinessName] = useState(NOOR_PROFILE.name);
  const [businessAddress, setBusinessAddress] = useState(NOOR_PROFILE.location);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState<Product[]>(NOOR_PRODUCTS);
  const [prices, setPrices] = useState<PriceItem[]>(NOOR_PRICES);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [productName, setProductName] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [deviceLevel, setDeviceLevel] = useState(1);
  const [modelEvents, setModelEvents] = useState<ModelEvent[]>(() => [
    { id: "runtime", time: new Date().toLocaleTimeString([], { hour12: false }), model: "Runtime", kind: "ready", message: "WASM workers ready · local inference only" },
    { id: "facts", time: new Date().toLocaleTimeString([], { hour12: false }), model: "Business Memory", kind: "ready", message: "Noor fact sheet and 4 verified offers loaded" },
  ]);
  const guest = useGuestThreads();
  const t = UI[appLanguage];
  const deviceProfile = DEVICE_PROFILES[deviceLevel] ?? DEVICE_PROFILES[1]!;

  function traceModel(model: string, kind: ModelEventKind, message: string) {
    const event: ModelEvent = { id: crypto.randomUUID(), time: new Date().toLocaleTimeString([], { hour12: false }), model, kind, message };
    setModelEvents((events) => [...events.slice(-39), event]);
  }

  function simulateDeviceLatency(baseMs: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, Math.round(baseMs * deviceProfile.factor)));
  }

  function selectDevice(level: number) {
    const profile = DEVICE_PROFILES[level] ?? DEVICE_PROFILES[1]!;
    setDeviceLevel(level);
    traceModel("Device simulator", "info", `${profile.name} selected · ${profile.detail} · ${profile.factor}× latency`);
  }

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  useEffect(() => {
    let alive = true;
    void hasSpeechModel().then((ready) => { if (alive) setSpeechReady(ready); });
    return () => {
      alive = false;
      if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("lokalpingu-app-language");
    const storedLocal = window.localStorage.getItem("lokalpingu-local-language");
    const storedCurrency = window.localStorage.getItem("lokalpingu-currency");
    setAppLanguage(storedLanguage && storedLanguage in UI ? (storedLanguage as AppLanguage) : "en");
    if (storedLocal && LOCAL_LANGUAGES.includes(storedLocal)) setLocalLanguage(storedLocal);
    if (storedCurrency && CURRENCIES.includes(storedCurrency)) setCurrency(storedCurrency);
    setOnboardingComplete(window.localStorage.getItem("lokalpingu-onboarding") === "complete");
  }, []);

  function updateAppLanguage(language: AppLanguage) {
    setAppLanguage(language);
    window.localStorage.setItem("lokalpingu-app-language", language);
  }

  function updateLocalLanguage(language: string) {
    setLocalLanguage(language);
    setPackNotice("");
    window.localStorage.setItem("lokalpingu-local-language", language);
  }

  useEffect(() => {
    let alive = true;
    setPackReady(false);
    setReversePackReady(false);
    setSpeakTranslation("");
    setSpeakNotice("");
    void Promise.all([hasLanguagePack(languageCode(localLanguage)), hasReverseLanguagePack(languageCode(localLanguage))]).then(([forward, reverse]) => { if (alive) { setPackReady(forward); setReversePackReady(reverse); } });
    return () => { alive = false; };
  }, [localLanguage]);

  async function downloadPack() {
    const selected = localLanguage;
    setPackBusy(true);
    setPackNotice(`Loading ${selected} model from this app…`);
    traceModel("OPUS-MT", "run", `Loading English → ${selected} language pack`);
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
      await installLanguagePack(languageCode(selected));
      const ready = await hasLanguagePack(languageCode(selected));
      if (selected === localLanguageRef.current) {
        setPackReady(ready);
        setPackNotice(ready ? "Offline model ready on this device." : "Model check failed. Try again.");
      }
      traceModel("OPUS-MT", ready ? "ready" : "error", ready ? `English → ${selected} ready offline` : `English → ${selected} model check failed`);
    } catch (error) {
      if (selected === localLanguageRef.current) setPackNotice(error instanceof Error ? error.message : "Model download failed.");
      traceModel("OPUS-MT", "error", error instanceof Error ? error.message : "Model download failed");
    } finally {
      setPackBusy(false);
    }
  }

  async function downloadReversePack() {
    const selected = localLanguage;
    setPackBusy(true);
    setPackNotice(`Loading ${selected} to English model from this app…`);
    traceModel("OPUS-MT", "run", `Loading ${selected} → English language pack`);
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
      await installReverseLanguagePack(languageCode(selected));
      const ready = await hasReverseLanguagePack(languageCode(selected));
      if (selected === localLanguageRef.current) {
        setReversePackReady(ready);
        setPackNotice(ready ? "Offline model ready on this device." : "Model check failed. Try again.");
      }
      traceModel("OPUS-MT", ready ? "ready" : "error", ready ? `${selected} → English ready offline` : `${selected} → English model check failed`);
    } catch (error) {
      if (selected === localLanguageRef.current) setPackNotice(error instanceof Error ? error.message : "Model download failed.");
      traceModel("OPUS-MT", "error", error instanceof Error ? error.message : "Model download failed");
    } finally {
      setPackBusy(false);
    }
  }

  async function translateText() {
    if (!speakText.trim()) return;
    const toEnglish = textInputLanguage !== "English";
    const selectedPackReady = toEnglish ? reversePackReady : packReady;
    if (!selectedPackReady) { setSpeakNotice("Download the selected offline model first."); return; }
    const selected = localLanguage;
    const modelLabel = `OPUS-MT ${toEnglish ? `${selected}→English` : `English→${selected}`}`;
    setSpeakBusy(true);
    setSpeakNotice("");
    traceModel(modelLabel, "run", `Input: “${speakText.trim().slice(0, 140)}”`);
    const started = performance.now();
    try {
      await simulateDeviceLatency(800);
      const result = toEnglish ? await translateToEnglish(languageCode(selected), speakText.trim()) : await translateEnglish(languageCode(selected), speakText.trim());
      if (selected !== localLanguageRef.current) return;
      setSpeakTranslation(result);
      traceModel(modelLabel, "output", `${Math.round(performance.now() - started)} ms · “${result.slice(0, 180)}”`);
      const normalized = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
      setSpeakNotice(normalized(result) === normalized(speakText) ? "Translation repeated the input. Check with a person." : "Check price, dates and allergies against the original message.");
    } catch (error) {
      setSpeakNotice(error instanceof Error ? error.message : "Translation failed.");
      traceModel(modelLabel, "error", error instanceof Error ? error.message : "Translation failed");
    } finally {
      setSpeakBusy(false);
    }
  }

  async function downloadSpeechPack() {
    setSpeechModelBusy(true);
    setSpeakNotice("Loading Whisper Tiny speech model from this app…");
    traceModel("Whisper Tiny q8", "run", "Loading local speech model");
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
      await installSpeechModel();
      const ready = await hasSpeechModel();
      setSpeechReady(ready);
      setSpeakNotice(ready ? "Offline speech model ready on this device." : "Speech model check failed. Try again.");
      traceModel("Whisper Tiny q8", ready ? "ready" : "error", ready ? "Speech recognition ready offline" : "Speech model check failed");
    } catch (error) {
      setSpeakNotice(error instanceof Error ? error.message : "Speech model download failed.");
      traceModel("Whisper Tiny q8", "error", error instanceof Error ? error.message : "Speech model download failed");
    } finally {
      setSpeechModelBusy(false);
    }
  }

  function stopRecording() {
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }

  async function processVoiceRecording(blob: Blob, inputLanguage: string) {
    setSpeakBusy(true);
    setSpeakNotice("Transcribing on this device…");
    traceModel("Whisper Tiny q8", "run", `Transcribing ${inputLanguage} audio on device`);
    const speechStarted = performance.now();
    try {
      const audio = await decodeRecordedAudio(blob);
      if (audio.length < 3_200) throw new Error("Recording was too short. Speak for at least one second.");
      await simulateDeviceLatency(1_200);
      const transcript = await transcribeAudio(audio, whisperLanguage(inputLanguage));
      traceModel("Whisper Tiny q8", "output", `${Math.round(performance.now() - speechStarted)} ms · Transcript: “${transcript.slice(0, 180)}”`);
      setSpeakText(transcript);
      setSpeakTranslation("");
      const toEnglish = inputLanguage !== "English";
      const translationReady = toEnglish ? reversePackReady : packReady;
      if (!translationReady) {
        setSpeakNotice(`Transcript ready. Download the ${toEnglish ? `${localLanguage} to English` : `English to ${localLanguage}`} translation model.`);
        return;
      }
      setSpeakNotice("Translating on this device…");
      const modelLabel = `OPUS-MT ${toEnglish ? `${localLanguage}→English` : `English→${localLanguage}`}`;
      traceModel(modelLabel, "run", `Input: “${transcript.slice(0, 140)}”`);
      const translationStarted = performance.now();
      await simulateDeviceLatency(800);
      const translated = toEnglish
        ? await translateToEnglish(languageCode(localLanguage), transcript)
        : await translateEnglish(languageCode(localLanguage), transcript);
      setSpeakTranslation(translated);
      traceModel(modelLabel, "output", `${Math.round(performance.now() - translationStarted)} ms · “${translated.slice(0, 180)}”`);
      setSpeakNotice("Speech and translation stayed on this device.");
    } catch (error) {
      setSpeakNotice(error instanceof Error ? error.message : "Speech recognition failed.");
      traceModel("Voice pipeline", "error", error instanceof Error ? error.message : "Speech recognition failed");
    } finally {
      setSpeakBusy(false);
    }
  }

  async function startRecording() {
    if (micMuted || speakBusy || speechModelBusy) return;
    if (!speechReady) { setSpeakNotice("Download the offline speech model first."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSpeakNotice("Microphone recording is unavailable in this browser.");
      return;
    }
    try {
      const inputLanguage = speakInputLanguage;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recordingChunksRef.current = [];
        void processVoiceRecording(blob, inputLanguage);
      };
      recorder.start();
      setSpeakText("");
      setSpeakTranslation("");
      setSpeakNotice("Listening… Tap again to stop. Maximum 30 seconds.");
      setRecording(true);
      recordingTimerRef.current = window.setTimeout(stopRecording, 30_000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setSpeakNotice(error instanceof Error ? error.message : "Microphone permission was denied.");
    }
  }

  function updateCurrency(next: string) {
    setCurrency(next);
    window.localStorage.setItem("lokalpingu-currency", next);
  }

  async function finishOnboarding() {
    const next = { ...profile, name: onboardingBusiness.trim(), language: languageCode(localLanguage), currency, updatedAt: new Date().toISOString() };
    try {
      await saveProfile(next);
      setProfile(next);
      setBusinessName(next.name || "Your business");
      setBusinessAddress(next.location || "Saved on this device");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Business profile could not be saved.");
      return;
    }
    window.localStorage.setItem("lokalpingu-onboarding", "complete");
    setOnboardingComplete(true);
    setOnboardingStep(0);
  }

  function resetApp() {
    window.localStorage.removeItem("lokalpingu-onboarding");
    window.localStorage.removeItem("lokalpingu-app-language");
    window.localStorage.removeItem("lokalpingu-local-language");
    window.localStorage.removeItem("lokalpingu-currency");
    setAppLanguage("en");
    setLocalLanguage("Kiswahili");
    setCurrency("USD");
    setOnboardingBusiness(NOOR_PROFILE.name);
    setUtilityView(null);
    setResetConfirm(false);
    setOnboardingStep(0);
    setOnboardingComplete(false);
  }

  useEffect(() => {
    let alive = true;
    async function loadBusiness() {
      try {
      let [savedProfile, storedProducts, storedPrices, storedBookings] = await Promise.all([getProfile(), listProducts(), listPrices(), listBookings()]);
      if (!alive) return;
      let nextProducts = storedProducts;
      let nextPrices = storedPrices;
      const oldProducts = readLocal<Product>(LOCAL_PRODUCTS_KEY);
      const oldPrices = readLocal<PriceItem>(LOCAL_PRICES_KEY);
      if ((!storedProducts.length && oldProducts.length) || (!storedPrices.length && oldPrices.length)) {
        nextProducts = storedProducts.length ? storedProducts : oldProducts;
        nextPrices = storedPrices.length ? storedPrices : oldPrices;
        await replaceCatalog(nextProducts, nextPrices);
      }
      if (oldProducts.length || oldPrices.length) {
        window.localStorage.removeItem(LOCAL_PRODUCTS_KEY);
        window.localStorage.removeItem(LOCAL_PRICES_KEY);
      }
      const profileIsEmpty = !savedProfile || (!savedProfile.name && !savedProfile.service && !savedProfile.location);
      const demoNotSeeded = !window.localStorage.getItem(DEMO_SEED_KEY);
      if (profileIsEmpty && !nextProducts.length && !nextPrices.length && demoNotSeeded) {
        savedProfile = { ...NOOR_PROFILE, updatedAt: new Date().toISOString() };
        nextProducts = NOOR_PRODUCTS.map((item) => ({ ...item }));
        nextPrices = NOOR_PRICES.map((item) => ({ ...item }));
        await Promise.all([saveProfile(savedProfile), replaceCatalog(nextProducts, nextPrices)]);
        window.localStorage.setItem(DEMO_SEED_KEY, "seeded");
        window.localStorage.setItem("lokalpingu-local-language", "Kiswahili");
        window.localStorage.setItem("lokalpingu-currency", "USD");
        setLocalLanguage("Kiswahili");
        setCurrency("USD");
      }
      if (savedProfile) {
        const completeProfile = { ...blankProfile(savedProfile.language), ...savedProfile };
        setProfile(completeProfile);
        setBusinessName(completeProfile.name || "Your business");
        setOnboardingBusiness(completeProfile.name);
        setBusinessAddress(completeProfile.location || "Saved on this device");
      }
      if (alive) { setProducts(nextProducts); setPrices(nextPrices); setBookings(storedBookings); }
      } catch (error) {
        if (alive) setNotice(error instanceof Error ? error.message : "Local business data could not be loaded.");
      }
    }
    void loadBusiness();
    return () => { alive = false; };
  }, []);

  async function saveFacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...profile, language: languageCode(localLanguage), currency, updatedAt: new Date().toISOString() };
    try {
      await saveProfile(next);
      setProfile(next);
      setBusinessName(next.name || "Your business");
      setBusinessAddress(next.location || "Saved on this device");
      setNotice("Confirmed business facts saved on this device.");
      setBusinessView("overview");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Business profile could not be saved.");
    }
  }

  async function deleteBusiness() {
    if (!window.confirm("Delete the business profile, catalog and saved interactions from this device?")) return;
    try {
      await clearBusinessData();
      window.localStorage.removeItem(LOCAL_PRODUCTS_KEY);
      window.localStorage.removeItem(LOCAL_PRICES_KEY);
      setProfile(blankProfile(languageCode(localLanguage)));
      setProducts([]); setPrices([]); setBookings([]);
      setBusinessName("Your business"); setBusinessAddress("Add location in business facts");
      setOnboardingBusiness("");
      setNotice("Local business data deleted.");
      setUtilityView(null);
      setBusinessView("overview");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Local business data could not be deleted.");
    }
  }

  async function addProduct() {
    if (!productName.trim()) return;
    const product: Product = { id: crypto.randomUUID(), name: productName.trim(), category: "Offer", description: "", active: true };
    try {
      await saveProduct(product);
      setProducts((items) => [...items, product]);
      setProductName("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Product could not be saved.");
    }
  }

  async function addPrice() {
    const amount = Number(priceValue);
    if (!priceLabel.trim() || !Number.isFinite(amount) || amount < 0) return;
    const price: PriceItem = { id: crypto.randomUUID(), label: priceLabel.trim(), price: amount, currency, unit: "item", active: true };
    try {
      await savePrice(price);
      setPrices((items) => [...items, price]);
      setPriceLabel(""); setPriceValue("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Price could not be saved.");
    }
  }

  async function askAssistant(override?: string) {
    const text = (override ?? message).trim();
    if (!text) return;
    setAssistantMessages((msgs) => [...msgs, { role: "user", text }]);
    setBusy(true);
    traceModel("Local Assistant · rules", "run", `Input: “${text.slice(0, 140)}”`);
    const started = performance.now();
    try {
      await simulateDeviceLatency(450);
      const [savedProducts, savedPrices] = await Promise.all([listProducts(), listPrices()]);
      const result = runLocalAssistant(text, appLanguage, savedProducts, savedPrices, businessName, currency);
      if (result.products !== savedProducts || result.prices !== savedPrices) await replaceCatalog(result.products, result.prices);
      setAssistantMessages((msgs) => [...msgs, { role: "assistant", text: result.reply }]);
      traceModel("Local Assistant · rules", "output", `${Math.round(performance.now() - started)} ms · Reply: “${result.reply.slice(0, 180)}”`);
      setProducts(result.products); setPrices(result.prices);
      setMessage("");
    } catch (error) {
      setAssistantMessages((msgs) => [...msgs, { role: "assistant", text: t.assistantFailed }]);
      traceModel("Local Assistant · rules", "error", error instanceof Error ? error.message : t.assistantFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-app-shell text-foreground sm:grid sm:place-content-center sm:p-5 lg:grid-cols-[430px_minmax(420px,560px)] lg:gap-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-background sm:h-[min(844px,calc(100dvh-40px))] sm:rounded-[2rem] sm:border sm:border-border sm:shadow-app">
        {onboardingComplete && <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 items-center gap-2.5">
             <div className="flex min-w-0 items-center gap-1.5"><LocalPinguWordmark className="text-[1.65rem]" /><span role="status" aria-label={online ? "Online" : "Offline"} title={online ? "Online" : "Offline"} className={`shrink-0 ${online ? "text-success" : "text-muted-foreground"}`}>{online ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}</span></div>
          </div>
          <div className="flex items-center gap-1">
             <Button variant="ghost" size="icon" aria-label={t.notifications} title={t.notifications} onClick={() => setUtilityView((view) => view === "notifications" ? null : "notifications")} className={`relative shrink-0 rounded-xl ${utilityView === "notifications" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><Bell className="size-5" /></Button>
            <Button variant="ghost" size="icon" aria-label={t.settings} title={t.settings} onClick={() => setUtilityView((view) => view === "settings" ? null : "settings")} className={`shrink-0 rounded-xl ${utilityView === "settings" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><Settings className="size-5" /></Button>
          </div>
        </header>}

        <main className={`min-h-0 flex-1 overflow-hidden px-5 pb-2 ${onboardingComplete ? "pt-2" : "pt-[max(1rem,env(safe-area-inset-top))]"}`}>
          {!onboardingComplete ? <Onboarding step={onboardingStep} setStep={setOnboardingStep} appLanguage={appLanguage} setAppLanguage={updateAppLanguage} localLanguage={localLanguage} setLocalLanguage={updateLocalLanguage} businessName={onboardingBusiness} setBusinessName={setOnboardingBusiness} finish={() => void finishOnboarding()} t={t} /> : utilityView === "notifications" ? <NotificationsView t={t} /> : utilityView === "settings" ? <SettingsView t={t} appLanguage={appLanguage} setAppLanguage={updateAppLanguage} localLanguage={localLanguage} setLocalLanguage={updateLocalLanguage} packReady={packReady} packBusy={packBusy} packNotice={packNotice} downloadPack={downloadPack} deleteBusiness={() => void deleteBusiness()} currency={currency} setCurrency={updateCurrency} resetConfirm={resetConfirm} setResetConfirm={setResetConfirm} resetApp={resetApp} /> : <>
          <section className={`${tab === "assistant" ? "flex animate-in fade-in slide-in-from-bottom-1" : "hidden"} h-full min-h-0 flex-col`} aria-label={t.assistant}>
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                {assistantMessages.length === 0 && !busy && <p className="mt-6 text-center text-sm font-semibold text-muted-foreground">{t.assistantEmpty}</p>}
                {assistantMessages.map((m, i) => m.role === "user"
                  ? <div key={i} className="ml-10 self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card">{m.text}</div>
                  : <div key={i} className="mr-6 flex items-start gap-2"><span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></span><p className="whitespace-pre-line text-sm font-medium leading-relaxed">{m.text}</p></div>)}
                {busy && <div className="mr-6 flex items-start gap-2"><span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></span><p className="text-sm font-medium text-muted-foreground">{t.typing}</p></div>}
              </div>
              {assistantMessages.length === 0 && !busy && <div className="flex flex-wrap gap-2">{t.suggestions.map((s) => <Button key={s} type="button" variant="outline" disabled={busy} onClick={() => void askAssistant(s)} className="h-auto rounded-full border-2 border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-accent hover:bg-accent-soft">{s}</Button>)}</div>}
              <div className="shrink-0 rounded-2xl bg-accent p-3 shadow-card">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-accent-foreground/80"><Cloud className="size-4" />{t.offlineModeShort}</p>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"><div className="relative"><textarea rows={1} value={message} disabled={busy} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askAssistant(); setAssistantExpanded(false); } }} placeholder={t.assistantPlaceholder} aria-expanded={assistantExpanded} className={`${assistantExpanded ? "h-[40vh] overflow-y-auto" : "h-12 overflow-hidden"} w-full min-w-0 resize-none rounded-xl border-2 border-accent-foreground/30 bg-sky-100 py-2 pl-3 pr-11 text-sm font-semibold text-slate-900 placeholder:text-slate-600 outline-none focus:border-accent-foreground/60`} /><Button type="button" size="icon" variant="ghost" onClick={() => setAssistantExpanded((x) => !x)} aria-label={assistantExpanded ? "Collapse input" : "Expand input"} className="absolute right-1.5 top-1.5 size-7 rounded-lg text-accent-foreground/80 hover:bg-accent-foreground/10">{assistantExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button></div><Button size="icon" aria-label="Send" title="Send" disabled={busy || !message.trim()} onClick={() => { void askAssistant(); setAssistantExpanded(false); }} className="size-12 rounded-xl bg-background text-accent hover:bg-background">{busy ? <RefreshCw className="size-5 animate-spin" /> : <Send className="size-5" />}</Button></div>
              </div>
            </section>
          <section className={`${tab === "speak" ? "flex animate-in fade-in slide-in-from-bottom-1" : "hidden"} h-full flex-col`} aria-label={t.translate}>
              <div role="tablist" aria-label={t.translate} className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border-2 border-border bg-card p-1 shadow-card">
                <button type="button" role="tab" aria-selected={translateMode === "voice"} onClick={() => { setTranslateMode("voice"); setLanguageOpen(false); setTextInputOpen(false); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${translateMode === "voice" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><Mic className="size-5" />{t.speak}</button>
                <button type="button" role="tab" aria-selected={translateMode === "text"} onClick={() => { setTranslateMode("text"); setSpeakInputOpen(false); setLanguageOpen(false); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${translateMode === "text" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><Languages className="size-5" />{t.translate}</button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {translateMode === "voice" ? <div className="relative">
                  <Button variant="outline" disabled={recording || speakBusy} onClick={() => { setSpeakInputOpen((open) => !open); setLanguageOpen(false); }} className="h-auto w-full justify-between rounded-2xl border-2 bg-card px-3 py-2.5 text-left shadow-card">
                    <span className="min-w-0"><span className="block text-xs font-semibold text-muted-foreground">{t.speakInput}</span><span className="block truncate font-bold">{speakInputLanguage}</span></span><ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${speakInputOpen ? "rotate-180" : ""}`} />
                  </Button>
                  {speakInputOpen && <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-56 overflow-y-auto rounded-2xl border-2 border-border bg-card p-2 shadow-app">{["English", ...LOCAL_LANGUAGES].map((language) => <Button key={language} variant="ghost" onClick={() => { setSpeakInputLanguage(language); if (language !== "English") updateLocalLanguage(language); setSpeakInputOpen(false); setSpeakText(""); setSpeakTranslation(""); }} className="w-full justify-between rounded-xl">{language}<Check className={`size-4 ${speakInputLanguage === language ? "opacity-100 text-primary" : "opacity-0"}`} /></Button>)}</div>}
                </div> : <div className="relative">
                  <Button variant="outline" onClick={() => { setTextInputOpen((open) => !open); setLanguageOpen(false); }} className="h-auto w-full justify-between rounded-2xl border-2 bg-card px-3 py-2.5 text-left shadow-card">
                    <span className="min-w-0"><span className="block text-xs font-semibold text-muted-foreground">{t.speakInput}</span><span className="block truncate font-bold">{textInputLanguage}</span></span><ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${textInputOpen ? "rotate-180" : ""}`} />
                  </Button>
                  {textInputOpen && <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-56 overflow-y-auto rounded-2xl border-2 border-border bg-card p-2 shadow-app">{["English", ...LOCAL_LANGUAGES].map((language) => <Button key={language} variant="ghost" onClick={() => { setTextInputLanguage(language); if (language !== "English") updateLocalLanguage(language); setTextInputOpen(false); setSpeakText(""); setSpeakTranslation(""); }} className="w-full justify-between rounded-xl">{language}<Check className={`size-4 ${textInputLanguage === language ? "opacity-100 text-primary" : "opacity-0"}`} /></Button>)}</div>}
                </div>}
                {(translateMode === "text" ? textInputLanguage !== "English" : speakInputLanguage !== "English") ? <div className="rounded-2xl border-2 border-border bg-card px-3 py-2.5 shadow-card"><span className="block text-xs font-semibold text-muted-foreground">{t.speakOutput}</span><span className="block font-bold">English</span></div> : <div className="relative">
                  <Button variant="outline" onClick={() => { setLanguageOpen((open) => !open); setSpeakInputOpen(false); setTextInputOpen(false); }} className="h-auto w-full justify-between rounded-2xl border-2 bg-card px-3 py-2.5 text-left shadow-card">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-muted-foreground">{t.speakOutput}</span>
                      <span className="block truncate font-bold">{localLanguage}</span>
                    </span>
                    <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${languageOpen ? "rotate-180" : ""}`} />
                  </Button>
                  {languageOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-56 overflow-y-auto rounded-2xl border-2 border-border bg-card p-2 shadow-app">
                      {LOCAL_LANGUAGES.map((language) => (
                        <Button key={language} variant="ghost" onClick={() => { updateLocalLanguage(language); if (translateMode === "text" && textInputLanguage !== "English") setTextInputLanguage(language); setLanguageOpen(false); }} className="w-full justify-between rounded-xl">
                          {language}<Check className={`size-4 ${localLanguage === language ? "opacity-100 text-primary" : "opacity-0"}`} />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>}
              </div>

              {translateMode === "voice" ? <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
                <div className="flex min-h-48 flex-1 flex-col items-center justify-center py-3 text-center">
                  <div className="mic-stage"><Button type="button" disabled={micMuted || speakBusy || speechModelBusy || !speechReady} onClick={() => recording ? stopRecording() : void startRecording()} aria-label={recording ? "Stop recording" : "Start recording"} className={`mic-button size-32 rounded-full disabled:opacity-60 ${recording ? "animate-pulse bg-destructive text-destructive-foreground" : micMuted ? "bg-muted text-muted-foreground !shadow-none" : "bg-primary text-primary-foreground"}`}>{micMuted ? <MicOff className="!size-14" /> : speakBusy || speechModelBusy ? <RefreshCw className="!size-12 animate-spin" /> : <Mic className="!size-14" />}</Button></div>
                  <p className="mt-5 font-display text-xl font-bold">{recording ? t.listening : t.tap}</p>
                  <p className="mt-2 max-w-xs text-sm font-medium text-muted-foreground">Whisper Tiny · local ONNX · audio stays on this device</p>
                </div>
                {!speechReady && <Button type="button" onClick={() => void downloadSpeechPack()} disabled={speechModelBusy} variant="outline" className="mb-2 rounded-xl border-2"><Download className="size-4" />{speechModelBusy ? "Loading speech model…" : "Download offline speech model (~44 MiB)"}</Button>}
                {speechReady && !(speakInputLanguage === "English" ? packReady : reversePackReady) && <Button type="button" onClick={() => void (speakInputLanguage === "English" ? downloadPack() : downloadReversePack())} disabled={packBusy} variant="outline" className="mb-2 rounded-xl border-2"><Download className="size-4" />{packBusy ? "Loading translation model…" : `Download ${speakInputLanguage === "English" ? `English to ${localLanguage}` : `${localLanguage} to English`} model`}</Button>}
                {speakText && <div className="mb-2 rounded-2xl border-2 border-border bg-card p-3 text-sm"><strong>{speakInputLanguage}</strong><p className="mt-1">{speakText}</p></div>}
                {speakTranslation && <div className="mb-2 rounded-2xl border-2 border-border bg-card p-3 text-sm"><strong>{speakInputLanguage === "English" ? localLanguage : "English"}</strong><p className="mt-1">{speakTranslation}</p></div>}
                {speakNotice && <p role="status" className="mb-2 text-xs font-medium text-muted-foreground">{speakNotice}</p>}
                <Button type="button" variant="outline" aria-pressed={micMuted} onClick={() => { if (recording) stopRecording(); setMicMuted((muted) => !muted); }} className={`mb-1 h-12 w-full rounded-xl border-2 ${micMuted ? "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground" : "bg-card text-foreground hover:bg-primary-soft hover:text-primary"}`}>{micMuted ? <Mic className="size-5" /> : <MicOff className="size-5" />}{micMuted ? (appLanguage === "de" ? "Stummschaltung aufheben" : "Unmute") : (appLanguage === "de" ? "Stummschalten" : "Mute")}</Button>
              </div> : <div role="tabpanel" className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                <p className="font-display text-xl font-bold">{t.translate}</p>
                <textarea value={speakText} onChange={(event) => { setSpeakText(event.target.value); setSpeakTranslation(""); }} maxLength={600} rows={5} placeholder="Enter an English guest message…" className="w-full resize-none rounded-2xl border-2 border-border bg-card p-3 text-sm outline-none focus:border-primary" />
                {!(textInputLanguage === "English" ? packReady : reversePackReady) && <Button type="button" onClick={() => void (textInputLanguage === "English" ? downloadPack() : downloadReversePack())} disabled={packBusy} variant="outline" className="rounded-xl border-2"><Download className="size-4" />{packBusy ? "Loading model…" : `Download ${textInputLanguage === "English" ? `English to ${localLanguage}` : `${localLanguage} to English`} model`}</Button>}
                <Button type="button" onClick={() => void translateText()} disabled={speakBusy || !speakText.trim() || !(textInputLanguage === "English" ? packReady : reversePackReady)} className="rounded-xl"><Languages className="size-4" />{speakBusy ? "Translating…" : "Translate on this device"}</Button>
                {speakTranslation && <div className="rounded-2xl border-2 border-border bg-card p-3 text-sm"><strong>{textInputLanguage === "English" ? localLanguage : "English"}</strong><p className="mt-1">{speakTranslation}</p></div>}
                {(speakNotice || packNotice) && <p role="status" className="text-xs font-medium text-muted-foreground">{speakNotice || packNotice}</p>}
              </div>}
            </section>

          <section className={`${tab === "chat" ? "flex animate-in fade-in slide-in-from-bottom-1" : "hidden"} h-full min-h-0 flex-col`} aria-label={t.messages}>
            {!packReady && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-warning-soft p-2 text-xs font-bold text-warning-foreground"><span>Offline translation needs the {localLanguage} model.</span><Button type="button" size="sm" onClick={() => void downloadPack()} disabled={packBusy}>{packBusy ? "Loading…" : "Download"}</Button></div>}
            {packNotice && <p role="status" className="mb-2 text-xs font-semibold">{packNotice}</p>}
            {(() => { const thread = guest.openId ? guest.threads.find((x) => x.id === guest.openId) : null; return thread ? <Conversation thread={thread} onBack={() => guest.open(null)} onSend={(text) => guest.send(thread.id, text)} language={localLanguage} packReady={packReady} latencyMultiplier={deviceProfile.factor} onModelEvent={traceModel} onDraft={async (th) => { await simulateDeviceLatency(450); return draftReply(th.messages.filter((m) => m.from === "guest").at(-1)?.text ?? "", await getProfile() ?? blankProfile(languageCode(localLanguage)), await listPrices()); }} copy={{ placeholder: t.replyPlaceholder, typing: t.typing, back: t.back, empty: "", translate: t.translate, original: t.hideTranslation, draft: t.draftReply, noTranslation: t.noTranslation }} /> : <>
              <p className="text-xs font-semibold text-muted-foreground">Demo messages. Replies are copied for your messaging app.</p>
              {guest.unreadTotal > 0 && <div className="flex justify-end"><span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{guest.unreadTotal} {t.unread}</span></div>}
              <ThreadList threads={guest.threads} onOpen={guest.open} />
            </>; })()}
          </section>

          <section className={`${tab === "business" ? "flex animate-in fade-in slide-in-from-bottom-1" : "hidden"} h-full min-h-0 flex-col`}>
              <div className="flex items-center gap-2">
                {businessView !== "overview" && businessView !== "kpi" && <Button variant="ghost" size="icon" aria-label="Back to business overview" onClick={() => setBusinessView("overview")} className="-ml-2 rounded-xl"><ChevronLeft /></Button>}
                <span className="ml-auto grid shrink-0 grid-cols-2 rounded-xl border-2 border-border bg-card p-1 shadow-card" role="tablist" aria-label="Switch between business and KPIs"><button type="button" role="tab" aria-label="Business" aria-selected={businessView !== "kpi"} onClick={() => setBusinessView("overview")} className={`grid place-items-center rounded-lg px-2.5 py-1.5 ${businessView !== "kpi" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><BriefcaseBusiness className="size-4" /></button><button type="button" role="tab" aria-label="KPIs" aria-selected={businessView === "kpi"} onClick={() => setBusinessView("kpi")} className={`grid place-items-center rounded-lg px-2.5 py-1.5 ${businessView === "kpi" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}><TrendingUp className="size-4" /></button></span>
              </div>
              {notice && <p className="mt-2 rounded-xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary">{notice}</p>}
              <div className="business-scroll mt-3 min-h-0 flex-1 overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {businessView === "overview" && <>
                   <button type="button" onClick={() => setBusinessView("facts")} className="w-full rounded-2xl border-2 border-border bg-card p-3 text-left shadow-card">
                     <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><MapPin /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{businessName}</span><span className="block truncate text-xs font-semibold text-muted-foreground">{businessAddress}</span></span></div>
                     <div className="mt-3 rounded-xl bg-background p-2.5 text-xs"><p className="font-bold">{profile.owner || "Owner"} · {profile.openingHours || "Hours not set"}</p>{profile.description && <p className="mt-1 font-medium text-muted-foreground">{profile.description}</p>}</div>
                     <div className="mt-2 flex items-center justify-between text-xs font-bold"><span className="text-success">Saved on this device</span><span className="text-muted-foreground">Edit facts</span></div>
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={() => setBusinessView("context")} className="h-20 flex-col items-start gap-1 rounded-2xl border-2 bg-card px-3 shadow-card"><Package className="size-5 text-primary" /><span className="font-bold">Products</span><small className="text-muted-foreground">{products.length} saved</small></Button>
                    <Button variant="outline" onClick={() => setBusinessView("prices")} className="h-20 flex-col items-start gap-1 rounded-2xl border-2 bg-card px-3 shadow-card"><Tag className="size-5 text-accent" /><span className="font-bold">Price lists</span><small className="text-muted-foreground">{prices.length} entries</small></Button>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Connectors</h2><span className="text-xs font-semibold text-muted-foreground">0 connected</span></div>
                    <div className="mt-2 grid grid-cols-3 gap-2">{CONNECTORS.map(({ name, icon }) => <div key={name} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 border-border bg-card px-1 py-3 text-center shadow-card"><span className="grid size-11 place-items-center rounded-xl bg-background"><svg role="img" aria-label={`${name} logo`} viewBox="0 0 24 24" className="size-7" fill={`#${icon.hex}`}><path d={icon.path} /></svg></span><span className="text-[0.7rem] font-bold leading-tight">{name}</span></div>)}</div>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Not connected. Chat messages are demo examples.</p>
                  </div>
                   <Button variant="outline" onClick={() => setBusinessView("facts")} className="mt-3 h-12 w-full rounded-xl border-2">Edit confirmed business facts</Button>
                   {bookings.length > 0 && <Button variant="outline" onClick={() => setBusinessView("interactions")} className="mt-2 h-12 w-full rounded-xl border-2">Previously saved interactions ({bookings.length})</Button>}
                </>}
                {businessView === "context" && <>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input value={productName} onChange={(event) => setProductName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addProduct(); }} placeholder="Add product or service" className="h-12 rounded-xl border-2" /><Button size="icon" onClick={addProduct} disabled={!productName.trim()} className="size-12 rounded-xl" aria-label="Add product"><Plus /></Button></div>
                   <p className="mt-2 text-xs font-bold text-warning-foreground">{t.offlineModeShort}</p>
                  <div className="mt-3 space-y-2">{products.length === 0 ? <EmptyState icon={<Package />} text="No products yet" /> : products.map((product) => <div key={product.id} className="rounded-2xl border-2 border-border bg-card p-3 shadow-card"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{product.name}</p><p className="text-xs font-semibold text-primary">{product.category}</p>{product.description && <p className="mt-1 text-xs font-medium text-muted-foreground">{product.description}</p>}</div><span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary">Active</span></div></div>)}</div>
                </>}
                 {businessView === "facts" && <form onSubmit={(event) => void saveFacts(event)} className="space-y-3">
                   <label className="block text-sm font-bold">Business name<Input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} maxLength={100} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Operator<Input value={profile.owner} onChange={(event) => setProfile({ ...profile, owner: event.target.value })} maxLength={100} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Description<textarea value={profile.description} onChange={(event) => setProfile({ ...profile, description: event.target.value })} maxLength={300} rows={3} className="mt-1 w-full resize-none rounded-xl border-2 border-border bg-card p-3 text-sm font-medium outline-none focus:border-primary" /></label>
                   <label className="block text-sm font-bold">Opening hours<Input value={profile.openingHours} onChange={(event) => setProfile({ ...profile, openingHours: event.target.value })} maxLength={100} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Service in English<Input value={profile.service} onChange={(event) => setProfile({ ...profile, service: event.target.value })} maxLength={120} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Check-in time<Input type="time" value={profile.checkIn} onChange={(event) => setProfile({ ...profile, checkIn: event.target.value })} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Maximum guests<Input type="number" min="1" value={profile.capacity ?? ""} onChange={(event) => setProfile({ ...profile, capacity: event.target.value ? Number(event.target.value) : null })} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Location or directions<Input value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} maxLength={300} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Allergy policy in English<Input value={profile.allergyPolicy} onChange={(event) => setProfile({ ...profile, allergyPolicy: event.target.value })} maxLength={300} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <label className="block text-sm font-bold">Cancellation policy in English<Input value={profile.cancellationPolicy} onChange={(event) => setProfile({ ...profile, cancellationPolicy: event.target.value })} maxLength={300} className="mt-1 h-11 rounded-xl border-2" /></label>
                   <Button type="submit" className="h-12 w-full rounded-xl">Save confirmed facts</Button>
                 </form>}
                 {businessView === "interactions" && <div className="space-y-3">{bookings.length === 0 ? <p className="text-sm text-muted-foreground">No interactions saved with customer consent.</p> : [...bookings].reverse().map((item) => <div key={item.id} className="rounded-xl border-2 border-border bg-card p-3 text-sm"><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p><p className="mt-2 font-bold">Guest: {item.customerMessage}</p><p className="mt-2">Approved reply: {item.approvedReply}</p></div>)}</div>}
                {businessView === "prices" && <>
                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2"><Input value={priceLabel} onChange={(event) => setPriceLabel(event.target.value)} placeholder="Item" className="h-12 rounded-xl border-2" /><Input value={priceValue} onChange={(event) => setPriceValue(event.target.value)} inputMode="decimal" placeholder="Price" className="h-12 rounded-xl border-2" /><Button size="icon" onClick={addPrice} disabled={!priceLabel.trim() || !priceValue} className="size-12 rounded-xl" aria-label="Add price"><Plus /></Button></div>
                  <div className="mt-3 space-y-2">{prices.length === 0 ? <EmptyState icon={<Tag />} text="No prices yet" /> : prices.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card p-3 shadow-card"><div><p className="font-bold">{item.label}</p><p className="text-xs font-semibold text-muted-foreground">per {item.unit}</p></div><div className="shrink-0 text-right"><strong className="block text-primary">{money(Number(item.price), item.currency, currency)}</strong>{item.localPrice && item.localCurrency && <span className="text-xs font-bold text-muted-foreground">{item.localCurrency === "TZS" ? "TSh" : item.localCurrency} {item.localPrice.toLocaleString("en-US")}</span>}</div></div>)}</div>
                </>}
                {businessView === "kpi" && <>
                   <p className="mb-2 text-xs font-bold text-warning-foreground">Illustrative demo data. No booking connector is active.</p>
                  <div className="flex gap-3 rounded-2xl border-2 border-border bg-card p-3 shadow-card"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><TrendingUp /></span><div><p className="font-bold">Guest feedback summary</p><p className="mt-0.5 text-sm font-medium text-muted-foreground">Guests love the traditional roasting ritual and fresh lunch. The most common question is how to travel from Ondera Market, so the directions are saved in the fact sheet.</p></div></div>
                  <div className="mt-3 grid grid-cols-2 gap-3"><Metric icon={<MessageCircle />} label="Requests this month" value="28" change="Demo dataset" /><Metric icon={<Star />} label="Top experience" value="Coffee ritual" change="Guest feedback" /></div>
                  <div className="mt-3 rounded-2xl border-2 border-border bg-card p-3 shadow-card">
                    <p className="font-bold">Most common guest languages</p>
                    <div className="mt-3 space-y-3" aria-label="Guest language distribution">
                      {[["English", 65], ["German", 20], ["French", 15]].map(([label, value]) => <div key={String(label)}><div className="flex justify-between text-xs font-bold"><span>{label}</span><span>{value}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div></div>)}
                    </div>
                  </div>
                </>}
              </div>
            </section>
          </>}
        </main>
        {onboardingComplete && <BottomNav active={tab} onChange={(nextTab) => { setUtilityView(null); setLanguageOpen(false); setSpeakInputOpen(false); setTextInputOpen(false); if (nextTab === tab) { if (nextTab === "chat") guest.open(null); if (nextTab === "business") setBusinessView("overview"); } setTab(nextTab); }} labels={t} chatUnread={guest.unreadTotal} />}
      </div>
      <div className="hidden h-[min(844px,calc(100dvh-40px))] min-w-0 flex-col gap-3 lg:flex">
        <DeviceSimulator level={deviceLevel} profile={deviceProfile} onChange={selectDevice} />
        <ModelConsole events={modelEvents} online={online} />
      </div>
    </div>
  );
}

function DeviceSimulator({ level, profile, onChange }: { level: number; profile: DeviceProfile; onChange: (level: number) => void }) {
  return (
    <section className="shrink-0 rounded-[1.25rem] border border-border bg-card px-4 py-3 shadow-card" aria-labelledby="device-simulator-title">
      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary"><Smartphone className="size-5" /></span><div><h2 id="device-simulator-title" className="text-sm font-bold">Handy-Leistung simulieren</h2><p className="text-xs font-semibold text-muted-foreground">{profile.name} · {profile.detail}</p></div><span className="ml-auto rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">{profile.factor}×</span></div>
      <input type="range" min="0" max="2" step="1" value={level} onChange={(event) => onChange(Number(event.target.value))} aria-label="Handy-Leistung" className="mt-3 h-2 w-full cursor-pointer accent-primary" />
      <div className="mt-1 flex justify-between text-[0.65rem] font-bold text-muted-foreground"><span>Einsteiger</span><span>Mittelklasse</span><span>High-End</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[0.65rem]"><span className="rounded-lg bg-muted px-2 py-1"><b className="block text-foreground">Whisper {profile.whisper}</b>Echtzeit</span><span className="rounded-lg bg-muted px-2 py-1"><b className="block text-foreground">OPUS {profile.opus}</b>Text</span><span className="rounded-lg bg-muted px-2 py-1"><b className="block text-foreground">Reply {profile.reply}</b>Antwort</span></div>
      <p className="mt-2 text-[0.65rem] font-medium text-muted-foreground">Simulierte Geräteklasse; echte Laufzeit steht im Terminal.</p>
    </section>
  );
}

function ModelConsole({ events, online }: { events: ModelEvent[]; online: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events.length]);
  const latest = events.at(-1);
  const colors: Record<ModelEventKind, string> = {
    info: "text-cyan-300",
    run: "text-amber-300",
    output: "text-lime-300",
    ready: "text-emerald-300",
    error: "text-red-300",
  };
  return (
    <aside className={`flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-emerald-950 bg-[#07110f] font-mono text-slate-100 shadow-app transition-[flex,height] ${collapsed ? "h-14 shrink-0" : "min-h-0 flex-1"}`} aria-label="Local model runtime console">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-emerald-950 bg-[#0a1714] px-4">
        <span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-300" /><span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate text-xs font-semibold text-slate-300">lokalpingu://model-runtime</span>
        {collapsed && <span className="min-w-0 truncate text-[0.65rem] text-emerald-300">{latest?.model}</span>}
        <span className="ml-auto rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-[0.65rem] font-bold text-emerald-300">LOCAL ONLY</span>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? "Terminal ausklappen" : "Terminal einklappen"} title={collapsed ? "Terminal ausklappen" : "Terminal einklappen"} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-emerald-950 hover:text-emerald-300"><ChevronDown className={`size-4 transition-transform ${collapsed ? "" : "rotate-180"}`} /></button>
      </div>
      {!collapsed && <><div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-emerald-950 px-4 py-3">
        <div className="min-w-0"><p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Active model</p><p className="truncate text-sm font-bold text-emerald-300">{latest?.model ?? "Runtime"}</p></div>
        <span className={`flex items-center gap-1.5 text-[0.65rem] font-bold ${online ? "text-cyan-300" : "text-amber-300"}`}><span className={`size-2 rounded-full ${online ? "bg-cyan-300" : "bg-amber-300"}`} />{online ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-xs leading-relaxed [scrollbar-color:#14532d_transparent]">
        <p className="mb-4 text-slate-500">$ watch --models --local --verbose</p>
        <div className="space-y-3">
          {events.map((event) => <div key={event.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"><span className="text-slate-600">{event.time}</span><p className="min-w-0 break-words"><span className="text-slate-400">[{event.model}]</span> <span className={`font-bold ${colors[event.kind]}`}>{event.kind.toUpperCase()}</span><br /><span className="text-slate-300">{event.message}</span></p></div>)}
          <div ref={endRef} />
        </div>
      </div>
      <div className="shrink-0 border-t border-emerald-950 bg-[#0a1714] px-4 py-3 text-[0.65rem] text-slate-500">No cloud inference · audio and business facts stay on device</div>
      </>}
    </aside>
  );
}

function Metric({ icon, label, value, change, accent }: { icon: ReactNode; label: string; value: string; change: string; accent?: boolean }) {
  return <div className="rounded-2xl border-2 border-border bg-card p-3.5 shadow-card"><div className={`mb-2 grid size-9 place-items-center rounded-xl [&_svg]:size-5 ${accent ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary"}`}>{icon}</div><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="font-display text-xl font-bold">{value}</p><p className="text-xs font-bold text-success">{change}</p></div>;
}

function LocalPinguWordmark({ className = "" }: { className?: string }) {
  return <span aria-label="LocalPingu" className={`flex items-end whitespace-nowrap font-display font-bold leading-none text-foreground ${className}`}><span>Local</span><PenguinP className="mx-[0.03em] h-[1.08em] w-auto shrink-0" /><span>ingu</span></span>;
}

function Onboarding({ step, setStep, appLanguage, setAppLanguage, localLanguage, setLocalLanguage, businessName, setBusinessName, finish, t }: { step: number; setStep: (step: number) => void; appLanguage: AppLanguage; setAppLanguage: (language: AppLanguage) => void; localLanguage: string; setLocalLanguage: (language: string) => void; businessName: string; setBusinessName: (name: string) => void; finish: () => void; t: typeof UI.en }) {
  const steps = 5;
  const titles = [t.chooseApp, t.welcome, t.chooseLocal, t.businessSetup, t.ready];
  return <section className="flex h-full flex-col" aria-labelledby="onboarding-title">
    <div className="flex items-center justify-between"><LocalPinguWordmark className="text-[1.9rem]" /><span className="text-xs font-bold text-muted-foreground">{t.step} {step + 1}/{steps}</span></div>
    <div className="mt-5 flex gap-1.5">{Array.from({ length: steps }).map((_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
    <div className="business-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-6">
      <h1 id="onboarding-title" className="font-display text-3xl font-bold leading-tight">{titles[step]}</h1>
      {step === 1 && <><div className="mt-2 flex justify-center"><img src={lokalPinguIconAsset.url} alt="LocalPingu Logo" className="size-40 rounded-3xl border-2 border-border bg-background object-contain p-1 shadow-card" /></div><p className="mt-3 text-base font-medium text-muted-foreground">{t.welcomeText}</p><div className="mt-8 grid grid-cols-3 gap-2"><OnboardingFeature icon={<Languages />} label={t.translate} /><OnboardingFeature icon={<MessageCircle />} label={t.chat} /><OnboardingFeature icon={<BriefcaseBusiness />} label={t.business} /></div></>}
      {step === 0 && <><p className="mt-2 text-sm font-medium text-muted-foreground">{t.chooseAppText}</p><div className="mt-5"><label htmlFor="onboarding-app-language" className="text-sm font-bold">{t.appLanguage}</label><select id="onboarding-app-language" value={appLanguage} onChange={(event) => setAppLanguage(event.target.value as AppLanguage)} className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-base font-semibold outline-none focus:border-primary">{APP_LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></div></>}
      {step === 2 && <><p className="mt-2 text-sm font-medium text-muted-foreground">{t.chooseLocalText}</p><div className="mt-4 grid grid-cols-2 gap-2">{LOCAL_LANGUAGES.map((language) => <ChoiceButton key={language} compact selected={localLanguage === language} onClick={() => setLocalLanguage(language)} title={language} />)}</div></>}
      {step === 3 && <><p className="mt-2 text-sm font-medium text-muted-foreground">{t.offlineModeShort}</p><label className="mt-5 text-xs font-bold text-muted-foreground" htmlFor="onboarding-business">{t.businessName}</label><Input id="onboarding-business" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder={t.businessPlace} className="mt-2 h-12 rounded-xl border-2" /><div className="mt-4 flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary"><ShieldCheck className="size-5" />{t.offlineModeShort}</div></>}
      {step === 4 && <div className="flex flex-1 flex-col items-center justify-center text-center"><div className="grid size-24 place-items-center rounded-full bg-primary-soft text-primary"><Check className="size-12" strokeWidth={3} /></div><p className="mt-5 max-w-xs text-base font-medium text-muted-foreground">{t.offlineModeShort}</p></div>}
    </div>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)} className="h-12 rounded-xl border-2 px-5">{t.back}</Button> : <span />}{step < steps - 1 ? <Button onClick={() => setStep(step + 1)} className="h-12 rounded-xl font-bold">{step === 3 && !businessName.trim() ? t.skip : t.continue}</Button> : <Button onClick={finish} className="h-12 rounded-xl font-bold">{t.startApp}</Button>}</div>
  </section>;
}

function ChoiceButton({ selected, onClick, title, subtitle, compact }: { selected: boolean; onClick: () => void; title: string; subtitle?: string; compact?: boolean }) {
  return <Button type="button" variant="outline" onClick={onClick} className={`${compact ? "h-12 px-3" : "h-16 px-4"} justify-between rounded-xl border-2 bg-card text-left ${selected ? "border-primary bg-primary-soft text-foreground" : ""}`}><span><strong className="block">{title}</strong>{subtitle && <small className="text-muted-foreground">{subtitle}</small>}</span>{selected && <Check className="size-5 text-primary" />}</Button>;
}

function OnboardingFeature({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="rounded-xl bg-primary-soft p-3 text-center text-primary"><span className="mx-auto grid size-9 place-items-center [&_svg]:size-5">{icon}</span><p className="mt-1 text-xs font-bold">{label}</p></div>;
}

function NotificationsView({ t }: { t: typeof UI.en }) {
  return <section className="flex h-full min-h-0 flex-col"><div className="mt-4 flex flex-1 items-center justify-center text-sm font-bold text-muted-foreground"><Check className="mr-2 size-4" />{t.allCaught}</div></section>;
}

function SettingsView({ t, appLanguage, setAppLanguage, localLanguage, setLocalLanguage, packReady, packBusy, packNotice, downloadPack, deleteBusiness, currency, setCurrency, resetConfirm, setResetConfirm, resetApp }: { t: typeof UI.en; appLanguage: AppLanguage; setAppLanguage: (language: AppLanguage) => void; localLanguage: string; setLocalLanguage: (language: string) => void; packReady: boolean; packBusy: boolean; packNotice: string; downloadPack: () => Promise<void>; deleteBusiness: () => void; currency: string; setCurrency: (next: string) => void; resetConfirm: boolean; setResetConfirm: (open: boolean) => void; resetApp: () => void }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="business-scroll mt-4 min-h-0 flex-1 overflow-y-auto pb-2">
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{t.preferences}</p>
        <div className="rounded-2xl border-2 border-border bg-card p-3 shadow-card">
          <label htmlFor="settings-app-language" className="block text-sm font-bold">{t.appLanguage}</label>
          <select id="settings-app-language" value={appLanguage} onChange={(event) => setAppLanguage(event.target.value as AppLanguage)} className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary">
            {APP_LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </select>
          <label htmlFor="settings-language" className="mt-4 block text-sm font-bold">{t.localLanguage}</label>
          <select id="settings-language" value={localLanguage} onChange={(event) => setLocalLanguage(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary">
            {LOCAL_LANGUAGES.map((language) => <option key={language}>{language}</option>)}
          </select>
          <Button type="button" onClick={() => void downloadPack()} disabled={packBusy} className="mt-3 w-full rounded-xl"><Download className="size-4" />{packBusy ? "Loading local model…" : packReady ? "Check offline model" : `Download ${localLanguage} model`}</Button>
          <p role="status" className="mt-2 text-xs font-medium text-muted-foreground">{packNotice || (packReady ? "Offline model ready on this device." : "Download once while online. Translation then works offline.")}</p>
          <label htmlFor="settings-currency" className="mt-4 block text-sm font-bold">{t.currency}</label>
          <select id="settings-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="mt-4 rounded-2xl border-2 border-border bg-card p-3 shadow-card">
          <p className="text-xs font-bold uppercase text-muted-foreground">Data & model grounding</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary">On-device Whisper Tiny</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">Quantized OPUS-MT</span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Owner-confirmed local facts</span>
          </div>
          <p className="mt-2 text-xs font-medium text-muted-foreground">Evaluation references: FLORES-200 and MASSIVE are not bundled. OpenStreetMap/Overpass is planned and currently disconnected.</p>
        </div>
        <div className="mt-5 rounded-2xl border-2 border-destructive/30 bg-card p-3">
          <p className="font-bold text-destructive">{t.reset}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{t.resetText}</p>
          <Button variant="outline" onClick={() => setResetConfirm(true)} className="mt-3 w-full rounded-xl border-2 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">{t.reset}</Button>
          <Button variant="outline" onClick={deleteBusiness} className="mt-2 w-full rounded-xl border-2 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">Delete local business data</Button>
        </div>
      </div>
      {resetConfirm && <div className="absolute inset-0 z-40 grid place-items-center bg-foreground/30 p-5"><div role="alertdialog" aria-modal="true" className="w-full rounded-2xl border-2 border-border bg-card p-5 shadow-app"><h2 className="font-display text-xl font-bold">{t.confirmReset}</h2><p className="mt-2 text-sm font-medium text-muted-foreground">{t.confirmResetText}</p><div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setResetConfirm(false)} className="rounded-xl border-2">{t.cancel}</Button><Button onClick={resetApp} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive">{t.confirm}</Button></div></div></div>}
    </section>
  );
}

function BottomNav({ active, onChange, labels, chatUnread }: { active: Tab; onChange: (tab: Tab) => void; labels: typeof UI.en; chatUnread: number }) {
  const items: { id: Tab; label: string; icon: typeof Mic }[] = [{ id: "assistant", label: labels.assistant, icon: Sparkles }, { id: "speak", label: labels.translate, icon: Languages }, { id: "chat", label: labels.chat, icon: MessageCircle }, { id: "business", label: labels.business, icon: BriefcaseBusiness }];
  return <nav aria-label="Main navigation" className="shrink-0 border-t-2 border-border bg-card px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2"><div className="grid grid-cols-4 gap-1.5">{items.map((item) => { const Icon = item.icon; const selected = active === item.id; const badge = item.id === "chat" ? chatUnread : 0; return <Button key={item.id} variant="ghost" onClick={() => onChange(item.id)} aria-current={selected ? "page" : undefined} aria-label={badge ? `${item.label}, ${badge} unread` : undefined} className={`relative h-14 flex-col gap-1 rounded-xl text-xs font-bold transition-transform active:scale-90 [&_svg]:!size-5 ${selected ? "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span className="relative"><Icon strokeWidth={selected ? 2.8 : 2.2} />{badge > 0 && <span key={badge} className="animate-in zoom-in absolute -right-3 -top-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-destructive px-1 text-[0.65rem] font-bold leading-none text-destructive-foreground">{badge > 9 ? "9+" : badge}</span>}</span>{item.label}</Button>; })}</div></nav>;
}
function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-border text-center text-muted-foreground"><div><span className="mx-auto mb-2 grid size-10 place-items-center rounded-xl bg-muted [&_svg]:size-5">{icon}</span><p className="text-sm font-bold">{text}</p></div></div>;
}
