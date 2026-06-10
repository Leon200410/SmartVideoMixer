import path from 'path';
import fs from 'fs-extra';
import { TemplateConfig } from './types';

/**
 * Template registry - loads and manages template configurations
 */
class TemplateRegistry {
  private templates: Map<string, TemplateConfig> = new Map();
  private configDir: string;

  constructor() {
    this.configDir = path.join(__dirname, 'configs');
  }

  /**
   * Load all template configurations from configs directory
   */
  async loadAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.configDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.configDir, file);
        const content = await fs.readJson(filePath);
        this.templates.set(content.id, content);
        console.log(`✓ Loaded template: ${content.id}`);
      }

      console.log(`✓ Total templates loaded: ${this.templates.size}`);
    } catch (error) {
      console.error('Failed to load templates:', error);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  get(id: string): TemplateConfig | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all template IDs
   */
  getAllIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get all templates
   */
  getAll(): TemplateConfig[] {
    return Array.from(this.templates.values());
  }

  /**
   * Check if template exists
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }
}

// Singleton instance
export const templateRegistry = new TemplateRegistry();
