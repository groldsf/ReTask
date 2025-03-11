import { Notice } from 'obsidian';

export class Notificator {
    private static debugMode: boolean = false;

    static setDebugMode(enabled: boolean) {
        this.debugMode = enabled;
    }

    static info(message: string, details?: any) {
        new Notice(`Info: ${message}`);
        if (this.debugMode) {
            console.log(`[INFO] ${message}`, details);
        }
    }

    static warn(message: string, details?: any) {
        new Notice(`Warning: ${message}`);
        if (this.debugMode) {
            console.warn(`[WARN] ${message}`, details);
        }
    }

    static error(message: string, details?: any) {
        new Notice(`Error: ${message}`);
        if (this.debugMode) {
            console.error(`[ERROR] ${message}`, details);
        }
    }

    static debug(message: string, details?: any) {
        if (this.debugMode) {
            console.debug(`[DEBUG] ${message}`, details);
        }
    }
}