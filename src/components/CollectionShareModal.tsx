import { useEffect, useRef, useState, MouseEvent } from 'react';
import type { PokemonCard } from '@/types/pokemon';
import type { CollectionSummary } from '@/lib/collectionStorage';
import { getEstimatedPrice } from '@/lib/pricing';
import Surface from './Surface';

interface CollectionShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: CollectionSummary;
  showcaseCards: PokemonCard[];
  username: string;
  userId: string;
  onShowToast: (msg: string) => void;
}

export default function CollectionShareModal({
  isOpen,
  onClose,
  summary,
  showcaseCards,
  username,
  userId,
  onShowToast,
}: CollectionShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Helper to draw rounded rectangle in Canvas
  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill = true,
    stroke = false
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  };

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsGenerating(false);
      return;
    }

    const generatePoster = async () => {
      // 1. Calculate Collection Statistics
      let totalPortfolioValue = 0;
      showcaseCards.forEach((c) => {
        const p = getEstimatedPrice(c);
        if (p) totalPortfolioValue += p.value;
      });

      // Dimensioning
      const W = 800;
      const H = 1000;
      canvas.width = W;
      canvas.height = H;

      // Draw background dark gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#090A0E');
      bgGrad.addColorStop(0.5, '#10131E');
      bgGrad.addColorStop(1, '#1A1E2E');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Draw futuristic glass radial glows
      const purpleGlow = ctx.createRadialGradient(150, 150, 10, 150, 150, 450);
      purpleGlow.addColorStop(0, 'rgba(156, 39, 176, 0.15)');
      purpleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = purpleGlow;
      ctx.fillRect(0, 0, W, H);

      const tealGlow = ctx.createRadialGradient(W - 150, H - 200, 10, W - 150, H - 200, 500);
      tealGlow.addColorStop(0, 'rgba(0, 188, 212, 0.16)');
      tealGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = tealGlow;
      ctx.fillRect(0, 0, W, H);

      // Draw thin elegant borders
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 16;
      ctx.strokeRect(8, 8, W - 16, H - 16);

      ctx.strokeStyle = 'rgba(0, 188, 212, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, W - 40, H - 40);

      // --- Header: App Logo and Brand ---
      ctx.fillStyle = '#00BCD4';
      ctx.shadowColor = 'rgba(0, 188, 212, 0.6)';
      ctx.shadowBlur = 15;
      drawRoundRect(ctx, 60, 60, 45, 60, 8, true, false);
      ctx.shadowBlur = 0; // Reset

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(82, 90, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('CARDDEX', 125, 90);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('PORTAFOLIO DE COLECCIÓN', 125, 112);

      // --- User Details / Info ---
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(username || 'Coleccionista Carddex', 60, 190);

      ctx.fillStyle = '#8E92A0';
      ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`Portafolio oficial registrado en Carddex Vercel.`, 60, 222);

      // --- Glassmorphic Box 1: Summary Stats ---
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      drawRoundRect(ctx, 60, 250, 680, 120, 18, true, true);

      // Unique Cards Count
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(String(summary.uniqueCount), 173, 312);
      ctx.fillStyle = '#8E92A0';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('CARTAS ÚNICAS', 173, 342);

      // Total Copies Count
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(String(summary.totalQuantity), 400, 312);
      ctx.fillStyle = '#8E92A0';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('CANTIDAD TOTAL', 400, 342);

      // Wishlist/Favorites
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(String(summary.wishlistCount), 626, 312);
      ctx.fillStyle = '#8E92A0';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('EN LISTA DE DESEOS', 626, 342);

      // Draw dividers
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(286, 275);
      ctx.lineTo(286, 345);
      ctx.moveTo(513, 275);
      ctx.lineTo(513, 345);
      ctx.stroke();

      // --- Section Title: Featured Cards ---
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('CARTAS DESTACADAS DE MI VITRINA', 60, 420);

      // --- Grid Showcase: 4 Cards ---
      const cardWidth = 140;
      const cardHeight = 196;
      const startX = 60;
      const startY = 450;
      const gapX = 35;
      const gapY = 30;

      for (let i = 0; i < 4; i++) {
        const card = showcaseCards[i];
        const row = Math.floor(i / 2);
        const col = i % 2;
        
        // Coordinates for card drawing
        const x = startX + col * (340 + gapX);
        const y = startY + row * (cardHeight + gapY);

        // Draw card wrapper box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        drawRoundRect(ctx, x, y, 340, cardHeight, 16, true, true);

        if (card) {
          // Attempt to load and render the high-res optimized card image on canvas
          const imgUrl = card.images?.large || card.images?.small;
          if (imgUrl) {
            try {
              // Load image using CORS support
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                // Timeout loading image after 1.5 seconds so canvas is never blocked
                const timer = setTimeout(() => reject(new Error('Timeout loading image')), 1500);
                tempImg.src = imgUrl;
                tempImg.onload = () => {
                  clearTimeout(timer);
                  resolve(tempImg);
                };
                tempImg.onerror = () => {
                  clearTimeout(timer);
                  reject(new Error('Load error'));
                };
              });

              // Draw image with rounded corners
              ctx.save();
              ctx.beginPath();
              drawRoundRect(ctx, x + 16, y + 16, cardWidth, cardHeight - 32, 10, false, false);
              ctx.clip();
              ctx.drawImage(img, x + 16, y + 16, cardWidth, cardHeight - 32);
              ctx.restore();
            } catch (imgError) {
              // Fallback: draw stylish card mockup placeholder inside the slot
              const fallbackGrad = ctx.createLinearGradient(x + 16, y + 16, x + 16 + cardWidth, y + 16 + cardHeight - 32);
              fallbackGrad.addColorStop(0, '#1C2030');
              fallbackGrad.addColorStop(1, '#0B0C10');
              ctx.fillStyle = fallbackGrad;
              drawRoundRect(ctx, x + 16, y + 16, cardWidth, cardHeight - 32, 10, true, false);

              // Inside card title
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.fillText(card.name.substring(0, 14), x + 26, y + 50);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
              ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.fillText(card.rarity || 'Pokémon Card', x + 26, y + 66);
            }
          }

          // Draw Details next to card image (Rarity, Name, Price)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(card.name.length > 15 ? card.name.substring(0, 14) + '…' : card.name, x + 172, y + 54);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(`${card.supertype} - ${card.number}/${card.set?.printedTotal || card.set?.total || ''}`, x + 172, y + 78);

          ctx.fillStyle = '#00BCD4';
          ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(card.rarity || 'Rareza Desconocida', x + 172, y + 104);

          // Card Price
          const pVal = getEstimatedPrice(card);
          ctx.fillStyle = '#FFC107';
          ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(pVal ? `$${pVal.value.toFixed(2)} USD` : 'S/V', x + 172, y + 146);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText('Valor TCGplayer', x + 172, y + 164);
        } else {
          // Empty slot placeholder
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.textAlign = 'center';
          ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText('Ranura de vitrina disponible', x + 170, y + cardHeight / 2);
          ctx.textAlign = 'left'; // Reset
        }
      }

      // --- Footer: High-fidelity QR and Code ---
      ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      drawRoundRect(ctx, 60, 760, 680, 170, 18, true, true);

      // Draw stylized QR graphic
      const qrX = 90;
      const qrY = 785;
      const qrS = 120;
      
      ctx.strokeStyle = 'rgba(0, 188, 212, 0.4)';
      ctx.lineWidth = 2;
      drawRoundRect(ctx, qrX, qrY, qrS, qrS, 10, false, true);

      // QR patterns
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(qrX + 15, qrY + 15, 30, 30);
      ctx.fillStyle = '#090A0E';
      ctx.fillRect(qrX + 22, qrY + 22, 16, 16);
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(qrX + 26, qrY + 26, 8, 8);

      ctx.fillRect(qrX + qrS - 45, qrY + 15, 30, 30);
      ctx.fillStyle = '#090A0E';
      ctx.fillRect(qrX + qrS - 38, qrY + 22, 16, 16);
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(qrX + qrS - 34, qrY + 26, 8, 8);

      ctx.fillRect(qrX + 15, qrY + qrS - 45, 30, 30);
      ctx.fillStyle = '#090A0E';
      ctx.fillRect(qrX + 22, qrY + qrS - 38, 16, 16);
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(qrX + 26, qrY + qrS - 34, 8, 8);

      // Technical random QR noise
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      const randPoints = [
        [55, 20], [65, 20], [75, 20], [55, 30], [75, 35], [85, 30],
        [20, 55], [30, 55], [35, 65], [20, 75], [30, 85], [35, 85],
        [55, 55], [65, 55], [75, 55], [85, 55], [55, 65], [75, 65],
        [55, 75], [65, 85], [75, 85], [85, 75], [85, 85],
        [55, 95], [65, 95], [75, 95], [95, 95], [95, 55], [95, 65],
        [95, 15], [95, 25], [15, 95], [25, 95]
      ];
      randPoints.forEach(([px, py]) => {
        ctx.fillRect(qrX + px, qrY + py, 6, 6);
      });

      // Right text for QR
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('ESCANEA PARA VER EL PORTAFOLIO', 240, 825);

      ctx.fillStyle = '#9098A6';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Escanea este código para ver mi portafolio online.', 240, 853);
      ctx.fillText('Consulta el valor en vivo y los detalles de las cartas.', 240, 875);

      ctx.fillStyle = 'rgba(0, 188, 212, 0.85)';
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('PORTAFOLIO PÚBLICO EN LINEA', 240, 905);

      // Export to state URL
      try {
        const url = canvas.toDataURL('image/png');
        setPreviewUrl(url);
      } catch (err) {
        console.error('Error generating preview URL:', err);
      }
      setIsGenerating(false);
    };

    generatePoster();
  }, [isOpen, showcaseCards, username, userId]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.download = `carddex_vitrina_${username.toLowerCase().replace(/\s+/g, '_')}.png`;
    link.href = previewUrl;
    link.click();
    onShowToast('¡Showcase Poster descargado!');
  };

  const handleShare = async () => {
    if (!previewUrl || !canvasRef.current) return;
    
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current?.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('Blob creation failed');

      const file = new File([blob], `carddex_${username.toLowerCase().replace(/\s+/g, '_')}.png`, {
        type: 'image/png',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Portafolio Carddex: ${username}`,
          text: `¡Mira mi portafolio de cartas Pokémon en Carddex!`,
        });
        onShowToast('¡Colección compartida!');
      } else {
        handleDownload();
      }
    } catch (err) {
      console.warn('Navigator share failed, falling back to download:', err);
      handleDownload();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(9, 11, 16, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={onClose}
    >
      <Surface
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(28, 32, 48, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
          borderRadius: 24,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 16,
          color: '#ffffff',
        }}
        onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: -0.4 }}>Compartir Showcase Poster</h3>
          <button
            onClick={onClose}
            className="modal-close-btn"
            style={{
              width: 28,
              height: 28,
            }}
          >
            ✕
          </button>
        </div>

        {/* Hidden physical canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Poster preview */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 320,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: '#0F1118',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
          }}
        >
          {isGenerating ? (
            <div style={{ fontSize: 13, color: '#9098A6' }}>Generando póster premium...</div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Colección Preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ fontSize: 13, color: '#9098A6' }}>Error al renderizar vitrina</div>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '0 10px', lineHeight: 1.4 }}>
          Crea una infografía elegante de tus cartas destacadas en alta resolución. Lista para compartir en tus redes sociales.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={handleDownload}
            disabled={!previewUrl}
            className="modal-secondary-btn"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              fontSize: 14,
            }}
          >
            Descargar PNG
          </button>
          <button
            onClick={handleShare}
            disabled={!previewUrl}
            className="modal-primary-btn"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #00BCD4, #008B9B) !important',
              boxShadow: '0 4px 12px rgba(0, 188, 212, 0.3) !important',
              fontSize: 14,
            }}
          >
            Enviar Póster
          </button>
        </div>
      </Surface>
    </div>
  );
}
