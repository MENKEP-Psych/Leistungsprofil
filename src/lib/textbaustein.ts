// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BefundSection {
  id: string;
  name: string;
}

export interface BlockRelevance {
  testId: string;
  prRange: 'below' | 'average' | 'above';
}

export interface Textbaustein {
  id: string;
  category: string;
  title: string;
  content: string;
  isDefault?: boolean;
  relevance?: BlockRelevance[];
}

// An item in the block queue (title stored at add-time so display works even after library edits)
export interface ReportItem {
  instanceId: string;
  sourceBlockId?: string;
  title: string;
  text: string;
  sectionId?: string;
}

export interface BefundReport {
  items: ReportItem[];
  sections: BefundSection[];
  finalText: string;
}

export interface VerlaufsEintrag {
  id: string;
  date: string;       // YYYY-MM-DD
  items: ReportItem[];
  finalText: string;
  createdAt: number;
}

// ── Default block library ─────────────────────────────────────────────────────

const D: Omit<Textbaustein, 'id'>[] = [
  // Einleitung
  { category: 'Einleitung', isDefault: true,
    title: 'Vollständige Untersuchung',
    content: 'Getestet wurden die Bereiche Aufmerksamkeit und Verarbeitungsgeschwindigkeit (TMT A/B, ZZT), verbales Gedächtnis und Lernen (VLMT, Logisches Gedächtnis), visuelles Gedächtnis (WMS-IV – Visuelle Wiedergabe), visuokonstruktive Fähigkeiten (Rey-Figur/ROCFT, Mosaik-Test), Arbeitsgedächtnis (Zahlenspanne, Blockspanne) sowie Planungs- und Exekutivfunktionen (Turm von London). Die Kooperation war gut, die Ergebnisse sind als valide einzuschätzen.' },
  { category: 'Einleitung', isDefault: true,
    title: 'Neglect- / Gesichtsfeldscreening',
    content: 'Getestet wurden die Bereiche visuelle Exploration und Neglect-Screening (TAP – Neglect-Subtests, Linien-Halbierungstest, Durchstreichtests) sowie eine orientierende Überprüfung der Gesichtsfeldgrenzen. Die Untersuchung erfolgte unter stationären Bedingungen.' },

  // Überblick
  { category: 'Überblick', isDefault: true,
    title: 'Leistungen überwiegend unauffällig',
    content: 'In der Gesamtschau ergibt sich ein weitgehend unauffälliges neuropsychologisches Leistungsprofil. Die kognitiven Leistungen lagen in den meisten untersuchten Bereichen im alters- und bildungserwarteten Normbereich.' },
  { category: 'Überblick', isDefault: true,
    title: 'Gemischtes Leistungsprofil',
    content: 'Es zeigt sich ein heterogenes neuropsychologisches Leistungsprofil: Während die Leistungen in den Bereichen [z.B. Gedächtnis, Visuokonstruktion] unauffällig waren, fanden sich Beeinträchtigungen vor allem im Bereich [z.B. Aufmerksamkeit, Exekutivfunktionen].' },

  // Fahrtauglichkeit
  { category: 'Fahrtauglichkeit', isDefault: true,
    title: 'Nicht eingeschränkt (neuropsychologisch)',
    content: 'Aus neuropsychologischer Sicht ergeben sich auf der Grundlage der vorliegenden Testergebnisse zum aktuellen Untersuchungszeitpunkt keine Hinweise auf neuropsychologisch bedingte Einschränkungen der Fahreignung. Diese Einschätzung bezieht sich ausschließlich auf den neuropsychologischen Befund und ist in die abschließende medizinische Beurteilung der Fahreignung durch die behandelnden Ärzte einzubeziehen.' },
  { category: 'Fahrtauglichkeit', isDefault: true,
    title: 'Eingeschränkt (neuropsychologisch)',
    content: 'Aus neuropsychologischer Sicht bestehen auf der Grundlage der vorliegenden Testergebnisse Hinweise auf neuropsychologisch bedingte Einschränkungen der Fahreignung. Die festgestellten Beeinträchtigungen in den Bereichen Aufmerksamkeit und Reaktionsgeschwindigkeit sind fahrrelevant. Diese Einschätzung bezieht sich ausschließlich auf den neuropsychologischen Befund; die abschließende Beurteilung der Fahreignung obliegt den behandelnden Ärzten.' },

  // Einschränkungen
  { category: 'Einschränkungen', isDefault: true,
    title: 'Aphasie / Sprachbarriere',
    content: 'Die neuropsychologische Untersuchung war durch eine vorhandene Aphasie bzw. sprachliche Einschränkungen beeinträchtigt. Sprachgebundene Testverfahren konnten nur eingeschränkt oder nicht durchgeführt werden. Die Ergebnisse sind unter diesem Vorbehalt zu interpretieren.' },
  { category: 'Einschränkungen', isDefault: true,
    title: 'Sehbeeinträchtigung',
    content: 'Aufgrund einer relevanten Sehbeeinträchtigung (z.B. Hemianopsie, stark reduzierte Sehschärfe) waren einzelne visuell gebundene Testverfahren nur eingeschränkt durchführbar oder mussten ausgelassen werden.' },
  { category: 'Einschränkungen', isDefault: true,
    title: 'Medikamentöse Einflüsse',
    content: 'Es ist zu berücksichtigen, dass die aktuelle Medikation (z.B. sedierende Substanzen, Antiepileptika) die kognitiven Leistungen potenziell beeinflussen kann. Die Ergebnisse sind vor diesem Hintergrund zu interpretieren.' },
  { category: 'Einschränkungen', isDefault: true,
    title: 'Motorische Einschränkungen',
    content: 'Aufgrund motorischer Einschränkungen der dominanten Hand (z.B. Hemiparese) waren mehrere zeitkritische Testverfahren nicht oder nur eingeschränkt durchführbar. Die betreffenden Ergebnisse sind entsprechend eingeschränkt aussagekräftig.' },
];

