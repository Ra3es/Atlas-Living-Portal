export interface Property {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  managementFeePercent: number;
  managementFeeFixed: number;
  pin: string;
  createdAt: number;
  updatedAt: number;
}

export interface RevenueLog {
  id: string;
  propertyId: string;
  paymentDate: string; // ISO String or YYYY-MM-DD
  platform: string;
  guest: string;
  type?: 'stay' | 'insurance';
  cleanings: number;
  gross: number;
  fees: number;
  netRevenue: number;
  uploadedAt: number;
}

export interface ExpenseLog {
  id: string;
  propertyId: string;
  date: string; // ISO String or YYYY-MM-DD
  category: string;
  supplier: string;
  description: string;
  amount: number;
  reimbursable: boolean;
  uploadedAt: number;
}

export interface CustomFee {
  id: string;
  propertyId: string;
  date: string;
  description: string;
  amount: number;
  feeType: 'fixed' | 'percent';
  percentage?: number;
  documentUrl?: string; // URL to uploaded invoice or proof
  addedAt: number;
}

export interface PaymentRecord {
  id: string;
  propertyId: string;
  date: string;
  amount: number;
  description: string;
  uploadedAt: number;
}

export type OperationStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';

export interface MaintenanceIssue {
  id: string;
  propertyId: string;
  date: string;
  title: string;
  description: string;
  category: 'maintenance' | 'cleaning' | 'block-request' | 'general' | 'other';
  status: 'open' | 'fixing' | 'resolved' | 'deferred';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  notes?: string;
  estimatedCost?: number;
  actualCost?: number;
  updatedAt: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
