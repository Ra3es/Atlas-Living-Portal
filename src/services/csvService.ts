import { parse } from 'csv-parse/browser/esm/sync';
import { RevenueLog, ExpenseLog, Property, PaymentRecord } from '../types';
import { format, parse as parseDate, isValid } from 'date-fns';

function parseCSVDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return format(new Date(), 'yyyy-MM-dd');
  
  const trimmed = dateStr.trim();
  if (!trimmed) return format(new Date(), 'yyyy-MM-dd');

  try {
    // Try common formats
    const formats = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd/M/yyyy', 'dd/MM/yyyy', 'MMM d, yyyy'];
    for (const f of formats) {
      const parsed = parseDate(trimmed, f, new Date());
      if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
    }
    
    // Fallback to JS native parser
    const nativeParsed = new Date(trimmed);
    if (isValid(nativeParsed)) return format(nativeParsed, 'yyyy-MM-dd');
    
    return format(new Date(), 'yyyy-MM-dd');
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return format(new Date(), 'yyyy-MM-dd');
  }
}

function safeFloat(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[^\d.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function getHeader(record: any, headers: string[]): any {
  const keys = Object.keys(record);
  for (const header of headers) {
    const key = keys.find(k => k.trim().toLowerCase() === header.toLowerCase());
    if (key) return record[key];
  }
  return undefined;
}

export function parseRevenueCSV(csvText: string, propertyId: string): Omit<RevenueLog, 'id' | 'uploadedAt'>[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  return records.map((r: any) => {
    const propId = getHeader(r, ['Property ID']) || propertyId;
    return {
      propertyId: propId.toString().trim().toUpperCase(),
      paymentDate: parseCSVDate(getHeader(r, ['Payment Date'])),
      platform: getHeader(r, ['Platform']) || 'Direct',
      guest: getHeader(r, ['Guest']) || 'Guest',
      cleanings: safeFloat(getHeader(r, ['Cleanings'])),
      gross: safeFloat(getHeader(r, ['Gross'])),
      fees: safeFloat(getHeader(r, ['Fees'])),
      netRevenue: safeFloat(getHeader(r, ['Net Revenue'])),
    };
  });
}

export function parseExpenseCSV(csvText: string, propertyId: string): Omit<ExpenseLog, 'id' | 'uploadedAt'>[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  return records.map((r: any) => {
    const propId = getHeader(r, ['Property ID']) || propertyId;
    return {
      propertyId: propId.toString().trim().toUpperCase(),
      date: parseCSVDate(getHeader(r, ['Date'])),
      category: getHeader(r, ['Category']) || 'Other',
      supplier: getHeader(r, ['Supplier']) || 'N/A',
      description: getHeader(r, ['Description']) || 'N/A',
      amount: safeFloat(getHeader(r, ['Amount'])),
      reimbursable: getHeader(r, ['Reimbursable'])?.toString().toLowerCase() === 'yes' || getHeader(r, ['Reimbursable'])?.toString().toLowerCase() === 'true',
    };
  });
}

export function parsePaymentCSV(csvText: string, propertyId: string): Omit<PaymentRecord, 'id' | 'uploadedAt'>[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  return records.map((r: any) => {
    const propId = getHeader(r, ['Property ID']) || propertyId;
    const category = getHeader(r, ['Category']);
    const ref = getHeader(r, ['Payment Ref']);
    const desc = getHeader(r, ['Description']) || 'Payment Received';
    
    // Combine description with Category and Ref if available
    const combinedDesc = [
      category,
      desc,
      ref ? `(Ref: ${ref})` : null
    ].filter(Boolean).join(' - ');

    return {
      propertyId: propId.toString().trim().toUpperCase(),
      date: parseCSVDate(getHeader(r, ['Date'])),
      amount: safeFloat(getHeader(r, ['Amount'])),
      description: combinedDesc,
    };
  });
}

export function parseSettingsCSV(csvText: string): Partial<Property> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const settings: any = {};
  records.forEach((r: any) => {
    const key = r['Parameter'];
    const val = r['Value'];
    
    if (key === 'Property ID') settings.id = val;
    if (key === 'Property Name') settings.name = val;
    if (key === 'Owner Name') settings.ownerName = val;
    if (key === 'Owner Email') settings.ownerEmail = val;
    if (key === 'Management Fee %') settings.managementFeePercent = parseFloat(val) || 0;
    if (key === 'Management Fee Fixed') settings.managementFeeFixed = parseFloat(val) || 0;
  });

  return settings;
}
