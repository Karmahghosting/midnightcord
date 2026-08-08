/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { DEFAULT_COLOR, SWATCHES } from "@midnightcordplugins/pinDms/constants";
import { categoryLen, createCategory, getCategory } from "@midnightcordplugins/pinDms/data";
import { classNameFactory } from "@utils/css";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModalLazy } from "@utils/modal";
import { RenderModalProps } from "@vencord/discord-types";
import { extractAndLoadChunksLazy, findComponentByCodeLazy } from "@webpack";
import { ColorPicker, TextInput, Toasts, useMemo, useState } from "@webpack/common";
import { t } from "../../autoTranslateMidnightcord";

interface ColorPickerWithSwatchesProps {
    className?: string;
    defaultColor: number;
    colors: number[];
    value: number;
    disabled?: boolean;
    onChange(value: number | null): void;
    renderDefaultButton?: () => React.ReactNode;
    renderCustomButton?: () => React.ReactNode;
}

const ColorPickerWithSwatches = findComponentByCodeLazy<ColorPickerWithSwatchesProps>('id:"color-picker"');

export const requireSettingsModal = extractAndLoadChunksLazy(['type:"USER_SETTINGS_MODAL_OPEN"']);

const cl = classNameFactory("vc-pindms-modal-");

interface Props {
    categoryId: string | null;
    initialChannelId: string | null;
    modalProps: RenderModalProps;
}

function useCategory(categoryId: string | null, initalChannelId: string | null) {
    const category = useMemo(() => {
        if (categoryId) {
            return getCategory(categoryId);
        } else if (initalChannelId) {
            return {
                id: Toasts.genId(),
                name: t("Pin Category {count}").replace("{count}", (categoryLen() + 1).toString()),
                color: DEFAULT_COLOR,
                collapsed: false,
                channels: [initalChannelId]
            };
        }
    }, [categoryId, initalChannelId]);

    return category;
}

export function NewCategoryModal({ categoryId, modalProps, initialChannelId }: Props) {
    const category = useCategory(categoryId, initialChannelId);
    if (!category) return null;

    const [name, setName] = useState(category.name);
    const [color, setColor] = useState(category.color);

    const onSave = () => {
        category.name = name;
        category.color = color;

        if (!categoryId) {
            createCategory(category);
        }

        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader>
                <Heading tag="h1" variant="heading-lg/semibold">{categoryId ? t("Edit Category") : t("New Category")}</Heading>
            </ModalHeader>
            <ModalContent>
            <form
                className={cl("content")}
                onSubmit={e => {
                    e.preventDefault();
                    onSave();
                }}
            >
                <section>
                    <Heading tag="h5">{t("Name")}</Heading>
                    <TextInput
                        value={name}
                        onChange={e => setName(e)}
                    />
                </section>
                <section>
                    <Heading tag="h5">{t("Color")}</Heading>
                    <ColorPickerWithSwatches
                        className={cl("color-picker")}
                        key={category.id}
                        defaultColor={DEFAULT_COLOR}
                        colors={SWATCHES}
                        onChange={c => setColor(c!)}
                        value={color}
                        renderDefaultButton={() => null}
                        renderCustomButton={() => (
                            <ColorPicker
                                color={color}
                                onChange={c => setColor(c!)}
                                key={category.id}
                                showEyeDropper={false}
                            />
                        )}
                    />
                </section>
            </form>
            </ModalContent>
            <ModalFooter>
                <Button
                    onClick={onSave}
                    disabled={!name}
                >
                    {categoryId ? t("Save") : t("Create")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

export const openCategoryModal = (categoryId: string | null, channelId: string | null) =>
    openModalLazy(async () => {
        await requireSettingsModal();
        return modalProps => <NewCategoryModal categoryId={categoryId} modalProps={modalProps} initialChannelId={channelId} />;
    });