export const DEFAULT_BLOCKS: Textbaustein[] = D.map(d => ({
  ...d,
  id: `default_${d.title.replace(/\s+/g, '_')}`,
}));

// ── Storage keys ──────────────────────────────────────────────────────────────

const LIBRARY_KEY  = (username: string)  => `textbausteine_library_v1_${username}`;
const REPORT_KEY   = (patientId: string) => `textbausteine_report_v1_${patientId}`;
const VERLAUF_KEY  = (patientId: string) => `textbausteine_verlauf_v1_${patientId}`;
const USERS_REGISTRY_KEY = 'textbausteine_known_users_v1';

// ── User registry ─────────────────────────────────────────────────────────────

export function getKnownUsers(): string[] {
  try {
    const raw = localStorage.getItem(USERS_REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function registerUser(username: string): void {
  const known = getKnownUsers();
  if (!known.includes(username)) {
    localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify([...known, username]));
  }
}

// ── Library CRUD ──────────────────────────────────────────────────────────────

export function loadLibrary(username: string): Textbaustein[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY(username));
    if (!raw) return [...DEFAULT_BLOCKS];
    const parsed: Textbaustein[] = JSON.parse(raw);
    const savedMap = new Map(parsed.map(b => [b.id, b]));
    const merged: Textbaustein[] = DEFAULT_BLOCKS.map(d => savedMap.get(d.id) ?? d);
    const defaultIds = new Set(DEFAULT_BLOCKS.map(d => d.id));
    parsed.filter(b => !defaultIds.has(b.id)).forEach(b => merged.push(b));
    return merged;
  } catch {
    return [...DEFAULT_BLOCKS];
  }
}

export function saveLibrary(username: string, blocks: Textbaustein[]): void {
  registerUser(username);
  localStorage.setItem(LIBRARY_KEY(username), JSON.stringify(blocks));
}

export function addBlock(blocks: Textbaustein[], partial: Omit<Textbaustein, 'id'>): Textbaustein[] {
  return [...blocks, { ...partial, id: crypto.randomUUID() }];
}

export function updateBlock(blocks: Textbaustein[], id: string, patch: Partial<Omit<Textbaustein, 'id'>>): Textbaustein[] {
  return blocks.map(b => b.id === id ? { ...b, ...patch } : b);
}

export function deleteBlock(blocks: Textbaustein[], id: string): Textbaustein[] {
  return blocks.filter(b => b.id !== id);
}

