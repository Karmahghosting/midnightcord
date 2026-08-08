/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, React } from "@webpack/common";

import Plugins from "~plugins";

function ApiKeyWarningModal({ pluginName, onClose }: { pluginName: string; onClose: () => void; }) {
    return (
        <ModalRoot transitionState={1 as any} size={ModalSize.SMALL}>
            <ModalHeader separator={false}>
                <span style={{ flexGrow: 1, fontSize: 20, fontWeight: 700, color: "#f2f3f5" }}>
                    API Key Required
                </span>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ padding: "8px 0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Warning row */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: "12px 14px",
                    }}>
                        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <path fill="#faa81a" d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
                        </svg>
                        <span style={{ fontSize: 14, color: "#dbdee1", lineHeight: 1.4 }}>
                            <strong style={{ color: "#f2f3f5" }}>{pluginName}</strong>
                            {" "}requires a Groq API Key to function.
                        </span>
                    </div>

                    <p style={{ fontSize: 14, color: "#b5bac1", lineHeight: 1.55, margin: 0 }}>
                        You only need to configure it once in the{" "}
                        <strong style={{ color: "#dbdee1" }}>MidnightcordAI</strong>
                        {" "}plugin settings. The key is shared across all plugins that use it.
                    </p>
                </div>
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
                    <Button
                        look={Button.Looks.LINK}
                        color={Button.Colors.PRIMARY}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        look={Button.Looks.FILLED}
                        color={Button.Colors.BRAND}
                        onClick={() => {
                            onClose();
                            const plugin = Plugins.MidnightcordAI;
                            if (plugin) openPluginModal(plugin);
                        }}
                    >
                        Open MidnightcordAI Settings
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function showApiKeyWarning(pluginName: string) {
    openModal(props => (
        <ApiKeyWarningModal pluginName={pluginName} onClose={props.onClose} />
    ));
}
