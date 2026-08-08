import { t } from "../autoTranslateMidnightcord";
/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { CommandArgument, CommandContext } from "@vencord/discord-types";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { OpenExternalIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, DraftType, Forms, Menu, PermissionsBits, PermissionStore, React, Select, SelectedChannelStore, showToast, TextInput, UploadManager, useEffect, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.BigFileUpload as PluginNative<typeof import("./native")>;

const UploadStore = findByPropsLazy("getUploads");
const OptionClasses = findByPropsLazy("optionName", "optionIcon", "optionLabel");

function createCloneableStore(initialState: any) {
    const store = { ...initialState };
    const listeners: (() => void)[] = [];
    function get() { return { ...store }; }
    function set(newState: Partial<typeof store>) {
        Object.assign(store, newState);
        listeners.forEach(l => l());
    }
    function subscribe(listener: () => void) {
        listeners.push(listener);
        return () => {
            const index = listeners.indexOf(listener);
            if (index > -1) listeners.splice(index, 1);
        };
    }
    return { get, set, subscribe };
}

function SettingsComponent(props: { setValue(v: any): void; }) {
    const [fileUploader, setFileUploader] = useState(settings.store.fileUploader || "GoFile");
    const [customUploaderStore] = useState(() => createCloneableStore({
        name: settings.store.customUploaderName || "",
        requestURL: settings.store.customUploaderRequestURL || "",
        fileFormName: settings.store.customUploaderFileFormName || "",
        responseType: settings.store.customUploaderResponseType || "",
        url: settings.store.customUploaderURL || "",
        thumbnailURL: settings.store.customUploaderThumbnailURL || "",
        headers: (() => {
            const p = JSON.parse(settings.store.customUploaderHeaders || "{}");
            if (Object.keys(p).length === 0) p[""] = "";
            return p;
        })(),
        args: (() => {
            const p = JSON.parse(settings.store.customUploaderArgs || "{}");
            if (Object.keys(p).length === 0) p[""] = "";
            return p;
        })(),
    }));

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsubscribe = customUploaderStore.subscribe(() => {
            const state = customUploaderStore.get();
            updateSetting("customUploaderName", state.name);
            updateSetting("customUploaderRequestURL", state.requestURL);
            updateSetting("customUploaderFileFormName", state.fileFormName);
            updateSetting("customUploaderResponseType", state.responseType);
            updateSetting("customUploaderURL", state.url);
            updateSetting("customUploaderThumbnailURL", state.thumbnailURL);
            updateSetting("customUploaderHeaders", JSON.stringify(state.headers));
            updateSetting("customUploaderArgs", JSON.stringify(state.args));
        });
        return unsubscribe;
    }, []);

    function updateSetting(key: keyof typeof settings.store, value: any) {
        if (key in settings.store) settings.store[key] = value;
    }

    function handleShareXConfigUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
                try {
                    const config = JSON.parse(e.target?.result as string);
                    customUploaderStore.set({
                        name: config.Name || "",
                        requestURL: config.RequestURL || "",
                        fileFormName: config.FileFormName || "",
                        responseType: config.ResponseType || "Text",
                        url: config.URL || "",
                        thumbnailURL: config.ThumbnailURL || "",
                        headers: config.Headers || { "": "" },
                        args: config.Arguments || { "": "" }
                    });
                    updateSetting("customUploaderName", config.Name || "");
                    updateSetting("customUploaderRequestURL", config.RequestURL || "");
                    updateSetting("customUploaderFileFormName", config.FileFormName || "");
                    updateSetting("customUploaderResponseType", config.ResponseType || "Text");
                    updateSetting("customUploaderURL", config.URL || "");
                    updateSetting("customUploaderThumbnailURL", config.ThumbnailURL || "");
                    updateSetting("customUploaderHeaders", JSON.stringify(config.Headers || { "": "" }));
                    updateSetting("customUploaderArgs", JSON.stringify(config.Arguments || { "": "" }));
                    setFileUploader("Custom");
                    updateSetting("fileUploader", "Custom");
                    showToast("ShareX config imported successfully!");
                } catch (error) {
                    showToast("Error importing ShareX config. Check console for details.");
                }
            };
            reader.readAsText(file);
            event.target.value = "";
        }
    }

    const handleFileUploaderChange = (v: string) => {
        setFileUploader(v);
        updateSetting("fileUploader", v);
    };

    const handleArgChange = (oldKey: string, newKey: string, value: any) => {
        const state = customUploaderStore.get();
        const newArgs = { ...state.args };
        if (oldKey !== newKey) delete newArgs[oldKey];
        if (value === "" && newKey === "") delete newArgs[oldKey];
        else newArgs[newKey] = value;
        customUploaderStore.set({ args: newArgs });
        if (Object.values(newArgs).every(v => v !== "") && Object.keys(newArgs).every(k => k !== "")) {
            newArgs[""] = "";
        }
        customUploaderStore.set({ args: newArgs });
    };

    const handleHeaderChange = (oldKey: string, newKey: string, value: string) => {
        const state = customUploaderStore.get();
        const newHeaders = { ...state.headers };
        if (oldKey !== newKey) delete newHeaders[oldKey];
        if (value === "" && newKey === "") delete newHeaders[oldKey];
        else newHeaders[newKey] = value;
        customUploaderStore.set({ headers: newHeaders });
        if (Object.values(newHeaders).every(v => v !== "") && Object.keys(newHeaders).every(k => k !== "")) {
            newHeaders[""] = "";
        }
        customUploaderStore.set({ headers: newHeaders });
    };

    return (
        <Flex flexDirection="column">
            <Forms.FormSection title={t("Select the file uploader service")}>
                <Select
                    options={[
                        { label: "Custom Uploader", value: "Custom" },
                        { label: "Catbox", value: "Catbox" },
                        { label: "Litterbox", value: "Litterbox" },
                        { label: "GoFile", value: "GoFile" },
                    ]}
                    placeholder="Select the file uploader service"
                    className={Margins.bottom16}
                    select={handleFileUploaderChange}
                    isSelected={v => v === fileUploader}
                    serialize={v => v}
                />
            </Forms.FormSection>

            <Forms.FormSection title={t("Auto-Send Link In Chat")}>
                <Select
                    options={[
                        { label: "Yes", value: "Yes" },
                        { label: "No", value: "No" },
                    ]}
                    placeholder="Select Auto-Send"
                    className={Margins.bottom16}
                    select={newValue => updateSetting("autoSend", newValue)}
                    isSelected={v => v === settings.store.autoSend}
                    serialize={v => v}
                />
            </Forms.FormSection>

            {fileUploader === "GoFile" && (
                <>
                    <Forms.FormDivider />
                    <Forms.FormTitle>GoFile Settings</Forms.FormTitle>
                    <Forms.FormSection title={t("GoFile Token (optional)")}>
                        <TextInput type="text" value={settings.store.gofileToken || ""} placeholder="Insert GoFile Token"
                            onChange={newValue => updateSetting("gofileToken", newValue)} className={Margins.bottom16} />
                    </Forms.FormSection>
                </>
            )}

            {fileUploader === "Catbox" && (
                <>
                    <Forms.FormDivider />
                    <Forms.FormTitle>Catbox Settings</Forms.FormTitle>
                    <Forms.FormSection title={t("Catbox User hash (optional)")}>
                        <TextInput type="text" value={settings.store.catboxUserHash || ""} placeholder="Insert User Hash"
                            onChange={newValue => updateSetting("catboxUserHash", newValue)} className={Margins.bottom16} />
                    </Forms.FormSection>
                </>
            )}

            {fileUploader === "Litterbox" && (
                <>
                    <Forms.FormDivider />
                    <Forms.FormTitle>Litterbox Settings</Forms.FormTitle>
                    <Forms.FormSection title={t("Select the file expiration time")}>
                        <Select
                            options={[
                                { label: "1 hour", value: "1h" },
                                { label: "12 hours", value: "12h" },
                                { label: "24 hours", value: "24h" },
                                { label: "72 hours", value: "72h" },
                            ]}
                            placeholder="Select Duration"
                            className={Margins.bottom16}
                            select={newValue => updateSetting("litterboxTime", newValue)}
                            isSelected={v => v === settings.store.litterboxTime}
                            serialize={v => v}
                        />
                    </Forms.FormSection>
                </>
            )}

            {fileUploader === "Custom" && (
                <>
                    <Forms.FormSection title={t("Request URL")}>
                        <TextInput type="text" value={customUploaderStore.get().requestURL} placeholder="Request URL"
                            onChange={(v: string) => customUploaderStore.set({ requestURL: v })} className={Margins.bottom16} />
                    </Forms.FormSection>
                    <Forms.FormSection title={t("File form name")}>
                        <TextInput type="text" value={customUploaderStore.get().fileFormName} placeholder="File Form Name"
                            onChange={(v: string) => customUploaderStore.set({ fileFormName: v })} className={Margins.bottom16} />
                    </Forms.FormSection>
                    <Forms.FormSection title={t("Response type")}>
                        <Select
                            options={[{ label: "Text", value: "Text" }, { label: "JSON", value: "JSON" }]}
                            placeholder="Select Response Type"
                            className={Margins.bottom16}
                            select={(v: string) => customUploaderStore.set({ responseType: v })}
                            isSelected={(v: string) => v === customUploaderStore.get().responseType}
                            serialize={(v: string) => v}
                        />
                    </Forms.FormSection>
                    <Forms.FormSection title={t("URL (JSON path)")}>
                        <TextInput type="text" value={customUploaderStore.get().url} placeholder="URL (JSON path)"
                            onChange={(v: string) => customUploaderStore.set({ url: v })} className={Margins.bottom16} />
                    </Forms.FormSection>

                    <Forms.FormDivider />
                    <Forms.FormTitle>Custom Uploader Arguments</Forms.FormTitle>
                    {Object.entries(customUploaderStore.get().args).map(([key, value], index) => (
                        <div key={index}>
                            <TextInput type="text" value={key} placeholder="Argument Key"
                                onChange={(newKey: string) => handleArgChange(key, newKey, value as string)} className={Margins.bottom16} />
                            <TextInput type="text" value={value as string} placeholder="Argument Value"
                                onChange={(newValue: string) => handleArgChange(key, key, newValue)} className={Margins.bottom16} />
                        </div>
                    ))}

                    <Forms.FormDivider />
                    <Forms.FormTitle>Headers</Forms.FormTitle>
                    {Object.entries(customUploaderStore.get().headers).map(([key, value], index) => (
                        <div key={index}>
                            <TextInput type="text" value={key} placeholder="Header Key"
                                onChange={(newKey: string) => handleHeaderChange(key, newKey, value as string)} className={Margins.bottom16} />
                            <TextInput type="text" value={value as string} placeholder="Header Value"
                                onChange={(newValue: string) => handleHeaderChange(key, key, newValue)} className={Margins.bottom16} />
                        </div>
                    ))}

                    <Forms.FormDivider />
                    <Forms.FormTitle>Import ShareX Config</Forms.FormTitle>
                    <Button onClick={() => fileInputRef.current?.click()}
                        color={Button.Colors.BRAND} size={Button.Sizes.XLARGE} className={Margins.bottom16}>
                        Select File
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".sxcu" style={{ display: "none" }}
                        onChange={handleShareXConfigUpload} />
                </>
            )}
        </Flex>
    );
}

