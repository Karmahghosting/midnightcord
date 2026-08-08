/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Maps a plugin's `name` to the basename (without extension) of its tutorial
 * video in the Midnightcord GitHub repository
 *
 * These are NOT always identical: several videos were uploaded with a different
 * casing (or, in one case, a completely different name) than the plugin's actual
 * `name` field. Since the video URL has to match the file on disk exactly (the
 * GitHub raw endpoint is case-sensitive), we keep this explicit mapping instead of
 * always assuming `${plugin.name}.mp4`.
 */
export const TUTORIAL_VIDEOS: ReadonlyMap<string, string> = new Map([
    ["Abbreviation", "Abbreviation"],
    ["AnonymiseFileNames", "AnonymiseFileNames"],
    ["AntiGroup", "AntiGroup"],
    ["AntiMoveDeco", "AntiMoveDeco"],
    ["AntiNickname", "AntiNickname"],
    ["AudioLimiter", "AudioLimiter"],
    ["AutoCorrect", "AutoCorrect"],
    ["AutoReply", "AutoReply"],
    ["AutoResponder", "AutoResponder"],
    ["AutoUnmute", "AutoUnmute"],
    ["Backpack", "BackPack"],
    ["BulkFriendRemove", "BulkFriendRemove"],
    ["CallTimer", "CallTimer"],
    ["ChannelWallpaper", "ChannelWallpaper"],
    ["CrashHandler", "CrashHandler"],
    ["CreateTheme", "CreateTheme"],
    ["CursorMacOS", "CursorMacOS"],
    ["CustomProfile", "CustomProfile"],
    ["DMBomb", "DMBomb"],
    ["DoubleCall", "DoubleCall"],
    ["DoubleEmoji", "DoubleEmoji"],
    ["EncryptedMessage", "EncryptedMessage"],
    ["EventLogs", "EventLogs"],
    ["ExportDM", "ExportDM"],
    ["Fake Voice Option", "Fake Voice Option"],
    ["FakeDM", "FakeDM"],
    ["FakeFriends", "FakeFriends"],
    ["FakeNitro", "Fakenitro"],
    ["FakePerm", "FakePerm"],
    ["FakeSwitcher", "FakeSwitcher"],
    ["FastPing", "FastPing"],
    ["FloodPanel", "FloodPanel"],
    ["FollowMe", "Followme"],
    ["FollowUser", "FollowUser"],
    ["GhostClient", "GhostClient"],
    ["GifConvertor", "Gifconvertor"],
    ["HideMedia", "HideMedia"],
    ["IgnoreCalls", "IgnoreCalls"],
    ["ImageZoom", "ImageZoom"],
    ["LastSeen", "lastseen"],
    ["LeaveAllServers", "leaveallservers"],
    ["LiveWallpaper", "LiveWallpaper"],
    ["LockGroup", "LockGroup"],
    ["MacOsButtons", "macosbuttons"],
    ["MassDM", "MassDM"],
    ["MemberCount", "MemberCount"],
    ["MessageCleaner", "MessageCleaner"],
    ["MessageLoggerEnhanced", "MessageLoggerEnhanced"],
    ["MultiInstance", "MultiInstance"],
    ["MuteAllServers", "MuteAllServers"],
    ["MidnightcordAI", "midnightcordai"],
    ["PasscodeLock", "passcodeLock"],
    ["PlatformIndicators", "PlatformIndicators"],
    ["PrevNames", "prevnames"],
    ["RealtimeTimestamps", "realtimetimestamps"],
    ["SelfDestruct", "SelfDestruct"],
    ["ServerCloner", "ServerCloner"],
    ["SharePerms", "SharePerms"],
    ["ShowHiddenChannels", "ShowHiddenChannels"],
    ["ShowHiddenThings", "ShowHiddenThings"],
    ["ShowID", "showid"],
    ["SilentDelete", "SilentDelete"],
    ["SilentEdit", "SilentEdit"],
    ["SmoothType", "smoothtype"],
    ["SoundCordPlayer", "SoundCordPlayer"],
    ["StreamProof", "StreamProof"],
    ["TokenImporter", "TokenImporter"],
    ["Translate", "Translate"],
    ["UserVoiceShow", "UserVoiceShow"],
    ["ValidUser", "ValidUser"],
    ["VideoRecorder", "VideoRecorder"],
    ["ViewIcons", "ViewIcons"],
    ["VoiceChannelSearch", "VoiceChannelSearch"],
    ["VoiceDictation", "voicedictation"],
    ["VoiceDownload", "VoiceDownload"],
    ["VoiceMessages", "VoiceMessages"],
    ["VolumeBooster", "VolumeBooster"],
    ["WhosWatching", "WhosWatching"],
    ["YoutubeInDiscord", "youtubeplayer"],
]);

/**
 * Set of plugin names that have a tutorial video available in midnightcord-tutorials.
 * Derived from TUTORIAL_VIDEOS so there's a single source of truth.
 */
export const TUTORIAL_PLUGIN_NAMES: ReadonlySet<string> = new Set(TUTORIAL_VIDEOS.keys());

/**
 * Returns the video basename (no extension) to use in the tutorial URL for a
 * given plugin name, falling back to the plugin name itself if there's no
 * explicit mapping (covers the common case where they're identical).
 */
export function getTutorialVideoName(pluginName: string): string | undefined {
    if (TUTORIAL_VIDEOS.has(pluginName)) return TUTORIAL_VIDEOS.get(pluginName);
    return undefined;
}

/**
 * Synchronously populates the cache from the static list and calls onProgress.
 * No network requests — instant, no CORS issues.
 */
export function loadTutorials(_pluginNames: string[], onProgress: (found: Set<string>) => void) {
    onProgress(new Set(TUTORIAL_PLUGIN_NAMES));
}
