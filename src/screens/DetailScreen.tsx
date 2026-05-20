import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import TcgCardImage from '@/components/TcgCardImage';
import RarityBadge from '@/components/RarityBadge';
import TypeBadge from '@/components/TypeBadge';
import PriceBadge from '@/components/PriceBadge';
import QuantitySelector from '@/components/QuantitySelector';
import FoilToggle from '@/components/FoilToggle';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import CardAssistantButton from '@/components/CardAssistantButton';
import { Toast } from '@/components/Section';
import {
  BackIcon,
  CheckIcon,
  HeartIcon,
  HeartFilledIcon,
  BookmarkIcon,
  BanIcon,
  ShareIcon,
  MoreIcon,
  DecksIcon,
  TrashIcon,
} from '@/components/icons';
import { useAsync, useCardMeta, useDecks } from '@/lib/hooks';
import { getCardById, getSimilarCardsByName } from '@/lib/pokemonTcgApi';
import {
  addRecentlyViewed,
  saveCardMeta,
  removeCard,
  toggleFavorite,
  toggleMissing,
  toggleWishlist,
} from '@/lib/collectionStorage';
import {
  getEstimatedPrice,
  formatPrice,
  PRICE_DISCLAIMER,
} from '@/lib/pricing';
import { addCardToDeck, createDeck } from '@/lib/deckStorage';
import { rarityColor, rarityLabel } from '@/lib/rarity';
import { buildCardAssistantContext } from '@/lib/cardAssistant';
import { triggerHaptic } from '@/lib/haptic';
import { typeColor } from '@/components/TypeBadge';
import { formatDateShort } from '@/lib/formatters';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PokemonCard } from '@/types/pokemon';
import type { CardCondition, CardVariant } from '@/types/collection';

