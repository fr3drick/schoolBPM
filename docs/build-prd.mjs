/**
 * Renders docs/PRD.md to docs/School-BPM-PRD.docx.
 *
 * The Markdown is the single source of truth; the Word file is a build
 * artefact so the two cannot drift. Handles only the constructs the PRD
 * actually uses: headings, paragraphs, pipe tables, bullet and numbered
 * lists, and inline bold / italic / code.
 *
 *   cd docs && npm install && npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat,
  PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLUE = '1565C0';
const DARK = '212B36';
const GREY = '637381';
const LIGHT = 'F4F7FB';
const BORDER = 'D7DEE6';
const CONTENT = 9026; // A4 minus 2x1440 twip margins

/** Splits inline markdown into styled runs. */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), size: 21, color: DARK, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), bold: true, size: 21, color: DARK, ...base }));
    } else if (tok.startsWith('`')) {
      out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: 19, color: '3A4750', ...base }));
    } else {
      out.push(new TextRun({ text: tok.slice(1, -1), italics: true, size: 21, color: DARK, ...base }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), size: 21, color: DARK, ...base }));
  return out.length ? out : [new TextRun({ text: '', size: 21 })];
}

const splitRow = (line) =>
  line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: BORDER };

function tableCell(text, width, { header = false, shade } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
    verticalAlign: VerticalAlign.CENTER,
    shading: header
      ? { type: ShadingType.CLEAR, fill: BLUE }
      : shade
        ? { type: ShadingType.CLEAR, fill: LIGHT }
        : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: 252 },
        children: header
          ? [new TextRun({ text: text.replace(/\*\*/g, ''), bold: true, size: 20, color: 'FFFFFF' })]
          : runs(text, { size: 20 }),
      }),
    ],
  });
}

function buildTable(rows) {
  const header = splitRow(rows[0]);
  const body = rows.slice(2).map(splitRow);
  const hasHeader = header.some((c) => c !== '');
  const cols = header.length;
  const width = Math.floor(CONTENT / cols);
  const widths = Array(cols).fill(width);
  widths[cols - 1] = CONTENT - width * (cols - 1);

  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      ...(hasHeader
        ? [new TableRow({
            tableHeader: true,
            children: header.map((c, i) => tableCell(c, widths[i], { header: true })),
          })]
        : []),
      ...body.map((r, ri) =>
        new TableRow({
          children: widths.map((w, i) => tableCell(r[i] ?? '', w, { shade: ri % 2 === 1 })),
        })
      ),
    ],
  });
}

function convert(md) {
  const lines = md.split('\n');
  const children = [];
  let i = 0;
  let titleDone = false;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Table: a pipe row followed by a separator row.
    if (line.trim().startsWith('|') && (lines[i + 1] || '').includes('---')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++]);
      children.push(buildTable(block));
      children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const [, hashes, text] = heading;
      if (hashes.length === 1 && !titleDone) {
        titleDone = true;
        children.push(new Paragraph({
          spacing: { before: 200, after: 40 },
          children: [new TextRun({ text: text.replace(/\s*—.*$/, ''), size: 52, bold: true, color: BLUE })],
        }));
        const sub = text.includes('—') ? text.split('—').slice(1).join('—').trim() : '';
        if (sub) {
          children.push(new Paragraph({
            spacing: { after: 220 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE } },
            children: [new TextRun({ text: sub, size: 28, color: DARK })],
          }));
        }
      } else {
        children.push(new Paragraph({
          heading: hashes.length === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          children: runs(text, { size: hashes.length === 2 ? 30 : 24, bold: true, color: hashes.length === 2 ? BLUE : DARK }),
        }));
      }
      i += 1;
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const parts = [(bullet || numbered)[1]];
      i += 1;
      // Wrapped continuation lines belong to the same list item.
      while (
        i < lines.length && lines[i].trim() &&
        !/^[-*]\s|^\d+\.\s|^#{1,3}\s/.test(lines[i]) && !lines[i].trim().startsWith('|')
      ) {
        parts.push(lines[i].trim());
        i += 1;
      }
      children.push(new Paragraph({
        numbering: { reference: bullet ? 'bullets' : 'nums', level: 0 },
        spacing: { after: 80, line: 276 },
        children: runs(parts.join(' ')),
      }));
      continue;
    }

    // Paragraph: join wrapped lines until a blank or a new block starts.
    const para = [line.trim()];
    i += 1;
    while (
      i < lines.length && lines[i].trim() &&
      !/^[-*]\s|^\d+\.\s|^#{1,3}\s/.test(lines[i]) && !lines[i].trim().startsWith('|')
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    children.push(new Paragraph({
      spacing: { after: 120, line: 276 },
      children: runs(para.join(' ')),
    }));
  }
  return children;
}

const md = fs.readFileSync(path.join(HERE, 'PRD.md'), 'utf8');

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] },
      { reference: 'nums', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21, color: DARK } },
      heading1: { run: { font: 'Calibri', size: 30, bold: true, color: BLUE }, paragraph: { spacing: { before: 340, after: 160 } } },
      heading2: { run: { font: 'Calibri', size: 24, bold: true, color: DARK }, paragraph: { spacing: { before: 240, after: 120 } } },
    },
  },
  sections: [{
    properties: {},
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'School BPM — Product Requirements Document   ·   Page ', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
            new TextRun({ text: ' of ', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
          ],
        })],
      }),
    },
    children: convert(md),
  }],
});

const out = path.join(HERE, 'School-BPM-PRD.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log(`Wrote ${out} (${buf.length} bytes)`);
});
