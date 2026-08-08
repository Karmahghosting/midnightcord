/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { copyWithToast } from "@utils/discord";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { Button, React } from "@webpack/common";
import { t } from "../../../midnightcordplugins/autoTranslateMidnightcord";

interface CryptoConfig {
    label: string;
    symbol: string;
    address: string;
    color: string;
    Icon: React.ComponentType;
}

function BtcIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#F7931A"/>
            <path d="M22.68 13.06c.33-2.22-1.36-3.41-3.67-4.21l.75-3.01-1.83-.46-.73 2.93c-.48-.12-.97-.23-1.46-.35l.74-2.96-1.83-.46-.75 3.01c-.4-.09-.79-.18-1.18-.27l-2.53-.63-.49 1.96s1.36.31 1.33.33c.74.19.88.68.85 1.07l-.85 3.42c.05.01.12.04.2.08l-.2-.05-1.19 4.79c-.09.23-.33.58-.85.45.02.03-1.33-.33-1.33-.33l-.91 2.11 2.39.6c.44.11.88.23 1.31.34l-.76 3.06 1.83.46.75-3.01c.5.14.98.26 1.46.38l-.75 3.01 1.83.46.76-3.05c3.13.59 5.48.35 6.47-2.48.8-2.28-.04-3.6-1.68-4.46 1.19-.28 2.09-1.06 2.33-2.68zm-4.17 5.86c-.57 2.28-4.41 1.05-5.65.74l1.01-4.04c1.24.31 5.23.93 4.64 3.3zm.57-5.9c-.52 2.07-3.72.96-4.75.71l.91-3.67c1.03.26 4.37.74 3.84 2.96z" fill="#FFF"/>
        </svg>
    );
}

function EthIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#627EEA"/>
            <path d="M16 4v8.87l7.5 3.35L16 4z" fill="#FFF" fillOpacity="0.6"/>
            <path d="M16 4L8.5 16.22 16 12.87V4z" fill="#FFF"/>
            <path d="M16 21.96v6.04l7.5-10.46L16 21.96z" fill="#FFF" fillOpacity="0.6"/>
            <path d="M16 28v-6.04L8.5 17.54 16 28z" fill="#FFF"/>
            <path d="M16 20.56l7.5-4.34L16 12.87v7.69z" fill="#FFF" fillOpacity="0.2"/>
            <path d="M8.5 16.22l7.5 4.34v-7.69l-7.5 4.35z" fill="#FFF" fillOpacity="0.6"/>
        </svg>
    );
}

function SolIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#14F195"/>
            <path d="M10.12 19.34a.45.45 0 01.32-.13h11.75a.23.23 0 01.16.39l-2.07 2.07a.45.45 0 01-.32.13H8.21a.23.23 0 01-.16-.39l2.07-2.07zM10.12 10.2a.45.45 0 01.32-.13h11.75a.23.23 0 01.16.39l-2.07 2.07a.45.45 0 01-.32.13H8.21a.23.23 0 01-.16-.39l2.07-2.07zM21.88 14.77a.45.45 0 01-.32.13H9.81a.23.23 0 01-.16-.39l2.07-2.07a.45.45 0 01.32-.13h11.75a.23.23 0 01.16.39l-2.07 2.07z" fill="#000"/>
        </svg>
    );
}

const CRYPTO_LIST: CryptoConfig[] = [
    {
        label: "Bitcoin",
        symbol: "BTC",
        address: "bc1qaw2rykpexk69grqgn0ssuyzfh7fgs846sz3tct",
        color: "#F7931A",
        Icon: BtcIcon
    },
    {
        label: "Ethereum",
        symbol: "ETH",
        address: "0xf03a7117cB6cA2874b7296e386438A073e3227a5",
        color: "#627EEA",
        Icon: EthIcon
    },
    {
        label: "Solana",
        symbol: "SOL",
        address: "8QUDWumpDpTiUL7iVKe6WD5CeAfBwtdSeZWUQrNBaKG",
        color: "#14F195",
        Icon: SolIcon
    }
];