const settings = definePluginSettings({
    fileUploader: {
        type: OptionType.SELECT,
        options: [
            { label: "Custom Uploader", value: "Custom" },
            { label: "Catbox", value: "Catbox", default: true },
            { label: "Litterbox", value: "Litterbox" },
            { label: "GoFile", value: "GoFile" },
        ],
        description: "Select the file uploader service",
        hidden: true
    },
    gofileToken: { type: OptionType.STRING, default: "", description: "GoFile Token (optional)", hidden: true },
    autoSend: {
        type: OptionType.SELECT,
        options: [{ label: "Yes", value: "Yes" }, { label: "No", value: "No", default: true }],
        description: "Auto-Send", hidden: true
    },
    catboxUserHash: { type: OptionType.STRING, default: "", description: "User hash for Catbox (optional)", hidden: true },
    litterboxTime: {
        type: OptionType.SELECT,
        options: [
            { label: "1 hour", value: "1h", default: true },
            { label: "12 hours", value: "12h" },
            { label: "24 hours", value: "24h" },
            { label: "72 hours", value: "72h" },
        ],
        description: "Duration for files on Litterbox", hidden: true
    },
    customUploaderName: { type: OptionType.STRING, default: "", description: "Name of the custom uploader", hidden: true },
    customUploaderRequestURL: { type: OptionType.STRING, default: "", description: "Request URL", hidden: true },
    customUploaderFileFormName: { type: OptionType.STRING, default: "", description: "File form name", hidden: true },
    customUploaderResponseType: {
        type: OptionType.SELECT,
        options: [{ label: "Text", value: "Text", default: true }, { label: "JSON", value: "JSON" }],
        description: "Response type", hidden: true
    },
    customUploaderURL: { type: OptionType.STRING, default: "", description: "URL (JSON path)", hidden: true },
    customUploaderThumbnailURL: { type: OptionType.STRING, default: "", description: "Thumbnail URL (JSON path)", hidden: true },
    customUploaderHeaders: { type: OptionType.STRING, default: JSON.stringify({}), description: "Headers (JSON string)", hidden: true },
    customUploaderArgs: { type: OptionType.STRING, default: JSON.stringify({}), description: "Arguments (JSON string)", hidden: true },
    customSettings: { type: OptionType.COMPONENT, component: SettingsComponent, description: "Configure custom uploader settings", hidden: false },
}).withPrivateSettings<{
    customUploaderArgs?: Record<string, string>;
    customUploaderHeaders?: Record<string, string>;
}>();

