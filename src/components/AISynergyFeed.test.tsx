// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AISynergyFeed from './AISynergyFeed';

vi.mock('@/lib/haptic', () => ({
  triggerHaptic: vi.fn(),
}));

describe('AISynergyFeed Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    global.fetch = vi.fn();
  });

  it('renders motivational prompt when ownedCardNames < 5', () => {
    render(<AISynergyFeed ownedCardNames={['Pikachu', 'Charizard']} />);

    expect(screen.getByText('¡Casi listo para el análisis!')).toBeDefined();
    expect(screen.getByText('3 cartas más')).toBeDefined();
  });

  it('displays loading skeleton and then fetches synergies when ownedCardNames >= 5', async () => {
    const mockSynergies = [
      {
        title: 'Sinergía Eléctrica',
        cardsInvolved: 'Pikachu, Raichu',
        tag: 'Ataque',
        explanation: 'Gran combinación de daño.',
        recommendation: 'Jugar con cartas de soporte.',
      },
    ];

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ synergies: mockSynergies }),
    });

    render(
      <AISynergyFeed
        ownedCardNames={[
          'Pikachu',
          'Raichu',
          'Jolteon',
          'Zapdos',
          'Electabuzz',
        ]}
      />
    );

    // Initial load will trigger fetch
    await waitFor(() => {
      expect(screen.getByText('Sinergía Eléctrica')).toBeDefined();
    });

    expect(screen.getByText('🔗 Pikachu, Raichu')).toBeDefined();
    expect(screen.getByText('Gran combinación de daño.')).toBeDefined();
    expect(
      screen.getByText('💡 Recomendación: Jugar con cartas de soporte.')
    ).toBeDefined();
  });

  it('reads from cache if valid and bypasses initial fetch', async () => {
    const cachedData = {
      data: [
        {
          title: 'Sinergía Fuego',
          cardsInvolved: 'Charizard, Ninetales',
          tag: 'Ataque',
          explanation: 'Daño masivo de fuego.',
          recommendation: 'Agregar energías rápidas.',
        },
      ],
      timestamp: Date.now(),
      cardCount: 5,
    };
    localStorage.setItem('carddex.cachedSynergies', JSON.stringify(cachedData));

    render(
      <AISynergyFeed
        ownedCardNames={[
          'Charizard',
          'Ninetales',
          'Growlithe',
          'Arcanine',
          'Flareon',
        ]}
      />
    );

    // Should immediately render cache without calling fetch
    expect(screen.getByText('Sinergía Fuego')).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles 429 rate limit error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
    });

    render(
      <AISynergyFeed
        ownedCardNames={[
          'Pikachu',
          'Raichu',
          'Jolteon',
          'Zapdos',
          'Electabuzz',
        ]}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('⚠️ Demasiadas solicitudes. Espera un momento.')
      ).toBeDefined();
    });
  });

  it('handles general fetch error', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network Error'));

    render(
      <AISynergyFeed
        ownedCardNames={[
          'Pikachu',
          'Raichu',
          'Jolteon',
          'Zapdos',
          'Electabuzz',
        ]}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('⚠️ No se pudieron obtener sinergias con IA.')
      ).toBeDefined();
    });
  });
});
