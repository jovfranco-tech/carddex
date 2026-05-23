import React, { useState } from 'react';
import { triggerHaptic } from '@/lib/haptic';
import { markAllAlertsAsRead, clearAllPriceAlerts, type PriceAlert } from '@/lib/priceMonitor';

interface PriceAlertsPanelProps {
  isOpen: boolean;
  alerts: PriceAlert[];
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export default function PriceAlertsPanel({
  isOpen,
  alerts,
  onClose,
  onNavigate,
}: PriceAlertsPanelProps) {
  const [insightCardId, setInsightCardId] = useState<string | null>(null);
  const [insightText, setInsightText] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);

  const handleInsight = async (alert: PriceAlert, e: React.MouseEvent) => {
    e.stopPropagation();
    if (insightLoading || insightCardId === alert.id) return;
    setInsightCardId(alert.id);
    setInsightText('');
    setInsightLoading(true);
    triggerHaptic('light');

    try {
      const res = await fetch('/api/price-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardName: alert.cardName,
          oldPrice: alert.oldPrice,
          newPrice: alert.newPrice,
          changePercent: alert.changePercent,
        }),
      });
      if (!res.ok) throw new Error('Error del servidor');
      const data = await res.json();
      setInsightText(data.insight || 'No se pudo obtener el análisis.');
    } catch {
      setInsightText('❌ No se pudo cargar el análisis de mercado en este momento.');
    } finally {
      setInsightLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 20, 40, 0.4)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={() => {
        onClose();
        triggerHaptic('light');
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '24px 20px 40px',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.15)',
          border: '0.5px solid rgba(255, 255, 255, 0.4)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div
          style={{
            width: 36,
            height: 5,
            background: 'rgba(0, 0, 0, 0.1)',
            borderRadius: 2.5,
            alignSelf: 'center',
            marginBottom: 18,
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
            Alertas de Precios
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            {alerts.length > 0 && (
              <button
                onClick={() => {
                  markAllAlertsAsRead();
                  triggerHaptic('light');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Marcar leídas
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                triggerHaptic('light');
              }}
              style={{
                background: 'rgba(0, 0, 0, 0.05)',
                border: 'none',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontWeight: 700,
                color: 'var(--ink-2)',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div
          className="no-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingRight: 2,
          }}
        >
          {alerts.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              No tienes alertas de precios en este momento.
            </div>
          ) : (
            alerts.map((alert, index) => {
              const isUp = alert.changePercent >= 0;
              return (
                <React.Fragment key={alert.id}>
                  <div
                    onClick={() => {
                      onClose();
                      triggerHaptic('light');
                      onNavigate(`/card/${alert.cardId}`);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 16,
                      background: alert.read ? 'rgba(0, 0, 0, 0.02)' : 'rgba(123, 90, 217, 0.06)',
                      border: alert.read
                        ? '0.5px solid rgba(0, 0, 0, 0.05)'
                        : '0.5px solid rgba(123, 90, 217, 0.2)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      boxShadow: alert.read ? 'none' : '0 4px 12px rgba(123, 90, 217, 0.04)',
                      animation: 'alertReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                      animationDelay: `${index * 60}ms`,
                    }}
                  >
                    <img
                      src={alert.cardImage}
                      alt={alert.cardName}
                      style={{
                        width: 38,
                        height: 53,
                        borderRadius: 6,
                        objectFit: 'cover',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--ink)',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {alert.cardName}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: isUp ? 'var(--success)' : 'var(--error)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isUp ? '▲' : '▼'} {Math.abs(alert.changePercent)}%
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: 4,
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Antes:{' '}
                          <span style={{ textDecoration: 'line-through' }}>
                            ${alert.oldPrice.toFixed(2)}
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                          Ahora: ${alert.newPrice.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                        {new Date(alert.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        -{' '}
                        {new Date(alert.timestamp).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      {/* AI Insight Button */}
                      <button
                        onClick={(e) => handleInsight(alert, e)}
                        style={{
                          marginTop: 8,
                          padding: '5px 12px',
                          background:
                            insightCardId === alert.id && insightText
                              ? 'rgba(123,90,217,0.15)'
                              : 'rgba(123,90,217,0.08)',
                          border: '0.5px solid rgba(123,90,217,0.3)',
                          borderRadius: 20,
                          color: '#7B5AD9',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: insightLoading && insightCardId === alert.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          width: 'fit-content',
                        }}
                      >
                        {insightLoading && insightCardId === alert.id ? (
                          <>
                            <span
                              style={{
                                animation: 'spin 1s linear infinite',
                                display: 'inline-block',
                              }}
                            >
                              ⟳
                            </span>{' '}
                            Analizando...
                          </>
                        ) : (
                          <>✦ AI Insight</>
                        )}
                      </button>
                    </div>
                  </div>
                  {/* Insight expanded panel */}
                  {insightCardId === alert.id && insightText && (
                    <div
                      style={{
                        margin: '4px 0 4px 50px',
                        padding: '12px 14px',
                        background:
                          'linear-gradient(135deg, rgba(123,90,217,0.06) 0%, rgba(47,111,224,0.04) 100%)',
                        border: '0.5px solid rgba(123,90,217,0.2)',
                        borderRadius: 12,
                        fontSize: 12,
                        color: 'var(--ink)',
                        lineHeight: 1.55,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: '#7B5AD9',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          marginBottom: 6,
                        }}
                      >
                        ✦ Análisis de Mercado IA
                      </div>
                      {insightText}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInsightCardId(null);
                          setInsightText('');
                        }}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          fontSize: 12,
                          padding: 2,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>

        {alerts.length > 0 && (
          <button
            onClick={() => {
              clearAllPriceAlerts();
              triggerHaptic('heavy');
            }}
            style={{
              width: '100%',
              marginTop: 20,
              background: 'rgba(255, 59, 48, 0.08)',
              color: '#FF3B30',
              border: 'none',
              borderRadius: 14,
              padding: '12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.2s',
            }}
          >
            Limpiar todas las alertas
          </button>
        )}
      </div>
    </div>
  );
}

// Inject spin keyframe for the AI insight loading spinner
const _spinStyle = document.createElement('style');
_spinStyle.textContent =
  '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
if (typeof document !== 'undefined' && !document.getElementById('carddex-spin-kf')) {
  _spinStyle.id = 'carddex-spin-kf';
  document.head.appendChild(_spinStyle);
}