function CryptoCard({ crypto }: { crypto: CryptoConfig }) {
    const [copied, setCopied] = React.useState(false);
    const { Icon } = crypto;

    const handleCopy = () => {
        copyWithToast(crypto.address, t("Successfully copied address!"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            onClick={handleCopy}
            style={{
                position: "relative",
                padding: "14px 16px",
                marginBottom: "12px",
                cursor: "pointer",
                borderRadius: "10px",
                background: "#2b2d31",
                border: copied ? `1px solid ${crypto.color}` : "1px solid #1e1f22",
                transition: "all 0.15s ease",
                overflow: "hidden"
            }}
            onMouseEnter={e => {
                if (!copied) {
                    e.currentTarget.style.borderColor = `${crypto.color}80`;
                }
            }}
            onMouseLeave={e => {
                if (!copied) {
                    e.currentTarget.style.borderColor = "#1e1f22";
                }
            }}
        >
            <Flex align={Flex.Align.CENTER} justify={Flex.Justify.BETWEEN} style={{ marginBottom: "8px" }}>
                <Flex align={Flex.Align.CENTER} gap="10px">
                    <Icon />
                    <div>
                        <span style={{ fontWeight: "bold", fontSize: "14px", color: "#ffffff" }}>{crypto.label}</span>
                        <span style={{ fontSize: "11px", color: "#b5bac1", marginLeft: "6px" }}>({crypto.symbol})</span>
                    </div>
                </Flex>
                <div style={{
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    backgroundColor: copied ? "#23a55a" : "#1e1f22",
                    color: copied ? "#ffffff" : "#dbdee1",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                }}>
                    {copied ? (
                        <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            {t("Copied!")}
                        </>
                    ) : (
                        t("Click to copy")
                    )}
                </div>
            </Flex>

            <div style={{
                backgroundColor: "#1e1f22",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "var(--font-code, monospace)",
                color: "#ffffff",
                wordBreak: "break-all",
                display: "flex",
                alignItems: "center",
                justify: "space-between"
            }}>
                <span style={{ color: "#ffffff" }}>{crypto.address}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b5bac1" strokeWidth="2" style={{ marginLeft: "8px", flexShrink: 0, opacity: 0.8 }}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </div>
        </div>
    );
}

export function ContributeModal(props: ModalProps) {
    const { onClose } = props;
    return (
        <ModalRoot {...props} size="medium">
            <ModalHeader separator={false} style={{ paddingTop: "24px", paddingBottom: "12px" }}>
                <Flex direction={Flex.Direction.VERTICAL} align={Flex.Align.CENTER} style={{ width: "100%" }}>
                    <Heading level={2} variant="heading-xl/bold" style={{ color: "#ffffff" }}>
                        {t("Support Midnightcord Project")}
                    </Heading>
                    <Paragraph style={{ textAlign: "center", color: "#dbdee1", fontSize: "13px", marginTop: "6px", maxWidth: "440px", lineHeight: "1.4" }}>
                        {t("Midnightcord is an independently developed project. Your donations directly contribute to server maintenance, developing new features, and ongoing updates.")}
                    </Paragraph>
                </Flex>
            </ModalHeader>

            <ModalContent style={{ padding: "16px 24px 24px 24px" }}>
                <div style={{ marginBottom: "10px", fontWeight: "bold", fontSize: "12px", textTransform: "uppercase", color: "#b5bac1", letterSpacing: "0.5px" }}>
                    {t("Crypto Donations")}
                </div>

                {CRYPTO_LIST.map(crypto => (
                    <CryptoCard key={crypto.symbol} crypto={crypto} />
                ))}

                <div style={{
                    marginTop: "16px",
                    padding: "12px",
                    borderRadius: "8px",
                    background: "#2b2d31",
                    border: "1px solid #1e1f22",
                    textAlign: "center"
                }}>
                    <Paragraph size="xs" style={{ fontSize: "12px", margin: 0, color: "#dbdee1" }}>
                        {t("Thank you for supporting the Midnightcord project!")}
                    </Paragraph>
                </div>
            </ModalContent>

            <ModalFooter style={{ borderTop: "1px solid var(--background-modifier-accent)", padding: "14px 24px" }}>
                <Flex direction={Flex.Direction.HORIZONTAL} justify={Flex.Justify.END} style={{ width: "100%" }}>
                    <Button
                        color={Button.Colors.BRAND}
                        onClick={onClose}
                        look={Button.Looks.FILLED}
                        style={{ padding: "0 28px", borderRadius: "4px" }}
                    >
                        {t("Close")}
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}
