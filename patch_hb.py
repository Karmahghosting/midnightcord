with open(r"C:\Users\zzafi\Documents\GitHub\midnightcord\src\api\HeaderBar.tsx", "rb") as f:
    raw = f.read()
content = raw.decode("utf-8-sig", errors="replace")

old_func = 'function HeaderBarButtons() {\n    const [, forceUpdate] = useState(0);\n\n    useEffect(() => {\n        const listener = () => forceUpdate(n => n + 1);\n        headerBarListeners.add(listener);\n        stealthListeners.add(listener);\n        window.addEventListener("midnightcord-stealth-change", listener);\n        return () => {\n            headerBarListeners.delete(listener);\n            stealthListeners.delete(listener);\n            window.removeEventListener("midnightcord-stealth-change", listener);\n        };\n    }, []);\n\n    if (isStealthModeEnabled()) return null;\n\n    return (\n        <div className="vc-header-bar-btns" style={{ display: "contents" }}>\n            {Array.from(headerBarButtons)\n                .sort(([, a], [, b]) => a.priority - b.priority)\n                .map(([id, { render: Button }]) => (\n                    <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render header bar button: ${id}`, e.error)}>\n                        <Button />\n                    </ErrorBoundary>\n                ))}\n        </div>\n    );\n}'

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
            tooltip="Compact Mode \u2014 Click to expand Midnightcord buttons"
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

content = content.replace(old_func, new_func)
print("Replaced HeaderBarButtons OK")

with open(r"C:\Users\zzafi\Documents\GitHub\midnightcord\src\api\HeaderBar.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("File written OK")
