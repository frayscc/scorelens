import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontDataUrl from '../../node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf?inline';
import fontkit from '@pdf-lib/fontkit';
import { downloadBlob, safeFileName } from './fileDownload';

export const A4 = { portrait: [595.28, 841.89] as [number, number] };
export const PDF_COLORS = {
  ink: rgb(0.094, 0.137, 0.122), muted: rgb(0.427, 0.486, 0.459),
  brand: rgb(0.071, 0.420, 0.310), brandDark: rgb(0.067, 0.243, 0.192), brandSoft: rgb(0.906, 0.953, 0.933),
  line: rgb(0.863, 0.898, 0.878), advantage: rgb(0.882, 0.953, 0.925), advantageText: rgb(0.078, 0.376, 0.278),
  weakness: rgb(1, 0.941, 0.910), weaknessText: rgb(0.643, 0.286, 0.157), white: rgb(1,1,1), normal: rgb(0.973,0.984,0.976),
  progress: rgb(0.882, 0.953, 0.925), progressText: rgb(0.078, 0.376, 0.278),
  decline: rgb(1, 0.957, 0.863), declineText: rgb(0.604, 0.353, 0.071),
};

function decodeDataUrl(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(',')[1];
  if (!encoded) throw new Error('内置中文字体加载失败。');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function createChinesePdf(fontBytes?: Uint8Array): Promise<{ document: PDFDocument; font: PDFFont }> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // Keep the complete TrueType font. fontkit's CJK subsetting can remap composite
  // glyph ids incorrectly in some PDF readers, which manifests as sporadic blank
  // Chinese characters even though the source text is intact.
  const font = await document.embedFont(fontBytes ?? decodeDataUrl(fontDataUrl), { subset: false });
  document.setCreator('ScoreLens');
  document.setProducer('ScoreLens · Local First');
  return { document, font };
}

export function fitText(font: PDFFont, text: string, maximumWidth: number, preferredSize: number, minimumSize = 4): number {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maximumWidth) size -= .25;
  return size;
}

export function drawCenteredText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color = PDF_COLORS.ink): void {
  const actual = fitText(font, text, width - 4, size);
  const textWidth = font.widthOfTextAtSize(text, actual);
  page.drawText(text, { x: x + Math.max(2, (width - textWidth) / 2), y, size: actual, font, color });
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  downloadBlob(new Blob([buffer], { type: 'application/pdf' }), `${safeFileName(fileName)}.pdf`);
}
