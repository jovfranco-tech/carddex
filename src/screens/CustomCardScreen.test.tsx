// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import CustomCardScreen from './CustomCardScreen';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/haptic', () => ({
  triggerHaptic: vi.fn(),
}));

describe('CustomCardScreen Component', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly with default state', () => {
    render(<CustomCardScreen />);

    // Check main title
    expect(screen.getByText('Creador de Cartas Custom IA')).toBeDefined();

    // Check initial prompt input value
    expect(screen.getByText('Configuración de la Carta')).toBeDefined();

    // Check that there are no custom creations initially
    expect(screen.getByText('Sin carta generada aún')).toBeDefined();
  });

  it('allows user to customize form fields and generates a custom card successfully', async () => {
    const mockApiResponse = {
      hp: '180',
      stage: 'Basic',
      attack1: {
        name: 'Fusión Estelar',
        cost: ['Dragon'],
        damage: '80',
        effect: 'Une una energía del mazo.',
      },
      attack2: {
        name: 'Llamarada Quantum',
        cost: ['Dragon', 'Colorless'],
        damage: '150',
        effect: '',
      },
      weakness: 'Colorless',
      resistance: null,
      retreatCost: 2,
      description: 'Un majestuoso dragón estelar.',
      imageUrl: 'https://example.com/art.png',
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    render(<CustomCardScreen />);

    // Custom values
    const nameInput = screen.getByPlaceholderText('Ej: Antigravity Coder');
    fireEvent.change(nameInput, { target: { value: 'Sparky' } });

    const promptInput = screen.getByPlaceholderText(
      'Describe la escena, colores y detalles que quieres que la IA ilustre.'
    );
    fireEvent.change(promptInput, {
      target: { value: 'A cute yellow squirrel generating electricity' },
    });

    // Submit form
    const submitBtn = screen.getByText('Forjar Carta con IA');
    fireEvent.click(submitBtn);

    // Should show loading step
    expect(screen.getByText('Canalizando energía de IA...')).toBeDefined();

    // Wait for the api call to finish
    await waitFor(() => {
      // Find 'Sparky' in preview or gallery
      expect(screen.getAllByText('Sparky')[0]).toBeDefined();
    });

    expect(screen.getAllByText('180 HP')[0]).toBeDefined();
    expect(screen.getAllByText('Fusión Estelar')[0]).toBeDefined();
    expect(screen.getAllByText('Llamarada Quantum')[0]).toBeDefined();

    // Verify it saved to localStorage
    const saved = localStorage.getItem('carddex.customCards');
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed[0].name).toBe('Sparky');
  });

  it('handles custom card deletion from gallery', async () => {
    const initialCards = [
      {
        id: 'custom-12345',
        name: 'Existing Dragon',
        type: 'Dragon',
        style: 'Illustration Rare',
        hp: '160',
        stage: 'Basic',
        attack1: { name: 'Bite', cost: ['Dragon'], damage: '30', effect: '' },
        attack2: {
          name: 'Fire Breath',
          cost: ['Dragon'],
          damage: '80',
          effect: '',
        },
        weakness: 'Colorless',
        resistance: null,
        retreatCost: 1,
        description: 'An old dragon.',
        imageUrl: 'https://example.com/dragon.png',
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem('carddex.customCards', JSON.stringify(initialCards));

    render(<CustomCardScreen />);

    // Verify it rendered the existing card
    expect(screen.getAllByText('Existing Dragon')[0]).toBeDefined();
    expect(screen.getByText('Mis Creaciones Custom (1)')).toBeDefined();

    // Find and click delete button
    const deleteBtn = screen.getByTitle('Eliminar');
    fireEvent.click(deleteBtn);

    // Verify it is removed
    expect(screen.queryByText('Existing Dragon')).toBeNull();
    expect(screen.getByText('Sin carta generada aún')).toBeDefined();
    expect(localStorage.getItem('carddex.customCards')).toBe('[]');
  });
});
