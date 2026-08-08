/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    addBadgeVisibilityListener,
    BadgeSource,
    getOwnHiddenBadgeSources,
    removeBadgeVisibilityListener,
    setOwnHiddenBadgeSources
} from "@api/BadgeVisibility";
import { t } from "@api/i18n";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { React, useState } from "@webpack/common";

const BADGE_OPTIONS: Array<{ label: string; value: BadgeSource; }> = [
    { label: "Vencord", value: "vencord" },
    { label: "Equicord", value: "equicord" },
    { label: "Midnightcord", value: "midnightcord" },
    { label: "GlobalBadges", value: "globalbadges" },
    { label: "Illegalcord", value: "illegalcord" }
];

function PrivacyTab() {
    const [hidden, setHidden] = useState<BadgeSource[]>(getOwnHiddenBadgeSources());

    React.useEffect(() => {
        const listener = () => setHidden([...getOwnHiddenBadgeSources()]);
        addBadgeVisibilityListener(listener);
        return () => removeBadgeVisibilityListener(listener);
    }, []);

    async function onChange(next: BadgeSource[]) {
        setHidden(next);
        await setOwnHiddenBadgeSources(next);
    }

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>{t("Privacy")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Midnightcord cloud synchronization and background data sharing are disabled in this build.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom20}>
                {t("These preferences stay on this device. Use Backup & Restore to transfer them manually.")}
            </Notice.Info>

            <Divider className={Margins.bottom20} />

            <Heading className={Margins.bottom8}>{t("Hidden Badge Sources")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which badge sources to hide on your own profile. This choice is stored locally only.")}
            </Paragraph>

            <SafeSearchableSelect
                multi
                closeOnSelect={false}
                options={BADGE_OPTIONS}
                value={hidden}
                placeholder={t("None hidden")}
                onChange={onChange}
            />
        </SettingsTab>
    );
}

export default wrapTab(PrivacyTab, "Privacy");
