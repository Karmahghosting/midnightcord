import fs from 'fs';
import path from 'path';

const pluginsDir = path.join(process.cwd(), 'src', 'midnightcordplugins');
const outputFile = path.join(process.cwd(), 'src', 'api', 'detailedPluginDescriptions.ts');

const pluginDirs = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory() && !f.startsWith('_'));

const detailedDescriptions = {};

for (const p of pluginDirs) {
    const indexFile = path.join(pluginsDir, p, 'index.tsx');
    const indexFileTs = path.join(pluginsDir, p, 'index.ts');
    
    let content = '';
    if (fs.existsSync(indexFile)) {
        content = fs.readFileSync(indexFile, 'utf-8');
    } else if (fs.existsSync(indexFileTs)) {
        content = fs.readFileSync(indexFileTs, 'utf-8');
    } else {
        continue;
    }

    // Very naive extraction of the plugin name and description fields
    const nameMatch = content.match(/name:\s*(["'`])(.*?)\1/);
    const descMatch = content.match(/description:\s*(["'`])(.*?)\1/);
    
    if (nameMatch && descMatch) {
        const name = nameMatch[2];
        const shortDesc = descMatch[2];
        
        let detailedDesc = `${shortDesc} `;
        
        // Add some specific instructions based on common Midnightcord plugin features
        if (content.includes('ContextMenu')) {
            detailedDesc += `To use this feature, simply right-click on the relevant element (like a user, message, or image) to open the context menu and find the new options. `;
        }
        if (content.includes('MessagePopover')) {
            detailedDesc += `You will find a new button added directly to the message hover bar (the popover that appears when you hover over a chat message). `;
        }
        if (content.includes('settingsAboutComponent') || content.includes('settings:')) {
            detailedDesc += `Make sure to click the gear icon next to the plugin name to configure its settings to your liking. `;
        }
        if (content.includes('ModalRoot') || content.includes('openModal')) {
            detailedDesc += `Interacting with this plugin will open a detailed pop-up interface where you can manage its functionality. `;
        }
        
        detailedDescriptions[name] = detailedDesc;
    }
}

// Also let's handle Vencord plugins by just providing a fallback in the component, but we can do it here for midnightcord plugins.

const fileContent = `// Auto-generated detailed descriptions for plugins
export const detailedPluginDescriptions: Record<string, string> = ${JSON.stringify(detailedDescriptions, null, 4)};
`;

fs.writeFileSync(outputFile, fileContent);
console.log('Successfully generated detailedPluginDescriptions.ts');