function sendTextToChat(text: string) {
    if (settings.store.autoSend === "No") {
        insertTextIntoChatInputBox(text);
    } else {
        const channelId = SelectedChannelStore.getChannelId();
        sendMessage(channelId, { content: text });
    }
}

async function resolveFile(options: CommandArgument[], ctx: CommandContext): Promise<File | null> {
    for (const opt of options) {
        if (opt.name === "file") {
            const upload = UploadStore.getUpload(ctx.channel.id, opt.name, DraftType.SlashCommand);
            return upload.item.file;
        }
    }
    return null;
}

async function uploadFileToGofile(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const serverResponse = await fetch("https://api.gofile.io/servers");
        const serverData = await serverResponse.json();
        const server = serverData.data.servers[Math.floor(Math.random() * serverData.data.servers.length)].name;
        const uploadResult = await Native.uploadFileToGofileNative(`https://${server}.gofile.io/uploadFile`, arrayBuffer, file.name, file.type);
        if (uploadResult.status === "ok") {
            setTimeout(() => sendTextToChat(`${uploadResult.data.downloadPage} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileToCatbox(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileSizeMB = file.size / (1024 * 1024);
        const uploadResult = await Native.uploadFileToCatboxNative("https://catbox.moe/user/api.php", arrayBuffer, file.name, file.type, settings.store.catboxUserHash);
        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            let finalUrl = uploadResult;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (fileSizeMB >= 150 && videoExts.some(ext => finalUrl.endsWith(ext))) finalUrl = `https://embeds.video/${finalUrl}`;
            setTimeout(() => sendTextToChat(`${finalUrl} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileToLitterbox(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileSizeMB = file.size / (1024 * 1024);
        const uploadResult = await Native.uploadFileToLitterboxNative(arrayBuffer, file.name, file.type, settings.store.litterboxTime);
        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            let finalUrl = uploadResult;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (fileSizeMB >= 150 && videoExts.some(ext => finalUrl.endsWith(ext))) finalUrl = `https://embeds.video/${finalUrl}`;
            setTimeout(() => sendTextToChat(`${finalUrl}`), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileCustom(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileFormName = settings.store.customUploaderFileFormName || "file[]";
        const customArgs = JSON.parse(settings.store.customUploaderArgs || "{}");
        const customHeaders = JSON.parse(settings.store.customUploaderHeaders || "{}");
        const responseType = settings.store.customUploaderResponseType;
        const urlPath = settings.store.customUploaderURL.split(".");
        const finalUrl = await Native.uploadFileCustomNative(settings.store.customUploaderRequestURL, arrayBuffer, file.name, file.type, fileFormName, customArgs, customHeaders, responseType, urlPath);
        if (finalUrl.startsWith("https://") || finalUrl.startsWith("http://")) {
            let finalUrlModified = finalUrl;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (videoExts.some(ext => finalUrlModified.endsWith(ext))) finalUrlModified = `https://embeds.video/${finalUrlModified}`;
            setTimeout(() => sendTextToChat(`${finalUrlModified} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: `Error uploading file: ${error}.` });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFile(file: File, channelId: string) {
    switch (settings.store.fileUploader) {
        case "GoFile": await uploadFileToGofile(file, channelId); break;
        case "Catbox": await uploadFileToCatbox(file, channelId); break;
        case "Litterbox": await uploadFileToLitterbox(file, channelId); break;
        case "Custom": await uploadFileCustom(file, channelId); break;
        default:
            sendBotMessage(channelId, { content: "Error: Unknown uploader selected." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

function triggerFileUpload() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    fileInput.onchange = async event => {
        const target = event.target as HTMLInputElement;
        if (target?.files?.length) {
            const channelId = SelectedChannelStore.getChannelId();
            await uploadFile(target.files[0], channelId);
        } else {
            showToast("No file selected");
        }
    };
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (props.channel.guild_id && !PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel)) return;
    children.splice(1, 0,
        <Menu.MenuItem
            id="upload-big-file"
            label={t("Upload a Big File")}
            iconLeft={OpenExternalIcon}
            action={triggerFileUpload}
        />
    );
};

export default definePlugin({
    name: "BigFileUpload",
    enabledByDefault: false,
    description: "Bypasses Discord's upload limit via GoFile, Catbox, or a custom uploader. Button in the right-click menu or /fileupload command.",
    authors: [Devs.ScattrdBlade],
    settings,
    dependencies: ["CommandsAPI"],
    contextMenus: { "channel-attach": ctxMenuPatch },
    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fileupload",
            description: "Upload a file",
            options: [{
                name: "file",
                description: "The file to upload",
                type: ApplicationCommandOptionType.ATTACHMENT,
                required: true,
            }],
            execute: async (opts, cmdCtx) => {
                const file = await resolveFile(opts, cmdCtx);
                if (file) {
                    await uploadFile(file, cmdCtx.channel.id);
                } else {
                    sendBotMessage(cmdCtx.channel.id, { content: "No file specified!" });
                    UploadManager.clearAll(cmdCtx.channel.id, DraftType.SlashCommand);
                }
            },
        },
    ],
});
