import React from 'react';
import { triggerHaptic } from '@/lib/haptic';
import {
  markAllAlertsAsRead,
  clearAllPriceAlerts,
  type PriceAlert,
} from '@/lib/priceMonitor';

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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>
              No tienes alertas de precios en este momento.
            </div>
          ) : (
            alerts.map((alert) => {
              const isUp = alert.changePercent >= 0;
              return (
                <div
                  key={alert.id}
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
                    border: alert.read ? '0.5px solid rgba(0, 0, 0, 0.05)' : '0.5px solid rgba(123, 90, 217, 0.2)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    boxShadow: alert.read ? 'none' : '0 4px 12px rgba(123, 90, 217, 0.04)',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Antes: <span style={{ textDecoration: 'line-through' }}>${alert.oldPrice.toFixed(2)}</span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                        Ahora: ${alert.newPrice.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(alert.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
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
