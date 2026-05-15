'use client';

import { useRef, useState } from 'react';
import { NeonButton } from './NeonButton';

interface Props {
  /** Current avatar data URL, or null. */
  current: string | null;
  /** Display fallback if no image set (e.g. initials). */
  fallback: string;
  /** Called with a new data URL after the user picks + resizes a file. */
  onPick: (dataUrl: string) => Promise<void> | void;
  /** Called with null when the user clears their avatar. */
  onClear?: () => Promise<void> | void;
  size?: number;
  busyLabel?: string;
  pickLabel?: string;
  clearLabel?: string;
}

const TARGET_SIZE = 128;       // px square output
const TARGET_QUALITY = 0.82;   // JPEG quality
const MAX_BYTES = 60_000;      // ~60 KB after encode

/**
 * Lets the player pick a local image, crops it to a centered square,
 * resizes to 128×128 and encodes as a JPEG data URL. Calls onPick with
 * the resulting string. Pure client-side — the file never leaves the
 * browser before being sent through the caller.
 */
export function AvatarUploader({
  current,
  fallback,
  onPick,
  onClear,
  size = 88,
  busyLabel = '…',
  pickLabel = 'Upload',
  clearLabel = 'Remove',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const url = await fileToSquareDataUrl(file);
      await onPick(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-full overflow-hidden relative shrink-0"
        style={{ width: size, height: size }}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current}
            alt="avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="surface-strong w-full h-full flex items-center justify-center text-gold text-lg font-display">
            {fallback}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-obsidian-bg/60 flex items-center justify-center text-[10px] text-gold uppercase tracking-widest">
            {busyLabel}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <NeonButton
          size="sm"
          variant="gold"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          type="button"
        >
          {pickLabel}
        </NeonButton>
        {current && onClear && (
          <NeonButton
            size="sm"
            variant="ghost"
            onClick={async () => {
              setBusy(true);
              try { await onClear(); } finally { setBusy(false); }
            }}
            disabled={busy}
            type="button"
          >
            {clearLabel}
          </NeonButton>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        {error && (
          <span className="text-[10px] text-status-alert">{error}</span>
        )}
      </div>
    </div>
  );
}

async function fileToSquareDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }
  if (file.size > 8 * 1024 * 1024) {
    // 8 MB upper bound on the raw file; the resize squashes it later
    throw new Error('file_too_large');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read_failed'));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('decode_failed'));
    i.src = dataUrl;
  });

  // Centered square crop, then resize.
  const min = Math.min(img.width, img.height);
  const sx = (img.width - min) / 2;
  const sy = (img.height - min) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unsupported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, min, min, 0, 0, TARGET_SIZE, TARGET_SIZE);

  let quality = TARGET_QUALITY;
  let out = canvas.toDataURL('image/jpeg', quality);
  // If still too big (unlikely at 128×128), step the quality down.
  while (out.length > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}
