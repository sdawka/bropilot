import {
  ExtractedDomain,
  ExtractedFeature,
  ExtractedRequirement,
} from '../processing/types.js';
import { AppDatabase } from '../database/Database.js';
import { DomainRepository, Domain } from '../repositories/DomainRepository.js';
import {
  FeatureRepository,
  Feature,
} from '../repositories/FeatureRepository.js';
import { ThingRepository, Thing } from '../repositories/ThingRepository.js';
import { ModuleRepository, Module } from '../repositories/ModuleRepository.js';
import {
  BehaviorRepository,
  Behavior,
} from '../repositories/BehaviorRepository.js';
import { FlowRepository, Flow } from '../repositories/FlowRepository.js';
import {
  ComponentRepository,
  Component,
} from '../repositories/ComponentRepository.js';
import { ScreenRepository, Screen } from '../repositories/ScreenRepository.js';
import {
  InfrastructureRepository,
  Infrastructure,
} from '../repositories/InfrastructureRepository.js';
import {
  ContractRepository,
  Contract,
} from '../repositories/ContractRepository.js';
import {
  ReleaseRepository,
  Release,
} from '../repositories/ReleaseRepository.js';
import {
  WorkPlanRepository,
  WorkPlan,
} from '../repositories/WorkPlanRepository.js';
import {
  ApplicationRepository,
  Application,
} from '../repositories/ApplicationRepository.js';
import { QueryBuilder } from '../database/QueryBuilder.js';

export type ProcessingChangeLog = {
  created: { type: 'domain' | 'feature' | 'requirement'; id: string }[];
  updated: {
    type: 'domain' | 'feature' | 'requirement';
    id: string;
    previous: any;
  }[];
};

export class KnowledgeGraph {
  private db: AppDatabase;
  private domainRepo: DomainRepository;
  private featureRepo: FeatureRepository;
  private thingRepo: ThingRepository;
  private moduleRepo: ModuleRepository;
  private behaviorRepo: BehaviorRepository;
  private flowRepo: FlowRepository;
  private componentRepo: ComponentRepository;
  private screenRepo: ScreenRepository;
  private infrastructureRepo: InfrastructureRepository;
  private contractRepo: ContractRepository;
  private releaseRepo: ReleaseRepository;
  private workPlanRepo: WorkPlanRepository;
  private applicationRepo: ApplicationRepository;
  private queryBuilder: QueryBuilder;

  constructor(db: AppDatabase) {
    this.db = db;
    const rawDb = db.getDB();
    this.domainRepo = new DomainRepository(rawDb);
    this.featureRepo = new FeatureRepository(rawDb);
    this.thingRepo = new ThingRepository(rawDb);
    this.moduleRepo = new ModuleRepository(rawDb);
    this.behaviorRepo = new BehaviorRepository(rawDb);
    this.flowRepo = new FlowRepository(rawDb);
    this.componentRepo = new ComponentRepository(rawDb);
    this.screenRepo = new ScreenRepository(rawDb);
    this.infrastructureRepo = new InfrastructureRepository(rawDb);
    this.contractRepo = new ContractRepository(rawDb);
    this.releaseRepo = new ReleaseRepository(rawDb);
    this.workPlanRepo = new WorkPlanRepository(rawDb);
    this.applicationRepo = new ApplicationRepository(rawDb);
    this.queryBuilder = new QueryBuilder(rawDb);
  }

  /**
   * Upserts a domain and returns change log info.
   */
  async addDomain(
    domain: ExtractedDomain,
    changeLog?: ProcessingChangeLog,
  ): Promise<void> {
    const existing = await this.domainRepo.findById(domain.name);
    if (existing) {
      if (changeLog) {
        changeLog.updated.push({
          type: 'domain',
          id: domain.name,
          previous: { ...existing },
        });
      }
      await this.domainRepo.update(domain.name, {
        ...domain,
        id: domain.name,
      });
    } else {
      if (changeLog) {
        changeLog.created.push({ type: 'domain', id: domain.name });
      }
      await this.domainRepo.create({
        ...domain,
        id: domain.name,
      });
    }
  }

  async addFeature(
    feature: ExtractedFeature,
    changeLog?: ProcessingChangeLog,
  ): Promise<void> {
    const existing = await this.featureRepo.findById(feature.name);
    if (existing) {
      if (changeLog) {
        changeLog.updated.push({
          type: 'feature',
          id: feature.name,
          previous: { ...existing },
        });
      }
      await this.featureRepo.update(feature.name, {
        ...feature,
        id: feature.name,
      });
    } else {
      if (changeLog) {
        changeLog.created.push({ type: 'feature', id: feature.name });
      }
      await this.featureRepo.create({
        ...feature,
        id: feature.name,
      });
    }
    // TODO: handle feature-domain relationships
  }

