param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$webRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$rootPrefix = $webRoot.TrimEnd([char]'\') + '\'
$index = Join-Path $webRoot 'index.html'
if (-not [System.IO.File]::Exists($index)) {
    throw 'dist\index.html fehlt. Den gesamten Offline-Ordner zusammen lassen.'
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'
    '.wasm' = 'application/wasm'
    '.onnx' = 'application/octet-stream'
    '.spm' = 'application/octet-stream'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.txt' = 'text/plain; charset=utf-8'
}

$url = 'http://127.0.0.1:4173/'
$runId = [System.Guid]::NewGuid().ToString('N')
$launchUrl = "${url}?demo=1&run=$runId"
$server = [System.Net.HttpListener]::new()
$server.Prefixes.Add($url)
$server.Start()
Write-Host "LokalPingu Demo lokal gestartet: $launchUrl"
Write-Host 'Mit Strg+C beenden.'
if (-not $NoBrowser) {
    try { Start-Process $launchUrl } catch { Write-Warning "Browser konnte nicht geöffnet werden: $_" }
}

try {
    while ($server.IsListening) {
        $context = $server.GetContext()
        $response = $context.Response
        try {
            $method = $context.Request.HttpMethod
            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $response.StatusCode = 405
                continue
            }
            $relative = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if (-not $relative) { $relative = 'index.html' }
            $candidate = [System.IO.Path]::GetFullPath((Join-Path $webRoot ($relative.Replace('/', '\'))))
            if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                continue
            }
            if (-not [System.IO.File]::Exists($candidate)) {
                $response.StatusCode = 404
                continue
            }
            $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
            $file = [System.IO.File]::OpenRead($candidate)
            try {
                $response.ContentLength64 = $file.Length
                if ($method -eq 'GET') { $file.CopyTo($response.OutputStream) }
            } finally {
                $file.Dispose()
            }
        } catch {
            Write-Warning "Anfrage fehlgeschlagen: $_"
        } finally {
            $response.Close()
        }
    }
} finally {
    $server.Stop()
    $server.Close()
}
