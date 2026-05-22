/**
 * Offline card catalog — static dataset of popular Pokémon TCG cards.
 * Used by `cardRecognition.ts` as a fallback when the network is unavailable.
 * Extracted from cardRecognition.ts for maintainability.
 */
import type { PokemonCard } from '@/types/pokemon';

export const OFFLINE_CARD_CATALOG: PokemonCard[] = [
  {
    id: 'sv3-125',
    name: 'Charizard ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'Tera', 'ex'],
    hp: '330',
    types: ['Darkness'],
    evolvesFrom: 'Charmeleon',
    rules: [
      'Tera: As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks (both yours and your opponent\'s).',
      'Pokémon ex rule: When your Pokémon ex is Knocked Out, your opponent takes 2 Prize cards.'
    ],
    attacks: [
      {
        name: 'Burning Darkness',
        cost: ['Fire', 'Fire'],
        convertedEnergyCost: 2,
        damage: '180+',
        text: 'This attack does 30 more damage for each Prize card your opponent has taken.'
      }
    ],
    set: {
      id: 'sv3',
      name: 'Obsidian Flames',
      series: 'Scarlet & Violet',
      printedTotal: 197,
      total: 230,
    },
    number: '125',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv3/125.png',
      large: 'https://images.pokemontcg.io/sv3/125_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 45.0,
          mid: 58.5,
          high: 75.0,
          market: 54.20
        }
      }
    },
    dhash: '1100110011001100111100001111000000001111000011111010101010101010'
  },
  {
    id: 'cel25-25',
    name: 'Pikachu',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '60',
    types: ['Lightning'],
    attacks: [
      {
        name: 'Gnaw',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        damage: '10'
      },
      {
        name: 'Thunderbolt',
        cost: ['Lightning', 'Lightning', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '100',
        text: 'Discard all Energy from this Pokémon.'
      }
    ],
    set: {
      id: 'cel25',
      name: 'Celebrations',
      series: 'Sword & Shield',
      printedTotal: 25,
      total: 25,
    },
    number: '25',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/cel25/25.png',
      large: 'https://images.pokemontcg.io/cel25/25_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.15,
          mid: 0.35,
          high: 1.5,
          market: 0.52
        }
      }
    },
    dhash: '1010101010101010111100001111000000111100001111000101010101010101'
  },
  {
    id: 'sv4-58',
    name: 'Mewtwo ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '220',
    types: ['Psychic'],
    attacks: [
      {
        name: 'Transfer Charge',
        cost: ['Psychic'],
        convertedEnergyCost: 1,
        text: 'Attach up to 2 Basic Psychic Energy cards from your discard pile to your Benched Pokémon in any way you like.'
      },
      {
        name: 'Photon Kinesis',
        cost: ['Psychic', 'Psychic'],
        convertedEnergyCost: 2,
        damage: '10+',
        text: 'This attack does 30 more damage for each Psychic Energy attached to this Pokémon.'
      }
    ],
    set: {
      id: 'sv4',
      name: 'Paradox Rift',
      series: 'Scarlet & Violet',
      printedTotal: 182,
      total: 256,
    },
    number: '58',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv4/58.png',
      large: 'https://images.pokemontcg.io/sv4/58_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 1.0,
          mid: 2.2,
          high: 5.0,
          market: 1.95
        }
      }
    },
    dhash: '0000111100001111110011001100110010101010101010100011110000111100'
  },
  {
    id: 'swsh8-104',
    name: 'Gengar',
    supertype: 'Pokémon',
    subtypes: ['Stage 2'],
    hp: '130',
    types: ['Psychic'],
    evolvesFrom: 'Haunter',
    attacks: [
      {
        name: 'Shadow Pain',
        cost: ['Psychic'],
        convertedEnergyCost: 1,
        text: 'Put 2 damage counters on each of your opponent\'s Pokémon that has any damage counters on it.'
      },
      {
        name: 'Bouncing Panic',
        cost: ['Psychic', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '90',
        text: 'This attack also does 20 damage to each of your Benched Pokémon. (Don\'t apply Weakness and Resistance for Benched Pokémon.)'
      }
    ],
    set: {
      id: 'swsh8',
      name: 'Fusion Strike',
      series: 'Sword & Shield',
      printedTotal: 264,
      total: 284,
    },
    number: '104',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/swsh8/104.png',
      large: 'https://images.pokemontcg.io/swsh8/104_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.45,
          mid: 0.85,
          high: 2.0,
          market: 0.79
        }
      }
    },
    dhash: '1111000011110000000011110000111111001100110011001010101010101010'
  },
  {
    id: 'swsh9-121',
    name: 'Eevee',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '60',
    types: ['Colorless'],
    attacks: [
      {
        name: 'Vee-Search',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        text: 'Search your deck for up to 3 Pokémon V, reveal them, and put them into your hand. Then, shuffle your deck.'
      },
      {
        name: 'Stampede',
        cost: ['Colorless', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '20'
      }
    ],
    set: {
      id: 'swsh9',
      name: 'Brilliant Stars',
      series: 'Sword & Shield',
      printedTotal: 172,
      total: 186,
    },
    number: '121',
    rarity: 'Common',
    images: {
      small: 'https://images.pokemontcg.io/swsh9/121.png',
      large: 'https://images.pokemontcg.io/swsh9/121_hires.png'
    },
    tcgplayer: {
      prices: {
        normal: {
          low: 0.05,
          mid: 0.15,
          high: 1.0,
          market: 0.11
        }
      }
    },
    dhash: '0011001100110011101010101010101011001100110011001111000011110000'
  },
  {
    id: 'swsh4-131',
    name: 'Snorlax',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '130',
    types: ['Colorless'],
    abilities: [
      {
        name: 'Gormandize',
        text: 'Once during your turn, if this Pokémon is in the Active Spot, you may draw cards until you have 7 cards in your hand. If you use this Ability, your turn ends.'
      }
    ],
    attacks: [
      {
        name: 'Body Slam',
        cost: ['Colorless', 'Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 4,
        damage: '100',
        text: 'Flip a coin. If heads, your opponent\'s Active Pokémon is now Paralyzed.'
      }
    ],
    set: {
      id: 'swsh4',
      name: 'Vivid Voltage',
      series: 'Sword & Shield',
      printedTotal: 185,
      total: 203,
    },
    number: '131',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/swsh4/131.png',
      large: 'https://images.pokemontcg.io/swsh4/131_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.80,
          mid: 1.50,
          high: 3.50,
          market: 1.25
        }
      }
    },
    dhash: '0101010101010101000011110000111111001100110011000011110000111100'
  },
  {
    id: 'sit-138',
    name: 'Lugia V',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'V'],
    hp: '220',
    types: ['Colorless'],
    attacks: [
      {
        name: 'Read the Wind',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        text: 'Discard a card from your hand. If you do, draw 3 cards.'
      },
      {
        name: 'Aero Dive',
        cost: ['Colorless', 'Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 4,
        damage: '130',
        text: 'You may discard any Stadium card in play.'
      }
    ],
    set: {
      id: 'sit',
      name: 'Silver Tempest',
      series: 'Sword & Shield',
      printedTotal: 195,
      total: 245,
    },
    number: '138',
    rarity: 'Ultra Rare',
    images: {
      small: 'https://images.pokemontcg.io/sit/138.png',
      large: 'https://images.pokemontcg.io/sit/138_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 3.50,
          mid: 5.75,
          high: 12.00,
          market: 4.88
        }
      }
    },
    dhash: '1001100110011001011001100110011000001111000011111111000011110000'
  },
  {
    id: 'swsh7-111',
    name: 'Rayquaza VMAX',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VMAX', 'Rapid Strike'],
    hp: '320',
    types: ['Dragon'],
    evolvesFrom: 'Rayquaza V',
    abilities: [
      {
        name: 'Azure Pulse',
        text: 'Once during your turn, you may discard your hand and draw 3 cards.'
      }
    ],
    attacks: [
      {
        name: 'Max Burst',
        cost: ['Fire', 'Lightning'],
        convertedEnergyCost: 2,
        damage: '20+',
        text: 'Discard any amount of basic Fire Energy or basic Lightning Energy from this Pokémon. This attack does 80 more damage for each card you discarded in this way.'
      }
    ],
    set: {
      id: 'swsh7',
      name: 'Evolving Skies',
      series: 'Sword & Shield',
      printedTotal: 203,
      total: 237,
    },
    number: '111',
    rarity: 'Rare Holo VMAX',
    images: {
      small: 'https://images.pokemontcg.io/swsh7/111.png',
      large: 'https://images.pokemontcg.io/swsh7/111_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 15.00,
          mid: 28.00,
          high: 45.00,
          market: 23.50
        }
      }
    },
    dhash: '0110011001100110100110011001100111110000111100000000111100001111'
  },
  {
    id: 'me1-3',
    name: 'Venusaur ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'ex'],
    hp: '340',
    types: ['Grass'],
    evolvesFrom: 'Ivysaur',
    attacks: [
      {
        name: 'Soothe Lariat',
        cost: ['Grass', 'Grass', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '150',
        text: 'Heal 30 damage from this Pokémon.'
      }
    ],
    set: {
      id: 'me1',
      name: '151',
      series: 'Scarlet & Violet',
      printedTotal: 165,
      total: 207,
    },
    number: '3',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/me1/3.png',
      large: 'https://images.pokemontcg.io/me1/3_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.00,
          mid: 4.25,
          high: 8.00,
          market: 3.82
        }
      }
    },
    dhash: '0011001100110011111100001111000000001111000011110101010101010101'
  },
  {
    id: 'me1-9',
    name: 'Blastoise ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'ex'],
    hp: '330',
    types: ['Water'],
    evolvesFrom: 'Wartortle',
    attacks: [
      {
        name: 'Twin Cannon',
        cost: ['Water', 'Water'],
        convertedEnergyCost: 2,
        damage: '140x',
        text: 'Discard up to 2 Basic Water Energy cards from your hand. This attack does 140 damage for each card you discarded in this way.'
      }
    ],
    set: {
      id: 'me1',
      name: '151',
      series: 'Scarlet & Violet',
      printedTotal: 165,
      total: 207,
    },
    number: '9',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/me1/9.png',
      large: 'https://images.pokemontcg.io/me1/9_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.50,
          mid: 5.00,
          high: 10.00,
          market: 4.20
        }
      }
    },
    dhash: '0101010101010101110011001100110000111100001111000000111100001111'
  },
  {
    id: 'me1-151',
    name: 'Mew ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '180',
    types: ['Psychic'],
    abilities: [
      {
        name: 'Restart',
        text: 'Once during your turn, you may draw cards until you have 3 cards in your hand.'
      }
    ],
    attacks: [
      {
        name: 'Genome Hacking',
        cost: ['Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 3,
        text: 'Choose 1 of your opponent\'s Active Pokémon\'s attacks and use it as this attack.'
      }
    ],
    set: {
      id: 'me1',
      name: '151',
      series: 'Scarlet & Violet',
      printedTotal: 165,
      total: 207,
    },
    number: '151',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/me1/151.png',
      large: 'https://images.pokemontcg.io/me1/151_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 5.00,
          mid: 8.50,
          high: 15.00,
          market: 7.42
        }
      }
    },
    dhash: '1001100110011001011001100110011011110000111100000000111100001111'
  },
  {
    id: 'sv1-86',
    name: 'Gardevoir ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'ex'],
    hp: '310',
    types: ['Psychic'],
    evolvesFrom: 'Kirlia',
    abilities: [
      {
        name: 'Psychic Embrace',
        text: 'As often as you like during your turn, you may attach a Basic Psychic Energy card from your discard pile to 1 of your Psychic Pokémon.'
      }
    ],
    attacks: [
      {
        name: 'Force Leap',
        cost: ['Psychic', 'Psychic', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '190'
      }
    ],
    set: {
      id: 'sv1',
      name: 'Scarlet & Violet',
      series: 'Scarlet & Violet',
      printedTotal: 198,
      total: 258,
    },
    number: '86',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv1/86.png',
      large: 'https://images.pokemontcg.io/sv1/86_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.00,
          mid: 3.50,
          high: 7.00,
          market: 3.12
        }
      }
    },
    dhash: '1100110011001100001111000011110010101010101010101111000011110000'
  },
  {
    id: 'swsh7-95',
    name: 'Umbreon VMAX',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VMAX'],
    hp: '310',
    types: ['Darkness'],
    evolvesFrom: 'Umbreon V',
    abilities: [
      {
        name: 'Dark Signal',
        text: 'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may switch 1 of your opponent\'s Benched Pokémon with their Active Pokémon.'
      }
    ],
    attacks: [
      {
        name: 'Max Darkness',
        cost: ['Darkness', 'Colorless', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '160'
      }
    ],
    set: {
      id: 'swsh7',
      name: 'Evolving Skies',
      series: 'Sword & Shield',
      printedTotal: 203,
      total: 237,
    },
    number: '95',
    rarity: 'Rare Holo VMAX',
    images: {
      small: 'https://images.pokemontcg.io/swsh7/95.png',
      large: 'https://images.pokemontcg.io/swsh7/95_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 6.00,
          mid: 10.50,
          high: 22.00,
          market: 8.85
        }
      }
    },
    dhash: '0000111100001111111100001111000000110011001100111010101010101010'
  },
  {
    id: 'lor-131',
    name: 'Giratina VSTAR',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VSTAR'],
    hp: '280',
    types: ['Dragon'],
    evolvesFrom: 'Giratina V',
    attacks: [
      {
        name: 'Lost Impact',
        cost: ['Grass', 'Psychic', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '280',
        text: 'Put 2 Energy attached to your Pokémon in the Lost Zone.'
      }
    ],
    set: {
      id: 'lor',
      name: 'Lost Origin',
      series: 'Sword & Shield',
      printedTotal: 196,
      total: 247,
    },
    number: '131',
    rarity: 'Rare Holo VSTAR',
    images: {
      small: 'https://images.pokemontcg.io/lor/131.png',
      large: 'https://images.pokemontcg.io/lor/131_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 4.00,
          mid: 7.20,
          high: 15.00,
          market: 6.10
        }
      }
    },
    dhash: '1111000011110000101010101010101000111100001111000101010101010101'
  },
  {
    id: 'brs-123',
    name: 'Arceus VSTAR',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VSTAR'],
    hp: '280',
    types: ['Colorless'],
    evolvesFrom: 'Arceus V',
    abilities: [
      {
        name: 'Starbirth',
        text: 'During your turn, you may search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.'
      }
    ],
    attacks: [
      {
        name: 'Trinity Nova',
        cost: ['Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '200',
        text: 'Search your deck for up to 3 Basic Energy cards and attach them to your Pokémon V in any way you like.'
      }
    ],
    set: {
      id: 'brs',
      name: 'Brilliant Stars',
      series: 'Sword & Shield',
      printedTotal: 172,
      total: 186,
    },
    number: '123',
    rarity: 'Rare Holo VSTAR',
    images: {
      small: 'https://images.pokemontcg.io/brs/123.png',
      large: 'https://images.pokemontcg.io/brs/123_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 5.00,
          mid: 9.80,
          high: 18.00,
          market: 8.24
        }
      }
    },
    dhash: '0110011001100110100110011001100111110000111100001010101010101010'
  },
  {
    id: 'twm-106',
    name: 'Greninja ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'Tera', 'ex'],
    hp: '310',
    types: ['Water'],
    evolvesFrom: 'Frogadier',
    attacks: [
      {
        name: 'Shinobi Blade',
        cost: ['Water'],
        convertedEnergyCost: 1,
        damage: '170',
        text: 'Search your deck for any 1 card and put it into your hand. Then, shuffle your deck.'
      }
    ],
    set: {
      id: 'twm',
      name: 'Twilight Masquerade',
      series: 'Scarlet & Violet',
      printedTotal: 167,
      total: 226,
    },
    number: '106',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/twm/106.png',
      large: 'https://images.pokemontcg.io/twm/106_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 4.50,
          mid: 7.50,
          high: 14.00,
          market: 6.80
        }
      }
    },
    dhash: '1010101010101010000011110000111111001100110011000011110000111100'
  },
  {
    id: 'par-124',
    name: 'Roaring Moon ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'Ancient', 'ex'],
    hp: '230',
    types: ['Darkness'],
    attacks: [
      {
        name: 'Frenzied Gouging',
        cost: ['Darkness', 'Darkness', 'Colorless'],
        convertedEnergyCost: 3,
        text: 'Knock Out your opponent\'s Active Pokémon. If you do, this Pokémon does 200 damage to itself.'
      }
    ],
    set: {
      id: 'par',
      name: 'Paradox Rift',
      series: 'Scarlet & Violet',
      printedTotal: 182,
      total: 256,
    },
    number: '124',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/par/124.png',
      large: 'https://images.pokemontcg.io/par/124_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 3.50,
          mid: 6.00,
          high: 12.00,
          market: 5.15
        }
      }
    },
    dhash: '1111111100000000101010101010101001010101010101010011110000111100'
  },
  {
    id: 'par-89',
    name: 'Iron Valiant ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'Future', 'ex'],
    hp: '220',
    types: ['Psychic'],
    abilities: [
      {
        name: 'Tachyon Bits',
        text: 'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent\'s Pokémon.'
      }
    ],
    attacks: [
      {
        name: 'Laser Blade',
        cost: ['Psychic', 'Psychic', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '200',
        text: 'This Pokémon can\'t attack during your next turn.'
      }
    ],
    set: {
      id: 'par',
      name: 'Paradox Rift',
      series: 'Scarlet & Violet',
      printedTotal: 182,
      total: 256,
    },
    number: '89',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/par/89.png',
      large: 'https://images.pokemontcg.io/par/89_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.00,
          mid: 4.00,
          high: 9.00,
          market: 3.42
        }
      }
    },
    dhash: '0000000011111111010101010101010110101010101010101100110011001100'
  },
  {
    id: 'sv1-81',
    name: 'Miraidon ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '220',
    types: ['Lightning'],
    abilities: [
      {
        name: 'Tandem Unit',
        text: 'Once during your turn, you may search your deck for up to 2 Basic Lightning Pokémon and put them onto your Bench. Then, shuffle your deck.'
      }
    ],
    attacks: [
      {
        name: 'Photon Blaster',
        cost: ['Lightning', 'Lightning', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '220',
        text: 'This Pokémon can\'t attack during your next turn.'
      }
    ],
    set: {
      id: 'sv1',
      name: 'Scarlet & Violet',
      series: 'Scarlet & Violet',
      printedTotal: 198,
      total: 258,
    },
    number: '81',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv1/81.png',
      large: 'https://images.pokemontcg.io/sv1/81_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 1.50,
          mid: 3.20,
          high: 8.00,
          market: 2.90
        }
      }
    },
    dhash: '1100110011001100101010101010101000001111000011110110011001100110'
  },
  {
    id: 'sv1-125',
    name: 'Koraidon ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '230',
    types: ['Fighting'],
    abilities: [
      {
        name: 'Dino Cry',
        text: 'Once during your turn, you may attach up to 2 Basic Fighting Energy cards from your discard pile to your Fighting Pokémon in any way you like. If you use this Ability, your turn ends.'
      }
    ],
    attacks: [
      {
        name: 'Wild Impact',
        cost: ['Fighting', 'Fighting', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '220',
        text: 'This Pokémon can\'t attack during your next turn.'
      }
    ],
    set: {
      id: 'sv1',
      name: 'Scarlet & Violet',
      series: 'Scarlet & Violet',
      printedTotal: 198,
      total: 258,
    },
    number: '125',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv1/125.png',
      large: 'https://images.pokemontcg.io/sv1/125_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 1.20,
          mid: 2.80,
          high: 6.00,
          market: 2.10
        }
      }
    },
    dhash: '0011001100110011010101010101010111110000111100001001100110011001'
  },
  {
    id: 'brs-79',
    name: 'Lucario',
    supertype: 'Pokémon',
    subtypes: ['Stage 1'],
    hp: '120',
    types: ['Fighting'],
    evolvesFrom: 'Riolu',
    attacks: [
      {
        name: 'Roaring Resolve',
        cost: ['Fighting'],
        convertedEnergyCost: 1,
        text: 'Once during your turn, you may put 2 damage counters on this Pokémon. If you do, search your deck for a Fighting Energy card and attach it to this Pokémon.'
      }
    ],
    set: {
      id: 'brs',
      name: 'Brilliant Stars',
      series: 'Sword & Shield',
      printedTotal: 172,
      total: 186,
    },
    number: '79',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/brs/79.png',
      large: 'https://images.pokemontcg.io/brs/79_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.15,
          mid: 0.45,
          high: 2.00,
          market: 0.38
        }
      }
    },
    dhash: '0101010110101010111100000000111111001100001111000110011010011001'
  },
  {
    id: 'evs-191',
    name: 'Dragonite V',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'V'],
    hp: '230',
    types: ['Dragon'],
    attacks: [
      {
        name: 'Dragon Gale',
        cost: ['Water', 'Lightning', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '250',
        text: 'This attack also does 20 damage to each of your Benched Pokémon.'
      }
    ],
    set: {
      id: 'evs',
      name: 'Evolving Skies',
      series: 'Sword & Shield',
      printedTotal: 203,
      total: 237,
    },
    number: '191',
    rarity: 'Ultra Rare',
    images: {
      small: 'https://images.pokemontcg.io/evs/191.png',
      large: 'https://images.pokemontcg.io/evs/191_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 8.00,
          mid: 15.00,
          high: 35.00,
          market: 11.50
        }
      }
    },
    dhash: '1001100101100110111100001111000000001111111100000110011010011001'
  },
  {
    id: 'obf-66',
    name: 'Tyranitar ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'Tera', 'ex'],
    hp: '340',
    types: ['Lightning'],
    evolvesFrom: 'Pupitar',
    attacks: [
      {
        name: 'Lightning Rampage',
        cost: ['Fighting', 'Fighting'],
        convertedEnergyCost: 2,
        damage: '150+',
        text: 'If your Benched Pokémon have any damage counters on them, this attack does 100 more damage.'
      }
    ],
    set: {
      id: 'obf',
      name: 'Obsidian Flames',
      series: 'Scarlet & Violet',
      printedTotal: 197,
      total: 230,
    },
    number: '66',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/obf/66.png',
      large: 'https://images.pokemontcg.io/obf/66_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 1.50,
          mid: 3.00,
          high: 7.00,
          market: 2.45
        }
      }
    },
    dhash: '1111000011110000010101010101010110101010101010100000111111110000'
  },
  {
    id: 'asr-73',
    name: 'Machamp VMAX',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VMAX'],
    hp: '330',
    types: ['Fighting'],
    evolvesFrom: 'Machamp V',
    attacks: [
      {
        name: 'G-Max Chi Strike',
        cost: ['Fighting', 'Fighting', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '240'
      }
    ],
    set: {
      id: 'asr',
      name: 'Astral Radiance',
      series: 'Sword & Shield',
      printedTotal: 189,
      total: 216,
    },
    number: '73',
    rarity: 'Rare Holo VMAX',
    images: {
      small: 'https://images.pokemontcg.io/asr/73.png',
      large: 'https://images.pokemontcg.io/asr/73_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.00,
          mid: 4.80,
          high: 11.00,
          market: 3.75
        }
      }
    },
    dhash: '0000111100001111101010101010101001100110011001101111000000001111'
  },
  {
    id: 'zsv10pt5-25',
    name: 'Pikachu ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '200',
    types: ['Lightning'],
    attacks: [
      {
        name: 'Sparking Bolt',
        cost: ['Lightning', 'Lightning', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '120',
        text: 'This attack does 30 damage to 1 of your opponent\'s Benched Pokémon. (Don\'t apply Weakness and Resistance for Benched Pokémon.)'
      }
    ],
    set: {
      id: 'zsv10pt5',
      name: 'Black Bolt',
      series: 'Scarlet & Violet',
      printedTotal: 86,
      total: 100,
    },
    number: '25',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/zsv10pt5/25.png',
      large: 'https://images.pokemontcg.io/zsv10pt5/25_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 3.00,
          mid: 5.50,
          high: 10.00,
          market: 4.50
        }
      }
    },
    dhash: '0101010111110000101010101100110000001111000011111111000010101010'
  },
  {
    id: 'sv9-2',
    name: 'Metapod',
    supertype: 'Pokémon',
    subtypes: ['Stage 1'],
    hp: '80',
    types: ['Grass'],
    evolvesFrom: 'Caterpie',
    attacks: [
      {
        name: 'Stun Spore',
        cost: ['Grass'],
        convertedEnergyCost: 1,
        damage: '20',
        text: 'Flip a coin. If heads, your opponent\'s Active Pokémon is now Paralyzed.'
      }
    ],
    set: {
      id: 'sv9',
      name: 'Journey Together',
      series: 'Scarlet & Violet',
      printedTotal: 159,
      total: 190,
    },
    number: '2',
    rarity: 'Common',
    images: {
      small: 'https://images.pokemontcg.io/sv9/2.png',
      large: 'https://images.pokemontcg.io/sv9/2_hires.png'
    },
    tcgplayer: {
      prices: {
        normal: {
          low: 0.05,
          mid: 0.15,
          high: 0.50,
          market: 0.10
        }
      }
    },
    dhash: '1100110011110000000011110101010100111100001111001010101000111100'
  },
  {
    id: 'me3-50',
    name: 'Mewtwo ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '220',
    types: ['Psychic'],
    attacks: [
      {
        name: 'Psybeam',
        cost: ['Psychic', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '30',
        text: 'Your opponent\'s Active Pokémon is now Confused.'
      },
      {
        name: 'Super Psy Bolt',
        cost: ['Psychic', 'Psychic', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '110'
      }
    ],
    set: {
      id: 'me3',
      name: 'Perfect Order',
      series: 'Mega Evolution',
      printedTotal: 88,
      total: 110,
    },
    number: '50',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/me3/50.png',
      large: 'https://images.pokemontcg.io/me3/50_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 2.50,
          mid: 4.00,
          high: 8.00,
          market: 3.50
        }
      }
    },
    dhash: '0000111111110000101010100110011001100110111100001010101000001111'
  }  ,
  {
    id: 'mep-la-030',
    name: 'Mega-Charizard Y ex',
    supertype: 'Pokémon',
    subtypes: ['Mega', 'ex', 'Stage 2'],
    hp: '360',
    types: ['Fire'],
    evolvesFrom: 'Charizard ex',
    rules: [
      'Pokémon ex rule: When your Pokémon ex is Knocked Out, your opponent takes 2 Prize cards.',
      'Mega Evolution rule: When 1 of your Pokémon becomes a Mega Evolution Pokémon, your turn ends.'
    ],
    attacks: [
      {
        name: 'Explosión Y',
        cost: ['Fire', 'Fire', 'Fire'],
        convertedEnergyCost: 3,
        damage: '300',
        text: 'This attack cannot be reduced or prevented by effects.',
      }
    ],
    set: {
      id: 'mep-la',
      name: 'MEP Latino América',
      series: 'Custom / Fan Set',
      printedTotal: 100,
      total: 100,
    },
    number: '030',
    rarity: 'Promo',
    images: {
      small: 'https://images.pokemontcg.io/xy2/13.png',
      large: 'https://images.pokemontcg.io/xy2/13_hires.png'
    },
    dhash: '1111000011110000111111001100110010101010101010100011110000111100'
  },
  {
    id: 'mep-en-070',
    name: 'Tyrunt',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '100',
    types: ['Fighting'],
    attacks: [
      {
        name: 'Gnaw',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        damage: '20',
        text: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.',
      },
      {
        name: 'Get Angry',
        cost: ['Fighting', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '50',
        text: 'If this Pokémon was damaged by an attack last turn, this attack does 50 more damage.',
      }
    ],
    weaknesses: [{ type: 'Grass', value: 'x2' }],
    set: {
      id: 'mep-en',
      name: 'MEP English Edition',
      series: 'Custom / Fan Set',
      printedTotal: 120,
      total: 120,
    },
    number: '070',
    rarity: 'Promo',
    images: {
      small: 'https://images.pokemontcg.io/xy6/56.png',
      large: 'https://images.pokemontcg.io/xy6/56_hires.png'
    },
    dhash: '1010101010101010010101010101010111001100110011001111000011110000'
  },
  {
    id: 'mep-shaymin-001',
    name: 'Shaymin',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '70',
    types: ['Grass'],
    attacks: [
      {
        name: 'Enviar Flores',
        cost: ['Grass'],
        convertedEnergyCost: 1,
        damage: '20',
        text: 'Heal 10 damage from each of your Benched Pokémon.',
      },
      {
        name: 'Seed Flare',
        cost: ['Grass', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '40',
        text: 'The Defending Pokémon Weakness is now Grass until end of your next turn.',
      }
    ],
    weaknesses: [{ type: 'Fire', value: 'x2' }],
    set: {
      id: 'mep',
      name: 'MEP Promo',
      series: 'Custom / Fan Set',
      printedTotal: 50,
      total: 50,
    },
    number: 'PR-001',
    rarity: 'Promo',
    images: {
      small: 'https://images.pokemontcg.io/dp4/11.png',
      large: 'https://images.pokemontcg.io/dp4/11_hires.png'
    },
    dhash: '0101010101010101100110011001100111001100110011000011001100110011'
  }
];
