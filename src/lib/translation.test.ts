import { describe, it, expect } from 'vitest';
import { translateCardText } from './translation';

describe('Pokémon TCG Dynamic Translation Engine', () => {
  it('should translate direct vocabulary words', () => {
    expect(translateCardText('Basic')).toBe('Básico');
    expect(translateCardText('Stage 1')).toBe('Fase 1');
    expect(translateCardText('Stage 2')).toBe('Fase 2');
    expect(translateCardText('ITEM')).toBe('Objeto');
    expect(translateCardText('SUPPORTER')).toBe('Partidario');
    expect(translateCardText('STADIUM')).toBe('Estadio');
    expect(translateCardText('Asleep')).toBe('Dormido');
    expect(translateCardText('Confused')).toBe('Confundido');
  });

  it('should translate coin flips patterns', () => {
    expect(translateCardText('Flip a coin.')).toBe('Lanza una moneda.');
    expect(translateCardText('If heads,')).toBe('Si sale cara,');
    expect(translateCardText('If tails,')).toBe('Si sale cruz,');
    expect(translateCardText('If heads, this attack does 30 more damage.')).toBe(
      'Si sale cara, este ataque hace 30 puntos de daño más.'
    );
    expect(translateCardText('If heads, the Active Pokémon is now Paralyzed.')).toBe(
      'Si sale cara, el Pokémon Activo pasa a estar paralizado.'
    );
  });

  it('should translate energy mechanics', () => {
    expect(translateCardText('Discard a Energy from this Pokémon.')).toBe(
      'Descarta 1 Energía de este Pokémon.'
    );
    expect(translateCardText('Discard 2 Energy attached to this Pokémon.')).toBe(
      'Descarta 2 Energía unidas a este Pokémon.'
    );
  });

  it('should translate damage multiplication patterns', () => {
    expect(
      translateCardText("This attack does 20 damage to each of your opponent's Benched Pokémon.")
    ).toBe(
      'Este ataque hace 20 puntos de daño a cada uno de los Pokémon en la Banca de tu oponente.'
    );
    expect(translateCardText("Don't apply Weakness and Resistance for Benched Pokémon.")).toBe(
      'No apliques Debilidad y Resistencia a los Pokémon en la Banca.'
    );
  });

  it('should translate card draw and hands', () => {
    expect(translateCardText('Draw 3 cards.')).toBe('Roba 3 cartas.');
    expect(translateCardText('Discard your hand and draw 5 cards.')).toBe(
      'Descarta tu mano y roba 5 cartas.'
    );
  });

  it('should return empty string on null or undefined', () => {
    expect(translateCardText(null)).toBe('');
    expect(translateCardText(undefined)).toBe('');
  });

  it('should preserve untranslated text structure safely', () => {
    const originalText = 'Use this attack during your first turn.';
    // Should pass through untouched if no rules match it
    expect(translateCardText(originalText)).toBe(originalText);
  });
});
