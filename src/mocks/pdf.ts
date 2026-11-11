/**
 * A minimal single-font PDF writer for mock exports. Text only, monospaced, paginated.
 * Characters outside Latin-1 (µ, ³, −) are transliterated, since the standard fonts are Latin-1.
 */
const TRANSLIT: Record<string, string> = { "µ": "u", "³": "3", "−": "-", "–": "-", "’": "'", "·": "-", "≈": "~" };

function pdfText(s: string): string {
  return s
    .replace(/[µ³−–’·≈]/g, (c) => TRANSLIT[c] ?? "?")
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[^\x20-\x7e]/g, "?");
}

export function simplePdf(lines: string[], { title }: { title: string }): Uint8Array {
  const perPage = 58;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) ;
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // pages, filled below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  pages.forEach((pageLines, p) => {
    const ops = ["BT", "/F2 13 Tf", "40 800 Td", `(${pdfText(title)}) Tj`, "/F1 8 Tf", "0 -20 Td", "10 TL"];
    for (const l of pageLines) ops.push(`(${pdfText(l)}) '`);
    ops.push("ET", "BT", "/F1 7 Tf", "40 24 Td", `(Page ${p + 1} of ${pages.length}) Tj`, "ET");
    const stream = ops.join("\n");
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contentId = objects.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(objects.length);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
