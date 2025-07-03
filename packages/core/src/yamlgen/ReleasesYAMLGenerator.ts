import { z } from 'zod';
import { ReleasesDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Release, Feature } from '../repositories/index.js';

export class ReleasesYAMLGenerator implements DocumentGenerator {
  documentType = 'releases';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const releases = await kg.getReleases();
    const result: { releases: { [key: string]: any } } = { releases: {} };

    for (const release of releases) {
      // Assuming features_included is a JSON string of feature IDs
      const features = release.features_included
        ? await Promise.all(
            JSON.parse(release.features_included).map(
              (featureId: string) => kg.getFeatureById(featureId), // Assuming getFeatureById is available
            ),
          )
        : [];

      result.releases[release.version] = {
        description: release.description,
        release_date: release.release_date,
        features_included: features.filter(Boolean).map((f) => f?.name),
      };
    }

    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = ReleasesDocumentSchema.safeParse(document);
    if (result.success) {
      return { valid: true };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map((e) => e.message),
      };
    }
  }
}
