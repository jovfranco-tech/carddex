import { describe, expect, it } from 'vitest';
import { translateSpanishQuery } from './pokemonTcgApi';

describe('translateSpanishQuery', () => {
  it('translates exact matches successfully', () => {
    expect(translateSpanishQuery('cambio')).toBe('Switch');
    expect(translateSpanishQuery('guzma')).toBe('Guzma');
  });

  it('is case-insensitive and ignores accents', () => {
    expect(translateSpanishQuery('Energía Fuego')).toBe('Fire Energy');
    expect(translateSpanishQuery('energia fuego')).toBe('Fire Energy');
    expect(translateSpanishQuery('Investigación de Profesores')).toBe("Professor's Research");
    expect(translateSpanishQuery('investigacion de profesores')).toBe("Professor's Research");
  });

  it('replaces partial Spanish keywords inside search terms', () => {
    expect(translateSpanishQuery('mi carta de cambio')).toBe('mi carta de Switch');
  });

  it('keeps English terms unchanged', () => {
    expect(translateSpanishQuery('Pikachu')).toBe('Pikachu');
    expect(translateSpanishQuery('Charizard VMAX')).toBe('Charizard VMAX');
  });
});
