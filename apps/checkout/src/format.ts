import { formatINR } from '@checkout/core';

export const money = (paise: number): string => formatINR(paise);

/** "+919876543210" -> "+91 98765 43210" */
export const formatPhone = (e164: string): string => e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