export function renameCategory(blocks: Textbaustein[], oldCat: string, newCat: string): Textbaustein[] {
  return blocks.map(b => b.category === oldCat ? { ...b, category: newCat.trim() } : b);
}

export function deleteCategory(blocks: Textbaustein[], category: string): Textbaustein[] {
  return blocks.filter(b => b.category !== category);
}

// ── Report CRUD ───────────────────────────────────────────────────────────────

function itemsToText(items: ReportItem[], sections: BefundSection[] = []): string {
  if (!sections.length) {
    return items.map(i => i.text.trim()).filter(Boolean).join('<br><br>');
  }
  const parts: string[] = [];
  for (const section of sections) {
    const sectionItems = items.filter(i => i.sectionId === section.id);
    if (!sectionItems.length) continue;
    const body = sectionItems.map(i => i.text.trim()).filter(Boolean).join('<br><br>');
    parts.push(`${section.name}<br><br>${body}`);
  }
  // Items without a section (or with a deleted section id) go at the end
  const unassigned = items.filter(i => !i.sectionId || !sections.some(s => s.id === i.sectionId));
  if (unassigned.length) {
    parts.push(unassigned.map(i => i.text.trim()).filter(Boolean).join('<br><br>'));
  }
  return parts.filter(Boolean).join('<br><br>');
}

export function emptyReport(): BefundReport {
  return { items: [], sections: [], finalText: '' };
}

export function loadReport(patientId: string): BefundReport {
  try {
    const raw = localStorage.getItem(REPORT_KEY(patientId));
    if (!raw) return emptyReport();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(raw);
    const items: ReportItem[] = (parsed.items ?? []).map((i: ReportItem) => ({
      instanceId: i.instanceId,
      sourceBlockId: i.sourceBlockId,
      title: i.title ?? '',
      text: i.text ?? '',
      sectionId: i.sectionId,
    }));
    // Migrate old format: headerText/footerText → prepend/append to items
    if (parsed.headerText?.trim()) {
      items.unshift({ instanceId: crypto.randomUUID(), title: 'Einleitung', text: parsed.headerText.trim() });
    }
    if (parsed.footerText?.trim()) {
      items.push({ instanceId: crypto.randomUUID(), title: 'Abschluss', text: parsed.footerText.trim() });
    }
    const sections: BefundSection[] = Array.isArray(parsed.sections) ? parsed.sections : [];
    const finalText: string = typeof parsed.finalText === 'string' ? parsed.finalText : itemsToText(items, sections);
    return { items, sections, finalText };
  } catch {
    return emptyReport();
  }
}

export function saveReport(patientId: string, report: BefundReport): void {
  localStorage.setItem(REPORT_KEY(patientId), JSON.stringify(report));
}

// Returns true when the user has manually edited finalText (diverged from auto-generated text).
// In that case, block operations append/leave finalText instead of regenerating it from scratch.
function isManuallyEdited(report: BefundReport): boolean {
  return report.finalText !== itemsToText(report.items, report.sections);
}

export function addItemToReport(report: BefundReport, block: Textbaustein, sectionId?: string): BefundReport {
  const item: ReportItem = {
    instanceId: crypto.randomUUID(),
    sourceBlockId: block.id,
    title: block.title,
    text: block.content,
    sectionId,
  };
  const items = [...report.items, item];
  const finalText = isManuallyEdited(report)
    ? report.finalText + (report.finalText.trim() ? '<br><br>' : '') + block.content.trim()
    : itemsToText(items, report.sections);
  return { items, sections: report.sections, finalText };
}

export function removeItem(report: BefundReport, instanceId: string): BefundReport {
  const items = report.items.filter(i => i.instanceId !== instanceId);
  const finalText = isManuallyEdited(report) ? report.finalText : itemsToText(items, report.sections);
  return { items, sections: report.sections, finalText };
}

export function reorderItems(report: BefundReport, fromIdx: number, toIdx: number): BefundReport {
  if (fromIdx === toIdx) return report;
  const items = [...report.items];
  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);
  const finalText = isManuallyEdited(report) ? report.finalText : itemsToText(items, report.sections);
  return { items, sections: report.sections, finalText };
}

