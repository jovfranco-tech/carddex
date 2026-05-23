import { useState } from 'react';
import { ShareIcon } from './icons';
import { triggerHaptic } from '@/lib/haptic';

interface SocialShareButtonProps {
  title: string;
  subtitle: string;
  imageUrl: string;
  qrValue: string;
  stats?: { label: string; value: string }[];
  onToast: (msg: string) => void;
}

export default function SocialShareButton({
  title,
  subtitle,
  imageUrl,
  stats = [],
  onToast,
}: SocialShareButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    triggerHaptic('medium');
    onToast('Generando tarjeta social premium...');

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setGenerating(false);
      onToast('Error al inicializar lienzo.');
      return;
    }

    try {
      // 1. Draw sleek futuristic background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 900);
      bgGrad.addColorStop(0, '#13111C');
      bgGrad.addColorStop(0.5, '#0C0A12');
      bgGrad.addColorStop(1, '#050408');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 600, 900);

      // 2. Draw glowing cyber rings in background
      ctx.strokeStyle = 'rgba(123, 90, 217, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(300, 420, 240, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 188, 212, 0.08)';
      ctx.beginPath();
      ctx.arc(300, 420, 280, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Render Card image (with CORS handling)
      const cardImg = new Image();
      cardImg.crossOrigin = 'anonymous';
      cardImg.src = imageUrl;

      await new Promise<void>((resolve) => {
        cardImg.onload = () => {
          // Draw image with rounded corners and glowing shadow
          ctx.save();

          // Outer card shadow/glow
          ctx.shadowColor = 'rgba(123, 90, 217, 0.4)';
          ctx.shadowBlur = 24;

          // Round corners clip
          const cx = 160;
          const cy = 120;
          const cw = 280;
          const ch = 392;
          const radius = 18;

          ctx.beginPath();
          ctx.moveTo(cx + radius, cy);
          ctx.lineTo(cx + cw - radius, cy);
          ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + radius);
          ctx.lineTo(cx + cw, cy + ch - radius);
          ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - radius, cy + ch);
          ctx.lineTo(cx + radius, cy + ch);
          ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - radius);
          ctx.lineTo(cx, cy + radius);
          ctx.quadraticCurveTo(cx, cy, cx + radius, cy);
          ctx.closePath();

          ctx.clip();
          ctx.drawImage(cardImg, cx, cy, cw, ch);
          ctx.restore();
          resolve();
        };

        cardImg.onerror = () => {
          // Fallback if image fails or CORS is blocked
          console.warn('[SocialShare] Image blocked by CORS/network. Drawing placeholder...');
          ctx.save();
          ctx.fillStyle = '#1D1B26';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 2;

          // Draw standard card shape
          const cx = 160;
          const cy = 120;
          const cw = 280;
          const ch = 392;
          const radius = 18;

          ctx.beginPath();
          ctx.moveTo(cx + radius, cy);
          ctx.lineTo(cx + cw - radius, cy);
          ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + radius);
          ctx.lineTo(cx + cw, cy + ch - radius);
          ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - radius, cy + ch);
          ctx.lineTo(cx + radius, cy + ch);
          ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - radius);
          ctx.lineTo(cx, cy + radius);
          ctx.quadraticCurveTo(cx, cy, cx + radius, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Write name on placeholder
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(title, 300, 310);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = '14px system-ui, sans-serif';
          ctx.fillText(subtitle, 300, 340);
          ctx.restore();
          resolve();
        };
      });

      // 4. Draw Branding header
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'center';
      ctx.fillText('CARDDEX TCG', 300, 60);

      // 5. Draw Title & Subtitle (Card/Deck Details)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
      ctx.letterSpacing = '-1px';
      ctx.textAlign = 'center';
      ctx.fillText(title, 300, 580);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.fillText(subtitle, 300, 610);

      // 6. Draw statistics / attributes grid
      if (stats.length > 0) {
        const startY = 660;
        const boxWidth = 110;
        const totalWidth = stats.length * boxWidth + (stats.length - 1) * 14;
        let startX = (600 - totalWidth) / 2;

        stats.forEach((s) => {
          // Draw glass card box
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(startX, startY, boxWidth, 68, 12);
          ctx.fill();
          ctx.stroke();

          // Text labels
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.letterSpacing = '0.5px';
          ctx.textAlign = 'center';
          ctx.fillText(s.label.toUpperCase(), startX + boxWidth / 2, startY + 24);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.letterSpacing = '-0.5px';
          ctx.fillText(s.value, startX + boxWidth / 2, startY + 48);

          startX += boxWidth + 14;
        });
      }

      // 7. Draw QR scanner target block / mockup code
      const qrX = 270;
      const qrY = 760;
      ctx.fillStyle = '#1D1A29';
      ctx.strokeStyle = 'rgba(123, 90, 217, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(qrX, qrY, 60, 60, 8);
      ctx.fill();
      ctx.stroke();

      // Draw futuristic visual bits in QR area
      ctx.fillStyle = '#7B5AD9';
      ctx.fillRect(qrX + 8, qrY + 8, 14, 14);
      ctx.fillRect(qrX + 38, qrY + 8, 14, 14);
      ctx.fillRect(qrX + 8, qrY + 38, 14, 14);
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(qrX + 26, qrY + 26, 8, 8);
      ctx.fillRect(qrX + 38, qrY + 38, 14, 14);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.letterSpacing = '1px';
      ctx.fillText('ESCANEADO POR IA', 300, 850);

      // 8. Download PNG
      canvas.toBlob((blob) => {
        if (!blob) {
          onToast('Error al exportar PNG');
          setGenerating(false);
          return;
        }
        const fileUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = `carddex-${title.toLowerCase().replace(/\s+/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(fileUrl);

        onToast('¡Ficha social descargada con éxito!');
        setGenerating(false);
      }, 'image/png');
    } catch (e) {
      console.error(e);
      onToast('Error generando la infografía');
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={generating}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.06)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        color: '#fff',
        padding: '10px 18px',
        borderRadius: 14,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'all 200ms ease',
      }}
    >
      <ShareIcon size={16} />
      <span>{generating ? 'Exportando…' : 'Exportar Ficha IA'}</span>
    </button>
  );
}