export default function DetailScreen() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();

  const card = useAsync((signal) => getCardById(cardId!, { signal }), [cardId]);
  const meta = useCardMeta(cardId);

  // Persist to recently viewed once.
  useEffect(() => {
    if (card.data?.id) addRecentlyViewed(card.data.id);
  }, [card.data?.id]);

  if (card.loading) {
    return (
      <div style={{ paddingTop: 80 }}>
        <LoadingState message="Cargando carta…" />
      </div>
    );
  }
  if (card.error || !card.data) {
    return (
      <div style={{ paddingTop: 80 }}>
        <ErrorState
          message={card.error ?? 'No se pudo cargar la carta.'}
          onRetry={card.reload}
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return <Detail card={card.data} meta={meta} />;
}

/* ------------------------------------------------------------------------- */
/* Inner detail view                                                          */
/* ------------------------------------------------------------------------- */

function Detail({
  card,
  meta,
}: {
  card: PokemonCard;
  meta: ReturnType<typeof useCardMeta>;
}) {
  const navigate = useNavigate();

  const [qty, setQty] = useState<number>(Math.max(1, meta?.quantity ?? 1));
  const [foil, setFoil] = useState<boolean>(meta?.foil ?? false);
  const [condition, setCondition] = useState<CardCondition>(meta?.condition ?? 'Near Mint');
  const [variant, setVariant] = useState<CardVariant>(meta?.variant ?? 'Normal');
  const [saved, setSaved] = useState(() => Boolean(meta?.owned));
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deckSavedId, setDeckSavedId] = useState<string | null>(null);

  const decksState = useDecks();
  const decks = Object.values(decksState.decks);

  // Resync local state if meta arrives after the first render.
  useEffect(() => {
    if (meta) {
      setQty(Math.max(1, meta.quantity));
      setFoil(meta.foil);
      setCondition(meta.condition);
      setVariant(meta.variant);
      setSaved(Boolean(meta.owned));
    } else {
      setSaved(false);
    }
  }, [meta?.cardId, meta?.owned]); // eslint-disable-line react-hooks/exhaustive-deps

  const price = useMemo(() => getEstimatedPrice(card), [card]);

  const handleSave = () => {
    const safeQty = Math.max(1, qty);
    saveCardMeta(card.id, {
      quantity: safeQty,
      foil,
      condition,
      variant,
      owned: true,
    });
    triggerHaptic('light');
    setSaved(true);
    setToastMessage(`Guardada en tu colección${foil ? ' · Foil' : ''} · ×${safeQty}`);
  };

  const handleRemove = () => {
    removeCard(card.id);
    triggerHaptic('medium');
    setSaved(false);
    setQty(1);
    setFoil(false);
    setCondition('Near Mint');
    setVariant('Normal');
    setToastMessage('Eliminada de tu colección');
  };

  const handleDownloadImage = async () => {
    try {
      const imageUrl = card.images?.large || card.images?.small;
      if (!imageUrl) return;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.name}-${card.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setToastMessage('Imagen descargada con éxito');
    } catch (err) {
      console.error(err);
      // Fallback: open in new window
      window.open(card.images?.large || card.images?.small, '_blank');
      setToastMessage('Abriendo imagen en pestaña nueva');
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(card.id);
    triggerHaptic('light');
    setToastMessage('ID copiado al portapapeles');
  };

  const handleCreateDeckWithCard = () => {
    const name = prompt('Nombre del nuevo mazo:');
    if (!name || !name.trim()) return;
    try {
      const deck = createDeck(name.trim());
      addCardToDeck(deck.id, card.id);
      triggerHaptic('success');
      setToastMessage(`Mazo "${deck.name}" creado con éxito`);
    } catch (err) {
      console.error(err);
      setToastMessage('Error al crear el mazo');
    }
  };

  const handleShare = async () => {
    triggerHaptic('light');
    const shareData = {
      title: `Pokémon TCG - ${card.name}`,
      text: `Mira esta carta: ${card.name} (${card.number}/${card.set?.printedTotal || card.set?.total}) de la expansión ${card.set?.name}.`,
      url: window.location.href,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.warn('Share failed or cancelled:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setToastMessage('Enlace copiado al portapapeles');
      } catch (err) {
        setToastMessage('No se pudo copiar el enlace');
      }
    }
  };

  const similar = useAsync(
    (signal) => getSimilarCardsByName(card.name.split(' ')[0], 6, { signal }),
    [card.name],
  );
  const otherPrints = (similar.data ?? []).filter((c) => c.id !== card.id).slice(0, 5);

  // Assistant context — rebuild whenever the underlying data changes so the
  // assistant always answers from fresh values.
  const assistantContext = useMemo(
    () =>
      buildCardAssistantContext(card, {
        collectionMeta: meta,
        similarCards: similar.data ?? [],
        printedTotalInSet: card.set?.printedTotal,
      }),
    [card, meta, similar.data],
  );

  const heroBgTint = card.types?.[0] ? `${typeColor(card.types[0])}28` : 'rgba(47,111,224,0.15)';
  const setName = card.set?.name ?? '—';
  const setSeries = card.set?.series ?? '';

  return (
    <div style={{ paddingBottom: 110 }}>
      <Toast
        visible={Boolean(toastMessage)}
        message={toastMessage || ''}
        onHide={() => setToastMessage(null)}
      />

      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '54px 14px 10px',
          background:
            'linear-gradient(180deg, var(--bg) 60%, rgba(247,248,251,0))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <RoundBtn ariaLabel="Volver" onClick={() => navigate(-1)}>
          <BackIcon size={18} />
        </RoundBtn>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: -0.3,
          }}
        >
          Detalle de carta
        </div>
        <RoundBtn ariaLabel="Compartir" onClick={handleShare}>
          <ShareIcon size={18} />
        </RoundBtn>
        <RoundBtn ariaLabel="Más" onClick={() => { triggerHaptic('light'); setMoreOpen(true); }}>
          <MoreIcon size={18} />
        </RoundBtn>
      </div>

      {/* Hero */}
      <div
        style={{
          padding: '8px 24px 22px',
          display: 'flex',
          justifyContent: 'center',
          background: `radial-gradient(60% 50% at 50% 35%, ${heroBgTint} 0%, transparent 70%)`,
        }}
      >
        <TcgCardImage card={card} width={250} hero large />
      </div>

      {/* Name + type + rarity */}
      <div style={{ padding: '0 18px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--ink)',
                letterSpacing: -0.6,
              }}
            >
              {card.name}
            </h2>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {card.types?.[0] && <TypeBadge type={card.types[0]} />}
              {card.subtypes?.[0] && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    padding: '3px 9px',
                    background: '#F2F3F7',
                    borderRadius: 999,
                  }}
                >
                  {card.subtypes.join(' · ')}
                </span>
              )}
            </div>
          </div>
          <RarityBadge rarity={card.rarity} size="lg" />
        </div>

        {/* Collection state badges */}
        <CollectionStateRow meta={meta} />
      </div>

      {/* Stats grid */}
      <div style={{ padding: '0 14px 14px' }}>
        <Surface style={{ display: 'flex', alignItems: 'stretch' }}>
          <MiniStat label="PS" value={card.hp ?? '—'} />
          <Divider />
          <MiniStat label="Número" value={card.number} />
          <Divider />
          <MiniStat
            label="Rareza"
            value={
              <span style={{ color: rarityColor(card.rarity) }}>{rarityLabel(card.rarity)}</span>
            }
          />
          <Divider />
          <MiniStat
            label="Valor"
            value={
              <span style={{ color: price ? 'var(--success)' : 'var(--muted)' }}>
                {price ? formatPrice(price) : 'Sin precio'}
              </span>
            }
          />
        </Surface>
      </div>

      {/* Expansion */}
      <div style={{ padding: '0 14px 12px' }}>
        <Surface style={{ padding: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <UpperLabel>Expansión</UpperLabel>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: -0.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {setName}
              </div>
              {setSeries && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {setSeries} · {formatDateShort(card.set?.releaseDate)}
                </div>
              )}
            </div>
            {card.set?.images?.symbol ? (
              <img
                src={card.set.images.symbol}
                alt={setName}
                style={{ height: 36, maxWidth: 60, objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
          </div>

          {otherPrints.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--hairline)', margin: '12px 0' }} />
              <UpperLabel>Aparece en</UpperLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {otherPrints.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/card/${p.id}`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#F2F3F7',
                      color: 'var(--ink)',
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.set?.images?.symbol && (
                      <img
                        src={p.set.images.symbol}
                        alt=""
                        style={{ width: 14, height: 14, objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {p.set?.name ?? 'Otra expansión'}
                  </button>
                ))}
              </div>
            </>
          )}
        </Surface>
      </div>

      {/* Details paragraph + ataques */}
      <div style={{ padding: '0 18px 16px' }}>
        <UpperLabel>Detalles</UpperLabel>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--ink-3)',
            letterSpacing: -0.1,
          }}
        >
          {card.flavorText ??
            (card.artist
              ? `Ilustrada por ${card.artist}.`
              : 'Una criatura de la franquicia Pokémon ilustrada en esta entrega del TCG.')}
        </p>

        {card.attacks && card.attacks.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <UpperLabel>Ataques</UpperLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {card.attacks.map((a, i) => (
                <Surface key={`${a.name}-${i}`} style={{ padding: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>
                      {a.name}
                    </div>
                    {a.damage && (
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: 'var(--ink)',
                          letterSpacing: -0.3,
                        }}
                      >
                        {a.damage}
                      </div>
                    )}
                  </div>
                  {a.cost && a.cost.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {a.cost.map((c, j) => (
                        <span
                          key={j}
                          style={{
                            background: typeColor(c) + '22',
                            color: typeColor(c),
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            letterSpacing: 0.2,
                            textTransform: 'uppercase',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {a.text && (
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: 'var(--ink-3)',
                      }}
                    >
                      {a.text}
                    </p>
                  )}
                </Surface>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Price source */}
      {price && (
        <div style={{ padding: '0 18px 14px' }}>
          <Surface style={{ padding: 12 }}>
            <UpperLabel>Valor estimado</UpperLabel>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <PriceBadge price={price} size="lg" />
              <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                {price.source}
              </span>
            </div>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 11,
                color: 'var(--muted)',
                lineHeight: 1.45,
              }}
            >
              {PRICE_DISCLAIMER}
            </p>
            <PriceHistoryChart price={price.value} cardId={card.id} />
          </Surface>
        </div>
      )}

      {/* Add to collection */}
      <div style={{ padding: '0 14px 12px' }}>
        <Surface style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.2,
              marginBottom: 12,
            }}
          >
            Agregar a mi colección
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <QuantitySelector value={qty} onChange={setQty} min={1} />
            <FoilToggle value={foil} onChange={setFoil} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <SelectField
              label="Variante"
              value={variant}
              onChange={(v) => setVariant(v as CardVariant)}
              options={['Normal', 'Holo', 'Reverse Holo', 'Promo']}
            />
            <SelectField
              label="Condición"
              value={condition}
              onChange={(v) => setCondition(v as CardCondition)}
              options={[
                'Mint',
                'Near Mint',
                'Lightly Played',
                'Moderately Played',
                'Heavily Played',
                'Damaged',
              ]}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: saved ? '1fr 1fr' : '1fr', gap: 10 }}>
            <button
              onClick={handleSave}
              style={{
                width: '100%',
                padding: '13px',
                background: saved ? 'var(--success)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: -0.2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 200ms',
              }}
            >
              <CheckIcon size={18} color="#fff" />
              {saved ? 'Guardado' : 'Guardar en mi colección'}
            </button>

            {saved && (
              <button
                onClick={handleRemove}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 14,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  letterSpacing: -0.2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 200ms, border-color 200ms',
                }}
              >
                <TrashIcon size={18} color="#ef4444" />
                Quitar
              </button>
            )}
          </div>
        </Surface>
      </div>

      {/* Add to deck */}
      {decks.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          <Surface style={{ padding: 16 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: -0.2,
                marginBottom: 12,
              }}
            >
              Añadir a un mazo
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }} className="no-scrollbar">
              {decks.map(deck => {
                const count = deck.cards.filter(id => id === card.id).length;
                const isMaxed = count >= 4 && card.supertype !== 'Energy';
                const isSavedHere = deckSavedId === deck.id;
                
                return (
                  <button
                    key={deck.id}
                    onClick={() => {
                      if (isMaxed) return;
                      addCardToDeck(deck.id, card.id);
                      triggerHaptic('light');
                      setDeckSavedId(deck.id);
                      setTimeout(() => setDeckSavedId(null), 2000);
                    }}
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: isSavedHere ? 'var(--success)' : isMaxed ? '#E1E3EA' : '#F2F3F7',
                      color: isSavedHere ? '#fff' : isMaxed ? 'var(--muted)' : 'var(--ink)',
                      padding: '8px 14px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      cursor: isMaxed ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 200ms',
                    }}
                  >
                    {isSavedHere ? <CheckIcon size={16} color="#fff" /> : <DecksIcon size={16} />}
                    {deck.name} ({deck.cards.length}/60)
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Puedes agregar hasta 4 copias de la misma carta por mazo.
            </div>
          </Surface>
        </div>
      )}

      {/* Card Assistant entry */}
      <div style={{ padding: '0 14px 14px' }}>
        <CardAssistantButton context={assistantContext} />
      </div>

      {/* Quick actions */}
      <div
        style={{ padding: '0 14px', display: 'flex', gap: 10 }}
        role="group"
        aria-label="Estado de la carta"
      >
        <ActionBtn
          icon={
            meta?.favorite ? (
              <HeartFilledIcon size={18} />
            ) : (
              <HeartIcon size={18} />
            )
          }
          label="Favorita"
          active={!!meta?.favorite}
          color="#FF3B30"
          onClick={() => {
            toggleFavorite(card.id);
            triggerHaptic('light');
          }}
        />
        <ActionBtn
          icon={<BookmarkIcon size={18} />}
          label="Wishlist"
          active={!!meta?.wishlist}
          color="#7B5AD9"
          onClick={() => {
            toggleWishlist(card.id);
            triggerHaptic('light');
          }}
        />
        <ActionBtn
          icon={<BanIcon size={18} />}
          label="Falta"
          active={!!meta?.missing}
          color="#8E8E93"
          onClick={() => {
            toggleMissing(card.id);
            triggerHaptic('light');
          }}
        />
      </div>

      {/* 3-dots Context Menu / Modal */}
      {moreOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 20, 40, 0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '20px 20px 34px',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.15)',
              borderTop: '0.5px solid rgba(255, 255, 255, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 36,
                height: 5,
                background: 'rgba(0, 0, 0, 0.15)',
                borderRadius: 3,
                alignSelf: 'center',
                marginBottom: 12,
              }}
            />
            
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--muted)',
                marginBottom: 6,
                paddingLeft: 8,
              }}
            >
              Acciones de Carta
            </div>

            <button
              onClick={() => {
                setMoreOpen(false);
                handleDownloadImage();
              }}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(0, 0, 0, 0.03)',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink)',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: 'inherit',
              }}
            >
              📥 Descargar Imagen
            </button>

            <button
              onClick={() => {
                setMoreOpen(false);
                handleCopyId();
              }}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(0, 0, 0, 0.03)',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink)',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: 'inherit',
              }}
            >
              📋 Copiar ID de Carta
            </button>

            {card.tcgplayer?.url && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  window.open(card.tcgplayer?.url, '_blank');
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'rgba(0, 0, 0, 0.03)',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: 'inherit',
                }}
              >
                🌐 Ver en TCGPlayer
              </button>
            )}

            <button
              onClick={() => {
                setMoreOpen(false);
                handleCreateDeckWithCard();
              }}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(123, 90, 217, 0.1)',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--accent)',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: 'inherit',
              }}
            >
              ➕ Crear mazo con esta carta
            </button>

            <button
              onClick={() => setMoreOpen(false)}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(0, 0, 0, 0.05)',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--ink-2)',
                textAlign: 'center',
                cursor: 'pointer',
                marginTop: 8,
                fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Small subcomponents                                                        */
/* ------------------------------------------------------------------------- */

function RoundBtn({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
        color: 'var(--ink-2)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--muted)',
          letterSpacing: 0.2,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: 'var(--ink)',
          marginTop: 4,
          letterSpacing: -0.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 0.5, background: 'var(--border)' }} />;
}

function UpperLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--muted)',
        letterSpacing: 0.3,
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  active,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1,
        padding: '12px 8px',
        background: active ? color + '14' : '#fff',
        border: `0.5px solid ${active ? color + '40' : 'var(--border)'}`,
        color: active ? color : 'var(--ink-3)',
        borderRadius: 14,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 180ms',
        minHeight: 56,
      }}
    >
      {icon}
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

/**
 * Row of small badges that summarize the user-specific state of this card:
 *   "En mi colección · 3", "Favorita", "Wishlist", "Falta", "Duplicada".
 * Hidden entirely when the card is not in the local collection.
 */
function CollectionStateRow({
  meta,
}: {
  meta: ReturnType<typeof useCardMeta>;
}) {
  if (!meta) return null;
  const badges: Array<{ label: string; color: string; bg: string }> = [];
  if (meta.owned && meta.quantity > 0) {
    badges.push({
      label: `En mi colección${meta.quantity > 1 ? ` · ${meta.quantity}` : ''}`,
      color: 'var(--success)',
      bg: 'rgba(52,199,89,0.10)',
    });
  }
  if (meta.quantity > 1) {
    badges.push({
      label: 'Duplicada',
      color: 'var(--warning)',
      bg: 'rgba(242,153,74,0.12)',
    });
  }
  if (meta.favorite) {
    badges.push({
      label: 'Favorita',
      color: 'var(--error)',
      bg: 'rgba(255,59,48,0.10)',
    });
  }
  if (meta.wishlist) {
    badges.push({
      label: 'Wishlist',
      color: 'var(--purple)',
      bg: 'rgba(123,90,217,0.12)',
    });
  }
  if (meta.missing) {
    badges.push({
      label: 'Falta',
      color: 'var(--muted)',
      bg: 'rgba(110,113,128,0.12)',
    });
  }
  if (badges.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      {badges.map((b) => (
        <span
          key={b.label}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: b.color,
            background: b.bg,
            padding: '4px 10px',
            borderRadius: 999,
            letterSpacing: -0.05,
          }}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--muted)',
          letterSpacing: 0.2,
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'relative',
          background: 'var(--bg)',
          borderRadius: 12,
          border: '0.5px solid var(--border)',
        }}
      >
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            padding: '10px 28px 10px 12px',
            width: '100%',
            cursor: 'pointer',
            letterSpacing: -0.1,
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            fontSize: 10,
            pointerEvents: 'none',
          }}
        >
          ▾
        </span>
      </div>
    </label>
  );
}

function PriceHistoryChart({ price, cardId }: { price: number; cardId: string }) {
  const data = useMemo(() => {
    // Generate 6 months of deterministic pseudo-random data based on cardId
    let hash = 0;
    for (let i = 0; i < cardId.length; i++) {
      hash = cardId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seed = Math.abs(hash) / 2147483647; // 0 to 1

    const points = [];
    let current = price * (0.7 + seed * 0.4); // Start based on seed
    for (let i = 0; i < 6; i++) {
      const month = new Date();
      month.setMonth(month.getMonth() - (5 - i));
      points.push({
        name: month.toLocaleDateString('es-ES', { month: 'short' }),
        value: i === 5 ? price : current
      });
      // Pseudo-random walk using the seed, making it deterministic per card
      const stepSeed = (seed * (i + 1) * 1.5) % 1;
      current = current + (stepSeed - 0.4) * (price * 0.15); 
    }
    return points;
  }, [price, cardId]);

  const isUp = data[5].value >= data[0].value;
  const color = isUp ? '#34C759' : '#FF3B30';

  return (
    <div style={{ width: '100%', height: 120, marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
        TENDENCIA DE 6 MESES <span style={{ color }}>{isUp ? '▲' : '▼'} {Math.abs(((data[5].value - data[0].value) / data[0].value) * 100).toFixed(1)}%</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted)' }} dy={10} />
          <Tooltip 
            contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            itemStyle={{ color: 'var(--ink)', fontWeight: 'bold' }}
            formatter={(value: any) => [`$${value.toFixed(2)}`, 'Valor']}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
        *Datos de tendencia aproximados de TCGPlayer
      </div>
    </div>
  );
}
