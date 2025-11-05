/**
 * Entity Graph Builder
 * Build and analyze relationship graphs between entities
 */

import { Lead, UccFiling } from '@shared/schema';
import { db } from '../db';
import { leads, entityRelationships, entityGroups } from '@shared/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

/**
 * Relationship types between entities
 */
export enum RelationshipType {
  PARENT = 'parent',
  SUBSIDIARY = 'subsidiary',
  AFFILIATE = 'affiliate',
  BRANCH = 'branch',
  FRANCHISE = 'franchise',
  PARTNER = 'partner',
  VENDOR = 'vendor',
  CUSTOMER = 'customer',
  DUPLICATE = 'duplicate',
  MERGED = 'merged',
  RELATED = 'related'
}

/**
 * Relationship source
 */
export enum RelationshipSource {
  USER_DEFINED = 'user_defined',
  AUTO_DETECTED = 'auto_detected',
  UCC_FILING = 'ucc_filing',
  ENTITY_RESOLUTION = 'entity_resolution',
  BUSINESS_REGISTRY = 'business_registry',
  ENRICHMENT = 'enrichment'
}

/**
 * Entity node in the graph
 */
export interface EntityNode {
  id: string;
  businessName: string;
  type: 'lead' | 'ucc_debtor' | 'ucc_creditor' | 'enriched';
  data: Partial<Lead>;
  metadata: {
    qualityScore?: number;
    intelligenceScore?: number;
    isEnriched?: boolean;
    uccFilingCount?: number;
    lastUpdated?: Date;
  };
}

/**
 * Relationship edge in the graph
 */
export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  confidence: number;
  weight: number;
  metadata: {
    source: RelationshipSource;
    establishedDate?: Date;
    evidence?: string[];
    bidirectional?: boolean;
  };
}

/**
 * Entity graph
 */
export interface EntityGraph {
  nodes: Map<string, EntityNode>;
  edges: Map<string, RelationshipEdge>;
  adjacencyList: Map<string, Set<string>>;
  reverseAdjacencyList: Map<string, Set<string>>;
}

/**
 * Graph analysis results
 */
export interface GraphAnalysis {
  connectedComponents: Array<Set<string>>;
  centralityScores: Map<string, number>;
  communities: Array<Set<string>>;
  hierarchyLevels: Map<string, number>;
  circularRelationships: Array<string[]>;
  orphanNodes: Set<string>;
  hubNodes: Set<string>;
}

/**
 * Entity family tree
 */
export interface EntityFamily {
  rootEntity: EntityNode;
  familySize: number;
  levels: Map<number, EntityNode[]>;
  relationships: RelationshipEdge[];
  strength: number;
  type: 'corporate' | 'franchise' | 'partnership' | 'mixed';
}

/**
 * Entity Graph Builder Service
 */