export function setFinalText(report: BefundReport, finalText: string): BefundReport {
  return { ...report, finalText };
}

export function getCategories(blocks: Textbaustein[]): string[] {
  return [...new Set(blocks.map(b => b.category))];
}

// ── Section operations ────────────────────────────────────────────────────────

export function addSection(report: BefundReport, name: string): BefundReport {
  const section: BefundSection = { id: crypto.randomUUID(), name };
  return { ...report, sections: [...report.sections, section] };
}

export function updateSection(report: BefundReport, id: string, name: string): BefundReport {
  const sections = report.sections.map(s => s.id === id ? { ...s, name } : s);
  return { ...report, sections, finalText: itemsToText(report.items, sections) };
}

export function deleteSection(report: BefundReport, id: string): BefundReport {
  const sections = report.sections.filter(s => s.id !== id);
  const items = report.items.map(i => i.sectionId === id ? { ...i, sectionId: undefined } : i);
  return { sections, items, finalText: itemsToText(items, sections) };
}

export function reorderSections(report: BefundReport, fromIdx: number, toIdx: number): BefundReport {
  if (fromIdx === toIdx) return report;
  const sections = [...report.sections];
  const [moved] = sections.splice(fromIdx, 1);
  sections.splice(toIdx, 0, moved);
  return { ...report, sections, finalText: itemsToText(report.items, sections) };
}

export function moveItemToSection(report: BefundReport, instanceId: string, sectionId: string | undefined): BefundReport {
  const items = report.items.map(i => i.instanceId === instanceId ? { ...i, sectionId } : i);
  return { ...report, items, finalText: itemsToText(items, report.sections) };
}

// ── Verlauf-specific item helpers (no sections) ───────────────────────────────

function verlaufItemsToText(items: ReportItem[]): string {
  return items.map(i => i.text.trim()).filter(Boolean).join('<br><br>');
}

export function addItemToVerlauf(
  entry: VerlaufsEintrag,
  block: Textbaustein,
): Pick<VerlaufsEintrag, 'items' | 'finalText'> {
  const item: ReportItem = {
    instanceId: crypto.randomUUID(),
    sourceBlockId: block.id,
    title: block.title,
    text: block.content,
  };
  const items = [...entry.items, item];
  return { items, finalText: verlaufItemsToText(items) };
}

export function removeVerlaufItem(
  entry: VerlaufsEintrag,
  instanceId: string,
): Pick<VerlaufsEintrag, 'items' | 'finalText'> {
  const items = entry.items.filter(i => i.instanceId !== instanceId);
  return { items, finalText: verlaufItemsToText(items) };
}

export function reorderVerlaufItems(
  entry: VerlaufsEintrag,
  fromIdx: number,
  toIdx: number,
): Pick<VerlaufsEintrag, 'items' | 'finalText'> {
  if (fromIdx === toIdx) return { items: entry.items, finalText: entry.finalText };
  const items = [...entry.items];
  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);
  return { items, finalText: verlaufItemsToText(items) };
}

// ── Verlaufseinträge storage ──────────────────────────────────────────────────

export function loadVerlauf(patientId: string): VerlaufsEintrag[] {
  try {
    const raw = localStorage.getItem(VERLAUF_KEY(patientId));
    return raw ? JSON.parse(raw) as VerlaufsEintrag[] : [];
  } catch { return []; }
}

export function saveVerlauf(patientId: string, entries: VerlaufsEintrag[]): void {
  localStorage.setItem(VERLAUF_KEY(patientId), JSON.stringify(entries));
}

// ── Shared file store helpers ─────────────────────────────────────────────────

export type TextbausteineStore = Record<string, Textbaustein[]>;

export function loadStoreIntoLocalStorage(store: TextbausteineStore): void {
  for (const [user, blocks] of Object.entries(store)) {
    if (Array.isArray(blocks) && blocks.length > 0) {
      saveLibrary(user, blocks);
    }
  }
}

export function buildStoreFromLocalStorage(): TextbausteineStore {
  const store: TextbausteineStore = {};
  for (const u of getKnownUsers()) {
    store[u] = loadLibrary(u);
  }
  return store;
}
