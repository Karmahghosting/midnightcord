/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tPlugin as t } from "@api/pluginI18n";
import { Button } from "@components/Button";
import { openModal } from "@utils/modal";

import { useSessions } from "../runtime";
import { Session } from "../types";
import { cl } from "../utils";
import { RenameModal } from "./RenameModal";

export function RenameButton({ session }: { session: Session; }) {
    const { accountId, ready, saved } = useSessions();
    return (
        <Button
            variant="secondary"
            size="xs"
            className={cl("rename-btn")}
            disabled={!accountId || !ready || !saved.has(session.id_hash)}
            onClick={() => accountId && openModal(props => <RenameModal {...props} session={session} accountId={accountId} />)}
        >
            {t("Renommer")}
        </Button>
    );
}

export function NewButton() {
    return <span className={cl("new-btn")}>{t("Nouveau")}</span>;
}