export class EntityGraphBuilder {
  private graph: EntityGraph;
  
  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      adjacencyList: new Map(),
      reverseAdjacencyList: new Map()
    };
  }

  /**
   * Build graph from entities
   */
  async buildGraph(entities: Lead[], includeUCC: boolean = true): Promise<EntityGraph> {
    // Clear existing graph
    this.clearGraph();
    
    // Add entity nodes
    for (const entity of entities) {
      await this.addEntityNode(entity);
    }
    
    // Detect relationships
    await this.detectRelationships(entities);
    
    // Include UCC relationships if requested
    if (includeUCC) {
      await this.addUCCRelationships(entities);
    }
    
    // Detect ownership chains
    await this.detectOwnershipChains();
    
    // Detect business patterns
    await this.detectBusinessPatterns();
    
    return this.graph;
  }

  /**
   * Add entity node to graph
   */
  private async addEntityNode(entity: Lead): Promise<void> {
    const node: EntityNode = {
      id: entity.id,
      businessName: entity.businessName,
      type: 'lead',
      data: entity,
      metadata: {
        qualityScore: entity.qualityScore || 0,
        intelligenceScore: entity.intelligenceScore || 0,
        isEnriched: entity.isEnriched || false,
        lastUpdated: entity.uploadedAt
      }
    };
    
    this.graph.nodes.set(entity.id, node);
    
    // Initialize adjacency lists
    if (!this.graph.adjacencyList.has(entity.id)) {
      this.graph.adjacencyList.set(entity.id, new Set());
    }
    if (!this.graph.reverseAdjacencyList.has(entity.id)) {
      this.graph.reverseAdjacencyList.set(entity.id, new Set());
    }
  }

  /**
   * Add relationship edge
   */
  private addRelationshipEdge(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    confidence: number,
    source: RelationshipSource,
    evidence: string[] = []
  ): void {
    const edgeId = `${sourceId}-${targetId}-${type}`;
    
    // Check if edge already exists
    if (this.graph.edges.has(edgeId)) {
      // Update confidence if higher
      const existingEdge = this.graph.edges.get(edgeId)!;
      if (confidence > existingEdge.confidence) {
        existingEdge.confidence = confidence;
        existingEdge.metadata.evidence = [
          ...(existingEdge.metadata.evidence || []),
          ...evidence
        ];
      }
      return;
    }
    
    const edge: RelationshipEdge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      type,
      confidence,
      weight: this.calculateEdgeWeight(type, confidence),
      metadata: {
        source,
        establishedDate: new Date(),
        evidence,
        bidirectional: this.isBidirectionalRelationship(type)
      }
    };
    
    this.graph.edges.set(edgeId, edge);
    
    // Update adjacency lists
    this.graph.adjacencyList.get(sourceId)?.add(targetId);
    this.graph.reverseAdjacencyList.get(targetId)?.add(sourceId);
    
    // Add reverse edge for bidirectional relationships
    if (edge.metadata.bidirectional) {
      this.graph.adjacencyList.get(targetId)?.add(sourceId);
      this.graph.reverseAdjacencyList.get(sourceId)?.add(targetId);
    }
  }

  /**
   * Detect relationships between entities
   */
  private async detectRelationships(entities: Lead[]): Promise<void> {
    // Detect parent-subsidiary relationships
    await this.detectParentSubsidiaryRelationships(entities);
    
    // Detect franchise relationships
    await this.detectFranchiseRelationships(entities);
    
    // Detect partner relationships
    await this.detectPartnerRelationships(entities);
    
    // Detect address-based relationships
    await this.detectAddressBasedRelationships(entities);
    
    // Detect owner-based relationships
    await this.detectOwnerBasedRelationships(entities);
  }

  /**
   * Detect parent-subsidiary relationships
   */
  private async detectParentSubsidiaryRelationships(entities: Lead[]): Promise<void> {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        // Check if one entity name contains the other
        const name1 = entity1.businessName.toLowerCase();
        const name2 = entity2.businessName.toLowerCase();
        
        // Parent-subsidiary patterns
        if (name1.includes(name2) && name1.length > name2.length + 5) {
          // entity1 might be subsidiary of entity2
          const confidence = this.calculateNameBasedConfidence(name1, name2);
          this.addRelationshipEdge(
            entity2.id,
            entity1.id,
            RelationshipType.PARENT,
            confidence,
            RelationshipSource.AUTO_DETECTED,
            [`Name pattern: "${name2}" contained in "${name1}"`]
          );
        } else if (name2.includes(name1) && name2.length > name1.length + 5) {
          // entity2 might be subsidiary of entity1
          const confidence = this.calculateNameBasedConfidence(name2, name1);
          this.addRelationshipEdge(
            entity1.id,
            entity2.id,
            RelationshipType.PARENT,
            confidence,
            RelationshipSource.AUTO_DETECTED,
            [`Name pattern: "${name1}" contained in "${name2}"`]
          );
        }
        
        // Check for common parent indicators
        const parentIndicators = ['holdings', 'group', 'parent', 'corp', 'international'];
        const subsidiaryIndicators = ['branch', 'division', 'subsidiary', 'location'];
        
        for (const indicator of parentIndicators) {
          if (name1.includes(indicator) && !name2.includes(indicator)) {
            // entity1 might be parent
            if (this.hasCommonNamePart(name1, name2)) {
              this.addRelationshipEdge(
                entity1.id,
                entity2.id,
                RelationshipType.PARENT,
                70,
                RelationshipSource.AUTO_DETECTED,
                [`Parent indicator: "${indicator}" in name`]
              );
            }
          }
        }
        
        for (const indicator of subsidiaryIndicators) {
          if (name2.includes(indicator) && !name1.includes(indicator)) {
            // entity2 might be subsidiary
            if (this.hasCommonNamePart(name1, name2)) {
              this.addRelationshipEdge(
                entity1.id,
                entity2.id,
                RelationshipType.SUBSIDIARY,
                70,
                RelationshipSource.AUTO_DETECTED,
                [`Subsidiary indicator: "${indicator}" in name`]
              );
            }
          }
        }
      }
    }
  }

  /**
   * Detect franchise relationships
   */
  private async detectFranchiseRelationships(entities: Lead[]): Promise<void> {
    const franchiseIndicators = ['franchise', 'franchisee', 'franchisor', 'licensed'];
    const locationIndicators = /\b(#\d+|\d+|location \d+|store \d+)\b/i;
    
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        const name1 = entity1.businessName.toLowerCase();
        const name2 = entity2.businessName.toLowerCase();
        
        // Check for franchise indicators
        for (const indicator of franchiseIndicators) {
          if (name1.includes(indicator) || name2.includes(indicator)) {
            if (this.hasCommonNamePart(name1, name2)) {
              this.addRelationshipEdge(
                entity1.id,
                entity2.id,
                RelationshipType.FRANCHISE,
                65,
                RelationshipSource.AUTO_DETECTED,
                [`Franchise indicator found: "${indicator}"`]
              );
            }
          }
        }
        
        // Check for numbered locations
        if (locationIndicators.test(name1) && locationIndicators.test(name2)) {
          const baseName1 = name1.replace(locationIndicators, '').trim();
          const baseName2 = name2.replace(locationIndicators, '').trim();
          
          if (baseName1 === baseName2) {
            this.addRelationshipEdge(
              entity1.id,
              entity2.id,
              RelationshipType.FRANCHISE,
              80,
              RelationshipSource.AUTO_DETECTED,
              ['Numbered location pattern detected']
            );
          }
        }
      }
    }
  }

  /**
   * Detect partner relationships
   */
  private async detectPartnerRelationships(entities: Lead[]): Promise<void> {
    const partnerIndicators = ['partners', 'partnership', 'joint venture', 'jv', 'alliance'];
    
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        const name1 = entity1.businessName.toLowerCase();
        const name2 = entity2.businessName.toLowerCase();
        
        // Check for partner indicators
        for (const indicator of partnerIndicators) {
          if (name1.includes(indicator) || name2.includes(indicator)) {
            // Check if they share address or owner
            const sameAddress = entity1.fullAddress && 
                               entity2.fullAddress && 
                               entity1.fullAddress === entity2.fullAddress;
            
            const sameOwner = entity1.ownerName && 
                             entity2.ownerName && 
                             entity1.ownerName === entity2.ownerName;
            
            if (sameAddress || sameOwner) {
              this.addRelationshipEdge(
                entity1.id,
                entity2.id,
                RelationshipType.PARTNER,
                sameOwner ? 85 : 70,
                RelationshipSource.AUTO_DETECTED,
                [
                  `Partner indicator: "${indicator}"`,
                  sameAddress ? 'Same address' : '',
                  sameOwner ? 'Same owner' : ''
                ].filter(Boolean)
              );
            }
          }
        }
      }
    }
  }

  /**
   * Detect address-based relationships
   */
  private async detectAddressBasedRelationships(entities: Lead[]): Promise<void> {
    // Group entities by address
    const addressGroups = new Map<string, Lead[]>();
    
    for (const entity of entities) {
      if (entity.fullAddress) {
        const normalizedAddress = entity.fullAddress.toLowerCase().trim();
        if (!addressGroups.has(normalizedAddress)) {
          addressGroups.set(normalizedAddress, []);
        }
        addressGroups.get(normalizedAddress)!.push(entity);
      }
    }
    
    // Create relationships for entities at same address
    for (const [address, groupEntities] of addressGroups) {
      if (groupEntities.length > 1) {
        for (let i = 0; i < groupEntities.length; i++) {
          for (let j = i + 1; j < groupEntities.length; j++) {
            this.addRelationshipEdge(
              groupEntities[i].id,
              groupEntities[j].id,
              RelationshipType.RELATED,
              60,
              RelationshipSource.AUTO_DETECTED,
              [`Shared address: ${address}`]
            );
          }
        }
      }
    }
  }

  /**
   * Detect owner-based relationships
   */
  private async detectOwnerBasedRelationships(entities: Lead[]): Promise<void> {
    // Group entities by owner
    const ownerGroups = new Map<string, Lead[]>();
    
    for (const entity of entities) {
      if (entity.ownerName) {
        const normalizedOwner = entity.ownerName.toLowerCase().trim();
        if (!ownerGroups.has(normalizedOwner)) {
          ownerGroups.set(normalizedOwner, []);
        }
        ownerGroups.get(normalizedOwner)!.push(entity);
      }
    }
    
    // Create relationships for entities with same owner
    for (const [owner, groupEntities] of ownerGroups) {
      if (groupEntities.length > 1) {
        for (let i = 0; i < groupEntities.length; i++) {
          for (let j = i + 1; j < groupEntities.length; j++) {
            this.addRelationshipEdge(
              groupEntities[i].id,
              groupEntities[j].id,
              RelationshipType.AFFILIATE,
              75,
              RelationshipSource.AUTO_DETECTED,
              [`Common owner: ${owner}`]
            );
          }
        }
      }
    }
  }

  /**
   * Add UCC relationships
   */
  private async addUCCRelationships(entities: Lead[]): Promise<void> {
    // Query UCC filings for these entities
    const businessNames = entities.map(e => e.businessName);
    
    // This would query the UCC filings table
    // For now, creating placeholder logic
    for (const entity of entities) {
      // Check if entity appears as debtor or secured party in UCC filings
      // This would involve querying the uccFilings table
      
      // Add vendor/customer relationships based on UCC data
      // This is placeholder - would need actual UCC data
    }
  }

  /**
   * Detect ownership chains
   */
  private async detectOwnershipChains(): Promise<void> {
    // Use DFS to find ownership chains
    const visited = new Set<string>();
    const chains: Array<string[]> = [];
    
    for (const nodeId of this.graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const chain = this.findOwnershipChain(nodeId, visited);
        if (chain.length > 1) {
          chains.push(chain);
        }
      }
    }
    
    // Mark circular relationships
    for (const chain of chains) {
      if (chain[0] === chain[chain.length - 1]) {
        // Circular relationship detected
        for (let i = 0; i < chain.length - 1; i++) {
          const edge = this.findEdge(chain[i], chain[i + 1]);
          if (edge) {
            edge.metadata.evidence = edge.metadata.evidence || [];
            edge.metadata.evidence.push('Part of circular ownership chain');
          }
        }
      }
    }
  }

  /**
   * Find ownership chain using DFS
   */
  private findOwnershipChain(startId: string, visited: Set<string>): string[] {
    const chain: string[] = [];
    const stack: string[] = [startId];
    const path = new Map<string, string>();
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      
      if (visited.has(current)) continue;
      visited.add(current);
      chain.push(current);
      
      // Find parent relationships
      const edges = Array.from(this.graph.edges.values()).filter(
        edge => edge.target === current && 
                (edge.type === RelationshipType.PARENT || 
                 edge.type === RelationshipType.SUBSIDIARY)
      );
      
      for (const edge of edges) {
        if (!visited.has(edge.source)) {
          stack.push(edge.source);
          path.set(edge.source, current);
        }
      }
    }
    
    return chain;
  }

  /**
   * Detect business patterns
   */
  private async detectBusinessPatterns(): Promise<void> {
    // Detect hub entities (many connections)
    const connectionCounts = new Map<string, number>();
    
    for (const [nodeId, connections] of this.graph.adjacencyList) {
      const reverseConnections = this.graph.reverseAdjacencyList.get(nodeId) || new Set();
      const totalConnections = connections.size + reverseConnections.size;
      connectionCounts.set(nodeId, totalConnections);
    }
    
    // Mark hub nodes (top 10% by connections)
    const sortedCounts = Array.from(connectionCounts.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const hubThreshold = Math.ceil(sortedCounts.length * 0.1);
    for (let i = 0; i < Math.min(hubThreshold, sortedCounts.length); i++) {
      const node = this.graph.nodes.get(sortedCounts[i][0]);
      if (node) {
        node.metadata.isHub = true;
      }
    }
  }

  /**
   * Analyze graph structure
   */
  analyzeGraph(): GraphAnalysis {
    const analysis: GraphAnalysis = {
      connectedComponents: this.findConnectedComponents(),
      centralityScores: this.calculateCentrality(),
      communities: this.detectCommunities(),
      hierarchyLevels: this.calculateHierarchyLevels(),
      circularRelationships: this.findCircularRelationships(),
      orphanNodes: this.findOrphanNodes(),
      hubNodes: this.findHubNodes()
    };
    
    return analysis;
  }

  /**
   * Find connected components
   */
  private findConnectedComponents(): Array<Set<string>> {
    const visited = new Set<string>();
    const components: Array<Set<string>> = [];
    
    for (const nodeId of this.graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const component = new Set<string>();
        this.dfs(nodeId, visited, component);
        components.push(component);
      }
    }
    
    return components;
  }

  /**
   * DFS traversal
   */
  private dfs(nodeId: string, visited: Set<string>, component: Set<string>): void {
    visited.add(nodeId);
    component.add(nodeId);
    
    const neighbors = this.graph.adjacencyList.get(nodeId) || new Set();
    const reverseNeighbors = this.graph.reverseAdjacencyList.get(nodeId) || new Set();
    
    for (const neighbor of [...neighbors, ...reverseNeighbors]) {
      if (!visited.has(neighbor)) {
        this.dfs(neighbor, visited, component);
      }
    }
  }

  /**
   * Calculate centrality scores
   */
  private calculateCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    
    // Degree centrality
    for (const [nodeId, connections] of this.graph.adjacencyList) {
      const reverseConnections = this.graph.reverseAdjacencyList.get(nodeId) || new Set();
      const degree = connections.size + reverseConnections.size;
      centrality.set(nodeId, degree);
    }
    
    // Normalize scores
    const maxCentrality = Math.max(...centrality.values());
    if (maxCentrality > 0) {
      for (const [nodeId, score] of centrality) {
        centrality.set(nodeId, score / maxCentrality);
      }
    }
    
    return centrality;
  }

  /**
   * Detect communities using simple modularity
   */
  private detectCommunities(): Array<Set<string>> {
    // Simple community detection based on connected components
    // In a real implementation, would use more sophisticated algorithms
    return this.findConnectedComponents();
  }

  /**
   * Calculate hierarchy levels
   */
  private calculateHierarchyLevels(): Map<string, number> {
    const levels = new Map<string, number>();
    
    // Find root nodes (no incoming parent edges)
    const rootNodes = new Set<string>();
    for (const nodeId of this.graph.nodes.keys()) {
      const hasParent = Array.from(this.graph.edges.values()).some(
        edge => edge.target === nodeId && edge.type === RelationshipType.PARENT
      );
      if (!hasParent) {
        rootNodes.add(nodeId);
        levels.set(nodeId, 0);
      }
    }
    
    // BFS to assign levels
    const queue = [...rootNodes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current) || 0;
      
      const children = Array.from(this.graph.edges.values())
        .filter(edge => edge.source === current && edge.type === RelationshipType.PARENT)
        .map(edge => edge.target);
      
      for (const child of children) {
        if (!levels.has(child)) {
          levels.set(child, currentLevel + 1);
          queue.push(child);
        }
      }
    }
    
    return levels;
  }

  /**
   * Find circular relationships
   */
  private findCircularRelationships(): Array<string[]> {
    const cycles: Array<string[]> = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    for (const nodeId of this.graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const path: string[] = [];
        this.findCycles(nodeId, visited, recursionStack, path, cycles);
      }
    }
    
    return cycles;
  }

  /**
   * Find cycles using DFS
   */
  private findCycles(
    nodeId: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
    cycles: Array<string[]>
  ): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);
    
    const neighbors = this.graph.adjacencyList.get(nodeId) || new Set();
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.findCycles(neighbor, visited, recursionStack, path, cycles);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }
    
    path.pop();
    recursionStack.delete(nodeId);
  }

  /**
   * Find orphan nodes
   */
  private findOrphanNodes(): Set<string> {
    const orphans = new Set<string>();
    
    for (const nodeId of this.graph.nodes.keys()) {
      const hasConnections = 
        (this.graph.adjacencyList.get(nodeId)?.size || 0) > 0 ||
        (this.graph.reverseAdjacencyList.get(nodeId)?.size || 0) > 0;
      
      if (!hasConnections) {
        orphans.add(nodeId);
      }
    }
    
    return orphans;
  }

  /**
   * Find hub nodes
   */
  private findHubNodes(): Set<string> {
    const hubs = new Set<string>();
    const threshold = 5; // Nodes with more than 5 connections
    
    for (const [nodeId, connections] of this.graph.adjacencyList) {
      const reverseConnections = this.graph.reverseAdjacencyList.get(nodeId) || new Set();
      const totalConnections = connections.size + reverseConnections.size;
      
      if (totalConnections >= threshold) {
        hubs.add(nodeId);
      }
    }
    
    return hubs;
  }

  /**
   * Generate entity family tree
   */
  generateFamilyTree(rootEntityId: string): EntityFamily | null {
    const rootNode = this.graph.nodes.get(rootEntityId);
    if (!rootNode) return null;
    
    const family: EntityFamily = {
      rootEntity: rootNode,
      familySize: 1,
      levels: new Map([[0, [rootNode]]]),
      relationships: [],
      strength: 0,
      type: 'corporate'
    };
    
    // BFS to build family tree
    const visited = new Set<string>([rootEntityId]);
    const queue: Array<{ id: string; level: number }> = [{ id: rootEntityId, level: 0 }];
    
    while (queue.length > 0) {
      const { id: currentId, level } = queue.shift()!;
      
      // Find all relationships from this node
      const edges = Array.from(this.graph.edges.values()).filter(
        edge => edge.source === currentId || edge.target === currentId
      );
      
      for (const edge of edges) {
        const otherId = edge.source === currentId ? edge.target : edge.source;
        
        if (!visited.has(otherId)) {
          visited.add(otherId);
          const otherNode = this.graph.nodes.get(otherId);
          
          if (otherNode) {
            const nextLevel = level + 1;
            
            if (!family.levels.has(nextLevel)) {
              family.levels.set(nextLevel, []);
            }
            family.levels.get(nextLevel)!.push(otherNode);
            
            family.relationships.push(edge);
            family.familySize++;
            
            queue.push({ id: otherId, level: nextLevel });
          }
        }
      }
    }
    
    // Calculate family strength
    family.strength = this.calculateFamilyStrength(family);
    
    // Determine family type
    family.type = this.determineFamilyType(family);
    
    return family;
  }

  /**
   * Calculate family strength
   */
  private calculateFamilyStrength(family: EntityFamily): number {
    if (family.relationships.length === 0) return 0;
    
    const avgConfidence = family.relationships.reduce(
      (sum, edge) => sum + edge.confidence, 0
    ) / family.relationships.length;
    
    const sizeFactor = Math.min(family.familySize / 10, 1);
    const levelFactor = Math.min(family.levels.size / 5, 1);
    
    return Math.round((avgConfidence * 0.5 + sizeFactor * 0.3 + levelFactor * 0.2) * 100);
  }

  /**
   * Determine family type
   */
  private determineFamilyType(family: EntityFamily): EntityFamily['type'] {
    const relationshipTypes = new Set(family.relationships.map(r => r.type));
    
    if (relationshipTypes.has(RelationshipType.FRANCHISE)) {
      return 'franchise';
    } else if (relationshipTypes.has(RelationshipType.PARTNER)) {
      return 'partnership';
    } else if (relationshipTypes.size > 2) {
      return 'mixed';
    }
    
    return 'corporate';
  }

  /**
   * Calculate relationship strength between two entities
   */
  calculateRelationshipStrength(entity1Id: string, entity2Id: string): number {
    // Find all paths between entities
    const paths = this.findAllPaths(entity1Id, entity2Id);
    
    if (paths.length === 0) return 0;
    
    // Calculate strength based on shortest path and number of paths
    const shortestPathLength = Math.min(...paths.map(p => p.length));
    const pathCount = paths.length;
    
    // Direct connection is strongest
    if (shortestPathLength === 2) {
      const edge = this.findEdge(entity1Id, entity2Id);
      return edge ? edge.confidence : 0;
    }
    
    // Indirect connections get weaker with distance
    const distanceFactor = 1 / shortestPathLength;
    const redundancyFactor = Math.min(pathCount / 3, 1);
    
    return Math.round((distanceFactor * 0.7 + redundancyFactor * 0.3) * 100);
  }

  /**
   * Find all paths between two entities
   */
  private findAllPaths(startId: string, endId: string, maxDepth: number = 5): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();
    const currentPath: string[] = [];
    
    this.dfsAllPaths(startId, endId, visited, currentPath, paths, maxDepth);
    
    return paths;
  }

  /**
   * DFS to find all paths
   */
  private dfsAllPaths(
    current: string,
    end: string,
    visited: Set<string>,
    currentPath: string[],
    allPaths: string[][],
    remainingDepth: number
  ): void {
    if (remainingDepth <= 0) return;
    
    visited.add(current);
    currentPath.push(current);
    
    if (current === end) {
      allPaths.push([...currentPath]);
    } else {
      const neighbors = this.graph.adjacencyList.get(current) || new Set();
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          this.dfsAllPaths(neighbor, end, visited, currentPath, allPaths, remainingDepth - 1);
        }
      }
    }
    
    currentPath.pop();
    visited.delete(current);
  }

  /**
   * Helper methods
   */
  
  private clearGraph(): void {
    this.graph.nodes.clear();
    this.graph.edges.clear();
    this.graph.adjacencyList.clear();
    this.graph.reverseAdjacencyList.clear();
  }
  
  private calculateEdgeWeight(type: RelationshipType, confidence: number): number {
    const typeWeights: Record<RelationshipType, number> = {
      [RelationshipType.PARENT]: 1.0,
      [RelationshipType.SUBSIDIARY]: 0.9,
      [RelationshipType.AFFILIATE]: 0.7,
      [RelationshipType.BRANCH]: 0.8,
      [RelationshipType.FRANCHISE]: 0.6,
      [RelationshipType.PARTNER]: 0.5,
      [RelationshipType.VENDOR]: 0.3,
      [RelationshipType.CUSTOMER]: 0.3,
      [RelationshipType.DUPLICATE]: 0.95,
      [RelationshipType.MERGED]: 1.0,
      [RelationshipType.RELATED]: 0.4
    };
    
    const typeWeight = typeWeights[type] || 0.5;
    return typeWeight * (confidence / 100);
  }
  
  private isBidirectionalRelationship(type: RelationshipType): boolean {
    const bidirectionalTypes = [
      RelationshipType.PARTNER,
      RelationshipType.AFFILIATE,
      RelationshipType.RELATED
    ];
    return bidirectionalTypes.includes(type);
  }
  
  private calculateNameBasedConfidence(name1: string, name2: string): number {
    const commonLength = Math.min(name1.length, name2.length);
    const difference = Math.abs(name1.length - name2.length);
    const baseConfidence = 60;
    const lengthPenalty = Math.min(difference * 2, 20);
    return Math.max(baseConfidence - lengthPenalty, 40);
  }
  
  private hasCommonNamePart(name1: string, name2: string): boolean {
    const words1 = name1.split(/\s+/).filter(w => w.length > 3);
    const words2 = name2.split(/\s+/).filter(w => w.length > 3);
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2) return true;
      }
    }
    
    return false;
  }
  
  private findEdge(source: string, target: string): RelationshipEdge | null {
    for (const edge of this.graph.edges.values()) {
      if (edge.source === source && edge.target === target) {
        return edge;
      }
      if (edge.metadata.bidirectional && edge.source === target && edge.target === source) {
        return edge;
      }
    }
    return null;
  }
}

// Export singleton instance
export const entityGraphBuilder = new EntityGraphBuilder();