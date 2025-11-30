/**
 * Domain mappings for special cases
 * Maps package names, app identifiers, or alternative domains to their canonical domain
 */

const DOMAIN_MAPPINGS: Record<string, string> = {
  'com.google.android.googlequicksearchbox': 'google.com',
  'com.google.android.gm': 'gmail.com',
};

/**
 * Resolve a domain to its canonical form using the mappings
 */
export function resolveDomainMapping(domain: string): string {
  const cleanDomain = domain.trim();
  return DOMAIN_MAPPINGS[cleanDomain] ?? domain;
}