  // async addRequirement(requirement: ExtractedRequirement, changeLog?: ProcessingChangeLog): Promise<void> {
  //   const existing = await this.thingRepo.findById(requirement.name);
  //   if (existing) {
  //     if (changeLog) {
  //       changeLog.updated.push({ type: 'requirement', id: requirement.name, previous: { ...existing } });
  //     }
  //     await this.thingRepo.update(requirement.name, {
  //       ...requirement,
  //       id: requirement.name,
  //       // relationships: JSON.stringify(requirement.relationships || []), // ExtractedRequirement does not have relationships
  //       // invariants: JSON.stringify(requirement.invariants || []), // ExtractedRequirement does not have invariants
  //     });
  //   } else {
  //     if (changeLog) {
  //       changeLog.created.push({ type: 'requirement', id: requirement.name });
  //     }
  //     await this.thingRepo.create({
  //       ...requirement,
  //       id: requirement.name,
  //       // relationships: JSON.stringify(requirement.relationships || []), // ExtractedRequirement does not have relationships
  //       // invariants: JSON.stringify(requirement.invariants || []), // ExtractedRequirement does not have invariants
  //     });
  //   }
  //   // TODO: handle requirement-feature relationships
  // }

  async deleteDomain(id: string): Promise<void> {
    await this.domainRepo.delete(id);
  }

  async deleteFeature(id: string): Promise<void> {
    await this.featureRepo.delete(id);
  }

  async deleteRequirement(id: string): Promise<void> {
    await this.thingRepo.delete(id);
  }

  async restoreDomain(id: string, previous: any): Promise<void> {
    await this.domainRepo.update(id, previous);
  }

  async restoreFeature(id: string, previous: any): Promise<void> {
    await this.featureRepo.update(id, previous);
  }

  async restoreRequirement(id: string, previous: any): Promise<void> {
    await this.thingRepo.update(id, previous);
  }

  // --- Getters for Document Generation ---

  async getApplication(): Promise<Application | null> {
    const applications = await this.applicationRepo.findAll();
    return applications.length > 0 ? applications[0] : null;
  }

  async getDomains(): Promise<Domain[]> {
    return this.domainRepo.findAll();
  }

  async getDomainsByNames(names: string[]): Promise<Domain[]> {
    const domains = await this.domainRepo.findAll();
    return domains.filter((d) => names.includes(d.name));
  }

  async getDomainById(id: string): Promise<Domain | null> {
    return this.domainRepo.findById(id);
  }

  async getFeatures(): Promise<Feature[]> {
    return this.featureRepo.findAll();
  }

  async getFeaturesByDomain(domainId: string): Promise<Feature[]> {
    // TODO: Implement proper querying using FeatureDomainRelationship
    // For now, return all features and let the ModuleGenerator filter
    return this.featureRepo.findAll();
  }

  async getFeatureById(id: string): Promise<Feature | null> {
    return this.featureRepo.findById(id);
  }

  async getModules(): Promise<Module[]> {
    return this.moduleRepo.findAll();
  }

  async getModuleById(id: string): Promise<Module | null> {
    return this.moduleRepo.findById(id);
  }

  async getModuleByDomain(domainId: string): Promise<Module | null> {
    const modules = await this.moduleRepo.findAll();
    return modules.find((m) => m.domain_id === domainId) || null;
  }

  async getThingsByModule(moduleId: string): Promise<Thing[]> {
    return this.thingRepo.findAll({ module_id: moduleId });
  }

  async getBehaviorsByModule(moduleId: string): Promise<Behavior[]> {
    return this.behaviorRepo.findAll({ module_id: moduleId });
  }

  async getFlowsByModule(moduleId: string): Promise<Flow[]> {
    return this.flowRepo.findAll({ module_id: moduleId });
  }

  async getComponents(): Promise<Component[]> {
    return this.componentRepo.findAll();
  }

  async getComponentsByModule(moduleId: string): Promise<Component[]> {
    return this.componentRepo.findAll({ module_id: moduleId });
  }

  async getScreens(): Promise<Screen[]> {
    return this.screenRepo.findAll();
  }

  async getScreensByModule(moduleId: string): Promise<Screen[]> {
    return this.screenRepo.findAll({ module_id: moduleId });
  }

  async getInfrastructure(): Promise<Infrastructure[]> {
    return this.infrastructureRepo.findAll();
  }

  async getContracts(): Promise<Contract[]> {
    return this.contractRepo.findAll();
  }

  async getReleases(): Promise<Release[]> {
    return this.releaseRepo.findAll();
  }

  async getWorkPlans(): Promise<WorkPlan[]> {
    return this.workPlanRepo.findAll();
  }
}
