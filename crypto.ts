// crypto.ts
import { clampIterations } from './utils';
import { MIN_ITERATIONS, MAX_ITERATIONS, BEGIN_MARKER, END_MARKER } from './constants';

// --- Architectural Constants ---
const SALT_BYTES = 16;       // 128-bit salt
const IV_BYTES = 12;         // 96-bit IV for GCM
const MAGIC = new Uint8Array([0x53, 0x45, 0x43, 0x31]); // 'SEC1'
const VERSION = 1; // payload format version
const HEADER_BYTES = MAGIC.length + 1 /*version*/ + 4 /*iterations*/;
const MAX_PAYLOAD_SIZE = 20 * 1024 * 1024; // 20MB max payload size

// --- Helper Functions for Base64URL ---
function b64urlEncode(data: Uint8Array | ArrayBuffer): string {
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(data))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function b64urlDecode(str: string): Uint8Array {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    const raw = atob(str);
    const array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        array[i] = raw.charCodeAt(i);
    }
    return array;
}

// --- Core Crypto Functions ---

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const passKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    // Create a new ArrayBuffer from the Uint8Array to ensure correct typing
    const saltBuffer = salt.slice().buffer;

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: iterations,
            hash: 'SHA-256'
        },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts text using AES-GCM, inspired by Fernet's format.
 * The salt is prepended to the ciphertext, and the result is Base64 encoded.
 */
export async function encryptText(text: string, password: string, opts: { iterations: number }): Promise<string> {
    if (!password) throw new Error("Password is required.");

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(password, salt, opts.iterations);

    const encodedText = new TextEncoder().encode(text);
    const ivBuffer = iv.slice().buffer;
    const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        encodedText.buffer
    );
    // New format: [MAGIC(4) | VERSION(1) | ITER(4, BE) | SALT(16) | IV(12) | CT+TAG]
    const header = new Uint8Array(HEADER_BYTES);
    header.set(MAGIC, 0);
    header[4] = VERSION;
    // write iterations as uint32 big-endian
    const iter = opts.iterations >>> 0;
    header[5] = (iter >>> 24) & 0xff;
    header[6] = (iter >>> 16) & 0xff;
    header[7] = (iter >>> 8) & 0xff;
    header[8] = iter & 0xff;

    const ct = new Uint8Array(encryptedContent);
    const payload = new Uint8Array(header.length + salt.length + iv.length + ct.length);
    payload.set(header, 0);
    payload.set(salt, header.length);
    payload.set(iv, header.length + salt.length);
    payload.set(ct, header.length + salt.length + iv.length);

    const b64Token = b64urlEncode(payload);

    return `${BEGIN_MARKER}\n${b64Token}\n${END_MARKER}`;
}

/**
 * Decrypts a block of text, extracting the salt and IV from the payload.
 */
export async function decryptText(block: string, password: string, iterations: number): Promise<string> {
    if (!password) throw new Error("Password is required.");
    if (!block) throw new Error("Block is empty");

    const startIdx = block.indexOf(BEGIN_MARKER);
    const endIdx = block.indexOf(END_MARKER);

    if (startIdx === -1 || endIdx === -1) {
        throw new Error("Invalid encrypted block: markers not found.");
    }

    const b64Token = block.substring(startIdx + BEGIN_MARKER.length, endIdx).trim();
    if (!b64Token) throw new Error("Invalid block: content is empty.");
    
    // Check size before decoding
    if (b64Token.length > MAX_PAYLOAD_SIZE) {
        throw new Error(`Block too large (max ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB)`);
    }

    let data: Uint8Array;
    try {
        data = b64urlDecode(b64Token);
        
        // Check size after decoding
        if (data.length > MAX_PAYLOAD_SIZE) {
            throw new Error(`Decoded block too large (max ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB)`);
        }
    } catch (e) {
        console.error('Failed to decode block:', e);
        throw new Error("Invalid block format: corrupted data");
    }

    let salt: Uint8Array;
    let iv: Uint8Array;
    let ct: Uint8Array;
    let itersToUse = clampIterations(iterations); // Apply default clamping first

    // Detect new format by MAGIC prefix
    const hasHeader = data.length > HEADER_BYTES && 
                     data[0] === MAGIC[0] && 
                     data[1] === MAGIC[1] && 
                     data[2] === MAGIC[2] && 
                     data[3] === MAGIC[3];
    
    try {
        if (hasHeader) {
            const ver = data[4];
            if (ver !== VERSION) {
                throw new Error(`Unsupported secure block version: ${ver}`);
            }
            // parse iterations (uint32 big-endian)
            const parsedIters = (data[5] << 24) | (data[6] << 16) | (data[7] << 8) | data[8];
            itersToUse = clampIterations(parsedIters); // Apply clamping to parsed iterations
            
            const offset = HEADER_BYTES;
            salt = data.slice(offset, offset + SALT_BYTES);
            iv = data.slice(offset + SALT_BYTES, offset + SALT_BYTES + IV_BYTES);
            ct = data.slice(offset + SALT_BYTES + IV_BYTES);
        } else {
            // Legacy format: [SALT(16) | IV(12) | CT+TAG]
            if (data.length < SALT_BYTES + IV_BYTES) {
                throw new Error("Corrupted data: payload too short for legacy format");
            }
            salt = data.slice(0, SALT_BYTES);
            iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
            ct = data.slice(SALT_BYTES + IV_BYTES);
        }
    } catch (e) {
        console.error('Error parsing block format:', e);
        throw new Error("Invalid block format: corrupted data");
    }

    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ct.length === 0) {
        throw new Error("Corrupted data: invalid salt, IV, or ciphertext length.");
    }

    // Additional validation for GCM tag (last 16 bytes of ciphertext)
    if (ct.length < 16) {
        throw new Error("Corrupted data: ciphertext too short");
    }

    try {
        const key = await deriveKey(password, salt, itersToUse);
        // Create new ArrayBuffers from the Uint8Arrays
        const ivBuffer = iv.slice().buffer;
        const ctBuffer = ct.slice().buffer;
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            key,
            ctBuffer
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        // Log detailed error for diagnostics
        console.error('Decrypt error:', e);
        // Return generic error to user without leaking details
        throw new Error("Decryption failed. Invalid password or corrupted data.");
    } finally {
        // Overwrite sensitive data with zeros when possible
        if (salt) new Uint8Array(salt).fill(0);
        if (iv) new Uint8Array(iv).fill(0);
        // Note: ct is a view, can't be cleared directly
    }
}

export function isEncryptedBlock(s: string): boolean {
    return s.startsWith(BEGIN_MARKER) && s.endsWith(END_MARKER);
}
