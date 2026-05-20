import { useEffect, useRef } from 'react';
import { getCollection } from '@/lib/collectionStorage';
import { getDecksState } from '@/lib/deckStorage';
import { getCachedCard, getCardsByIds } from '@/lib/pokemonTcgApi';

// In-memory set of already preloaded image URLs to avoid duplicate fetches in this session
const preloadedUrls = new Set<string>();

/**
 * Preloads a single image URL using the standard browser Image constructor.
 * This routes the request through the Service Worker fetch event, storing it in Workbox's CacheFirst store.
 */
function preloadImageUrl(url: string): Promise<void> {
  if (preloadedUrls.has(url)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      preloadedUrls.add(url);
      resolve();
    };
    img.onerror = () => {
      // Resolve anyway so we don't block the queue on network failures
      preloadedUrls.add(url);
      resolve();
    };
  });
}

/**
 * Non-blocking background worker that processes a queue of image URLs with rate-limiting.
 */
class BackgroundImageQueue {
  private queue: string[] = [];
  private activeCount = 0;
  private maxConcurrency = 3;
  private delayBetween = 60; // ms

  public add(urls: string[]) {
    const newUrls = urls.filter((url) => !preloadedUrls.has(url) && !this.queue.includes(url));
    if (newUrls.length === 0) return;
    
    this.queue.push(...newUrls);
    this.processNext();
  }

  private processNext() {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrency) return;

    this.activeCount++;
    const url = this.queue.shift()!;

    setTimeout(async () => {
      try {
        await preloadImageUrl(url);
      } catch (err) {
        console.error('[Preloader] Failed to prefetch image:', url, err);
      } finally {
        this.activeCount--;
        this.processNext();
      }
    }, this.delayBetween);

    // If we have capacity, kick off another in parallel
    if (this.activeCount < this.maxConcurrency) {
      this.processNext();
    }
  }
}

const backgroundQueue = new BackgroundImageQueue();

/**
 * Performs a predictive scan of all collection and deck cards.
 * Automatically fetches missing metadata and caches the images.
 */
export async function triggerPredictivePreload() {
  try {
    const collection = getCollection();
    const decksState = getDecksState();

    // 1. Gather all unique card IDs from collection and decks
    const cardIds = new Set<string>();
    
    // Add collection IDs (owned)
    Object.values(collection.cards)
      .filter((c) => c.owned)
      .forEach((c) => cardIds.add(c.cardId));

    // Add deck IDs
    Object.values(decksState.decks).forEach((deck) => {
      deck.cards.forEach((id) => cardIds.add(id));
    });

    const uniqueIds = Array.from(cardIds);
    if (uniqueIds.length === 0) return;

    // 2. Separate IDs into cached and uncached
    const cachedIds: string[] = [];
    const uncachedIds: string[] = [];

    uniqueIds.forEach((id) => {
      if (getCachedCard(id)) {
        cachedIds.push(id);
      } else {
        uncachedIds.push(id);
      }
    });

    // 3. Queue images for already cached card metadata
    const imageUrlsToPrefetch: string[] = [];
    cachedIds.forEach((id) => {
      const card = getCachedCard(id);
      if (card?.images) {
        if (card.images.small) imageUrlsToPrefetch.push(card.images.small);
        if (card.images.large) imageUrlsToPrefetch.push(card.images.large);
      }
    });

    if (imageUrlsToPrefetch.length > 0) {
      backgroundQueue.add(imageUrlsToPrefetch);
    }

    // 4. Proactively fetch metadata for uncached card IDs in the background.
    // Once fetched, the API will cache them in localStorage/memory.
    // The next execution trigger (or subsequent render) will pick them up and prefetch their images.
    if (uncachedIds.length > 0) {
      console.log(`[Preloader] Pre-fetching metadata for ${uncachedIds.length} uncached cards...`);
      // We run this asynchronously in the background so it doesn't block the caller
      getCardsByIds(uncachedIds)
        .then((cards) => {
          const freshUrls: string[] = [];
          cards.forEach((card) => {
            if (card?.images) {
              if (card.images.small) freshUrls.push(card.images.small);
              if (card.images.large) freshUrls.push(card.images.large);
            }
          });
          if (freshUrls.length > 0) {
            backgroundQueue.add(freshUrls);
          }
        })
        .catch((err) => {
          console.error('[Preloader] Background card metadata fetch failed:', err);
        });
    }
  } catch (e) {
    console.error('[Preloader] Error triggering preloading:', e);
  }
}

/**
 * React hook to register predictive image preloading.
 * Automatically runs on mount and listens for changes in collection or decks.
 */
export function usePredictiveImagePreloader() {
  const lastTriggerRef = useRef<number>(0);

  useEffect(() => {
    // Run initial preload on mount (wait 2 seconds to prioritize page load first)
    const initialTimer = setTimeout(() => {
      triggerPredictivePreload();
      lastTriggerRef.current = Date.now();
    }, 2000);

    // We can also poll/check periodically or whenever local storage sync runs.
    // Let's listen to local storage change events or active tab returns
    const handleFocus = () => {
      // Throttle checks to once every 10 seconds
      if (Date.now() - lastTriggerRef.current > 10000) {
        triggerPredictivePreload();
        lastTriggerRef.current = Date.now();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);
}
