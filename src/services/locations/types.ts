export type NodeType = 'object' | 'building' | 'section' | 'floor' | 'apartment';

export interface LocationNode {
  id: string;
  companyId: string;
  nodeType: NodeType;
  parentId: string | null;
  displayName: string;
  canonical_key?: string;
  sort_order: number;
  synonyms?: unknown;
  created_by?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  syncStatus?: string;
  source?: string;
  _deleted?: boolean;
}

export interface FloorPlan {
  id: string;
  companyId: string;
  locationId: string;
  name?: string;
  sort_order: number;
  pdf_url: string;
  pdf_name: string;
  pdf_size: string;
  is_active: boolean;
  created_by?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  syncStatus?: string;
  source?: string;
  _deleted?: boolean;
}

export const NODE_TYPES: NodeType[] = ['object', 'building', 'section', 'floor', 'apartment'];

export const CHILD_OF: Record<NodeType, NodeType | null> = {
  object: null,
  building: 'object',
  section: 'building',
  floor: 'section',
  apartment: 'floor'
};
