$dest = "C:\Users\zzafi\Documents\GitHub\midnightcord\src\plugins"
$srcVencord = "C:\Users\zzafi\Desktop\vencord&equicord\vencord\src\plugins"
$srcEquicord = "C:\Users\zzafi\Desktop\vencord&equicord\equicord\src\plugins"

$destDirs = Get-ChildItem -Path $dest -Directory

$copiedCount = 0

foreach ($dir in $destDirs) { if ($dir.Name -eq "_core" -or $dir.Name -eq "_api") { continue }
    $pluginName = $dir.Name
    $srcPath = ""

    if (Test-Path "$srcVencord\$pluginName") {
        $srcPath = "$srcVencord\$pluginName"
    } elseif (Test-Path "$srcEquicord\$pluginName") {
        $srcPath = "$srcEquicord\$pluginName"
    }

    if ($srcPath -ne "") {
        Remove-Item -Path $dir.FullName -Recurse -Force
        Copy-Item -Path $srcPath -Destination $dest -Recurse -Force
        $copiedCount++
    }
}
