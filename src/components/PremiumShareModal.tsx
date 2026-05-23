import { useEffect, useRef, useState, MouseEvent } from 'react';
import type { PokemonCard } from '@/types/pokemon';
import { getEstimatedPrice } from '@/lib/pricing';
import Surface from './Surface';

interface PremiumShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  deckCards: PokemonCard[];
  cardIds: string[]; // contains duplicate IDs representing card quantities
  onShowToast: (msg: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  Grass: '#48C058',
  Fire: '#FF421F',
  Water: '#2196F3',
  Lightning: '#FFC107',
  Psychic: '#9C27B0',
  Fighting: '#FF5722',
  Darkness: '#37474F',
  Metal: '#78909C',
  Dragon: '#7E57C2',
  Colorless: '#9E9E9E',
  Fairy: '#EC407A',
};

const TYPE_LABELS: Record<string, string> = {
  Grass: 'Planta',
  Fire: 'Fuego',
  Water: 'Agua',
  Lightning: 'Rayo',
  Psychic: 'Psíquico',
  Fighting: 'Lucha',
  Darkness: 'Oscuridad',
  Metal: 'Metal',
  Dragon: 'Dragón',
  Colorless: 'Incoloro',
  Fairy: 'Hada',
};

export default function PremiumShareModal({
  isOpen,
  onClose,
  deckName,
  deckCards,
  cardIds,
  onShowToast,
}: PremiumShareModalProps) {
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
    if (!isOpen || !canvasRef.current || deckCards.length === 0) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsGenerating(false);
      return;
    }

    // 1. Calculate Deck Data
    const counts: Record<string, number> = {};
    for (const id of cardIds) {
      counts[id] = (counts[id] || 0) + 1;
    }

    let pokemonQty = 0;
    let trainerQty = 0;
    let energyQty = 0;
    let totalPriceUsd = 0;
    const activeTypes: Record<string, number> = {};

    deckCards.forEach((card) => {
      const qty = counts[card.id] || 0;
      const supertype = card.supertype?.toLowerCase() || '';

      if (supertype.includes('pokemon') || supertype.includes('pokémon')) {
        pokemonQty += qty;
        // Count types
        const cardTypes = card.types && card.types.length > 0 ? card.types : ['Colorless'];
        cardTypes.forEach((t) => {
          activeTypes[t] = (activeTypes[t] || 0) + qty;
        });
      } else if (supertype.includes('trainer')) {
        trainerQty += qty;
      } else if (supertype.includes('energy')) {
        energyQty += qty;
      } else {
        pokemonQty += qty;
      }

      // Add Price
      const p = getEstimatedPrice(card);
      if (p) {
        // Assume USD or convert if EUR (keep it USD for the infographic)
        totalPriceUsd += p.value * qty;
      }
    });

    // 2. Render Canvas (800x1000px)
    const W = 800;
    const H = 1000;
    canvas.width = W;
    canvas.height = H;

    // Draw background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0B0C10');
    bgGrad.addColorStop(0.5, '#121520');
    bgGrad.addColorStop(1, '#1C2030');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Draw neon ambient glows
    // Top-left purple glow
    const purpleGlow = ctx.createRadialGradient(100, 100, 10, 100, 100, 400);
    purpleGlow.addColorStop(0, 'rgba(123, 90, 217, 0.15)');
    purpleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = purpleGlow;
    ctx.fillRect(0, 0, W, H);

    // Bottom-right cian glow
    const cianGlow = ctx.createRadialGradient(W - 100, H - 100, 10, W - 100, H - 100, 450);
    cianGlow.addColorStop(0, 'rgba(47, 111, 224, 0.18)');
    cianGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cianGlow;
    ctx.fillRect(0, 0, W, H);

    // Draw thin elegant border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    ctx.strokeStyle = 'rgba(47, 111, 224, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    // --- Header ---
    // Logo
    ctx.fillStyle = '#2F6FE0';
    ctx.shadowColor = 'rgba(47, 111, 224, 0.6)';
    ctx.shadowBlur = 15;
    // Draw stylish card emblem
    drawRoundRect(ctx, 60, 60, 45, 60, 8, true, false);
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw symbol inside emblem
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(82, 90, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('CARDDEX', 125, 90);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('MAZO DE JUEGO', 125, 112);

    // --- Mazo Title ---
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillText(deckName, 60, 200);

    // Subtitle
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#9098A6';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Contiene ${cardIds.length} cartas seleccionadas. Creado en CardDex Vercel.`, 60, 235);

    // --- Glassmorphic Box 1: Conteo de Categorías ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    drawRoundRect(ctx, 60, 280, 680, 160, 18, true, true);

    // Pokémon column
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(String(pokemonQty), 173, 365);
    ctx.fillStyle = '#8E92A0';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('POKÉMON', 173, 400);

    // Trainer column
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(String(trainerQty), 400, 365);
    ctx.fillStyle = '#8E92A0';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('ENTRENADORES', 400, 400);

    // Energy column
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(String(energyQty), 626, 365);
    ctx.fillStyle = '#8E92A0';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('ENERGÍAS', 626, 400);

    // Draw dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(286, 310);
    ctx.lineTo(286, 410);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(513, 310);
    ctx.lineTo(513, 410);
    ctx.stroke();

    // --- Section: Elementos y Precios ---
    ctx.textAlign = 'left';

    // Left block: Types indicators
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    drawRoundRect(ctx, 60, 470, 325, 260, 18, true, true);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('ELEMENTOS PREDOMINANTES', 85, 515);

    const sortedTypes = Object.entries(activeTypes).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (sortedTypes.length === 0) {
      ctx.fillStyle = '#6B7180';
      ctx.font = 'italic 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Sin pokémon en el mazo', 85, 570);
    } else {
      sortedTypes.forEach(([type, count], idx) => {
        const yPos = 560 + idx * 40;
        const color = TYPE_COLORS[type] || '#FFFFFF';

        // Draw type color dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(95, yPos - 5, 8, 0, Math.PI * 2);
        ctx.fill();

        // Draw label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(TYPE_LABELS[type] || type, 120, yPos);

        // Draw count
        ctx.fillStyle = '#9098A6';
        ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`${count} cartas`, 260, yPos);
      });
    }

    // Right block: Price Badge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    drawRoundRect(ctx, 415, 470, 325, 260, 18, true, true);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('VALOR DE MERCADO ESTIMADO', 440, 515);

    ctx.fillStyle = '#FFC107';
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.shadowColor = 'rgba(255, 193, 7, 0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText(`$${totalPriceUsd.toFixed(2)}`, 440, 580);
    ctx.shadowBlur = 0; // Reset

    ctx.fillStyle = '#9098A6';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('USD (Precios de TCGplayer)', 440, 615);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const priceText = 'El valor real de las cartas físicas puede variar según el estado de conservación, folio holográfico y fluctuación de la demanda de mercado en tiempo real.';
    wrapText(ctx, priceText, 440, 645, 280, 16);

    // --- Footer: High-fidelity QR and Code ---
    // Glassmorphic bottom banner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    drawRoundRect(ctx, 60, 760, 680, 170, 18, true, true);

    // Draw stylized QR graphic
    const qrX = 90;
    const qrY = 785;
    const qrS = 120;
    
    // Draw QR borders
    ctx.strokeStyle = 'rgba(47, 111, 224, 0.4)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, qrX, qrY, qrS, qrS, 10, false, true);

    // Inside high tech details
    ctx.fillStyle = '#2F6FE0';
    // Top-left square
    ctx.fillRect(qrX + 15, qrY + 15, 30, 30);
    ctx.fillStyle = '#0B0C10';
    ctx.fillRect(qrX + 22, qrY + 22, 16, 16);
    ctx.fillStyle = '#2F6FE0';
    ctx.fillRect(qrX + 26, qrY + 26, 8, 8);

    // Top-right square
    ctx.fillRect(qrX + qrS - 45, qrY + 15, 30, 30);
    ctx.fillStyle = '#0B0C10';
    ctx.fillRect(qrX + qrS - 38, qrY + 22, 16, 16);
    ctx.fillStyle = '#2F6FE0';
    ctx.fillRect(qrX + qrS - 34, qrY + 26, 8, 8);

    // Bottom-left square
    ctx.fillRect(qrX + 15, qrY + qrS - 45, 30, 30);
    ctx.fillStyle = '#0B0C10';
    ctx.fillRect(qrX + 22, qrY + qrS - 38, 16, 16);
    ctx.fillStyle = '#2F6FE0';
    ctx.fillRect(qrX + 26, qrY + qrS - 34, 8, 8);

    // Random tech pixel dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
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
    ctx.fillText('ESCANEA E IMPORTA EL MAZO', 240, 825);

    ctx.fillStyle = '#9098A6';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Abre la cámara de tu móvil para escanear este mazo.', 240, 853);
    ctx.fillText('Impórtalo instantáneamente en tu biblioteca de CardDex.', 240, 875);

    ctx.fillStyle = 'rgba(47, 111, 224, 0.8)';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('VERCEL MULTIPLATFORM APP', 240, 905);

    // 3. Export to state URL
    try {
      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);
    } catch (err) {
      console.error('Error generating preview URL:', err);
    }
    setIsGenerating(false);
  }, [isOpen, deckName, deckCards, cardIds]);

  // Helper function to wrap text inside canvas
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.download = `carddex_mazo_${deckName.toLowerCase().replace(/\s+/g, '_')}.png`;
    link.href = previewUrl;
    link.click();
    onShowToast('¡Infografía descargada con éxito!');
  };

  const handleShare = async () => {
    if (!previewUrl || !canvasRef.current) return;
    
    try {
      // 1. Convert Base64 URL to File Blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current?.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('Blob creation failed');

      const file = new File([blob], `carddex_${deckName.toLowerCase().replace(/\s+/g, '_')}.png`, {
        type: 'image/png',
      });

      // 2. Check navigator.canShare and share
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Mazo CardDex: ${deckName}`,
          text: `¡Mira mi mazo "${deckName}" en CardDex!`,
        });
        onShowToast('¡Mazo compartido!');
      } else {
        // Fallback: Copy public link or trigger download
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
        animation: 'fadeIn 0.25s ease-out forwards',
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
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>Compartir Tarjeta Mazo</h3>
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

        {/* Canvas is hidden physically but used for rendering */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Visual glassmorphic preview of the generated image */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 300,
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
            <div style={{ fontSize: 13, color: '#9098A6' }}>Generando infografía premium...</div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Mazo Preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ fontSize: 13, color: '#9098A6' }}>Error al renderizar tarjeta</div>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '0 10px', lineHeight: 1.4 }}>
          Generamos una infografía glassmorphic del mazo sin dependencias externas. Lista para Instagram, Twitter/X o WhatsApp.
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
              background: 'linear-gradient(135deg, #2F6FE0, #1E4DA1) !important',
              boxShadow: '0 4px 12px rgba(47, 111, 224, 0.3) !important',
              fontSize: 14,
            }}
          >
            Enviar Tarjeta
          </button>
        </div>
      </Surface>
    </div>
  );
}
