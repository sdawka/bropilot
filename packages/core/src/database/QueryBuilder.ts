import Database from 'better-sqlite3';

export class QueryBuilder {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Builds a query to find entities related to a source entity through a join table.
   * @param sourceTable The main table (e.g., 'applications')
   * @param sourceIdColumn The ID column of the source table (e.g., 'id')
   * @param sourceId The ID of the source entity
   * @param joinTable The intermediary join table (e.g., 'feature_domains')
   * @param joinSourceColumn The column in the join table linking to the source (e.g., 'feature_id')
   * @param joinTargetColumn The column in the join table linking to the target (e.g., 'domain_id')
   * @param targetTable The target table (e.g., 'domains')
   * @param targetIdColumn The ID column of the target table (e.g., 'id')
   * @returns A prepared statement that can be run to get related entities.
   */
  buildRelatedQuery(
    sourceTable: string,
    sourceIdColumn: string,
    sourceId: string,
    joinTable: string,
    joinSourceColumn: string,
    joinTargetColumn: string,
    targetTable: string,
    targetIdColumn: string,
  ): Database.Statement {
    const query = `
      SELECT T2.*
      FROM ${sourceTable} AS T1
      JOIN ${joinTable} AS JT ON T1.${sourceIdColumn} = JT.${joinSourceColumn}
      JOIN ${targetTable} AS T2 ON JT.${joinTargetColumn} = T2.${targetIdColumn}
      WHERE T1.${sourceIdColumn} = ?;
    `;
    return this.db.prepare(query);
  }

  // Example of a more specific graph traversal query
  /**
   * Finds all domains associated with a specific application.
   * @param applicationId The ID of the application.
   * @returns A prepared statement to get domains.
   */
  findDomainsForApplication(applicationId: string): Database.Statement {
    const query = `
      SELECT *
      FROM domains
      WHERE application_id = ?;
    `;
    return this.db.prepare(query);
  }

  /**
   * Finds all features associated with a specific domain through the feature_domains join table.
   * @param domainId The ID of the domain.
   * @returns A prepared statement to get features.
   */
  findFeaturesForDomain(domainId: string): Database.Statement {
    const query = `
      SELECT F.*
      FROM features AS F
      JOIN feature_domains AS FD ON F.id = FD.feature_id
      WHERE FD.domain_id = ?;
    `;
    return this.db.prepare(query);
  }

  /**
   * Finds all behaviors associated with a specific flow.
   * @param flowId The ID of the flow.
   * @returns A prepared statement to get behaviors.
   */
  findBehaviorsForFlow(flowId: string): Database.Statement {
    const query = `
      SELECT B.*
      FROM behaviors AS B
      JOIN flow_behaviors AS FB ON B.id = FB.behavior_id
      WHERE FB.flow_id = ?;
    `;
    return this.db.prepare(query);
  }

  /**
   * Finds all things associated with a specific module.
   * @param moduleId The ID of the module.
   * @returns A prepared statement to get things.
   */
  findThingsForModule(moduleId: string): Database.Statement {
    const query = `
      SELECT T.*
      FROM things AS T
      WHERE T.module_id = ?;
    `;
    return this.db.prepare(query);
  }
}
