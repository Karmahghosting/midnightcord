/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import "./AddonCard.css";

import { Badge } from "@components/Badge";
import { BaseText } from "@components/BaseText";
import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { Tooltip, useRef } from "@webpack/common";
import type { ComponentType, MouseEventHandler, ReactNode } from "react";

const cl = classNameFactory("vc-addon-");

interface Props {
    name: ReactNode;
    description: ReactNode;
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    disabled?: boolean;
    isNew?: boolean;
    sourceBadge?: ReactNode;
    tooltip?: string;
    onMouseEnter?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;

    infoButton?: ReactNode;
    footer?: ReactNode;
    author?: ReactNode;
    iconType?: "midnightcord" | "other";
    customIcon?: ComponentType<any>;
}

export function AddonCard({ disabled, isNew, sourceBadge, tooltip, name, infoButton, footer, author, enabled, setEnabled, description, onMouseEnter, onMouseLeave, iconType, customIcon: CustomIcon }: Props) {
    const titleRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);

    return (
        <div
            className={cl("card", { "card-disabled": disabled })}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={cl("top-row")}>
                <div className={cl("title-group")}>
                    <div className={cl("icon")}>
                        {CustomIcon ? (
                            <CustomIcon width={24} height={24} fill="currentColor" />
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
                        )}
                    </div>
                    <div className={cl("name-author")}>
                        <BaseText size="md" weight="bold" className={cl("name")}>
                            <div ref={titleContainerRef} className={cl("title-container")}>
                                <div
                                    ref={titleRef}
                                    className={cl("title")}
                                    onMouseOver={() => {
                                        const title = titleRef.current!;
                                        const titleContainer = titleContainerRef.current!;

                                        title.style.setProperty("--offset", `${titleContainer.clientWidth - title.scrollWidth}px`);
                                        title.style.setProperty("--duration", `${Math.max(0.5, (title.scrollWidth - titleContainer.clientWidth) / 7)}s`);
                                    }}
                                >
                                    {name}
                                </div>
                            </div>
                            {isNew && <Badge text="NEW" variant="danger" />}
                        </BaseText>
                    </div>
                </div>
            </div>

            <div
                className={cl("note")}
                style={{ lineHeight: "1.25em", fontSize: "small", margin: "12px 0", flex: 1 }}
                title={description ? description.toString() : ""}
            >
                {description}
            </div>

            <div className={cl("bottom-row")}>
                <div className={cl("actions")}>
                    {sourceBadge && (
                        <Tooltip text={tooltip}>
                            {({ onMouseEnter, onMouseLeave }) => (
                                <div
                                    className={cl("source")}
                                    onMouseEnter={onMouseEnter}
                                    onMouseLeave={onMouseLeave}
                                >
                                    {sourceBadge}
                                </div>
                            )}
                        </Tooltip>
                    )}
                    {infoButton}
                </div>
                {setEnabled.toString() !== "() => {}" && (
                    <Switch
                        checked={enabled}
                        onChange={setEnabled}
                        disabled={disabled}
                    />
                )}
            </div>

            {footer && <div className={cl("footer")}>{footer}</div>}
        </div>
    );
}
