import { useMemo } from 'react';
import { TrophyIcon, StarFilledIcon, StarIcon, SparklesIcon, ZapIcon } from '@/components/icons';
import {
  ACHIEVEMENT_CATALOGUE,
  getUnlockedAchievements,
  type Achievement,
} from '@/lib/achievements';

const CATEGORY_LABELS: Record<string, string> = {
  ai: '✦ AI-Native',
  collection: '📦 Colección',
  social: '🤝 Social',
};

function CategoryIcon({ category }: { category: string }) {
  if (category === 'ai') return <SparklesIcon size={14} />;
  if (category === 'collection') return <StarIcon size={14} />;
  return <ZapIcon size={14} />;
}

function AchievementCard({ achievement, unlocked, unlockedAt }: {
  achievement: Achievement;
  unlocked: boolean;
  unlockedAt?: string;
}) {
  const dateStr = unlockedAt
    ? new Date(unlockedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      style={{
        background: unlocked
          ? 'linear-gradient(135deg, rgba(123,90,217,0.12) 0%, rgba(47,111,224,0.08) 100%)'
          : 'var(--surface)',
        border: unlocked ? '1px solid rgba(123,90,217,0.3)' : '1px solid var(--border)',
        borderRadius: 18,
        padding: '16px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
        boxShadow: unlocked ? '0 4px 24px rgba(123,90,217,0.12)' : 'none',
      }}
    >
      {/* Glow effect for unlocked */}
      {unlocked && (
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(123,90,217,0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Emoji / lock */}
      <div
        style={{
          fontSize: 32,
          lineHeight: 1,
          flexShrink: 0,
          filter: unlocked
            ? 'drop-shadow(0 0 8px rgba(123,90,217,0.4))'
            : 'grayscale(1) opacity(0.35)',
          transition: 'filter 300ms',
        }}
      >
        {unlocked ? achievement.emoji : '🔒'}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: unlocked ? 'var(--accent)' : 'var(--muted)',
              letterSpacing: -0.2,
            }}
          >
            {achievement.title}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--muted)',
              background: 'var(--bg)',
              borderRadius: 6,
              padding: '1px 5px',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <CategoryIcon category={achievement.category} />
            {CATEGORY_LABELS[achievement.category]}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.35 }}>
          {unlocked ? achievement.description : '???'}
        </div>
        {unlocked && dateStr && (
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4, opacity: 0.7 }}>
            Desbloqueado el {dateStr}
          </div>
        )}
      </div>

      {/* Check badge */}
      {unlocked && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7B5AD9, #2F6FE0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(123,90,217,0.4)',
          }}
        >
          <StarFilledIcon size={13} color="#fff" />
        </div>
      )}
    </div>
  );
}

export default function AchievementsScreen() {
  const unlocked = useMemo(() => getUnlockedAchievements(), []);
  const unlockedCount = Object.keys(unlocked).length;
  const totalCount = ACHIEVEMENT_CATALOGUE.length;
  const progress = Math.round((unlockedCount / totalCount) * 100);

  const grouped = useMemo(() => {
    const groups: Record<string, Achievement[]> = { ai: [], collection: [], social: [] };
    for (const a of ACHIEVEMENT_CATALOGUE) {
      (groups[a.category] ??= []).push(a);
    }
    return groups;
  }, []);

  return (
    <div style={{ paddingBottom: 'var(--bottom-nav-clearance)', overflowY: 'auto', height: '100%' }}>
      {/* Hero header */}
      <div
        style={{
          background: 'linear-gradient(160deg, #0d0f1a 0%, #12152b 60%, #0d0f1a 100%)',
          padding: '52px 24px 28px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 260,
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(123,90,217,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <TrophyIcon size={26} color="#FFD700" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.6 }}>
            Logros
          </h1>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
          Desbloquea logros usando las funciones AI-native de Carddex.
        </p>

        {/* Progress bar */}
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 99,
            height: 8,
            overflow: 'hidden',
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7B5AD9, #2F6FE0)',
              borderRadius: 99,
              transition: 'width 800ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: '0 0 10px rgba(123,90,217,0.6)',
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          {unlockedCount} / {totalCount} logros desbloqueados · {progress}%
        </div>
      </div>

      {/* Achievement groups */}
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {Object.entries(grouped).map(([cat, items]) => (
          items.length > 0 && (
            <div key={cat}>
              <div style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}>
                {CATEGORY_LABELS[cat]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((a) => (
                  <AchievementCard
                    key={a.id}
                    achievement={a}
                    unlocked={Boolean(unlocked[a.id])}
                    unlockedAt={unlocked[a.id]?.unlockedAt}
                  />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
