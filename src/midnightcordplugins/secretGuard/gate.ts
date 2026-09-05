/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ScanResult, scanSecrets } from "./detector";

export type ValidationPhase = "before" | "after";
interface OperationState {
    context: string;
    generation: number;
    approvedContent?: string;
}

export interface GateRequest {
    operation: object;
    phase: ValidationPhase;
    context: string;
    getContent(): string;
    contextIsCurrent(): boolean;
    confirm(result: ScanResult): Promise<boolean>;
}

const CANCEL = { cancel: true } as const;

export class SecretGate {
    private active = false;
    private generation = 0;
    private operations = new WeakMap<object, OperationState>();

    constructor(private scan: (text: string) => ScanResult = scanSecrets) { }

    start() {
        this.active = true;
        this.invalidate();
    }

    invalidate() {
        this.generation++;
        this.operations = new WeakMap();
    }

    stop() {
        this.active = false;
        this.invalidate();
    }

    async validate(request: GateRequest): Promise<undefined | { cancel: true; }> {
        let state: OperationState | undefined;
        try {
            if (!this.active || !request.contextIsCurrent()) return CANCEL;
            if (request.phase === "before") {
                state = { context: request.context, generation: this.generation };
                this.operations.set(request.operation, state);
            } else {
                state = this.operations.get(request.operation);
                if (!state || state.generation !== this.generation || state.context !== request.context) return CANCEL;
            }
            const content = request.getContent();
            if (state.approvedContent !== content) {
                const result = this.scan(content);
                if (result.tooLong || result.findings.length) {
                    const accepted = await request.confirm(result);
                    if (!accepted || result.tooLong) return CANCEL;
                    if (!this.active || state.generation !== this.generation || !request.contextIsCurrent() || request.getContent() !== content) return CANCEL;
                    state.approvedContent = content;
                }
            }
            if (!this.active || state.generation !== this.generation || !request.contextIsCurrent() || request.getContent() !== content) return CANCEL;
            return undefined;
        } catch {
            return CANCEL;
        } finally {
            if (request.phase === "after") this.operations.delete(request.operation);
        }
    }
}
