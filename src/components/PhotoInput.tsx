import { useEffect, useId, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export function PhotoInput({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const id = useId();
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(next?: File) {
    if (!next) return;
    if (!PHOTO_TYPES.includes(next.type)) { setError('請選擇 JPG、PNG、WebP 或 HEIC 照片。'); return; }
    if (next.size > MAX_PHOTO_SIZE) { setError('照片不能超過 10 MB，請縮小照片後重新選取。'); return; }
    setError('');
    onChange(next);
  }

  return <div className="compare-photo span-2">
    <div className="compare-photo-preview">
      {preview ? <img src={preview} alt="比價照片預覽" onError={() => setError('瀏覽器無法預覽此照片，可改選 JPG 或 PNG。')} /> : <ImagePlus size={30} />}
      {file ? <div className="photo-selection"><span>{file.name}</span><button type="button" className="icon-button" aria-label="移除選取的照片" onClick={() => { onChange(null); setError(''); }}><X size={18} /></button></div> : null}
    </div>
    <div className="photo-options">
      <label className="button secondary" htmlFor={`${id}-album`}><ImagePlus size={18} />選擇照片</label>
      <input id={`${id}-album`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic" aria-label="選擇比價照片" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
      <label className="button secondary" htmlFor={`${id}-camera`}><Camera size={18} />拍照</label>
      <input id={`${id}-camera`} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="拍攝比價照片" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
