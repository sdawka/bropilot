import {
  ExtractedEntities,
  ValidationResult,
  ExtractedDomain,
  ExtractedFeature,
} from './types.js';

export class EntityValidator {
  validate(entities: ExtractedEntities): ValidationResult {
    const errors: string[] = [];

    // Validate domain names
    for (const domain of entities.domains) {
      if (!this.isValidName(domain.name)) {
        errors.push(`Invalid domain name: ${domain.name}`);
      }
      if (!domain.description || domain.description.length < 10) {
        errors.push(
          `Domain '${domain.name}' needs a longer description (min 10 characters).`,
        );
      }
    }

    // Validate features
    for (const feature of entities.features) {
      if (!this.isValidName(feature.name)) {
        errors.push(`Invalid feature name: ${feature.name}`);
      }
      if (!feature.purpose || feature.purpose.length < 10) {
        errors.push(
          `Feature '${feature.name}' needs a longer purpose description (min 10 characters).`,
        );
      }
      if (feature.domains.length === 0) {
        errors.push(`Feature '${feature.name}' not assigned to any domain.`);
      }
    }

    // Validate requirements (basic validation for now)
    for (const requirement of entities.requirements) {
      if (!this.isValidName(requirement.name)) {
        errors.push(`Invalid requirement name: ${requirement.name}`);
      }
      if (!requirement.description || requirement.description.length < 10) {
        errors.push(
          `Requirement '${requirement.name}' needs a longer description (min 10 characters).`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private isValidName(name: string): boolean {
    // Simple validation: non-empty and alphanumeric with hyphens/underscores allowed
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0;
  }
}
