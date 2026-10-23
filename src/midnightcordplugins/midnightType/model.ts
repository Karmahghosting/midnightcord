/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Official upstream artifacts, pinned by revision and SHA-256. No mutable "latest" downloads.
// llama.cpp: https://github.com/ggml-org/llama.cpp/releases/tag/b11840 (MIT)
// Qwen: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF (Apache-2.0)
export const RUNTIME_VERSION = "b11840";
export const MODEL_REVISION = "9217f5db79a29953eb74d5343926648285ec7e67";
export const INSTALL_VERSION = `${RUNTIME_VERSION}-qwen-${MODEL_REVISION.slice(0, 8)}`;

export interface Artifact {
    url: string;
    sha256: string;
    bytes: number;
}

export const MODEL: Artifact = {
    url: `https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/${MODEL_REVISION}/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
    sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
    bytes: 491400032
};

const builds: Record<string, [string, number, string]> = {
    "win32-x64": ["win-cpu-x64.zip", 24156518, "f805935dec8a6f527bf3d587419865c1cf486ba6a430dc0381ca97aedf0da034"],
    "win32-arm64": ["win-cpu-arm64.zip", 12781980, "9bfdb90329cd190c8286e5e53ed74391f8455c7cf7a6370725817440dd7ff085"],
    "darwin-x64": ["macos-x64.tar.gz", 11968728, "7fa0ffca7a0966ab408779481ca6ddf4552ab51c606661dd9b43450db5fa2523"],
    "darwin-arm64": ["macos-arm64.tar.gz", 16236017, "f24acd73f63f6c54b02dcee483c6d30d71b7b732e216c9215a932268e5c7d6f4"],
    "linux-x64": ["ubuntu-x64.tar.gz", 22423573, "5f6e72e772a1264df279d6b7a848570fdc00e5d968b72e7a917d19e07da96400"],
    "linux-arm64": ["ubuntu-arm64.tar.gz", 18123932, "7df930178fc4a97306839a0a004d81b8752787ca42170269f87871c52610d9d0"]
};

export function runtimeArtifact(platform = process.platform, arch = process.arch): Artifact | undefined {
    const entry = builds[`${platform}-${arch}`];
    return entry && {
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${RUNTIME_VERSION}/llama-${RUNTIME_VERSION}-bin-${entry[0]}`,
        bytes: entry[1], sha256: entry[2]
    };
}

export function executableRelativePath(platform = process.platform) {
    return platform === "win32" ? "runtime/llama-server.exe" : `runtime/llama-${RUNTIME_VERSION}/llama-server`;
}

export type Language = "auto" | "fr" | "en";

export function completionPrompt(prefix: string, language: Language) {
    const instruction = language === "fr" ? "Continue in French." : language === "en" ? "Continue in English." : "Keep the same language as the draft.";
    // Quotes delimit data; model output is never executed and can only become a user-accepted suffix.
    return "<|im_start|>system\nYou autocomplete short chat messages. Return ONLY the next 2 to 8 words, never repeat the draft, never answer the message, never explain. "
        + instruction + "<|im_end|>\n"
        + "<|im_start|>user\nDraft: Je te souhaite une\nContinuation:<|im_end|>\n<|im_start|>assistant\n excellente journée !<|im_end|>\n"
        + "<|im_start|>user\nDraft: Thanks for your\nContinuation:<|im_end|>\n<|im_start|>assistant\n help today!<|im_end|>\n"
        + `<|im_start|>user\nDraft: ${prefix.replace(/<\|/g, "< | ")}\nContinuation:<|im_end|>\n<|im_start|>assistant\n`;
}

export function cleanCompletion(value: unknown, prefix: string): string {
    if (typeof value !== "string") return "";
    let text = value.split(/\r?\n|<\||\[INST\]/, 1)[0].replace(/[\u0000-\u001f\u007f]/g, "");
    if (/^(?:Draft|Continuation|Assistant|User|System|Brouillon|Suite)\s*:/i.test(text.trim())) return "";
    if (text.trimStart().startsWith(prefix.trim())) text = text.trimStart().slice(prefix.trim().length);
    if (/^[\s"'`]+$/.test(text)) return "";
    text = text.split(/(\s+)/).slice(0, 16).join("").slice(0, 160);
    // The chat-template tokenizer may eat a leading space: restore the word boundary.
    if (/[^\s'’-]$/.test(prefix) && /^[\p{L}\p{N}]/u.test(text)) text = ` ${text}`;
    if (/[\s'’-]$/.test(prefix)) text = text.trimStart();
    return text;
}
