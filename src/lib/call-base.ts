import * as XLSX from "xlsx";
import mammoth from "mammoth";

export type ImportedContact = {
  full_name: string;
  phone: string;
  source: string | null;
  contact_type: "cold" | "recommendation" | "instagram" | "site" | "other";
  comment: string | null;
};

const TYPE_MAP: Record<string, ImportedContact["contact_type"]> = {
  cold: "cold", холодная: "cold", "холодная база": "cold",
  recommendation: "recommendation", рекомендация: "recommendation",
  instagram: "instagram", инстаграм: "instagram",
  site: "site", сайт: "site",
  other: "other", другое: "other",
};

const normType = (v: unknown): ImportedContact["contact_type"] => {
  const k = String(v ?? "").trim().toLowerCase();
  return TYPE_MAP[k] ?? "cold";
};

const findCol = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h));

const rowsFromMatrix = (matrix: string[][]): ImportedContact[] => {
  if (matrix.length < 1) return [];
  const header = matrix[0].map((h) => String(h ?? "").trim().toLowerCase());
  const iName = findCol(header, /name|фио|имя|клиент/i);
  const iPhone = findCol(header, /phone|тел|номер/i);
  const iSource = findCol(header, /source|источник/i);
  const iType = findCol(header, /type|тип/i);
  const iComment = findCol(header, /comment|коммент|примеч/i);
  if (iName < 0 || iPhone < 0) throw new Error("Файл должен содержать колонки ФИО и Телефон");
  return matrix.slice(1).map((c) => ({
    full_name: String(c[iName] ?? "").trim(),
    phone: String(c[iPhone] ?? "").trim(),
    source: iSource >= 0 ? String(c[iSource] ?? "").trim() || null : null,
    contact_type: iType >= 0 ? normType(c[iType]) : "cold",
    comment: iComment >= 0 ? String(c[iComment] ?? "").trim() || null : null,
  })).filter((r) => r.full_name && r.phone);
};

const parseCsv = (text: string): ImportedContact[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const matrix = lines.map((l) => l.split(/[,;\t]/).map((x) => x.trim()));
  return rowsFromMatrix(matrix);
};

const parseTxt = (text: string): ImportedContact[] => {
  // Try CSV first; if no header keywords, treat each line as "ФИО, телефон" or just phone
  if (/name|фио|имя|phone|тел/i.test(text.split(/\r?\n/)[0] ?? "")) return parseCsv(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => {
    const m = l.match(/(.+?)[\s,;\t]+([+\d][\d\s\-()]{6,})/);
    if (m) return { full_name: m[1].trim(), phone: m[2].trim(), source: null, contact_type: "cold" as const, comment: null };
    const phoneOnly = l.match(/[+\d][\d\s\-()]{6,}/);
    if (phoneOnly) return { full_name: "Без имени", phone: phoneOnly[0].trim(), source: null, contact_type: "cold" as const, comment: null };
    return null;
  }).filter(Boolean) as ImportedContact[];
};

const parseXlsx = async (file: File): Promise<ImportedContact[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
  return rowsFromMatrix(matrix);
};

const parseDocx = async (file: File): Promise<ImportedContact[]> => {
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return parseTxt(value);
};

export async function parseContactsFile(file: File): Promise<ImportedContact[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  if (name.endsWith(".docx")) return parseDocx(file);
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".txt")) return parseTxt(await file.text());
  throw new Error("Поддерживаются: .xlsx, .xls, .csv, .docx, .txt");
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const last2 = digits.slice(-2);
  // +7 *** *** ** 28
  return `+${digits[0] ?? "*"} *** *** ** ${last2}`;
}

export function exportContactsCsv(rows: Array<Record<string, unknown>>): string {
  const headers = ["ФИО", "Телефон", "Тип", "Источник", "Статус", "Комментарий", "Дата добавления"];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.full_name, r.phone, r.contact_type, r.source, r.status, r.comment,
      r.created_at ? new Date(String(r.created_at)).toLocaleString("ru-RU") : "",
    ].map(escape).join(";"));
  }
  return "\ufeff" + lines.join("\n");
}
