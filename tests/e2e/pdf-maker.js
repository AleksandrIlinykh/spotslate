// Builds a small text PDF for the reader's tests: one page per entry, each a list of lines [x, y, text] in points
// from the bottom left (as PDF places them), set in Helvetica, every line its own text run.
export function makePdf(pages, { width = 420, height = 340, size = 14 } = {}) {
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  const kids = [];
  for (const lines of pages) {
    const stream = lines.map(([x, y, text]) => `BT /F1 ${size} Tf ${x} ${y} Td (${escape(text)}) Tj ET`).join('\n');
    const contents = objects.push(`<</Length ${Buffer.byteLength(stream, 'latin1')}>>\nstream\n${stream}\nendstream`);
    const resources = '<</Font<</F1 3 0 R>>>>';
    kids.push(objects.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]/Contents ${contents} 0 R/Resources${resources}>>`));
  }
  objects[1] = `<</Type/Pages/Kids[${kids.map((id) => `${id} 0 R`).join(' ')}]/Count ${kids.length}>>`;
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const escape = (text) => text.replace(/[\\()]/g, '\\$&');
