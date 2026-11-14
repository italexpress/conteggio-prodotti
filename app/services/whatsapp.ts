import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export function normalizeContactPhone(raw: string | null | undefined, country?: string | null): string | null {
  if (!raw?.trim()) return null;
  const text=raw.trim().replace(/^00/,'+');
  // Do not infer a country from the user's language or accept an extension.
  if (!/^[+\d\s().-]+$/.test(text) || (!text.startsWith('+') && !country)) return null;
  try {
    const phone=parsePhoneNumberFromString(text,country as CountryCode | undefined);
    return phone?.isValid() && !phone.ext ? phone.number : null;
  } catch { return null; }
}
export function whatsappLink(phone: string | null | undefined, customerName?: string | null): string | null {
  const normalized=normalizeContactPhone(phone);
  const name=customerName?.trim().replace(/\s+/g,' ') || '';
  const greeting=name && !/^cliente$/i.test(name) ? `Ciao ${name}!` : 'Ciao!';
  const message=`${greeting} Perdonaci per il disturbo, ti scriviamo in merito al tuo ordine 📦`;
  return normalized ? `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}` : null;
}
export function contactAccessDenied(error: any): boolean {
  const errors=error?.body?.errors?.graphQLErrors ?? error?.errors;
  return Array.isArray(errors) && errors.length>0 && errors.every(e=>e.extensions?.code==='ACCESS_DENIED' &&
    Array.isArray(e.path) && e.path.some((p:string)=>['phone','shippingAddress','billingAddress'].includes(p)));
}
