/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { tPlugin as t } from "@api/pluginI18n";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { copyWithToast, openImageModal } from "@utils/discord";
import { Logger } from "@utils/Logger";
import type { RenderModalProps } from "@vencord/discord-types";
import { Alerts, Button, Clickable, closeModal, Menu, Modal, ModalContent, ModalHeader, ModalFooter, ModalCloseButton, NavigationRouter, openModal, Parser, showToast, TextInput, Toasts, useEffect, useState, IconUtils, UserStore } from "@webpack/common";
import { findComponentByCodeLazy } from "@webpack";
import type { ReactNode } from "react";

import { PASSWORD_KEYS, settings } from "./settings";
import { type BookmarkProtectionState, cleanupExpiredBookmarks, clearBookmarks, getBookmarkProtectionState, getVisibleBookmarks, removeBookmark, type VisibleBookmark } from "./store";

const cl = classNameFactory("vc-secure-bookmarks-");
const logger = new Logger("SecureBookmarks");
const SearchBar = findComponentByCodeLazy<any>("#{intl::SEARCH}),ref");

let activeModalKey: string | null = null;

function closeAllSecureBookmarksModals(): void {
    if (!activeModalKey) return;
    closeModal(activeModalKey);
    activeModalKey = null;
}

function formatExpiry(expiresAt: number | null): string {
    if (expiresAt === null) return t("No expiry");
    const diff = expiresAt - Date.now();
    if (diff <= 0) return t("Expired");
    const minutes = Math.ceil(diff / 60_000);
    if (minutes < 60) return `${minutes}${t("m left")}`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 48) return `${hours}${t("h left")}`;
    return `${Math.ceil(hours / 24)}${t("d left")}`;
}

function isExpired(expiresAt: number | null): boolean {
    return expiresAt !== null && expiresAt <= Date.now();
}

function summarizeBookmark(bookmark: VisibleBookmark): string {
    if (bookmark.content.trim()) return bookmark.content.trim();
    if (bookmark.images?.length) return `${bookmark.images.length} ${bookmark.images.length === 1 ? t("image") : t("images")}`;
    if (bookmark.attachmentNames.length) return `${bookmark.attachmentNames.length} ${bookmark.attachmentNames.length === 1 ? t("attachment") : t("attachments")}`;
    if (bookmark.embedCount) return `${bookmark.embedCount} ${bookmark.embedCount === 1 ? t("embed") : t("embeds")}`;
    return t("Saved message");
}

function parsedMessageContent(bookmark: VisibleBookmark): ReactNode {
    const content = summarizeBookmark(bookmark);
    if (!bookmark.content.trim()) return content;
    return Parser.parse(bookmark.content, true, {
        channelId: bookmark.channelId,
        messageId: bookmark.messageId,
        allowLinks: true,
        allowHeading: true,
        allowList: true,
        allowEmojiLinks: true,
        viewingChannelId: bookmark.channelId
    });
}

function jumpToBookmark(bookmark: VisibleBookmark): void {
    NavigationRouter.transitionTo(`/channels/${bookmark.guildId ?? "@me"}/${bookmark.channelId}/${bookmark.messageId}`);
    closeAllSecureBookmarksModals();
}

function BookmarkImages({ bookmark }: { bookmark: VisibleBookmark; }) {
    const images = bookmark.images ?? [];
    if (!images.length) return null;
    return (
        <div className={cl("images")}>
            {images.map(image => (
                <Clickable
                    key={image.url}
                    className={cl("image-button")}
                    onClick={() => openImageModal({
                        url: image.proxyUrl || image.url,
                        original: image.url,
                        width: image.width ?? 1,
                        height: image.height ?? 1
                    })}
                >
                    <img
                        className={cl("image")}
                        src={image.proxyUrl || image.url}
                        alt={image.filename}
                    />
                </Clickable>
            ))}
        </div>
    );
}

// ── Lock icon ────────────────────────────────────────────────────────────────
function LockIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M17 10V7A5 5 0 0 0 7 7v3H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2ZM9 7a3 3 0 1 1 6 0v3H9V7Zm3 6a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Z" />
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M10.42 3.52a1.8 1.8 0 0 1 3.16 0l8.5 15A1.8 1.8 0 0 1 20.5 21h-17a1.8 1.8 0 0 1-1.58-2.48l8.5-15ZM12 9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        </svg>
    );
}

// ── Unlock view ─────────────────────────────────────────────────────────────
interface UnlockViewProps {
    onUnlock: (password: string) => void;
}

