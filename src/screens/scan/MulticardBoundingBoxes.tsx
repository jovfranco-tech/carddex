import type { PokemonCard } from '@/types/pokemon';

interface JitterState {
  x1: number;
  y1: number;
  scale1: number;
  conf1: number;
  x2: number;
  y2: number;
  scale2: number;
  conf2: number;
  x3: number;
  y3: number;
  scale3: number;
  conf3: number;
}

interface MulticardBoundingBoxesProps {
  detectedMulticards: PokemonCard[];
  jitter: JitterState;
}

export default function MulticardBoundingBoxes({
  detectedMulticards,
  jitter,
}: MulticardBoundingBoxesProps) {
  return (
    <>
      {detectedMulticards[0] && (
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '6%',
            width: '42%',
            height: '50%',
            border: '2.5px solid #7B5AD9',
            borderRadius: 16,
            boxShadow: '0 0 20px rgba(123, 90, 217, 0.4), inset 0 0 12px rgba(123, 90, 217, 0.2)',
            animation: 'popIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 10,
            transform: `translate3d(${jitter.x1}px, ${jitter.y1}px, 0) scale(${jitter.scale1})`,
            transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -30,
              left: 0,
              background: 'rgba(20, 22, 30, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '0.5px solid rgba(123, 90, 217, 0.4)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 10.5,
              fontWeight: 700,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7B5AD9' }} />
            <span>
              {detectedMulticards[0].name} ({jitter.conf1}%)
            </span>
          </div>
        </div>
      )}
      {detectedMulticards[1] && (
        <div
          style={{
            position: 'absolute',
            top: '38%',
            left: '52%',
            width: '42%',
            height: '50%',
            border: '2.5px solid #E07A25',
            borderRadius: 16,
            boxShadow: '0 0 20px rgba(224, 122, 37, 0.4), inset 0 0 12px rgba(224, 122, 37, 0.2)',
            animation: 'popIn 450ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 10,
            transform: `translate3d(${jitter.x2}px, ${jitter.y2}px, 0) scale(${jitter.scale2})`,
            transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -30,
              left: 0,
              background: 'rgba(20, 22, 30, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '0.5px solid rgba(224, 122, 37, 0.4)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 10.5,
              fontWeight: 700,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E07A25' }} />
            <span>
              {detectedMulticards[1].name} ({jitter.conf2}%)
            </span>
          </div>
        </div>
      )}
      {detectedMulticards[2] && (
        <div
          style={{
            position: 'absolute',
            top: '46%',
            left: '10%',
            width: '38%',
            height: '46%',
            border: '2.5px solid #2F6FE0',
            borderRadius: 16,
            boxShadow: '0 0 20px rgba(47, 111, 224, 0.4), inset 0 0 12px rgba(47, 111, 224, 0.2)',
            animation: 'popIn 550ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 9,
            transform: `translate3d(${jitter.x3}px, ${jitter.y3}px, 0) scale(${jitter.scale3})`,
            transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -30,
              left: 0,
              background: 'rgba(20, 22, 30, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '0.5px solid rgba(47, 111, 224, 0.4)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 10.5,
              fontWeight: 700,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2F6FE0' }} />
            <span>
              {detectedMulticards[2].name} ({jitter.conf3}%)
            </span>
          </div>
        </div>
      )}
    </>
  );
}
