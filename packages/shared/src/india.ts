/** India-specific helpers with no dependencies (the checkout page imports this file alone). */

/** India's states and union territories, as the address form lists them (shipping zones use the same names). */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

/** Finds the list's spelling of a state name ("delhi", "NCT of Delhi", "Orissa" -> list names). */
export function matchState(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const clean = input.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'nct of delhi': 'Delhi',
    'new delhi': 'Delhi',
    orissa: 'Odisha',
    pondicherry: 'Puducherry',
    'jammu kashmir': 'Jammu and Kashmir',
    uttaranchal: 'Uttarakhand',
    'andaman nicobar': 'Andaman and Nicobar Islands',
    'andaman and nicobar': 'Andaman and Nicobar Islands',
    'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
    'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  };
  if (aliases[clean]) return aliases[clean];
  return INDIAN_STATES.find((s) => s.toLowerCase() === clean);
}

/**
 * Indian mobile number -> "+91XXXXXXXXXX", or null. Accepts spaces, dashes, a leading 0, 91 or +91.
 * Only 10-digit numbers starting 6-9 are mobiles (WhatsApp OTP needs a mobile).
 */
export function normalizeIndianMobile(input: string | undefined | null): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** "+919876543210" -> "+91 98•••••210" (what the checkout shows before / around OTP). */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+91/, '');
  return `+91 ${d.slice(0, 2)}${'•'.repeat(5)}${d.slice(7)}`;
}
