interface Variant {
  id: string;
  name: string;
  weight: number;
}

interface Experiment {
  id: string;
  name: string;
  description?: string;
  variants: Variant[];
  targetAudience?: (user: User) => boolean;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
}

interface User {
  id: string;
  segments?: string[];
  attributes?: Record<string, string | number | boolean | undefined>;
}

interface ABTestingConfig {
  storageKey?: string;
  debug?: boolean;
  forceVariant?: Record<string, string>;
}

type AssignmentStrategy = 'consistent' | 'random' | 'session';

class ABTestingManager {
  private config: ABTestingConfig;
  private experiments: Map<string, Experiment>;
  private userAssignments: Map<string, string>;
  private userId: string | null;
  private strategy: AssignmentStrategy;

  constructor(config: ABTestingConfig = {}) {
    this.config = {
      storageKey: config.storageKey || 'ab_testing_assignments',
      debug: config.debug || false,
      forceVariant: config.forceVariant || {}
    };
    this.experiments = new Map();
    this.userAssignments = new Map();
    this.userId = null;
    this.strategy = 'consistent';
    this.loadAssignments();
  }

  private loadAssignments(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.config.storageKey!);
      if (stored) {
        const data = JSON.parse(stored);
        Object.entries(data).forEach(([key, value]) => {
          this.userAssignments.set(key, value as string);
        });
      }
    } catch (e) {
      console.warn('Failed to load A/B testing assignments:', e);
    }
  }

  private saveAssignments(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const data = Object.fromEntries(this.userAssignments);
      localStorage.setItem(this.config.storageKey!, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save A/B testing assignments:', e);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  setStrategy(strategy: AssignmentStrategy): void {
    this.strategy = strategy;
  }

  registerExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);

    if (this.config.debug) {
      console.log(`Experiment registered: ${experiment.id}`, experiment);
    }
  }

  registerExperiments(experiments: Experiment[]): void {
    experiments.forEach(exp => this.registerExperiment(exp));
  }

  private isActive(experiment: Experiment): boolean {
    if (!experiment.isActive) return false;

    const now = new Date();
    if (experiment.startDate && now < experiment.startDate) return false;
    if (experiment.endDate && now > experiment.endDate) return false;

    return true;
  }

  private isEligible(experiment: Experiment, user?: User): boolean {
    if (!experiment.targetAudience) return true;

    if (!user && !this.userId) return false;

    const userData: User = user || { id: this.userId || '' };
    return experiment.targetAudience(userData);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private assignVariant(experiment: Experiment, user?: User): string | null {
    const forceVariant = this.config.forceVariant?.[experiment.id];
    if (forceVariant) {
      return forceVariant;
    }

    const userId = user?.id || this.userId || 'anonymous';
    const key = `${experiment.id}:${userId}`;

    const existingAssignment = this.userAssignments.get(key);
    if (existingAssignment && this.strategy !== 'random') {
      return existingAssignment;
    }

    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let random: number;

    switch (this.strategy) {
      case 'random':
        random = Math.random() * totalWeight;
        break;
      case 'session':
        random = Math.random() * totalWeight;
        break;
      case 'consistent':
      default:
        random = (this.hashString(key) % 10000) / 10000 * totalWeight;
    }

    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        this.userAssignments.set(key, variant.id);
        this.saveAssignments();
        return variant.id;
      }
    }

    return experiment.variants[experiment.variants.length - 1].id;
  }

  getVariant(experimentId: string, user?: User): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      console.warn(`Experiment not found: ${experimentId}`);
      return null;
    }

    if (!this.isActive(experiment)) {
      return null;
    }

    if (!this.isEligible(experiment, user)) {
      return null;
    }

    return this.assignVariant(experiment, user);
  }

  isVariant(experimentId: string, variantId: string, user?: User): boolean {
    const assignedVariant = this.getVariant(experimentId, user);
    return assignedVariant === variantId;
  }

  getVariantData(experimentId: string, user?: User): Variant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const variantId = this.getVariant(experimentId, user);
    if (!variantId) return null;

    return experiment.variants.find(v => v.id === variantId) || null;
  }

  trackImpression(experimentId: string, variantId: string): void {
    console.log(`A/B Testing - Impression: ${experimentId} -> ${variantId}`);
  }

  trackConversion(_experimentId: string): void {
    const variantId = this.getVariant(_experimentId);
    if (variantId) {
      console.log('A/B Testing - Conversion:', _experimentId, '->', variantId);
    }
  }

  resetAssignments(experimentId?: string): void {
    if (experimentId) {
      for (const [key] of this.userAssignments) {
        if (key.startsWith(`${experimentId}:`)) {
          this.userAssignments.delete(key);
        }
      }
    } else {
      this.userAssignments.clear();
    }
    this.saveAssignments();
  }

  getActiveExperiments(user?: User): Experiment[] {
    const active: Experiment[] = [];

    this.experiments.forEach((experiment) => {
      if (this.isActive(experiment) && this.isEligible(experiment, user)) {
        active.push(experiment);
      }
    });

    return active;
  }

  getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }

  getAllExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }
}

const manager = new ABTestingManager();

export function initABTesting(config?: ABTestingConfig): void {
  if (config) {
    Object.assign(manager, { config: { ...manager.config, ...config } });
  }
}

export function setUserId(userId: string): void {
  manager.setUserId(userId);
}

export function setStrategy(strategy: AssignmentStrategy): void {
  manager.setStrategy(strategy);
}

export function registerExperiment(experiment: Experiment): void {
  manager.registerExperiment(experiment);
}

export function registerExperiments(experiments: Experiment[]): void {
  manager.registerExperiments(experiments);
}

export function getVariant(experimentId: string, user?: User): string | null {
  return manager.getVariant(experimentId, user);
}

export function isVariant(experimentId: string, variantId: string, user?: User): boolean {
  return manager.isVariant(experimentId, variantId, user);
}

export function getVariantData(experimentId: string, user?: User): Variant | null {
  return manager.getVariantData(experimentId, user);
}

export function trackImpression(experimentId: string, variantId: string, user?: User): void {
  manager.trackImpression(experimentId, variantId, user);
}

export function trackConversion(_experimentId: string): void {
    manager.trackConversion(_experimentId);
  }

export function resetAssignments(experimentId?: string): void {
  manager.resetAssignments(experimentId);
}

export function getActiveExperiments(user?: User): Experiment[] {
  return manager.getActiveExperiments(user);
}

export function getExperiment(experimentId: string): Experiment | undefined {
  return manager.getExperiment(experimentId);
}

export function getAllExperiments(): Experiment[] {
  return manager.getAllExperiments();
}

export const ABTesting = manager;

export type { Experiment, Variant, ABTestingConfig, AssignmentStrategy };
export type { User };
