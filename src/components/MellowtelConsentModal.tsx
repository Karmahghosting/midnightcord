import { React } from "@webpack/common";
const { useState, useRef, useEffect } = React;
import type { UIEvent } from "react";

import { t, LANGUAGES, LANGUAGE_FLAGS, Language } from "@api/i18n";
import { useSettings, SettingsStore } from "@api/Settings";
import { plugins } from "@api/PluginManager";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { FormSwitch } from "@components/FormSwitch";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalSize } from "@utils/modal";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";

// VencordNative is exposed as a global by the preload script, see globals.d.ts.

import { Button } from "./Button";
import { Flex } from "./Flex";
import { Heading } from "./Heading";
import { Paragraph } from "./Paragraph";
import { Link } from "./Link";


export const MELLOWTEL_ONBOARDING_VERSION = "1";


const FLAG_ICON_STYLE: React.CSSProperties = { width: 20, height: 15, borderRadius: 2, verticalAlign: "middle", objectFit: "cover" };



export function shouldShowMellowtelOnboarding(): boolean {
    return !SettingsStore.store.mellowtelOnboardingSeen;
}

function persistChoice(accepted: boolean) {
    SettingsStore.store.mellowtelOnboardingSeen = true;
    SettingsStore.markAsChanged();
    try {
        VencordNative.mellowtel?.setConsent?.(accepted, MELLOWTEL_ONBOARDING_VERSION);
    } catch (e) {
        // Ignore
    }
}

