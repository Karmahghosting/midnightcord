/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { downloadSettingsBackup, uploadSettingsBackup } from "@api/SettingsSync/offline";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { React } from "@webpack/common";
import { t } from "@api/i18n";

function BackupAndRestoreTab() {
    return (
        <SettingsTab>
            <Heading className={Margins.top16}>{t("Backup & Restore")}</Heading>
            <Paragraph className={Margins.bottom20}>
                {t("Import and export your Midnightcord settings as a JSON file. This allows you to easily transfer your settings to another device, or recover them after reinstalling Midnightcord or Discord.")}
            </Paragraph>

            <Notice.Warning className={Margins.bottom20}>
                {t("Sensitive data (API keys, tokens, custom uploader credentials) are automatically excluded from exports for your security.")}
            </Notice.Warning>

            <Notice.Warning className={Margins.bottom20}>
                {t("Importing a settings file will overwrite your current settings. Make sure to export a backup first if you want to keep your current configuration.")}
            </Notice.Warning>

            <Heading>{t("What is included in a backup")}</Heading>
            <Paragraph className={Margins.bottom20}>
                {t("Custom QuickCSS, Theme Links, Plugin Settings, DataStore Data")}
            </Paragraph>

            <Divider className={Margins.bottom20} />

            <Heading>{t("Import Settings")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Select a previously exported settings file to restore your configuration.")}
            </Paragraph>

            <Flex gap="8px" className={Margins.bottom20} style={{ flexWrap: "wrap" }}>
                <Button onClick={() => uploadSettingsBackup("all")} size="small" variant="secondary">
                    {t("Import All Settings")}
                </Button>
                <Button onClick={() => uploadSettingsBackup("plugins")} size="small">
                    {t("Import Plugins Only")}
                </Button>
                <Button onClick={() => uploadSettingsBackup("css")} size="small">
                    {t("Import QuickCSS")}
                </Button>
                <Button onClick={() => uploadSettingsBackup("datastore")} size="small">
                    {t("Import DataStore")}
                </Button>
            </Flex>

            <Divider className={Margins.bottom20} />

            <Heading>{t("Export Settings")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Download your current settings as a backup file.")}
            </Paragraph>

            <Flex gap="8px" style={{ flexWrap: "wrap" }}>
                <Button onClick={() => downloadSettingsBackup("all")} size="small" variant="secondary">
                    {t("Export All Settings")}
                </Button>
                <Button onClick={() => downloadSettingsBackup("plugins")} size="small">
                    {t("Export Plugins")}
                </Button>
                <Button onClick={() => downloadSettingsBackup("css")} size="small">
                    {t("Export QuickCSS")}
                </Button>
                <Button onClick={() => downloadSettingsBackup("datastore")} size="small">
                    {t("Export DataStore")}
                </Button>
            </Flex>
        </SettingsTab>
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
