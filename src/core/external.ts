import * as dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const EXTERNAL_FETCH_TIMEOUT_MS = parseInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS || '10000', 10);
export const EXTERNAL_CACHE_TTL_MS = parseInt(process.env.EXTERNAL_CACHE_TTL_MS || '3600000', 10); // 1 hour
export const EXTERNAL_CACHE_MAX_ENTRIES = parseInt(process.env.EXTERNAL_CACHE_MAX_ENTRIES || '1000', 10);
export const MAX_RESPONSE_BYTES = parseInt(process.env.MAX_RESPONSE_BYTES || String(5 * 1024 * 1024), 10); // 5MB limit
export const MAX_REDIRECTS = parseInt(process.env.MAX_REDIRECTS || '5', 10);

export interface ExternalSource {
    url: string;
    domain: string;
    retrievedAt: number;
    publishedAt?: number;
    sourceType?: 'official' | 'primary' | 'secondary' | 'community' | 'unknown';
}

export interface ExternalObservation {
    content: string;
    source?: ExternalSource;
    confidence?: 'high' | 'medium' | 'low' | 'unknown';
    freshness?: 'current' | 'recent' | 'old' | 'unknown';
    title?: string;
    snippet?: string;
}

export interface SearchResult {
    title: string;
    url: string;
    domain: string;
    snippet: string;
    publishedAt?: number;
    relevance?: number;
    sourceType?: ExternalSource['sourceType'];
}

function isPrivateIP(ip: string): boolean {
    try {
        const addr = ipaddr.parse(ip);
        const range = addr.range();
        
        // Block all private/internal/local/multicast/carrier-grade nat ranges
        const blockedRanges = [
            'unspecified',
            'broadcast',
            'multicast',
            'linkLocal',
            'loopback',
            'carrierGradeNat',
            'private',
            'reserved'
        ];
        
        if (blockedRanges.includes(range)) {
            return true;
        }

        // Specifically check for cloud metadata addresses not caught by standard private checks
        if (addr.kind() === 'ipv4' && ip === '169.254.169.254') {
            return true;
        }
        
        return false;
    } catch {
        return true; // If we can't parse it, block it
    }
}

async function resolveAndValidateHost(hostname: string): Promise<void> {
    try {
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
            if (isPrivateIP(addr.address)) {
                throw new Error(`SSRF Blocked: Hostname resolves to private/internal IP address (${addr.address})`);
            }
        }
    } catch (error: any) {
        if (error.message.includes('SSRF Blocked')) {
            throw error;
        }
        // If DNS resolution fails, let fetch fail naturally, but it might be an IP directly.
        // If it's an IP directly, dns.lookup usually returns the IP itself.
        if (isPrivateIP(hostname)) {
            throw new Error(`SSRF Blocked: Direct private/internal IP address (${hostname})`);
        }
    }
}

export interface SecureFetchOptions extends RequestInit {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
}

export interface SecureFetchResponse {
    status: number;
    statusText: string;
    headers: Headers;
    text: string;
    url: string; // The final URL after redirects
}

export async function fetchWithSecurity(url: string, options: SecureFetchOptions = {}): Promise<SecureFetchResponse> {
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
    const timeoutMs = options.timeoutMs ?? EXTERNAL_FETCH_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;

    while (redirectCount <= maxRedirects) {
        const parsedUrl = new URL(currentUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
        }

        await resolveAndValidateHost(parsedUrl.hostname);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const fetchOptions: RequestInit = {
                ...options,
                redirect: 'manual', // Explicitly disable automatic redirects
                signal: controller.signal
            };

            const response = await fetch(currentUrl, fetchOptions);
            clearTimeout(timeoutId);

            // Handle manual redirect
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) {
                    throw new Error('Redirect with no location header');
                }
                currentUrl = new URL(location, currentUrl).toString();
                redirectCount++;
                continue;
            }

            // Stream response to enforce size limits
            if (!response.body) {
                return {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    text: '',
                    url: currentUrl
                };
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let text = '';
            let bytesRead = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                bytesRead += value.byteLength;
                if (bytesRead > maxBytes) {
                    reader.cancel();
                    throw new Error(`Response exceeded maximum size limit of ${maxBytes} bytes`);
                }

                text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();

            return {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                text,
                url: currentUrl
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
            throw error;
        }
    }

    throw new Error(`Exceeded maximum redirect limit of ${maxRedirects}`);
}

export class InMemoryExternalCache {
    private cache = new Map<string, { data: any, expiresAt: number }>();

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set(key: string, data: any, ttlMs: number = EXTERNAL_CACHE_TTL_MS) {
        if (this.cache.size >= EXTERNAL_CACHE_MAX_ENTRIES) {
            // Evict oldest (Map iterates in insertion order)
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    }
}

export const externalCache = new InMemoryExternalCache();
