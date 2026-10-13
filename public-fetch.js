import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { ImportError } from './recipe-import.js';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(address, prefix, 'ipv4');
// Permit only global-unicast IPv6 (2000::/3), excluding documentation ranges.
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return /^[23]/i.test(address) && !blocked.check(address, 'ipv6');
  return false;
}
export function parsePublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new ImportError('Enter a valid recipe link starting with https:// or http://.', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new ImportError('Use a public http:// or https:// recipe link without a login or custom port.', 400);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || isIP(hostname) && !isPublicAddress(hostname)) throw new ImportError('Only public recipe websites can be imported.', 400);
  url.hash = '';
  return url;
}
export async function fetchPublicHtml(input, { resolveHost = lookup, requestFor = protocol => protocol === 'https:' ? https.request : http.request } = {}) {
  const signal = AbortSignal.timeout(15000);
  let url = parsePublicUrl(input);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await new Promise((resolve, reject) => {
        const abort = () => reject(new ImportError('The website took too long. Paste the recipe text instead.'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) return abort();
        Promise.resolve(resolveHost(hostname, { all: true, verbatim: true })).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
      if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new ImportError('This link does not point to a public recipe website.', 400);
      const address = addresses.find(a => a.family === 4) || addresses[0];
      const result = await new Promise((resolve, reject) => {
        const request = requestFor(url.protocol)(url, {
          signal,
          headers: { 'User-Agent': 'Pantry/0.2 recipe importer', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
          // Pin the validated DNS answer for this connection, preserving TLS host verification.
          lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
        }, response => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) { response.resume(); return resolve({ redirect: response.headers.location }); }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            response.resume(); return reject(new ImportError(`The website could not be read (HTTP ${response.statusCode}). Paste the recipe text instead.`));
          }
          if (!/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers['content-type'] || '')) {
            response.resume(); return reject(new ImportError('This link is not an HTML recipe page. Paste the recipe text instead.'));
          }
          const chunks = []; let size = 0;
          response.on('data', chunk => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) { response.destroy(new ImportError('This page is too large. Paste the recipe text instead.')); return; }
            chunks.push(chunk);
          });
          response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
          response.on('error', reject);
        });
        request.on('error', reject);
        request.end();
      });
      if ('html' in result) return { html: result.html, url: url.href };
      if (!result.redirect) throw new ImportError('The website returned an incomplete redirect. Paste the recipe text instead.');
      url = parsePublicUrl(new URL(result.redirect, url).href);
    }
    throw new ImportError('Too many website redirects. Paste the recipe text instead.');
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('The website could not be reached. Paste the recipe text instead.');
  }
}
