import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { useI18n } from '@/i18n';

interface CameraDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type Facing = 'environment' | 'user';

export function CameraDialog({ open, onClose, onCapture }: CameraDialogProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('camera.unsupported'));
      return;
    }
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().then(() => setReady(true)).catch(() => setReady(true));
        }
      })
      .catch(() => {
        if (!cancelled) setError(t('camera.denied'));
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing, stopStream, t]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Dialog
      open={open}
      title={t('camera.title')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
          >
            {t('camera.flip')}
          </button>
          <button type="button" className="btn btn--primary" onClick={capture} disabled={!ready || !!error}>
            {t('camera.capture')}
          </button>
        </>
      }
    >
      {error ? (
        <p className="dialog__text" role="alert">
          {error}
        </p>
      ) : (
        <video ref={videoRef} className="camera__video" playsInline muted />
      )}
    </Dialog>
  );
}
