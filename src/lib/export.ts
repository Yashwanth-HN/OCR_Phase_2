import { baseName } from '@/lib/job';
import { safeFileName } from '@/lib/download';

export interface ExportSection {
  /** Usually the source file name. */
  title: string;
  text: string;
}

export type ExportFormat = 'txt' | 'docx';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const KANNADA_FONT = 'Noto Sans Kannada';

export function buildTxt(sections: ExportSection[]): Blob {
  const body =
    sections.length === 1
      ? (sections[0]?.text ?? '')
      : sections.map((s) => `===== ${s.title} =====\n${s.text}`).join('\n\n');
  return new Blob([body + '\n'], { type: 'text/plain;charset=utf-8' });
}

/** Builds a Word document with one section (starting on a new page) per input. */
export async function buildDocx(sections: ExportSection[]): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const run = (text: string, bold = false, size = 28) =>
    new TextRun({
      text,
      bold,
      size,
      sizeComplexScript: size,
      font: { ascii: KANNADA_FONT, cs: KANNADA_FONT, eastAsia: KANNADA_FONT, hAnsi: KANNADA_FONT },
      language: { value: 'kn-IN' },
    });

  const document = new Document({
    creator: 'Kannada OCR',
    title: sections[0]?.title ?? 'Kannada OCR',
    sections: sections.map((section) => ({
      children: [
        ...(sections.length > 1
          ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(section.title, true, 32)] })]
          : []),
        ...section.text.split('\n').map(
          (line) => new Paragraph({ spacing: { after: 160, line: 360 }, children: [run(line)] }),
        ),
      ],
    })),
  });

  return Packer.toBlob(document);
}

export async function buildExport(sections: ExportSection[], format: ExportFormat): Promise<Blob> {
  return format === 'txt' ? buildTxt(sections) : buildDocx(sections);
}

/** Zips one export file per section. */
export async function buildZip(sections: ExportSection[], format: ExportFormat): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const section of sections) {
    let name = `${safeFileName(baseName(section.title))}.${format}`;
    for (let n = 2; used.has(name); n += 1) {
      name = `${safeFileName(baseName(section.title))} (${n}).${format}`;
    }
    used.add(name);
    zip.file(name, await buildExport([section], format));
  }
  return zip.generateAsync({ type: 'blob' });
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Fallback used in demo mode (no backend): opens the browser's print dialog, where "Save as PDF" works. */
export function printAsPdf(title: string, text: string): boolean {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return false;
  win.document.write(
    `<!doctype html><html lang="kn"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>body{font-family:'Noto Sans Kannada','Noto Sans',sans-serif;font-size:16pt;line-height:1.9;margin:2cm;white-space:pre-wrap}</style>` +
      `</head><body>${escapeHtml(text)}</body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
  return true;
}
