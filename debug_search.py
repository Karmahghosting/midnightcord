with open(r"C:\Users\zzafi\Documents\GitHub\midnightcord\src\api\HeaderBar.tsx", "rb") as f:
    raw = f.read()

content = raw.decode("utf-8-sig", errors="replace")

old_func = 'function HeaderBarButtons() {\n    const [, forceUpdate] = useState(0);\n\n    useEffect(() => {\n        const listener = () => forceUpdate(n => n + 1);\n        headerBarListeners.add(listener);\n        stealthListeners.add(listener);\n        window.addEventListener("midnightcord-stealth-change", listener);\n        return () => {\n            headerBarListeners.delete(listener);\n            stealthListeners.delete(listener);\n            window.removeEventListener("midnightcord-stealth-change", listener);\n        };\n    }, []);\n\n    if (isStealthModeEnabled()) return null;\n\n    return (\n        <div className="vc-header-bar-btns" style={{ display: "contents" }}>\n            {Array.from(headerBarButtons)\n                .sort(([, a], [, b]) => a.priority - b.priority)\n                .map(([id, { render: Button }]) => (\n                    <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render header bar button: ${id}`, e.error)}>\n                        <Button />\n                    </ErrorBoundary>\n                ))}\n        </div>\n    );\n}'

print("Looking for old_func:", old_func[:80])
print("Found:", old_func in content)

# Try normalized search
import re
idx = content.find("function HeaderBarButtons()")
print("func starts at:", idx)
print(repr(content[idx:idx+300]))
