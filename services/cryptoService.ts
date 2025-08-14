import { clampIterations } from '../utils';
import { encryptText, decryptText, isEncryptedBlock } from '../crypto';
import { Notice } from 'obsidian';

interface CryptoResult {
    success: boolean;
    content?: string;
    error?: string;
}

export class CryptoService {
    constructor(private iterations: number) {}

    async encrypt(text: string, password: string): Promise<CryptoResult> {
        try {
            if (!password) {
                return {
                    success: false,
                    error: 'Password is required'
                };
            }

            const encryptedContent = await encryptText(text, password, {
                iterations: this.iterations
            });

            return {
                success: true,
                content: encryptedContent
            };
        } catch (e: any) {
            console.error('Encryption failed:', e);
            return {
                success: false,
                error: e.message || 'Encryption failed'
            };
        }
    }

    async decrypt(encryptedText: string, password: string): Promise<CryptoResult> {
        try {
            if (!password) {
                return {
                    success: false,
                    error: 'Password is required'
                };
            }

            const decryptedContent = await decryptText(
                encryptedText.trim(),
                password,
                this.iterations
            );

            return {
                success: true,
                content: decryptedContent
            };
        } catch (e: any) {
            console.error('Decryption failed:', e);
            return {
                success: false,
                error: e.message || 'Decryption failed. Invalid password or corrupted data.'
            };
        }
    }

    isEncrypted(text: string): boolean {
        return isEncryptedBlock(text.trim());
    }

    setIterations(iterations: number): void {
        this.iterations = clampIterations(iterations);
    }

    getIterations(): number {
        return this.iterations;
    }
}