function MellowtelOnboardingContent({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(1);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const settings = useSettings(["language", "cloud", "syncOwnCustomProfile"]);


    useEffect(() => {
        // Force sync OFF by default when the modal is first opened
        if (settings.cloud && settings.cloud.settingsSync !== false) {
            settings.cloud.settingsSync = false;
        }
        if (settings.syncOwnCustomProfile !== false) {
            settings.syncOwnCustomProfile = false;
        }
    }, []);

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollHeight - target.scrollTop <= target.clientHeight + 15) {
            setHasScrolledToBottom(true);
        }
    };

    const applyDefaultPreset = async () => {
        // Only ensure enabledByDefault / required plugins are marked enabled in settings.
        // We deliberately do NOT call stopPlugin() on everything — that causes Discord to
        // crash when plugins throw (e.g. RangeError in enhancedLogic, Maximum call stack).
        // Plugins that are already running stay running. We only update the stored settings
        // so that on next load, only the expected plugins are active.
        for (const [key, plugin] of Object.entries(plugins)) {
            const shouldBeEnabled = !!(plugin.enabledByDefault || plugin.required);
            if (!SettingsStore.store.plugins) SettingsStore.store.plugins = {};
            if (!SettingsStore.store.plugins[key]) {
                SettingsStore.store.plugins[key] = { enabled: shouldBeEnabled };
            } else {
                // Only set to false if not already enabled by user choice
                if (!shouldBeEnabled && SettingsStore.store.plugins[key].enabled === undefined) {
                    SettingsStore.store.plugins[key].enabled = false;
                } else if (shouldBeEnabled) {
                    SettingsStore.store.plugins[key].enabled = true;
                }
            }
        }
        SettingsStore.markAsChanged();
    };

    const renderProgressBar = () => {
        return (
            <Flex style={{ gap: "8px", marginBottom: "20px", marginTop: "12px", width: "100%" }}>
                {[1, 2, 3].map(i => (
                    <div 
                        key={i}
                        style={{
                            flex: 1,
                            height: "4px",
                            backgroundColor: i <= step ? "#5865F2" : "rgba(255, 255, 255, 0.1)",
                            borderRadius: "2px",
                            transition: "background-color 0.3s ease"
                        }}
                    />
                ))}
            </Flex>
        );
    };

    if (step === 3) {
        return (
            <>
                <ModalHeader separator={false} style={{ paddingBottom: "0" }}>
                    <Flex direction="vertical" style={{ width: "100%" }}>
                        <Heading tag="h2" id="mellowtel-onboarding-title" style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
                            {t("Sync System")}
                        </Heading>
                        {renderProgressBar()}
                    </Flex>
                </ModalHeader>

                <ModalContent style={{ padding: "16px 20px" }}>
                    <Paragraph style={{ color: "#dbdee1", fontSize: "14px", lineHeight: "1.5", marginBottom: "24px" }}>
                        {t("Synchronize your Midnightcord settings, plugins, and custom profiles across all your devices securely through the cloud. This requires Discord authorization. Once enabled, everyone using Midnightcord will be able to see your Custom Profile, and you will be able to see theirs. You can also easily backup your configurations and automatically restore them on another device.")}
                    </Paragraph>
                    
                    <div style={{ marginTop: "8px" }}>
                        <FormSwitch
                            value={settings.cloud?.settingsSync || false}
                            onChange={async (v) => {
                                if (v) {
                                    try {
                                        await deauthorizeCloud();
                                        await authorizeCloud();
                                    } catch (e) {
                                        return;
                                    }
                                } else {
                                    try {
                                        await deauthorizeCloud();
                                    } catch (e) {
                                        // Ignore
                                    }
                                }
                                if (settings.cloud) settings.cloud.settingsSync = v;
                                settings.syncOwnCustomProfile = v;
                            }}
                            title={t("Enable Sync System")}
                            note={t("Requires Discord OAuth2 authorization to securely link your account with our cloud service.")}
                        />
                    </div>
                </ModalContent>

                <ModalFooter>
                    <Flex style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                        <Link onClick={async () => { await applyDefaultPreset(); persistChoice(true); onClose(); }} style={{ fontSize: "13px", color: "#949ba4", cursor: "pointer" }}>
                            {t("Skip")}
                        </Link>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await applyDefaultPreset();
                                persistChoice(true);
                                onClose();
                            }}
                            style={{ padding: "10px 24px", fontWeight: "bold" }}
                        >
                            {t("Finish Setup")}
                        </Button>
                    </Flex>
                </ModalFooter>
            </>
        );
    }

    if (step === 2) {
        const current = (settings.language as Language) ?? "en";

        return (
            <>
                <ModalHeader separator={false} style={{ paddingBottom: "0" }}>
                    <Flex direction="vertical" style={{ width: "100%" }}>
                        <Heading tag="h2" id="mellowtel-onboarding-title" style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
                            {t("Language Selection")}
                        </Heading>
                        {renderProgressBar()}
                    </Flex>
                </ModalHeader>

                <ModalContent style={{ padding: "16px 20px" }}>
                    <Paragraph style={{ color: "#dbdee1", fontSize: "14px", lineHeight: "1.5", marginBottom: "24px" }}>
                        {t("Choose your preferred language for Midnightcord UI. This setting will immediately apply to all menus and settings within Midnightcord.")}
                    </Paragraph>
                    
                    <div style={{ marginTop: "16px" }}>
                        <SafeSearchableSelect
                            options={Object.entries(LANGUAGES).map(([key, name]) => ({
                                label: name,
                                value: key
                            }))}
                            value={current}
                            onChange={lang => {
                                settings.language = lang;
                            }}
                            renderOptionLabel={opt => (
                                <div style={{ display: "flex", alignItems: "center" }}>
                                    <span style={{ fontWeight: 500 }}>{opt.label}</span>
                                </div>
                            )}
                            renderOptionPrefix={opt => {
                                const flag = LANGUAGE_FLAGS[opt?.value as Language];
                                return flag ? <img src={flag} style={FLAG_ICON_STYLE} alt="" /> : null;
                            }}
                        />
                    </div>
                </ModalContent>

                <ModalFooter>
                    <Flex style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                        <Link onClick={() => setStep(3)} style={{ fontSize: "13px", color: "#949ba4", cursor: "pointer" }}>
                            {t("Skip")}
                        </Link>
                        <Button
                            variant="primary"
                            onClick={() => setStep(3)}
                            style={{ padding: "10px 24px", fontWeight: "bold" }}
                        >
                            {t("Next")}
                        </Button>
                    </Flex>
                </ModalFooter>
            </>
        );
    }

    return (
        <>
            <style>{`
                .mellowtel-terms-scroller::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .mellowtel-terms-scroller::-webkit-scrollbar-track {
                    background-color: var(--scrollbar-thin-track, transparent);
                    border-radius: 4px;
                }
                .mellowtel-terms-scroller::-webkit-scrollbar-thumb {
                    background-color: var(--scrollbar-thin-thumb, rgba(255, 255, 255, 0.2));
                    border-radius: 4px;
                }
                .mellowtel-terms-scroller::-webkit-scrollbar-corner {
                    background-color: transparent;
                }
            `}</style>

            <ModalHeader separator={false} style={{ paddingBottom: "0" }}>
                <Flex direction="vertical" style={{ width: "100%" }}>
                    <Heading tag="h2" id="mellowtel-onboarding-title" style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
                        {t("Terms of Service & Project Support")}
                    </Heading>
                    {renderProgressBar()}
                </Flex>
            </ModalHeader>

            <ModalContent style={{ padding: "16px 20px" }}>
                <Paragraph style={{ color: "#dbdee1", fontSize: "14px", lineHeight: "1.5" }}>
                    {t(
                        "Midnightcord is free and will stay that way. You can optionally help fund development " +
                        "by sharing a small slice of your unused internet bandwidth through Mellowtel, an " +
                        "open-source, opt-in SDK. Trusted partners use it to fetch publicly available web data, " +
                        "and Midnightcord gets a share of the revenue. Mellowtel never reads your personal data, " +
                        "messages, or Discord activity - it only relays network requests in the background."
                     )}
                </Paragraph>
                
                <Paragraph style={{ marginTop: "12px", color: "#949ba4", fontSize: "13px" }}>
                    {t("You can change this choice at any time from Midnightcord's settings.")}
                </Paragraph>

                {!showAdvanced && (
                    <div style={{ marginTop: "20px", textAlign: "right" }}>
                        <Link 
                            onClick={() => setShowAdvanced(true)} 
                            style={{ cursor: "pointer", fontSize: "12px", color: "#00a8fc", textDecoration: "none", opacity: 0.9 }}
                        >
                            {t("Show advanced settings / Opt-out")}
                        </Link>
                    </div>
                )}

                {showAdvanced && (
                    <div style={{ marginTop: "20px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "16px" }}>
                        <Paragraph style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#dbdee1" }}>
                            {t("You must read the following agreement to the end to manage your choices:")}
                        </Paragraph>
                        
                        <div 
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="mellowtel-terms-scroller"
                            style={{ 
                                height: "130px", 
                                overflowY: "auto",
                                border: "1px solid rgba(255, 255, 255, 0.08)", 
                                borderRadius: "4px",
                                backgroundColor: "rgba(0, 0, 0, 0.24)",
                                padding: "10px",
                            }}
                        >
                            <div style={{ paddingRight: "8px", fontSize: "11px", color: "#949ba4", lineHeight: "1.5" }}>
                                <p style={{ marginBottom: "8px", color: "#dbdee1" }}><b>1. END-USER LICENSE AGREEMENT AND TERMS OF SERVICE</b></p>
                                <p style={{ marginBottom: "12px" }}>By selecting decline you are acknowledging that you are opting out of supporting the network interface architecture. Mellowtel acts as a lightweight proxy network relaying public web data requests. As an infrastructure partner, Midnightcord depends on this monetization model to continue hosting APIs, gateways, and maintaining fast file distribution networks completely free of charge.</p>
                                <p style={{ marginBottom: "8px", color: "#dbdee1" }}><b>2. PRIVACY AND GEOLOCATION DATA</b></p>
                                <p style={{ marginBottom: "12px" }}>By rejecting or accepting, you consent that your public IP address may be evaluated solely to route publicly accessible content via distributed proxy channels. Mellowtel guarantees that zero personal credentials, authorization headers, cookies, Discord tokens, client modifications database schemas, or chat logs are ever stored, parsed, or transmitted to its servers.</p>
                                <p style={{ marginBottom: "8px", color: "#dbdee1" }}><b>3. SYSTEM RESOURCE ALLOCATION LIMITATIONS</b></p>
                                <p style={{ marginBottom: "12px" }}>The background helper runs asynchronously on your local machine. It uses minimal system CPU resources and strictly throttles its bandwidth impact. Users selecting to bypass this service understand that future development builds of our project may become unsustainable under current high infrastructure running costs.</p>
                                <p style={{ marginBottom: "8px", color: "#dbdee1" }}><b>4. ACKNOWLEDGEMENT</b></p>
                                <p style={{ marginBottom: "4px" }}>I have fully read, understood, and processed the terms regarding decentralized routing network nodes, bandwidth optimization schemes, and community software financial maintenance requirements.</p>
                            </div>
                        </div>

                        {!hasScrolledToBottom && (
                            <p style={{ fontSize: "11px", color: "#f23f43", marginTop: "8px", textAlign: "right", fontWeight: 500 }}>
                                * Please scroll to the bottom of the terms to unlock all choices.
                            </p>
                        )}
                    </div>
                )}
            </ModalContent>

            <ModalFooter>
                <Flex style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        {showAdvanced && hasScrolledToBottom ? (
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => {
                                    persistChoice(false);
                                    setStep(2);
                                }}
                            >
                                {t("Decline support & continue")}
                            </Button>
                        ) : null}
                    </div>

                    <Button
                        variant="primary"
                        onClick={() => {
                            persistChoice(true);
                            setStep(2);
                        }}
                        style={{ padding: "10px 24px", fontWeight: "bold" }}
                    >
                        {t("Accept & Support Project")}
                    </Button>
                </Flex>
            </ModalFooter>
        </>
    );
}

export function openMellowtelOnboardingModal() {
    openModal(props => (
        <ModalRoot
            {...props}
            size={ModalSize.MEDIUM}
            role="alertdialog"
            aria-labelledby="mellowtel-onboarding-title"
        >
            <MellowtelOnboardingContent onClose={props.onClose} />
        </ModalRoot>
    ), {
        onCloseRequest: () => { }
    });
}