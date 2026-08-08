import re

with open(r"C:\Users\zzafi\Documents\GitHub\midnightcord\src\api\HeaderBar.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Ajouter import findComponentByCodeLazy si pas déjà présent
if "findComponentByCodeLazy" not in content:
    content = content.replace(
        'import { findComponentByCodeLazy, findCssClassesLazy } from "@webpack";',
        'import { findComponentByCodeLazy, findCssClassesLazy } from "@webpack";'
    )

# 2. Modifier HeaderBarButtons pour support compact
old_func = '''function HeaderBarButtons() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        headerBarListeners.add(listener);
        stealthListeners.add(listener);
        window.addEventListener("midnightcord-stealth-change", listener);
        return () => {
            headerBarListeners.delete(listener);
            stealthListeners.delete(listener);
            window.removeEventListener("midnightcord-stealth-change", listener);
        };
    }, []);

    if (isStealthModeEnabled()) return null;

    return (
        <div className="vc-header-bar-btns" style={{ display: "contents" }}>
            {Array.from(headerBarButtons)
                .sort(([, a], [, b]) => a.priority - b.priority)
                .map(([id, { render: Button }]) => (
                    <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render header bar button: ${id}`, e.error)}>
                        <Button />
                    </ErrorBoundary>
                ))}
        </div>
    );
}'''

new_func = '''const GridVerticalIcon = findComponentByCodeLazy("M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z");

function CompactHeaderBarToggle() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        compactListeners.add(listener);
        window.addEventListener("midnightcord-compact-change", listener);
        return () => {
            compactListeners.delete(listener);
            window.removeEventListener("midnightcord-compact-change", listener);
        };
    }, []);

    return (
        <HeaderBarButton
            icon={GridVerticalIcon}
            tooltip="Compact Mode — Click to expand Midnightcord buttons"
            onClick={toggleCompactMode}
            selected={false}
        />
    );
}

function HeaderBarButtons() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        headerBarListeners.add(listener);
        stealthListeners.add(listener);
        compactListeners.add(listener);
        window.addEventListener("midnightcord-stealth-change", listener);
        window.addEventListener("midnightcord-compact-change", listener);
        return () => {
            headerBarListeners.delete(listener);
            stealthListeners.delete(listener);
            compactListeners.delete(listener);
            window.removeEventListener("midnightcord-stealth-change", listener);
            window.removeEventListener("midnightcord-compact-change", listener);
        };
    }, []);

    if (isStealthModeEnabled()) return null;

    if (isCompactModeEnabled()) {
        return (
            <div className="vc-header-bar-btns" style={{ display: "contents" }}>
                <CompactHeaderBarToggle />
            </div>
        );
    }

    return (
        <div className="vc-header-bar-btns" style={{ display: "contents" }}>
            {Array.from(headerBarButtons)
                .sort(([, a], [, b]) => a.priority - b.priority)
                .map(([id, { render: Button }]) => (
                    <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render header bar button: ${id}`, e.error)}>
                        <Button />
                    </ErrorBoundary>
                ))}
        </div>
    );
}'''

if old_func in content:
    content = content.replace(old_func, new_func)
    print("HeaderBarButtons patched OK")
else:
    print("ERROR: old_func not found")
    # Debug: show nearby text
    idx = content.find("function HeaderBarButtons()")
    print(repr(content[idx:idx+500]))

with open(r"C:\Users\zzafi\Documents\GitHub\midnightcord\src\api\HeaderBar.tsx", "w", encoding="utf-8") as f:
    f.write(content)
