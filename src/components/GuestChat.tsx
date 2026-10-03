import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Languages, Maximize2, Minimize2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PenguinP } from "@/components/PenguinP";
import { translateEnglish } from "../local-translation";
import { languages } from "../languages";
import { type Draft } from "../reply";


export type ChatMessage = { id: string; from: "guest" | "me"; text: string; time: string; translation?: string };
export type Thread = { id: string; name: string; initials: string; tone: string; guests: number; unread: number; language: string; messages: ChatMessage[] };

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const INITIAL_THREADS: Thread[] = [
  { id: "coffee", name: "Alex & Jamie", initials: "AJ", tone: "bg-accent-soft text-accent", guests: 2, unread: 1, language: "English", messages: [
    { id: "coffee-1", from: "guest", text: "Hi Noor! We are 2 people visiting tomorrow around 2 PM. Do you have a coffee tour available and how much does it cost?", translation: "Hujambo Noor! Sisi ni watu 2 tunatembelea kesho mwendo wa saa nane mchana. Je, kuna ziara ya kahawa na inagharimu kiasi gani?", time: "10:40" },
    { id: "coffee-2", from: "me", text: "Hello! Our Traditional Coffee Tour takes 2 hours and costs $15 per person ($30 total). I will confirm the 2 PM slot before reserving it for you.", time: "10:42" },
  ] },
  { id: "vegetarian", name: "Mara & Jonas", initials: "MJ", tone: "bg-primary-soft text-primary", guests: 2, unread: 1, language: "Deutsch", messages: [
    { id: "vegetarian-1", from: "guest", text: "Guten Tag! Wir würden gerne die Farm-Tour machen. Gibt es bei dem Mittagessen auch eine vegetarische Option?", time: "09:10" },
    { id: "vegetarian-2", from: "me", text: "Guten Tag! Ja, unser Farm-to-Table Mittagessen ($10/Person) bietet frische vegetarische Spezialitäten mit Gemüse von unserem eigenen Feld. Wir bereiten das sehr gerne für Sie vor!", time: "09:13" },
  ] },
  { id: "directions", name: "Sofia Rossi", initials: "SR", tone: "bg-warning-soft text-warning-foreground", guests: 1, unread: 1, language: "English", messages: [
    { id: "directions-1", from: "guest", text: "Is your farm easy to reach with a local taxi or minibus from the town center?", time: "Yesterday" },
    { id: "directions-2", from: "me", text: "Yes! Take the local minibus towards Ondera Market and ask the driver to drop you at 'Noor's Coffee Stop'. It is a 3-minute walk from the main road.", time: "Yesterday" },
  ] },
];

type Copy = { placeholder: string; typing: string; back: string; empty: string; translate?: string; original?: string; draft?: string; noTranslation?: string };

export function useGuestThreads() {
  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = (id: string | null) => {
    setOpenId(id);
    if (id) setThreads((list) => list.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
  };

  const send = (id: string, text: string) => {
    setThreads((list) => list.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { id: crypto.randomUUID(), from: "me", text, time: now() }] } : t)));
  };

  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);
  return { threads, openId, open, send, unreadTotal };
}

