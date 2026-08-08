/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Link } from "@components/Link";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { wordsFromCamel, wordsToTitle } from "@utils/text";
import { DefinedSettings, PluginOptionBase } from "@utils/types";
import { PropsWithChildren } from "react";
import React from "react";
import { tPlugin } from "@api/pluginI18n";

export const cl = classNameFactory("vc-plugins-setting-");

export const TUTORIAL_CACHE = new Map<string, boolean>();

export enum SearchStatus {
    ALL,
    ENABLED,
    DISABLED,
    MIDNIGHTCORD,
    OTHERS,
    VENCORD,
    NEW,
    USER_PLUGINS,
    API_PLUGINS,
    TUTORIAL,
    LIKED_PLUGINS
}

interface SettingBaseProps<T> {
    option: T;
    onChange(newValue: any): void;
    pluginSettings: {
        [setting: string]: any;
        enabled: boolean;
    };
    id: string;
    definedSettings?: DefinedSettings;
}

export type SettingProps<T extends PluginOptionBase> = SettingBaseProps<T>;
export type ComponentSettingProps<T extends Omit<PluginOptionBase, "description" | "placeholder">> = SettingBaseProps<T>;

export function resolveError(isValidResult: boolean | string) {
    if (typeof isValidResult === "string") return isValidResult;

    return isValidResult ? null : "Invalid input provided";
}

interface SettingsSectionProps extends PropsWithChildren {
    name: string;
    description: string;
    error?: string | null;
    inlineSetting?: boolean;
    tag?: "label" | "div";
}

export function SettingsSection({ tag: Tag = "div", name, description, error, inlineSetting, children }: SettingsSectionProps) {
    const renderDescription = (text: string) => {
        // Ajoute http:// si absent pour la regex et le lien
        const urlRegex = /(https?:\/\/[^\s)]+|console\.groq\.com\/[^\s)]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                const href = part.startsWith("http") ? part : `https://${part}`;
                return <Link key={i} href={href} style={{ color: "var(--text-link)", textDecoration: "underline" }}>{part}</Link>;
            }
            return part;
        });
    };

    return (
        <Tag className={cl("section")}>
            <div className={classes(cl("content"), inlineSetting && cl("inline"))}>
                <div className={cl("label")}>
                    {name && <BaseText className={cl("title")} size="md" weight="medium" style={{ color: "#fff" }}>{tPlugin(wordsToTitle(wordsFromCamel(name)))}</BaseText>}
                    {description && <BaseText className={cl("description")} size="sm" style={{ color: "#fff" }}>{renderDescription(tPlugin(description))}</BaseText>}
                </div>
                {children}
            </div>
            {error && <BaseText className={cl("error")} size="sm" style={{ color: "#FF5C5C" }}>{error}</BaseText>}
        </Tag>
    );
}
