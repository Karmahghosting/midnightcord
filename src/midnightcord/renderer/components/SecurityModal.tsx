/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Flex, Heading, Paragraph } from "@components";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot } from "@utils/modal";
import { React } from "@webpack/common";

type ModalProps = { transitionState: any; onClose(): void; };

function WarningIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M12 2L1 21h22L12 2z" fill="#f5a623" stroke="#f5a623" strokeWidth="0" />
            <path d="M12 2L1 21h22L12 2z" fill="none" stroke="#e08c00" strokeWidth="1" />
            <text x="12" y="17.5" textAnchor="middle" fill="#1a1a1a" fontSize="11" fontWeight="bold" fontFfriendly="sans-serif">!</text>
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginRight: "6px", verticalAlign: "middle" }}>
            <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5L12 2z" fill="#5865f2" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function SecurityModal(props: ModalProps) {
    const { onClose } = props;
    const [timeLeft, setTimeLeft] = React.useState(5);
    const canClose = timeLeft === 0;

    React.useEffect(() => {
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft]);

    return (
        <ModalRoot {...props} size="medium">
            <ModalHeader separator={false} style={{ paddingTop: "20px", paddingBottom: "4px" }}>
                <Flex direction={Flex.Direction.VERTICAL} align={Flex.Align.CENTER} style={{ width: "100%", gap: "8px" }}>
                    <WarningIcon />
                    <Heading level={2} variant="heading-xl/semibold" style={{ textAlign: "center" }}>
                        Important Security Reminder
                    </Heading>
                </Flex>
            </ModalHeader>
            <ModalContent style={{ padding: "16px 24px" }}>
                <div style={{
                    background: "rgba(240, 71, 71, 0.07)",
                    border: "1px solid rgba(240, 71, 71, 0.3)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                    marginBottom: "16px"
                }}>
                    <Paragraph style={{ fontWeight: "bold", marginBottom: "6px", color: "var(--text-normal)" }}>
                        NightCordFr is a 100% Free product.
                    </Paragraph>
                    <Paragraph style={{ color: "var(--text-muted)" }}>
                        If you paid to obtain this application, you have been the victim of a <strong style={{ color: "var(--text-danger)" }}>scam</strong>. We never request money for access to our core services.
                    </Paragraph>
                </div>

                <div style={{
                    background: "rgba(88, 101, 242, 0.07)",
                    border: "1px solid rgba(88, 101, 242, 0.3)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                    marginBottom: "16px"
                }}>
                    <Flex align={Flex.Align.CENTER} style={{ marginBottom: "10px" }}>
                        <ShieldIcon />
                        <Heading level={3} variant="heading-md/semibold">Official Team</Heading>
                    </Flex>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: "6px", color: "var(--text-normal)" }}>
                            <strong>owner:</strong> ahki__
                        </li>
                        <li style={{ color: "var(--text-normal)" }}>
                            <strong>Support &amp; Community:</strong>{" "}
                            <span
                                style={{ color: "var(--text-link)", cursor: "pointer" }}
                                onClick={() => VencordNative.native.openExternal("https://discord.gg/nightcord")}
                            >
                                discord.gg/nightcord
                            </span>
                        </li>
                    </ul>
                </div>

                <div style={{
                    borderTop: "1px solid var(--background-modifier-accent)",
                    paddingTop: "12px"
                }}>
                    <Paragraph style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px" }}>
                        <strong>Note:</strong> Only download NightCordFr via our official channels to ensure your security.
                    </Paragraph>
                </div>
            </ModalContent>
            <ModalFooter style={{ justifyContent: "flex-end" }}>
                <Button
                    variant={canClose ? "primary" : "secondary"}
                    disabled={!canClose}
                    onClick={onClose}
                    style={{ minWidth: "110px" }}
                >
                    {canClose ? "OK" : `OK (${timeLeft}s)`}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