/** Penguin-P profile picture in the LocalPingu logo style — one penguin per guest. */
export function GuestAvatar({ guests, size = "size-11" }: { guests: number; size?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-primary-soft ${size}`} aria-label={guests > 1 ? `${guests} guests` : "1 guest"} role="img">
      {guests > 1 ? (
        <span className="flex items-end">
          <PenguinP className="-mr-[14%] h-[1.15rem] w-auto" />
          <PenguinP className="h-[1.45rem] w-auto" />
        </span>
      ) : (
        <PenguinP className="h-[1.5rem] w-auto" />
      )}
    </span>
  );
}


export function ThreadList({ threads, onOpen }: { threads: Thread[]; onOpen: (id: string) => void }) {
  return (
    <div className="mt-4 min-h-0 space-y-2 overflow-y-auto">
      {threads.map((chat) => {
        const last = chat.messages[chat.messages.length - 1];
        return (
          <Button key={chat.id} variant="ghost" onClick={() => onOpen(chat.id)} className="animate-in fade-in slide-in-from-top-1 h-auto w-full justify-start rounded-2xl border-2 border-border bg-card p-3 text-left shadow-card">
            <GuestAvatar guests={chat.guests} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><strong className="truncate">{chat.name}</strong><small className="shrink-0 text-muted-foreground">{last?.time}</small></span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${chat.unread ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{last?.from === "me" && "Copied: "}{last?.text}</span>
                {chat.unread > 0 && <span aria-label={`${chat.unread} unread`} className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground">{chat.unread}</span>}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function Conversation({ thread, onBack, onSend, copy, language, packReady, onDraft }: { thread: Thread; onBack: () => void; onSend: (text: string) => void; copy: Copy; language: string; packReady: boolean; onDraft: (thread: Thread) => Promise<Draft> }) {
  const [draft, setDraft] = useState("");
  const [draftLocal, setDraftLocal] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [plan, setPlan] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.messages.length]);
  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onSend(text);
      setDraft(""); setDraftLocal(""); setPlan(null); setExpanded(false);
      setStatus("Reply added to this demo chat and copied for your messaging app.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reply could not be copied or saved.");
    }
  };
  const createDraft = async () => {
    try {
      const next = await onDraft(thread);
      setPlan(next);
      setDraft(next.text);
      setDraftLocal("");
      setStatus("");
      if (packReady) await translateDraft(next.text);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft failed.");
    }
  };
  const translateDraft = async (text: string) => {
    const code = languages.find((item) => item.name === language)?.code;
    if (!packReady || !code || !text.trim()) return;
    setDraftBusy(true);
    try {
      setDraftLocal(await translateEnglish(code, text));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft translation failed.");
    } finally {
      setDraftBusy(false);
    }
  };
  const toggleTranslation = async (message: ChatMessage) => {
    if (shown[message.id]) { setShown((items) => ({ ...items, [message.id]: false })); return; }
    setShown((items) => ({ ...items, [message.id]: true }));
    if (message.translation) { setTranslations((items) => ({ ...items, [message.id]: message.translation! })); return; }
    if (!packReady) { setTranslations((items) => ({ ...items, [message.id]: "Download this language's offline model in Settings first." })); return; }
    const code = languages.find((item) => item.name === language)?.code;
    if (!code) return;
    setTranslating((items) => ({ ...items, [message.id]: true }));
    try {
      const translated = await translateEnglish(code, message.text);
      setTranslations((items) => ({ ...items, [message.id]: translated }));
    }
    catch { setTranslations((items) => ({ ...items, [message.id]: copy.noTranslation ?? "No offline translation available." })); }
    finally { setTranslating((items) => ({ ...items, [message.id]: false })); }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={thread.name}>
      <div className="flex items-center gap-3 border-b-2 border-border pb-3">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label={copy.back} className="rounded-xl"><ArrowLeft className="size-5" /></Button>
        <GuestAvatar guests={thread.guests} size="size-10" />
        <div className="min-w-0 flex-1"><strong className="block truncate font-display text-lg">{thread.name}</strong><small className="font-semibold text-primary">Demo chat · {thread.language}</small></div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3">
        {thread.messages.map((m) => (
          <div key={m.id} className={`animate-in fade-in slide-in-from-bottom-2 flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`flex max-w-[92%] items-end gap-1.5 ${m.from === "me" ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm font-semibold shadow-card ${m.from === "me" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border-2 border-border bg-card"}`}>
                <p>{m.text}</p>
                {m.from === "guest" && shown[m.id] && <p className="mt-1.5 border-t-2 border-border pt-1.5 text-accent">{translating[m.id] ? "…" : (translations[m.id] ?? copy.noTranslation ?? "No offline translation available.")}</p>}
                <span className={`mt-0.5 flex items-center justify-end gap-1 text-[0.65rem] ${m.from === "me" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.time}{m.from === "me" && <Copy className="size-3" />}</span>
              </div>
              {m.from === "guest" && thread.language === "English" && <Button type="button" size="icon" variant="ghost" onClick={() => void toggleTranslation(m)} aria-label={shown[m.id] ? (copy.original ?? "Hide translation") : (copy.translate ?? "Translate")} title={shown[m.id] ? (copy.original ?? "Hide translation") : (copy.translate ?? "Translate")} className={`size-9 shrink-0 rounded-xl ${shown[m.id] ? "bg-accent-soft text-accent" : "text-muted-foreground"}`}><Languages className="size-4" /></Button>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {draftLocal && <div className="mb-2 rounded-xl border-2 border-border bg-card p-3 text-xs"><strong>Draft in {language}:</strong><p className="mt-1">{draftLocal}</p></div>}
      {!expanded && <Button type="button" size="icon" variant="ghost" onClick={() => void createDraft()} className="mx-auto mb-2 size-10 self-center rounded-xl bg-accent-soft text-accent" aria-label={copy.draft ?? "Draft reply"} title={copy.draft ?? "Draft reply"}>
        <Sparkles className="size-5" />
      </Button>}
      {draft.trim() && packReady && <Button type="button" variant="ghost" onClick={() => void translateDraft(draft)} disabled={draftBusy} className="mb-2 self-start rounded-xl text-xs"><Languages className="size-4" />{draftBusy ? "Translating draft…" : `Review in ${language}`}</Button>}
      {status && <p role="status" className="mb-2 text-xs font-semibold text-primary">{status}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <div className="relative">
          <textarea rows={1} value={draft} onChange={(e) => { setDraft(e.target.value); setDraftLocal(""); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder={copy.placeholder} aria-expanded={expanded} className={`${expanded ? "h-[45vh]" : plan ? "h-24" : "h-12"} w-full min-w-0 resize-none overflow-y-auto rounded-xl border-2 border-border bg-card py-2 pl-3 pr-11 text-sm font-semibold outline-none focus:border-primary`} />
          <Button type="button" size="icon" variant="ghost" onClick={() => setExpanded((x) => !x)} aria-label={expanded ? "Collapse input" : "Expand input"} className="absolute right-1.5 top-1.5 size-7 rounded-lg bg-background/80 text-muted-foreground">{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
        </div>
        <Button size="icon" onClick={() => void submit()} disabled={!draft.trim()} aria-label="Send demo reply and copy" title="Send demo reply and copy" className="size-12 rounded-xl"><Send className="size-5" /></Button>
      </div>
    </section>
  );
}
