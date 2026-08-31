import {
  PDFDocument,
  PDFPage,
  PDFFont,
  RGB,
  StandardFonts,
  rgb,
} from 'pdf-lib';

export type CertificatePdfInput = {
  studentName: string;
  courseTitle: string;
  issuedAt: Date;
  code: string;
  workloadHours: number;
  /** Base pública do site (ex.: https://ava.exemplo.com.br) para o link. */
  publicOrigin?: string;
};

/** Paleta azul institucional (slate-navy). */
const COLORS = {
  ink: rgb(0.047, 0.102, 0.165), // #0c1a2a
  inkSoft: rgb(0.239, 0.31, 0.388), // #3d4f63
  muted: rgb(0.42, 0.486, 0.561), // #6b7c8f
  brand: rgb(0.102, 0.29, 0.431), // #1a4a6e
  brandDark: rgb(0.071, 0.165, 0.294), // #122b4b
  brandSoft: rgb(0.91, 0.945, 0.98), // #e8f1fa
  accent: rgb(0.239, 0.42, 0.604), // #3d6b9a
  accentSoft: rgb(0.847, 0.906, 0.961), // #d8e7f5
  white: rgb(1, 1, 1),
  line: rgb(0.835, 0.871, 0.91), // #d5dee8
} as const;

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(d);
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  return lines.length ? lines : [''];
}

function fitFontSize(
  text: string,
  font: PDFFont,
  maxSize: number,
  minSize: number,
  maxWidth: number,
): number {
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    const lines = wrapText(text, font, size, maxWidth);
    const widest = Math.max(
      ...lines.map((line) => font.widthOfTextAtSize(line, size)),
    );
    if (widest <= maxWidth && lines.length <= 3) return size;
  }
  return minSize;
}

function drawCenteredBlock(
  page: PDFPage,
  lines: string[],
  centerX: number,
  topY: number,
  size: number,
  font: PDFFont,
  color: RGB,
  lineHeight: number,
): number {
  let y = topY;
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: centerX - w / 2,
      y,
      size,
      font,
      color,
    });
    y -= lineHeight;
  }
  return y;
}

function drawHorizontalRule(
  page: PDFPage,
  centerX: number,
  y: number,
  width: number,
  color: RGB,
  thickness = 1,
): void {
  page.drawLine({
    start: { x: centerX - width / 2, y },
    end: { x: centerX + width / 2, y },
    thickness,
    color,
  });
}

function drawCornerOrnaments(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  arm: number,
): void {
  const corners = [
    { ox: x, oy: y + h, dx: 1, dy: -1 },
    { ox: x + w, oy: y + h, dx: -1, dy: -1 },
    { ox: x, oy: y, dx: 1, dy: 1 },
    { ox: x + w, oy: y, dx: -1, dy: 1 },
  ];

  for (const c of corners) {
    page.drawLine({
      start: { x: c.ox, y: c.oy },
      end: { x: c.ox + arm * c.dx, y: c.oy },
      thickness: 2.5,
      color: COLORS.accent,
    });
    page.drawLine({
      start: { x: c.ox, y: c.oy },
      end: { x: c.ox, y: c.oy + arm * c.dy },
      thickness: 2.5,
      color: COLORS.accent,
    });
  }
}

