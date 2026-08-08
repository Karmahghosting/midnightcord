/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";
import { SearchableSelect } from "@webpack/common";

export interface SafeSearchableSelectOption {
    label: string;
    value: string | number;
    [key: string]: any;
}

export interface SafeSearchableSelectProps {
    options: SafeSearchableSelectOption[];
    value?: any;
    onChange: (value: any) => void;
    placeholder?: string;
    closeOnSelect?: boolean;
    clearable?: boolean;
    multi?: boolean;
    disabled?: boolean;
    renderOptionLabel?: (opt: SafeSearchableSelectOption) => React.ReactNode;
    renderOptionPrefix?: (opt: SafeSearchableSelectOption) => React.ReactNode;
    renderOptionSuffix?: (opt: SafeSearchableSelectOption) => React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    [key: string]: any;
}

const nativeFallbackStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "4px",
    background: "var(--background-tertiary)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-accent)",
    fontSize: "14px",
    cursor: "pointer",
};

/**
 * A safe functional component wrapper around Discord's SearchableSelect.
 * Avoids top-level class extensions (extends React.Component) which cause
 * Reflect.get crashes during initial Webpack module loading.
 */
export function SafeSearchableSelect(props: SafeSearchableSelectProps) {
    const { options, value, onChange, placeholder, className, style, ...rest } = props;

    // SearchableSelect is a LazyComponent (function).
    // When rendered, React calls it with props and passes renderOptionPrefix, multi, etc.
    if (typeof SearchableSelect === "function") {
        return (
            <SearchableSelect
                options={options}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className}
                style={style}
                {...rest}
            />
        );
    }

    // Native HTML fallback
    const singleValue = Array.isArray(value) ? undefined : (value as string | number ?? "");
    return (
        <select
            value={singleValue}
            onChange={e => onChange(e.currentTarget.value)}
            className={className}
            style={{ ...nativeFallbackStyle, ...style }}
        >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {options?.map(opt => (
                <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
