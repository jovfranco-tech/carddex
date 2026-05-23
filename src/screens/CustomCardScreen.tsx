import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Surface from '@/components/Surface';
import { ArrowLeftIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import { triggerHaptic } from '@/lib/haptic';
import { processAchievementEvent } from '@/lib/achievements';
import { dispatchAchievement } from '@/app/App';
import { triggerCustomCardsSync } from '@/lib/collectionStorage';

interface CustomCard {
  id: string;
  name: string;
  type: string;
  style: string;
  hp: string;
  stage: string;
  attack1: {
    name: string;
    cost: string[];
    damage: string;
    effect: string;
  };
  attack2: {
    name: string;
    cost: string[];
    damage: string;
    effect: string;
  };
  weakness: string;
  resistance: string | null;
  retreatCost: number;
  description: string;
  imageUrl: string;
  createdAt: string;
}

const ELEMENT_COLORS: Record<string, string> = {
  Grass: '#27AE60',
  Fire: '#EB5757',
  Water: '#2D9CDB',
  Lightning: '#F2C94C',
  Psychic: '#9B51E0',
  Fighting: '#E08027',
  Darkness: '#333333',
  Metal: '#7B889B',
  Dragon: '#D97B24',
  Colorless: '#A1A8B8',
};

const ELEMENT_EMOJIS: Record<string, string> = {
  Grass: '🌿',
  Fire: '🔥',
  Water: '💧',
  Lightning: '⚡',
  Psychic: '👁️',
  Fighting: '✊',
  Darkness: '🌙',
  Metal: '🛡️',
  Dragon: '🐲',
  Colorless: '⭐',
};

export default function CustomCardScreen() {
  const navigate = useNavigate();

  // Form states
  const [name, setName] = useState('Gemini Dragon');
  const [type, setType] = useState('Dragon');
  const [style, setStyle] = useState('Illustration Rare');
  const [artPrompt, setArtPrompt] = useState(
    'Dragon composed of glowing neural network paths, neon circuitry, epic fantasy landscape'
  );

  // Fusion mode
  const [isFusionMode, setIsFusionMode] = useState(false);
  const [fusionCardA, setFusionCardA] = useState('Charizard ex');
  const [fusionCardB, setFusionCardB] = useState('Mewtwo ex');

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Active custom card preview
  const [currentCard, setCurrentCard] = useState<CustomCard | null>(null);

  // Custom cards collection saved locally
  const [savedCards, setSavedCards] = useState<CustomCard[]>([]);

  // 3D holographic tilt card position state
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, bx: 50, by: 50 });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load saved custom cards from localStorage
    try {
      const saved = localStorage.getItem('carddex.customCards');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSavedCards(parsed);
        if (parsed.length > 0) {
          setCurrentCard(parsed[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFusionMode && !name.trim()) return;

    setLoading(true);
    setError(null);
    triggerHaptic('medium');

    const steps = [
      'Canalizando energía de IA...',
      'Calculando HP y habilidades balanceadas...',
      'Consultando al ilustrador DALL-E...',
      'Holografiando bordes metálicos...',
    ];

    let currentStepIdx = 0;
    setLoadingStep(steps[currentStepIdx]);
    const stepInterval = setInterval(() => {
      if (currentStepIdx < steps.length - 1) {
        currentStepIdx++;
        setLoadingStep(steps[currentStepIdx]);
      }
    }, 2500);

    try {
      const res = await fetch('/api/custom-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isFusionMode
          ? JSON.stringify({ cardA: fusionCardA, cardB: fusionCardB, type, style })
          : JSON.stringify({ name, type, style, artPrompt }),
      });

      if (!res.ok) {
        throw new Error('Error al generar la carta con IA');
      }

      const data = await res.json();

      const newCard: CustomCard = {
        id: `custom-${Date.now()}`,
        name: isFusionMode ? data.name || `${fusionCardA} × ${fusionCardB}` : name,
        type: type,
        style: style,
        hp: data.hp || '160',
        stage: data.stage || 'Basic',
        attack1: data.attack1 || { name: 'Ataque IA 1', cost: [type], damage: '50', effect: '' },
        attack2: data.attack2 || {
          name: 'Ataque IA 2',
          cost: [type, 'Colorless'],
          damage: '100',
          effect: '',
        },
        weakness: data.weakness || 'Colorless',
        resistance: data.resistance || null,
        retreatCost: data.retreatCost || 1,
        description:
          data.description || 'Una asombrosa creación impulsada por inteligencia artificial.',
        imageUrl: data.imageUrl,
        createdAt: new Date().toISOString(),
      };

      setCurrentCard(newCard);

      // Auto-save to list
      const updatedList = [newCard, ...savedCards];
      setSavedCards(updatedList);
      localStorage.setItem('carddex.customCards', JSON.stringify(updatedList));
      triggerCustomCardsSync();

      triggerHaptic('success');

      // Fire achievement event for custom card creation
      const achieved = processAchievementEvent({ type: 'custom_card_created' });
      achieved.forEach(dispatchAchievement);
    } catch (err) {
      console.error(err);
      setError('No se pudo conectar con el motor de IA. Inténtalo de nuevo.');
      triggerHaptic('warning');
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleDeleteCard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const updated = savedCards.filter((c) => c.id !== id);
    setSavedCards(updated);
    localStorage.setItem('carddex.customCards', JSON.stringify(updated));
    triggerCustomCardsSync();
    if (currentCard?.id === id) {
      setCurrentCard(updated[0] || null);
    }
  };

  // Mouse tilt handlers for holographic effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within element
    const y = e.clientY - rect.top; // y position within element

    const width = rect.width;
    const height = rect.height;

    // Calculate rotation angles (-15 to 15 deg)
    const ry = -(15 * (x - width / 2)) / (width / 2);
    const rx = (15 * (y - height / 2)) / (height / 2);

    // Calculate background gradient reflection position (10% to 90%)
    const bx = 10 + (80 * x) / width;
    const by = 10 + (80 * y) / height;

    setTilt({ rx, ry, bx, by });
  };

  const handleMouseLeave = () => {
    // Reset to center smoothly
    setTilt({ rx: 0, ry: 0, bx: 50, by: 50 });
  };

  const handleExportPng = async () => {
    if (!currentCard) return;
    triggerHaptic('medium');

    try {
      // Build a 400x560 canvas (standard card ratio 1:1.4)
      const W = 400;
      const H = 560;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const typeColor = ELEMENT_COLORS[currentCard.type] || '#A1A8B8';

      // Background
      ctx.fillStyle = '#15171e';
      ctx.roundRect(0, 0, W, H, 18);
      ctx.fill();

      // Border
      ctx.strokeStyle = typeColor;
      ctx.lineWidth = 14;
      ctx.roundRect(0, 0, W, H, 18);
      ctx.stroke();

      // Load artwork image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Continue even if image fails
        img.src = currentCard.imageUrl;
      });

      // Artwork area
      const artY = 64;
      const artH = 200;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(20, artY, W - 40, artH, 8);
      ctx.clip();
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 20, artY, W - 40, artH);
      } else {
        ctx.fillStyle = '#090a0f';
        ctx.fillRect(20, artY, W - 40, artH);
      }
      ctx.restore();

      // Name (top left)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(currentCard.name, 20, 50);

      // HP (top right)
      ctx.fillStyle = '#FF3B30';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${currentCard.hp} HP`, W - 20, 50);
      ctx.textAlign = 'left';

      // Attacks section
      const atkY = artY + artH + 24;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(currentCard.attack1.name, 20, atkY);
      ctx.textAlign = 'right';
      ctx.fillText(currentCard.attack1.damage, W - 20, atkY);
      ctx.textAlign = 'left';

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(currentCard.attack1.effect?.slice(0, 60) || '', 20, atkY + 18);

      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(20, atkY + 32);
      ctx.lineTo(W - 20, atkY + 32);
      ctx.stroke();

      const atk2Y = atkY + 52;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(currentCard.attack2.name, 20, atk2Y);
      ctx.textAlign = 'right';
      ctx.fillText(currentCard.attack2.damage, W - 20, atk2Y);
      ctx.textAlign = 'left';

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(currentCard.attack2.effect?.slice(0, 60) || '', 20, atk2Y + 18);

      // Description / flavor text
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = 'italic 11px system-ui, sans-serif';
      const descY = H - 28;
      ctx.fillText(`"${currentCard.description.slice(0, 70)}..."`, 20, descY, W - 40);

      // Watermark
      ctx.fillStyle = 'rgba(123,90,217,0.6)';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('✦ CardDex Custom', W - 20, H - 12);
      ctx.textAlign = 'left';

      // Trigger download
      const link = document.createElement('a');
      link.download = `${currentCard.name.replace(/\s+/g, '_')}_carddex.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      triggerHaptic('success');
    } catch (err) {
      console.error('Error exporting PNG:', err);
    }
  };

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header bar */}
      <header
        style={{
          padding: '54px 18px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={() => {
            triggerHaptic('light');
            navigate('/');
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            background: 'var(--surface)',
            border: '0.5px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-2)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeftIcon size={20} />
        </button>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--ink)',
              letterSpacing: -0.6,
            }}
          >
            Creador de Cartas Custom IA
          </h1>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Diseña cartas coleccionables únicas con GPT y DALL-E
          </span>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 24,
          padding: '0 18px',
        }}
        className="custom-card-grid"
      >
        {/* Card View / Preview Column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {currentCard ? (
            <>
              {/* Responsive tilting holographic card container */}
              <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  aspectRatio: '1 / 1.4',
                  borderRadius: 18,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                  transition: 'transform 100ms ease-out',
                  position: 'relative',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 30px rgba(123,90,217,0.1)',
                  userSelect: 'none',
                }}
              >
                {/* Holographic foil overlay layer */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0.08) 55%, rgba(255,255,255,0) 80%)',
                    backgroundPosition: `${tilt.bx}% ${tilt.by}%`,
                    backgroundSize: '250% 250%',
                    mixBlendMode: 'overlay',
                    zIndex: 4,
                    pointerEvents: 'none',
                    transition: 'background-position 100ms ease-out',
                  }}
                />

                {/* Foil sparkle shine overlay layer */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'radial-gradient(circle at center, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0) 70%)',
                    mixBlendMode: 'color-dodge',
                    zIndex: 3,
                    pointerEvents: 'none',
                    opacity: 0.8,
                  }}
                />

                {/* Card template artwork & details */}
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#15171e',
                    border: `10px solid ${ELEMENT_COLORS[currentCard.type] || '#A1A8B8'}`,
                    borderRadius: 18,
                    boxSizing: 'border-box',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  {/* Top header: Name, HP, Type */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: 'rgba(255,255,255,0.5)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {currentCard.stage}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#fff',
                          letterSpacing: -0.3,
                        }}
                      >
                        {currentCard.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#FF3B30' }}>
                        {currentCard.hp} HP
                      </span>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: ELEMENT_COLORS[currentCard.type],
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                        }}
                      >
                        {ELEMENT_EMOJIS[currentCard.type]}
                      </span>
                    </div>
                  </div>

                  {/* Art Frame */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1.4 / 1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#090a0f',
                      border: '1.5px solid rgba(255,255,255,0.1)',
                      position: 'relative',
                      marginTop: 6,
                    }}
                  >
                    <img
                      src={currentCard.imageUrl}
                      alt={currentCard.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 6,
                        fontSize: 8,
                        color: 'rgba(255,255,255,0.4)',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '1px 4px',
                        borderRadius: 4,
                      }}
                    >
                      IA Art: {currentCard.style}
                    </div>
                  </div>

                  {/* Body: Attacks */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      flex: 1,
                      justifyContent: 'center',
                      padding: '8px 2px',
                    }}
                  >
                    {/* Attack 1 */}
                    <div
                      style={{
                        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                        paddingBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {currentCard.attack1.cost.map((c, i) => (
                            <span
                              key={i}
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: ELEMENT_COLORS[c] || '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 8,
                              }}
                            >
                              {ELEMENT_EMOJIS[c] || '⭐'}
                            </span>
                          ))}
                          <span
                            style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginLeft: 4 }}
                          >
                            {currentCard.attack1.name}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                          {currentCard.attack1.damage}
                        </span>
                      </div>
                      {currentCard.attack1.effect && (
                        <p
                          style={{
                            margin: '2px 0 0',
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.7)',
                            lineHeight: 1.2,
                          }}
                        >
                          {currentCard.attack1.effect}
                        </p>
                      )}
                    </div>

                    {/* Attack 2 */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {currentCard.attack2.cost.map((c, i) => (
                            <span
                              key={i}
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: ELEMENT_COLORS[c] || '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 8,
                              }}
                            >
                              {ELEMENT_EMOJIS[c] || '⭐'}
                            </span>
                          ))}
                          <span
                            style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginLeft: 4 }}
                          >
                            {currentCard.attack2.name}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                          {currentCard.attack2.damage}
                        </span>
                      </div>
                      {currentCard.attack2.effect && (
                        <p
                          style={{
                            margin: '2px 0 0',
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.7)',
                            lineHeight: 1.2,
                          }}
                        >
                          {currentCard.attack2.effect}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer: Weakness, Resistance, Retreat */}
                  <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.15)', paddingTop: 4 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 9,
                        color: 'rgba(255,255,255,0.6)',
                        fontWeight: 600,
                      }}
                    >
                      <div>
                        <span>Debilidad: </span>
                        <span style={{ color: '#fff' }}>
                          {currentCard.weakness} {ELEMENT_EMOJIS[currentCard.weakness] || ''}
                        </span>
                      </div>
                      <div>
                        <span>Resistencia: </span>
                        <span style={{ color: '#fff' }}>{currentCard.resistance || 'Ninguna'}</span>
                      </div>
                      <div>
                        <span>Coste Retirada: </span>
                        <span style={{ color: '#fff' }}>
                          {Array.from({ length: currentCard.retreatCost })
                            .map(() => '★')
                            .join('') || '—'}
                        </span>
                      </div>
                    </div>
                    {/* Flavor Text */}
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 8.5,
                        fontStyle: 'italic',
                        color: 'rgba(255,255,255,0.45)',
                        textAlign: 'center',
                        borderTop: '0.5px solid rgba(255,255,255,0.06)',
                        paddingTop: 3,
                      }}
                    >
                      "{currentCard.description}"
                    </p>
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                💡 Tip: Mueve el mouse sobre la carta para ver el efecto holográfico 3D
              </span>
              {/* Download as PNG button */}
              <button
                onClick={handleExportPng}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 12,
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 2,
                  transition: 'background 150ms ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
              >
                ⬇ Descargar como PNG
              </button>
            </>
          ) : (
            <div
              style={{
                width: '100%',
                maxWidth: 320,
                aspectRatio: '1 / 1.4',
                borderRadius: 18,
                border: '2px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: 'var(--muted)',
                padding: 24,
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 40 }}>🃏</span>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Sin carta generada aún</div>
              <p style={{ fontSize: 12, margin: 0 }}>
                Completa el formulario para forjar tu primera carta con Inteligencia Artificial.
              </p>
            </div>
          )}
        </div>

        {/* Creator Form Column */}
        <Surface style={{ padding: 20 }}>
          <form
            onSubmit={handleGenerate}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
              Configuración de la Carta
            </h2>

            {/* Mode Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 4,
                gap: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setIsFusionMode(false)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: !isFusionMode ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: !isFusionMode ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                ✨ Crear Carta
              </button>
              <button
                type="button"
                onClick={() => setIsFusionMode(true)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: isFusionMode ? '1px solid rgba(255,149,0,0.4)' : '1px solid transparent',
                  background: isFusionMode
                    ? 'linear-gradient(135deg, rgba(255,149,0,0.3), rgba(255,59,48,0.3))'
                    : 'transparent',
                  color: isFusionMode ? '#FF9500' : 'rgba(255,255,255,0.5)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                🧬 Modo Fusión
              </button>
            </div>

            {/* Name (only shown in normal mode) */}
            {!isFusionMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Nombre del Pokémon
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Antigravity Coder"
                  required={!isFusionMode}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {/* Fusion inputs (only in fusion mode) */}
            {isFusionMode && (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.6)',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Pokémon A
                    </label>
                    <input
                      value={fusionCardA}
                      onChange={(e) => setFusionCardA(e.target.value)}
                      placeholder="Charizard ex"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,149,0,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#fff',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      paddingBottom: 10,
                      fontSize: 20,
                    }}
                  >
                    🧬
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.6)',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Pokémon B
                    </label>
                    <input
                      value={fusionCardB}
                      onChange={(e) => setFusionCardB(e.target.value)}
                      placeholder="Mewtwo ex"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,149,0,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#fff',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,149,0,0.8)',
                    textAlign: 'center',
                    fontStyle: 'italic',
                  }}
                >
                  ✦ La IA fusionará ambos Pokémon en una carta épica con arte generativo
                </div>
              </>
            )}

            {/* Type & Style in Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Elemento / Tipo
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                  }}
                >
                  {Object.keys(ELEMENT_COLORS).map((t) => (
                    <option key={t} value={t}>
                      {ELEMENT_EMOJIS[t]} {t}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Estilo de Rareza
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="Illustration Rare">Illustration Rare</option>
                  <option value="Full Art">Full Art</option>
                  <option value="Gold Star">Gold Star</option>
                  <option value="Vintage">Vintage Classic</option>
                </select>
              </div>
            </div>

            {/* Art Prompt (only in normal mode) */}
            {!isFusionMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Indicación de Arte para IA (DALL-E)
                </label>
                <textarea
                  value={artPrompt}
                  onChange={(e) => setArtPrompt(e.target.value)}
                  placeholder="Describe la escena, colores y detalles que quieres que la IA ilustre."
                  rows={3}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 13,
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                    resize: 'none',
                    lineHeight: 1.4,
                  }}
                />
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--error)', fontSize: 12.5, fontWeight: 600 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading
                  ? 'rgba(123,90,217,0.2)'
                  : 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                padding: '14px',
                fontSize: 15,
                fontWeight: 800,
                fontFamily: 'inherit',
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(123, 90, 217, 0.3)',
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.2)',
                      borderTopColor: '#fff',
                      animation: 'spinCreatorLoader 0.7s linear infinite',
                    }}
                  />
                  <span>{loadingStep || 'Generando carta...'}</span>
                </>
              ) : (
                <>
                  <SparklesIcon size={18} color="#fff" />
                  <span>Forjar Carta con IA</span>
                </>
              )}
            </button>
          </form>
        </Surface>
      </div>

      {/* Saved Custom Creations Gallery */}
      {savedCards.length > 0 && (
        <div style={{ padding: '24px 18px 0' }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--ink)',
              margin: '0 0 12px',
              letterSpacing: -0.4,
            }}
          >
            Mis Creaciones Custom ({savedCards.length})
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              paddingBottom: 8,
            }}
            className="no-scrollbar"
          >
            {savedCards.map((c) => {
              const active = currentCard?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setCurrentCard(c);
                  }}
                  style={{
                    width: 90,
                    flexShrink: 0,
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'var(--surface)',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    padding: 6,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1.2 / 1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#090a0f',
                    }}
                  >
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: 'var(--ink)',
                      marginTop: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--muted)',
                      textAlign: 'center',
                      marginTop: 2,
                    }}
                  >
                    {ELEMENT_EMOJIS[c.type]} {c.type}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDeleteCard(c.id, e)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(255, 59, 48, 0.9)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                    title="Eliminar"
                  >
                    <TrashIcon size={10} color="#fff" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading animation styles */}
      <style>{`
        @keyframes spinCreatorLoader {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @media (min-width: 768px) {
          .custom-card-grid {
            grid-template-columns: 320px 1fr !important;
            align-items: start !important;
          }
        }
      `}</style>
    </div>
  );
}