function UnlockView({ onUnlock }: UnlockViewProps) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const unlock = () => {
        if (password !== settings.store.password) {
            setError(t("Wrong password. Please try again."));
            return;
        }
        setError("");
        onUnlock(password);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") unlock();
    };

    return (
        <div className={cl("unlock")}>
            <div className={cl("unlock-icon")}>
                <LockIcon />
            </div>
            <div>
                <BaseText tag="h3" size="lg" weight="semibold">{t("Unlock SecureBookmarks")}</BaseText>
                <BaseText size="sm" color="text-muted" style={{ marginTop: 4 }}>
                    {t("Enter your password to access your encrypted bookmarks.")}
                </BaseText>
            </div>
            <div className={cl("unlock-fields")}>
                <TextInput
                    value={password}
                    onChange={setPassword}
                    placeholder={t("Enter your password…")}
                    type="password"
                    autoComplete="current-password"
                    onKeyDown={handleKeyDown}
                />
                {error && (
                    <BaseText size="sm" color="text-danger">
                        {error}
                    </BaseText>
                )}
            </div>
            <Button
                className={cl("unlock-btn")}
                size="medium"
                onClick={unlock}
                disabled={!password}
            >
                Unlock
            </Button>
        </div>
    );
}

// ── Bookmarks list ──────────────────────────────────────────────────────────
interface BookmarksListProps {
    password: string;
}

