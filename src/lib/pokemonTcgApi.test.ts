import { describe, expect, it } from 'vitest';
import { translateSpanishQuery, parseSearchQuery } from './pokemonTcgApi';

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

  it('translates fan nicknames like gordo and chonkachu', () => {
    expect(translateSpanishQuery('pikachu gordo')).toBe('Pikachu VMAX');
    expect(translateSpanishQuery('chonkachu')).toBe('Pikachu VMAX');
    expect(translateSpanishQuery('eevee gordo')).toBe('eevee VMAX');
  });
});

describe('parseSearchQuery', () => {
  it('parses pure name queries correctly', () => {
    const parsed = parseSearchQuery('Pikachu VMAX');
    expect(parsed.name).toBe('Pikachu VMAX');
    expect(parsed.number).toBeUndefined();
    expect(parsed.setId).toBeUndefined();
  });

  it('extracts pure digit card numbers', () => {
    const parsed = parseSearchQuery('Charizard 223');
    expect(parsed.name).toBe('Charizard');
    expect(parsed.number).toBe('223');
    expect(parsed.setId).toBeUndefined();
  });

  it('extracts fractional card numbers', () => {
    const parsed = parseSearchQuery('Pikachu 026/071');
    expect(parsed.name).toBe('Pikachu');
    expect(parsed.number).toBe('026');
    expect(parsed.setId).toBeUndefined();
  });

  it('extracts special gallery numbers', () => {
    const parsed = parseSearchQuery('Mew TG12');
    expect(parsed.name).toBe('Mew');
    expect(parsed.number).toBe('TG12');
    expect(parsed.setId).toBeUndefined();
  });

  it('extracts set ID codes', () => {
    const parsed = parseSearchQuery('Charizard sv3');
    expect(parsed.name).toBe('Charizard');
    expect(parsed.number).toBeUndefined();
    expect(parsed.setId).toBe('sv3');

    // Test new 2025/2026 sets and classic sets
    expect(parseSearchQuery('Mewtwo me3').setId).toBe('me3');
    expect(parseSearchQuery('Pikachu ex zsv10pt5').setId).toBe('zsv10pt5');
    expect(parseSearchQuery('Reshiram rsv10pt5').setId).toBe('rsv10pt5');
    expect(parseSearchQuery('Alakazam base1').setId).toBe('base1');
    expect(parseSearchQuery('Mew cel25').setId).toBe('cel25');
  });

  it('handles fully combined name, number and set queries', () => {
    const parsed = parseSearchQuery('Pikachu 026/165 sv2a');
    expect(parsed.name).toBe('Pikachu');
    expect(parsed.number).toBe('026');
    expect(parsed.setId).toBe('sv2a');
  });

  it('handles translated combined queries with accents', () => {
    const parsed = parseSearchQuery('energía fuego 12 sv3');
    expect(parsed.name).toBe('Fire Energy');
    expect(parsed.number).toBe('12');
    expect(parsed.setId).toBe('sv3');
  });
});
