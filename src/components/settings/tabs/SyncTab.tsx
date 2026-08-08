import {
    addBadgeVisibilityListener,
    BadgeSource,
    getOwnHiddenBadgeSources,
    removeBadgeVisibilityListener,
    setOwnHiddenBadgeSources,
} from "@api/BadgeVisibility";
import { useSettings } from "@api/Settings";
import { beginDiscordOAuth, checkOAuthToken, clearToken, getStoredToken, storeToken } from "@api/OAuth2";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";
import { deleteCloudSettings, eraseAllCloudData, getCloudSettings, putCloudSettings } from "@api/SettingsSync/cloudSync";

import { Button } from "@components/Button";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CloudUploadIcon, DeleteIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";

import { localStorage } from "@utils/localStorage";
import { Margins } from "@utils/margins";
import { openModal } from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { findComponentByCodeLazy } from "@webpack";
import { Alerts, React, useState, OAuth2AuthorizeModal } from "@webpack/common";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { t } from "@api/i18n";
import { ILLEGALCORD_ICON_DATA_URI } from "@api/illegalcord_base64";

const ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };
const MIDNIGHTCORD_ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };

const MIDNIGHTCORD_ICON_DATA_URI = "data:image/png;base64,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"

function MidnightcordIcon() {
    return <img src={MIDNIGHTCORD_ICON_DATA_URI} alt="Midnightcord" style={MIDNIGHTCORD_ICON_STYLE} />;
}

function EquicordIcon() {
    return <img src="https://equicord.org/assets/favicon.png" alt="Equicord" style={ICON_STYLE} />;
}

function VencordIcon() {
    return <img src="https://equicord.org/assets/icons/vencord/icon-light.png" alt="Vencord" style={ICON_STYLE} />;
}

function GlobalBadgesIcon() {
    return <img src="https://equicord.org/assets/icons/misc/userplugin.png" alt="GlobalBadges" style={ICON_STYLE} />;
}

function IllegalcordIcon() {
    return <img src={ILLEGALCORD_ICON_DATA_URI} alt="Illegalcord" style={ICON_STYLE} />;
}

const RefreshIcon = findComponentByCodeLazy("M4 12a8 8 0 0 1 14.93-4H15");
const TrashIcon = findComponentByCodeLazy("2.81h8.36a3");

function validateUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return "Invalid URL";
    }
}

const cloudBackendOptions = [
    { label: "Midnightcord Cloud", value: "https://api.nightcord.st/" },
    { label: "Equicord Cloud", value: "https://cloud.equicord.org/" },
    { label: "Vencord Cloud", value: "https://api.vencord.dev/" }
];

const syncDirectionOptions = [
    { label: "Two-way sync (changes go both directions)", value: "both" },
    { label: "This device is the source (upload only)", value: "push" },
    { label: "The cloud is the source (download only)", value: "pull" },
    { label: "Do not sync automatically (manual sync via buttons below only)", value: "manual" }
];

const BADGE_OPTIONS: Array<{ label: string; value: BadgeSource }> = [
    { label: "Midnightcord Badges", value: "midnightcord" },
    { label: "Equicord Badges", value: "equicord" },
    { label: "Vencord Badges", value: "vencord" },
    { label: "GlobalBadges", value: "globalbadges" },
    { label: "Illegalcord Badges", value: "illegalcord" },
];

function renderPrefix(option: { value: BadgeSource }) {
    switch (option.value) {
        case "midnightcord": return <MidnightcordIcon />;
        case "equicord": return <EquicordIcon />;
        case "vencord": return <VencordIcon />;
        case "globalbadges": return <GlobalBadgesIcon />;
        case "illegalcord": return <IllegalcordIcon />;
        default: return null;
    }
}

