import { SAMPLE_LINES } from '@/lib/constants';

/**
 * Renders the sample Kannada paragraph to a PNG so "Try a sample" works with a real backend too.
 */
export async function makeSampleFile(): Promise<File> {
  const width = 1200;
  const lineHeight = 120;
  const height = 160 + SAMPLE_LINES.length * lineHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  try {
    await document.fonts.load("500 56px 'Noto Sans Kannada'", SAMPLE_LINES[0]);
  } catch {
    /* fall back to whatever font is available */
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#14213D';
  ctx.font = "500 56px 'Noto Sans Kannada', sans-serif";
  ctx.textBaseline = 'middle';
  SAMPLE_LINES.forEach((line, i) => {
    ctx.fillText(line, 80, 120 + i * lineHeight);
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return new File([blob], 'sample-kannada-paragraph.png', { type: 'image/png' });
}
