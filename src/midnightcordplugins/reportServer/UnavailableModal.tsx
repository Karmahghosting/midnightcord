/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, LinkButton } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { copyWithToast } from "@utils/discord";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { showToast, Toasts } from "@webpack/common";

const REPORT_GUIDE = "https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord";

export function openReportUnavailable(guild: { id: string; name: string; }, _reason?: string): void {
    openModal(({ transitionState, onClose }) => (
        <ModalRoot transitionState={transitionState} size={ModalSize.SMALL} aria-label="Signalement du serveur indisponible">
            <ModalHeader>
                <Heading tag="h2" style={{ margin: 0 }}>Signaler le serveur</Heading>
            </ModalHeader>
            <ModalContent style={{ padding: "16px", maxHeight: "60vh", overflowY: "auto", overflowWrap: "anywhere" }}>
                <Paragraph>Le formulaire Discord n’a pas pu être ouvert. Aucun signalement n’a été envoyé.</Paragraph>
                <Paragraph><strong>{guild.name}</strong></Paragraph>
                <Paragraph>Identifiant du serveur : <code>{guild.id}</code></Paragraph>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                        void copyWithToast(guild.id, "Identifiant du serveur copié.").catch(() => {
                            showToast("Impossible de copier l’identifiant. Tu peux le sélectionner ci-dessus.", Toasts.Type.FAILURE);
                        });
                    }}
                >
                    Copier l’identifiant
                </Button>
            </ModalContent>
            <ModalFooter>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
                    <LinkButton variant="secondary" size="small" href={REPORT_GUIDE}>Guide officiel Discord</LinkButton>
                    <Button variant="primary" size="small" onClick={onClose}>Fermer</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    ), { modalKey: `midnightcord-report-unavailable-${guild.id}` });
}
