/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tPlugin as t } from "@api/pluginI18n";
import { Button, TextButton } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { React } from "@webpack/common";

import { monitor, useSessions } from "../runtime";
import { Session } from "../types";
import { cl, getDefaultName } from "../utils";

export function RenameModal({ session, accountId, ...props }: ModalProps & { session: Session; accountId: string; }) {
    const snapshot = useSessions();
    const [value, setValue] = React.useState(snapshot.saved.get(session.id_hash)?.name ?? "");
    const [saving, setSaving] = React.useState(false);
    const active = snapshot.accountId === accountId && snapshot.ready && snapshot.saved.has(session.id_hash);
    React.useEffect(() => { if (!active) props.onClose(); }, [active]);

    async function save() {
        if (!active || saving) return;
        setSaving(true);
        const success = await monitor.rename(accountId, session.id_hash, value);
        setSaving(false);
        if (success) props.onClose();
    }

    return (
        <ModalRoot {...props} size={ModalSize.SMALL} aria-label={t("Renommer l'appareil")}>
            <ModalHeader>
                <Heading>{t("Renommer l'appareil")}</Heading>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <ModalContent className={cl("content")}>
                <form onSubmit={event => { event.preventDefault(); void save(); }}>
                    <label className={cl("label")}>
                        {t("Nom de cet appareil")}
                        <input className={cl("input")} autoFocus maxLength={80} value={value} placeholder={getDefaultName(session.client_info)} onChange={event => setValue(event.target.value)} disabled={!active || saving} />
                    </label>
                    <TextButton type="button" onClick={() => setValue("")} disabled={saving}>{t("Rétablir le nom par défaut")}</TextButton>
                    {snapshot.error && <Paragraph color="text-danger" role="alert">{t(snapshot.error)}</Paragraph>}
                </form>
            </ModalContent>
            <ModalFooter>
                <Button onClick={() => void save()} disabled={!active || saving}>{saving ? t("Enregistrement…") : t("Enregistrer")}</Button>
                <Button variant="secondary" onClick={props.onClose}>{t("Annuler")}</Button>
            </ModalFooter>
        </ModalRoot>
    );
}