function BookmarksList({ password }: BookmarksListProps) {
    const [bookmarks, setBookmarks] = useState<VisibleBookmark[]>([]);
    const [pending, setPending] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const reload = () => {
        setPending(true);
        void getVisibleBookmarks(password)
            .then(nextBookmarks => {
                setBookmarks(nextBookmarks);
                setError("");
            })
            .catch(err => {
                logger.error("Failed to decrypt bookmarks.", err);
                setError("Could not decrypt bookmarks with this password.");
            })
            .finally(() => setPending(false));
    };

    useEffect(reload, [password]);

    const remove = (id: string) => {
        void removeBookmark(id)
            .then(reload)
            .then(() => showToast(t("Bookmark removed."), Toasts.Type.SUCCESS));
    };

    const confirmClear = () => {
        Alerts.show({
            title: t("Clear SecureBookmarks"),
            body: t("Are you sure you want to delete all saved bookmarks? This action is irreversible."),
            confirmText: t("Clear all"),
            confirmVariant: "critical-primary",
            cancelText: t("Cancel"),
            onConfirm: () => {
                void clearBookmarks()
                    .then(reload)
                    .then(() => showToast(t("All bookmarks cleared."), Toasts.Type.SUCCESS));
            }
        });
    };

    const filteredBookmarks = bookmarks.filter(bookmark => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const contentMatch = bookmark.content?.toLowerCase().includes(query);
        const authorMatch = bookmark.authorName?.toLowerCase().includes(query);
        const channelMatch = bookmark.channelName?.toLowerCase().includes(query);
        const dateMatch = new Date(bookmark.messageTimestamp).toLocaleString().toLowerCase().includes(query);
        return contentMatch || authorMatch || channelMatch || dateMatch;
    });

    if (pending) return (
        <div className={cl("empty")}>
            <BaseText size="sm" color="text-muted">{t("Loading your bookmarks…")}</BaseText>
        </div>
    );

    if (error) return (
        <div className={cl("empty")}>
            <BaseText size="sm" color="text-danger">{error}</BaseText>
        </div>
    );

    return (
        <div className={cl("list")}>
            {bookmarks.length > 0 && (
                <div className={cl("search-container")}>
                    <SearchBar
                        autoFocus
                        placeholder={t("Search by message, date, or author...")}
                        query={searchQuery}
                        onChange={setSearchQuery}
                        onClear={() => setSearchQuery("")}
                    />
                </div>
            )}
            {!bookmarks.length ? (
                <div className={cl("empty")}>
                    <BaseText tag="h4" size="md" weight="semibold">{t("No bookmarks yet")}</BaseText>
                    <BaseText size="sm" color="text-muted">
                        {t("Save messages using the message context menu to see them here.")}
                    </BaseText>
                </div>
            ) : !filteredBookmarks.length ? (
                <div className={cl("empty")}>
                    <BaseText tag="h4" size="md" weight="semibold">{t("No bookmarks match your search")}</BaseText>
                    <BaseText size="sm" color="text-muted">
                        {t("Try another keyword or clear the search field.")}
                    </BaseText>
                </div>
            ) : (
                <>
                    <div className={cl("toolbar")}>
                        <BaseText size="sm" color="text-muted" weight="medium">
                            {filteredBookmarks.length} {filteredBookmarks.length === 1 ? t("saved bookmark") : t("saved bookmarks")}
                        </BaseText>
                        <Button size="small" color="RED" onClick={confirmClear}>{t("Clear all")}</Button>
                    </div>
                    {filteredBookmarks.map(bookmark => {
                        const expired = isExpired(bookmark.expiresAt);
                        const user = UserStore.getUser(bookmark.authorId);
                        const avatarUrl = user
                            ? (IconUtils.getUserAvatarURL(user, false, 32) ?? IconUtils.getDefaultAvatarURL(user.id))
                            : IconUtils.getDefaultAvatarURL(bookmark.authorId);
                        return (
                            <div className={cl("item")} key={bookmark.id}>
                                <div className={cl("item-header")}>
                                    <div className={cl("item-main")}>
                                        <div className={cl("meta")}>
                                            <img
                                                src={avatarUrl}
                                                className={cl("author-avatar")}
                                                alt=""
                                            />
                                            <BaseText size="sm" weight="semibold" lineClamp={1}>
                                                {bookmark.authorName}
                                            </BaseText>
                                            <span className={cl("channel-badge")}>#{bookmark.channelName}</span>
                                            <span className={cl("expiry-badge", expired && "expired")}>
                                                {formatExpiry(bookmark.expiresAt)}
                                            </span>
                                        </div>
                                        <div className={cl("content")}>
                                            {parsedMessageContent(bookmark)}
                                        </div>
                                        <BookmarkImages bookmark={bookmark} />
                                        <BaseText size="xs" color="text-muted">
                                            {new Date(bookmark.messageTimestamp).toLocaleString()}
                                        </BaseText>
                                    </div>
                                </div>
                                <div className={cl("actions")}>
                                    <Button size="small" onClick={() => jumpToBookmark(bookmark)}>{t("Jump")}</Button>
                                    <Button size="small" color="PRIMARY" onClick={() => copyWithToast(bookmark.link, t("Bookmark link copied."))}>{t("Copy link")}</Button>
                                    <Button size="small" color="PRIMARY" onClick={() => copyWithToast(bookmark.content || summarizeBookmark(bookmark), t("Bookmark text copied."))}>{t("Copy text")}</Button>
                                    <Button size="small" color="RED" onClick={() => remove(bookmark.id)}>{t("Delete")}</Button>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}

// ── Main modal ──────────────────────────────────────────────────────────────
interface SecureBookmarksModalProps {
    modalProps: RenderModalProps;
    close: () => void;
}

function SecureBookmarksModalInner({ modalProps, close }: SecureBookmarksModalProps) {
    const { usePassword, password } = settings.use(PASSWORD_KEYS);
    const [unlockedPassword, setUnlockedPassword] = useState("");
    const [protection, setProtection] = useState<BookmarkProtectionState | null>(null);

    useEffect(() => {
        void getBookmarkProtectionState().then(setProtection);
    }, []);

    const passwordNeeded = Boolean(protection?.hasEncrypted || usePassword && protection?.total);
    const needsUnlock = passwordNeeded && unlockedPassword !== password;

    return (
        <Modal
            {...modalProps}
            size="large"
            className="vc-secure-bookmarks-modal"
        >
            <ModalHeader separator={false}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <BaseText tag="h2" size="lg" weight="semibold">SecureBookmarks</BaseText>
                    <ModalCloseButton onClick={close} />
                </div>
            </ModalHeader>
            <ModalContent style={{ padding: "16px 20px" }}>
                {!protection ? (
                    <div className={cl("empty")}>
                        <BaseText size="sm" color="text-muted">{t("Loading…")}</BaseText>
                    </div>
                ) : passwordNeeded && !password ? (
                    <div className={cl("no-password")}>
                        <div className={cl("no-password-icon")}>
                            <WarningIcon />
                        </div>
                        <div>
                            <BaseText tag="h3" size="lg" weight="semibold">{t("Password not set")}</BaseText>
                            <BaseText size="sm" color="text-muted" style={{ marginTop: 4 }}>
                                {t("Set a SecureBookmarks password in the plugin settings to access your encrypted bookmarks.")}
                            </BaseText>
                        </div>
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                                close();
                            }}
                            style={{ marginTop: 12 }}
                        >
                            Open Settings
                        </Button>
                    </div>
                ) : needsUnlock ? (
                    <UnlockView onUnlock={setUnlockedPassword} />
                ) : (
                    <BookmarksList password={unlockedPassword} />
                )}
            </ModalContent>
            <ModalFooter>
                <Button onClick={close} variant="secondary">
                    Close
                </Button>
            </ModalFooter>
        </Modal>
    );
}

const SecureBookmarksModal = ErrorBoundary.wrap(SecureBookmarksModalInner, { noop: true });

export function openSecureBookmarksModal(): void {
    closeAllSecureBookmarksModals();
    const key = openModal(props => (
        <SecureBookmarksModal
            modalProps={props}
            close={() => {
                closeModal(key);
                activeModalKey = null;
            }}
        />
    ));
    activeModalKey = key;
}

export function renderSecureBookmarksToolboxMenu() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        void cleanupExpiredBookmarks().then(store => setCount(store.records.length));
    }, []);

    return (
        <Menu.MenuItem
            id="secure-bookmarks-menu"
            label={`SecureBookmarks${count ? ` (${count})` : ""}`}
            action={openSecureBookmarksModal}
        >
            <Menu.MenuItem
                id="secure-bookmarks-open"
                label={t("Open bookmarks")}
                action={openSecureBookmarksModal}
            />
            <Menu.MenuItem
                id="secure-bookmarks-clear-expired"
                label={t("Clear expired bookmarks")}
                action={() => {
                    void cleanupExpiredBookmarks()
                        .then(store => {
                            setCount(store.records.length);
                            showToast(t("Expired bookmarks cleared."), Toasts.Type.SUCCESS);
                        });
                }}
            />
        </Menu.MenuItem>
    );
}
