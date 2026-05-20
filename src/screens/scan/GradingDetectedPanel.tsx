import { useState } from 'react';
import { saveCardMeta } from '@/lib/collectionStorage';
import { triggerHaptic } from '@/lib/haptic';

interface GradingDetectedPanelProps {
  gradingResult: any;
  onRetry: () => void;
}

export default function GradingDetectedPanel({
  gradingResult,
  onRetry,
}: GradingDetectedPanelProps) {
  const [saved, setSaved] = useState(false);
  const cardObj = gradingResult.cardObj;

  const handleSaveWithGrade = () => {
    if (!cardObj) return;
    saveCardMeta(cardObj.id, {
      owned: true,
      condition: gradingResult.qualifier as any,
      customGrade: gradingResult.overallGrade,
      customGradeReport: gradingResult.issues.join('\n'),
    });
    setSaved(true);
    triggerHaptic('success');
  };

  const getSubGradeColor = (val: number) => {
    if (val >= 9.0) return '#34C759';
    if (val >= 7.5) return '#FF9500';
    return '#FF3B30';
  };

  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 24,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        maxWidth: 420,
        margin: '0 auto',
        width: '100%',
        color: '#fff',
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {cardObj ? (
          <div style={{ width: 50, height: 70, borderRadius: 6, overflow: 'hidden', background: '#111', flexShrink: 0 }}>
            <img src={cardObj.images?.small} alt={cardObj.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 50, height: 70, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🃏
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#FF9500', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>
            ✦ Certificado de Calificación IA
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {gradingResult.cardName}
          </div>
          {cardObj && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              {cardObj.set?.name} · {cardObj.number}
            </div>
          )}
        </div>
      </div>

      {/* Main Grade Badge Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '12px 16px',
        gap: 16
      }}>
        {/* Holographic score circle */}
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FF9500 0%, #FF2D55 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(255, 149, 0, 0.4)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{gradingResult.overallGrade.toFixed(1)}</span>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Calificación General</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FF9500', letterSpacing: -0.2 }}>
            PSA {Math.round(gradingResult.overallGrade)} <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>({gradingResult.qualifier})</span>
          </div>
        </div>
      </div>

      {/* Subgrades grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        background: 'rgba(255,255,255,0.01)',
      }}>
        {[
          { label: 'Centrado', value: gradingResult.centering },
          { label: 'Esquinas', value: gradingResult.corners },
          { label: 'Bordes', value: gradingResult.edges },
          { label: 'Superficie', value: gradingResult.surface },
        ].map((sub) => (
          <div key={sub.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{sub.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: getSubGradeColor(sub.value) }}>{sub.value.toFixed(1)}</span>
            </div>
            {/* mini progress bar */}
            <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${sub.value * 10}%`,
                background: getSubGradeColor(sub.value),
                borderRadius: 2
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Issues detected list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 0.2 }}>
          DETALLES Y ANOMALÍAS DETECTADAS:
        </div>
        <div style={{
          maxHeight: 80,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          {gradingResult.issues && gradingResult.issues.length > 0 ? (
            gradingResult.issues.map((issue: string, index: number) => (
              <div key={index} style={{
                display: 'flex',
                gap: 8,
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.3
              }}>
                <span style={{ color: '#FF3B30' }}>•</span>
                <span>{issue}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11.5, color: '#34C759', fontWeight: 600 }}>
              ✓ Ninguna imperfección visible en superficie, bordes ni esquinas.
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onRetry}
          style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Escanear otra
        </button>
        {cardObj && (
          <button
            onClick={handleSaveWithGrade}
            disabled={saved}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: saved ? 'rgba(52, 199, 89, 0.2)' : '#fff',
              color: saved ? '#34C759' : 'var(--scanner-bg)',
              border: saved ? '1px solid #34C759' : 'none',
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: saved ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {saved ? '✓ Guardada con éxito' : 'Guardar con Calificación'}
          </button>
        )}
      </div>
    </div>
  );
}
