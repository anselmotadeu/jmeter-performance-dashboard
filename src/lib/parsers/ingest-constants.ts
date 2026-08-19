import type { HttpPhase } from './types';

export const HTTP_PHASES: HttpPhase[] = ['duration', 'blocked', 'connecting', 'sending', 'waiting', 'receiving'];

export const HEATMAP_BINS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];