function CustomProfileSyncToggle() {
    const settings = useSettings();
    const [token, setToken] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let isMounted = true;
        getStoredToken().then(async t => {
            if (!isMounted) return;
            if (t) {
                const check = await checkOAuthToken(t);
                if (!isMounted) return;
                if (check?.valid) {
                    setToken(t);
                    settings.syncOwnCustomProfile = true;
                    settings.seeAllCustomProfile = true;
                } else {
                    await clearToken();
                    if (!isMounted) return;
                    settings.syncOwnCustomProfile = false;
                    settings.seeAllCustomProfile = false;
                }
            } else {
                settings.syncOwnCustomProfile = false;
                settings.seeAllCustomProfile = false;
            }
            setChecking(false);
        });
        return () => { isMounted = false; };
    }, []);

    const isEnabled = !!token;

    async function handleToggle(on: boolean) {
        if (busy) return;
        if (on) {
            setBusy(true);
            let oauthData: { url: string; redirectUri: string; scopes: string[]; clientId?: string; } | null = null;
            try {
                oauthData = await beginDiscordOAuth();
            } catch (e) {
                console.error("[CustomProfileSync] Failed to fetch OAuth config:", e);
                setBusy(false);
                return;
            }
            setBusy(false);

            let clientId = oauthData.clientId;
            if (!clientId) {
                try {
                    clientId = new URL(oauthData.url).searchParams.get("client_id") ?? undefined;
                } catch { }
            }
            if (!clientId) return;

            openModal(oauthProps => <OAuth2AuthorizeModal
                {...oauthProps}
                scopes={oauthData!.scopes}
                responseType="code"
                redirectUri={oauthData!.redirectUri}
                permissions={0n}
                clientId={clientId!}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) return;
                    try {
                        const res = await fetch(location, { headers: { Accept: "application/json" } });
                        const { token: newToken } = await res.json();
                        if (newToken) {
                            await storeToken(newToken);
                            setToken(newToken);
                            settings.syncOwnCustomProfile = true;
                            settings.seeAllCustomProfile = true;
                        }
                    } catch (e) {
                        console.error("[CustomProfileSync] OAuth callback failed:", e);
                    }
                }}
            />);
        } else {
            setBusy(true);
            await clearToken();
            setToken(null);
            settings.syncOwnCustomProfile = false;
            settings.seeAllCustomProfile = false;
            setBusy(false);
        }
    }

    if (checking) return null;

    return (
        <div style={{ marginBottom: 16 }}>
            <FormSwitch
                value={isEnabled}
                onChange={handleToggle}
                title={t("Midnightcord Sync")}
                description={isEnabled
                    ? t("Your custom profile is synced. Other Midnightcord users can see your profile, and you can see theirs.")
                    : t("Enable to share your custom profile with other Midnightcord users and see their profiles.")}
                disabled={busy}
            />

            {isEnabled && (
                <div style={{ marginTop: 4 }}>
                    <a role="button" onClick={async () => {
                        await clearToken();
                        setToken(null);
                        settings.syncOwnCustomProfile = false;
                        settings.seeAllCustomProfile = false;
                    }} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                        {t("Disconnect account")}
                    </a>
                </div>
            )}
        </div>
    );
}

