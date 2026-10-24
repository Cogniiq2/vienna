/** Nur für das Debug-Panel: erzeugt kurze Test-Medien im Browser (keine Dateien im Repo). */

/** Leiser Sinuston als WAV. */
export function createDebugAudio(seconds: number, frequency: number): Blob {
  const rate = 22050;
  const samples = Math.floor(rate * seconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 2000, (samples - i) / 2000);
    view.setInt16(44 + i * 2, Math.sin((2 * Math.PI * frequency * i) / rate) * 6000 * fade, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Drei Sekunden ruhiges Canvas-Video (WebM/MP4 je nach Browser). null, wenn MediaRecorder fehlt. */
export async function createDebugVideo(): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') return null;
  const stream = canvas.captureStream(24);
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!type) return null;
  const recorder = new MediaRecorder(stream, { mimeType: type });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - start) / 3000;
      ctx.fillStyle = `hsl(${30 + t * 20}, 30%, ${70 - t * 20}%)`;
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '300 48px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ђорђе · Богдана · Лазар', 320, 190);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    frame();
  });
  recorder.stop();
  await done;
  return new Blob(chunks, { type: type.split(';')[0] });
}
