$ErrorActionPreference = 'Stop'
$projeto = 'D:\Kidy_sales_Intelligence'
$arquivo = Join-Path $projeto 'src\app\cliente\[codigo]\page.tsx'
if (-not (Test-Path -LiteralPath $arquivo)) { throw "Arquivo nao encontrado: $arquivo" }
Set-Location $projeto
$original = [System.IO.File]::ReadAllText($arquivo)
$novo = $original

if ($novo -notmatch 'from ["'']lucide-react["'']') {
    $importacao = 'import { MessageCircle, Phone, Mail, MapPin } from "lucide-react";' + "`r`n"
    $novo = $importacao + $novo
} elseif ($novo -notmatch 'import\s*\{[^}]*\bMessageCircle\b[^}]*\}\s*from\s*["'']lucide-react["'']') {
    throw 'Ja existe importacao de lucide-react. Ajuste manualmente os icones importados para evitar conflito.'
}

$estilo = 'style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, textDecoration: "none" }}'
$substituicoes = @(
    @{
        Nome = 'WhatsApp'
        Padrao = '(?s)(<a\s+href=\{`https://wa\.me/\$\{telefoneBrasil\(zap\)\}\?text=\$\{mensagem\}`\}\s+target="_blank"\s+rel="noopener noreferrer")\s*>\s*WhatsApp\s*</a>'
        Novo = '$1 ' + $estilo + '><MessageCircle size={17} color="#25D366" /><span>WhatsApp</span></a>'
    },
    @{
        Nome = 'Ligar'
        Padrao = '(?s)(<a\s+href=\{`tel:\+\$\{telefoneBrasil\(fone\)\}`\})\s*>\s*Ligar\s*</a>'
        Novo = '$1 ' + $estilo + '><Phone size={17} color="#16803C" /><span>Ligar</span></a>'
    },
    @{
        Nome = 'E-mail'
        Padrao = '(?s)(<a\s+href=\{`mailto:\$\{contato\.email\}\?subject=\$\{encodeURIComponent\("Contato comercial Kidy"\)\}`\})\s*>\s*E-mail\s*</a>'
        Novo = '$1 ' + $estilo + '><Mail size={17} color="#2563EB" /><span>E-mail</span></a>'
    },
    @{
        Nome = 'Google Maps'
        Padrao = '(?s)(<a\s+href=\{`https://www\.google\.com/maps/search/\?api=1&query=\$\{encodeURIComponent\(endereco360\)\}`\}\s+target="_blank"\s+rel="noopener noreferrer"\s+style=\{\{\s*display:\s*"inline-block",\s*marginTop:\s*10\s*\}\})\s*>\s*Abrir rota no Google Maps\s*</a>'
        Novo = '$1><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}><MapPin size={17} color="#EA4335" />Abrir rota no Google Maps</span></a>'
    }
)

foreach ($item in $substituicoes) {
    $matches = [regex]::Matches($novo, $item.Padrao)
    if ($matches.Count -eq 0 -and $novo.Contains('<' + $item.Nome)) {
        Write-Host "Possivelmente ja alterado: $($item.Nome)"
        continue
    }
    if ($matches.Count -ne 1) { throw "Esperada uma ocorrencia de $($item.Nome); encontradas $($matches.Count). Nenhum arquivo foi modificado." }
    $novo = [regex]::Replace($novo, $item.Padrao, $item.Novo)
}

if ($novo -eq $original) { Write-Host 'Nenhuma alteracao necessaria.'; exit 0 }
$backupDir = 'D:\Kidy_sales_Intelligence_BACKUPS'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backup = Join-Path $backupDir ('cliente360-icones-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tsx')
[System.IO.File]::WriteAllText($backup, $original, [System.Text.UTF8Encoding]::new($false))
try {
    [System.IO.File]::WriteAllText($arquivo, $novo, [System.Text.UTF8Encoding]::new($false))
    & npx.cmd tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw "TypeScript falhou (codigo $LASTEXITCODE)" }
    Write-Host "SUCESSO! Backup: $backup" -ForegroundColor Green
} catch {
    [System.IO.File]::WriteAllText($arquivo, $original, [System.Text.UTF8Encoding]::new($false))
    Write-Host 'Arquivo original restaurado.' -ForegroundColor Yellow
    throw
}