function CloudIntegrationSection() {
    const settings = useSettings(["cloud.authenticated", "cloud.url", "cloud.settingsSync"]);
    const [inputKey, setInputKey] = useState(0);
    const forceUpdate = useForceUpdater();

    const { cloud } = settings;
    const isAuthenticated = cloud.authenticated;
    const syncEnabled = isAuthenticated && cloud.settingsSync;

    async function changeUrl(url: string) {
        cloud.url = url;
        cloud.authenticated = false;

        await deauthorizeCloud();
        await authorizeCloud();

        setInputKey(prev => prev + 1);
    }

    return (
        <>
            <Heading className={Margins.top16}>{t("Cloud Integration")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Midnightcord's cloud integration allows you to sync your settings across multiple devices and Discord installations. Your data is securely stored and can be easily restored at any time.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("We use our own Midnightcord Cloud backend with enhanced features.")}
                {" "}
                {t("View our privacy policy to see what we store and how we use your data.")}
            </Notice.Info>

            <FormSwitch
                title={t("Enable Cloud Integration")}
                description={t("Connect to the cloud backend for settings synchronization. This will request authorization if you haven't set up cloud integration yet.")}
                value={isAuthenticated}
                onChange={v => {
                    if (v)
                        authorizeCloud();
                    else
                        cloud.authenticated = v;
                }}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Cloud Backend")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which cloud backend to use for storing your settings.")}
            </Paragraph>

            <div className={Margins.bottom8}>
                <SafeSearchableSelect
                    options={cloudBackendOptions}
                    value={cloudBackendOptions.find(o => o.value === cloud.url)?.value}
                    onChange={v => changeUrl(v)}
                    closeOnSelect={true}
                    renderOptionPrefix={o => {
                        if (o?.value?.includes("midnightcord")) return <MidnightcordIcon />;
                        if (o?.value?.includes("equicord")) return <EquicordIcon />;
                        return <VencordIcon />;
                    }}
                />
            </div>

            <Flex gap="8px" alignItems="center">
                <div style={{ flex: 1 }}>
                    <CheckedTextInput
                        key={"backendUrl-" + inputKey}
                        value={cloud.url}
                        onChange={async v => {
                            cloud.url = v;
                            cloud.authenticated = false;
                            await deauthorizeCloud();
                        }}
                        validate={validateUrl}
                    />
                </div>
                <Button
                    disabled={!isAuthenticated}
                    onClick={async () => {
                        cloud.authenticated = false;
                        await deauthorizeCloud();
                        await authorizeCloud();
                    }}
                >
                    <Flex gap="8px" alignItems="center">
                        <RefreshIcon color="currentColor" />
                        {t("Reauthorize")}
                    </Flex>
                </Button>
            </Flex>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Settings Sync")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Synchronize your Midnightcord settings to the cloud. This makes it easy to keep your configuration consistent across multiple devices without manual import/export.")}
            </Paragraph>

            <FormSwitch
                title={t("Enable Settings Sync")}
                description={t("When enabled, your settings can be synced to and from the cloud. Use the actions below to manually sync.")}
                value={cloud.settingsSync}
                onChange={v => { cloud.settingsSync = v; }}
                disabled={!isAuthenticated}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Sync Rules for This Device")}</Heading>
            <Paragraph className={Margins.bottom16}>
                <span dangerouslySetInnerHTML={{ __html: t("This setting controls how settings move between <strong>this device</strong> and the cloud. You can let changes flow both ways, or choose one place to be the main source of truth.") }} />
            </Paragraph>

            <SafeSearchableSelect
                options={syncDirectionOptions}
                value={localStorage.Vencord_cloudSyncDirection ?? "both"}
                onChange={v => {
                    localStorage.Vencord_cloudSyncDirection = v;
                    forceUpdate();
                }}
                disabled={!syncEnabled}
                closeOnSelect={true}
            />

            <Flex gap="8px" className={Margins.top16}>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => putCloudSettings(true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudUploadIcon />
                        {t("Sync to Cloud")}
                    </Flex>
                </Button>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => getCloudSettings(true, true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudDownloadIcon />
                        {t("Sync from Cloud")}
                    </Flex>
                </Button>
            </Flex>

            {!isAuthenticated && (
                <Notice.Warning className={Margins.top8}>
                    {t("Enable cloud integration above to use settings sync features.")}
                </Notice.Warning>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Danger Zone")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Permanently delete all your data from the cloud. This action cannot be undone and will remove all synced settings and any other data stored on the cloud backend.")}
            </Paragraph>

            <Flex gap="8px">
                <Button
                    variant="dangerPrimary"
                    size="medium"
                    disabled={!syncEnabled}
                    onClick={() => deleteCloudSettings()}
                >
                    <Flex gap="8px" alignItems="center">
                        <TrashIcon color="currentColor" />
                        {t("Delete Cloud Settings")}
                    </Flex>
                </Button>
                <Button
                    variant="dangerSecondary"
                    size="medium"
                    disabled={!isAuthenticated}
                    onClick={() => Alerts.show({
                        title: t("Delete Cloud Account"),
                        body: t("Are you sure you want to permanently delete your cloud account and all associated data? This action cannot be undone."),
                        onConfirm: eraseAllCloudData,
                        confirmText: t("Delete Cloud Account"),
                        confirmColor: "vc-cloud-erase-data-danger-btn",
                        cancelText: t("Cancel")
                    })}
                >
                    <Flex gap="8px" alignItems="center">
                        <DeleteIcon />
                        {t("Delete Cloud Account")}
                    </Flex>
                </Button>
            </Flex>
        </>
    );
}

function SyncTab() {
    const [hidden, setHidden] = useState<BadgeSource[]>(getOwnHiddenBadgeSources());
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        const listener = () => setHidden([...getOwnHiddenBadgeSources()]);
        addBadgeVisibilityListener(listener);
        return () => removeBadgeVisibilityListener(listener);
    }, []);

    async function onChange(next: BadgeSource[]) {
        setHidden(next);
        setSaving(true);
        try {
            await setOwnHiddenBadgeSources(next);
        } finally {
            setSaving(false);
        }
    }

    return (
        <SettingsTab>
            <CustomProfileSyncToggle />

            <Divider className={Margins.bottom16} />

            <CloudIntegrationSection />

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.top16}>{t("Badges")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which badge sources to hide on your own profile. Selected sources disappear from your profile for everyone — including yourself — wherever it's viewed.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("This only affects your own profile. The first time you select a badge to hide, you'll be asked to sign in with Discord so your preference can be shared with others viewing your profile.")}
            </Notice.Info>

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.bottom8} style={{ fontSize: 14 }}>{t("Hidden Badge Sources")}</Heading>
            <div className={Margins.bottom8}>
                <SafeSearchableSelect
                    multi
                    closeOnSelect={false}
                    options={BADGE_OPTIONS}
                    value={hidden}
                    placeholder={t("None hidden")}
                    onChange={onChange}
                    renderOptionPrefix={renderPrefix}
                />
            </div>

            {saving && (
                <Paragraph className={Margins.top8} style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {t("Saving...")}
                </Paragraph>
            )}
        </SettingsTab>
    );
}

export default wrapTab(SyncTab, "Synchronization");