/** Gera PDF A4 paisagem — layout institucional Globaltec Educacional. */
export async function buildCertificatePdf(
  input: CertificatePdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const { width, height } = page.getSize();
  const margin = 32;
  const frameX = margin;
  const frameY = margin;
  const frameW = width - margin * 2;
  const frameH = height - margin * 2;
  const centerX = width / 2;
  const contentW = frameW - 120;

  // Fundo suave interno
  page.drawRectangle({
    x: frameX,
    y: frameY,
    width: frameW,
    height: frameH,
    color: COLORS.brandSoft,
  });

  // Borda externa dupla
  page.drawRectangle({
    x: frameX,
    y: frameY,
    width: frameW,
    height: frameH,
    borderColor: COLORS.brandDark,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: frameX + 8,
    y: frameY + 8,
    width: frameW - 16,
    height: frameH - 16,
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  });
  page.drawRectangle({
    x: frameX + 14,
    y: frameY + 14,
    width: frameW - 28,
    height: frameH - 28,
    color: COLORS.white,
    borderColor: COLORS.line,
    borderWidth: 1,
  });

  drawCornerOrnaments(
    page,
    frameX + 14,
    frameY + 14,
    frameW - 28,
    frameH - 28,
    22,
  );

  // Faixa superior institucional
  const headerH = 58;
  page.drawRectangle({
    x: frameX + 14,
    y: frameY + frameH - 14 - headerH,
    width: frameW - 28,
    height: headerH,
    color: COLORS.brand,
  });
  page.drawRectangle({
    x: frameX + 14,
    y: frameY + frameH - 14 - headerH,
    width: frameW - 28,
    height: 4,
    color: COLORS.accent,
  });

  const headerTitle = 'Globaltec Educacional';
  page.drawText(headerTitle, {
    x: centerX - fontBold.widthOfTextAtSize(headerTitle, 20) / 2,
    y: frameY + frameH - 14 - headerH + 18,
    size: 20,
    font: fontBold,
    color: COLORS.white,
  });

  // Área útil entre cabeçalho e rodapé (centralização vertical)
  const footerY = frameY + 36;
  const footerBoxH = 34;
  const contentAreaTop = frameY + frameH - 14 - headerH - 20;
  const contentAreaBottom = footerY - 8 + footerBoxH + 28;

  const nameSize = fitFontSize(input.studentName, fontBold, 28, 16, contentW);
  const nameLines = wrapText(input.studentName, fontBold, nameSize, contentW);
  const titleSize = fitFontSize(input.courseTitle, fontBold, 22, 14, contentW);
  const titleLines = wrapText(input.courseTitle, fontBold, titleSize, contentW);
  const hoursLabel =
    input.workloadHours > 0
      ? `Carga horária: ${input.workloadHours} horas`
      : null;
  const metaLineCount = hoursLabel ? 2 : 1;

  const contentHeight =
    30 + // título principal
    46 + // linha + espaço
    49 + // intro + espaço
    nameLines.length * (nameSize + 8) +
    10 +
    38 + // linha + espaço
    47 + // corpo + espaço
    titleLines.length * (titleSize + 6) +
    16 +
    metaLineCount * 16;

  const verticalPad = Math.max(
    12,
    (contentAreaTop - contentAreaBottom - contentHeight) / 2,
  );
  let y = contentAreaBottom + verticalPad + contentHeight - 30;

  // Título principal
  const mainTitle = 'Certificado de Conclusão';
  page.drawText(mainTitle, {
    x: centerX - fontBold.widthOfTextAtSize(mainTitle, 30) / 2,
    y,
    size: 30,
    font: fontBold,
    color: COLORS.ink,
  });

  y -= 18;
  drawHorizontalRule(page, centerX, y, 220, COLORS.accent, 2);
  y -= 28;

  const intro = 'Certificamos que';
  page.drawText(intro, {
    x: centerX - fontOblique.widthOfTextAtSize(intro, 13) / 2,
    y,
    size: 13,
    font: fontOblique,
    color: COLORS.muted,
  });
  y -= 36;

  y = drawCenteredBlock(
    page,
    nameLines,
    centerX,
    y,
    nameSize,
    fontBold,
    COLORS.ink,
    nameSize + 8,
  );
  y -= 10;

  drawHorizontalRule(
    page,
    centerX,
    y + 6,
    Math.min(contentW * 0.55, 360),
    COLORS.line,
    1,
  );
  y -= 28;

  const body = 'concluiu com êxito o curso';
  page.drawText(body, {
    x: centerX - font.widthOfTextAtSize(body, 13) / 2,
    y,
    size: 13,
    font,
    color: COLORS.muted,
  });
  y -= 34;

  y = drawCenteredBlock(
    page,
    titleLines,
    centerX,
    y,
    titleSize,
    fontBold,
    COLORS.brandDark,
    titleSize + 6,
  );
  y -= 16;

  const dateLabel = `Emitido em ${formatDate(input.issuedAt)}`;
  const metaLines = hoursLabel ? [hoursLabel, dateLabel] : [dateLabel];

  for (const line of metaLines) {
    page.drawText(line, {
      x: centerX - font.widthOfTextAtSize(line, 11) / 2,
      y,
      size: 11,
      font,
      color: COLORS.inkSoft,
    });
    y -= 16;
  }

  // Rodapé — verificação
  const origin = (input.publicOrigin ?? '').replace(/\/$/, '');
  const verifyUrl = origin
    ? `${origin}/verificar/${input.code}`
    : `/verificar/${input.code}`;

  const footerBoxW = Math.min(frameW - 80, 620);
  const footerBoxX = centerX - footerBoxW / 2;
  page.drawRectangle({
    x: footerBoxX,
    y: footerY - 8,
    width: footerBoxW,
    height: 34,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: COLORS.line,
    borderWidth: 1,
  });

  const codeLine = `Código de verificação: ${input.code}`;
  page.drawText(codeLine, {
    x: centerX - fontBold.widthOfTextAtSize(codeLine, 10) / 2,
    y: footerY + 12,
    size: 10,
    font: fontBold,
    color: COLORS.ink,
  });

  const consult = `Valide em ${verifyUrl}`;
  page.drawText(consult, {
    x: centerX - font.widthOfTextAtSize(consult, 8.5) / 2,
    y: footerY,
    size: 8.5,
    font,
    color: COLORS.muted,
  });

  return doc.save();
}
