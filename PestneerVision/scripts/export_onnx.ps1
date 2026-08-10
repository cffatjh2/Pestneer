param([ValidateSet('nano','tiny','both')][string]$Model = 'both')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'vendor/YOLOX'
$webModels = Join-Path (Split-Path -Parent $root) 'frontend/public/models/pestneer-vision'
New-Item -ItemType Directory -Force $webModels | Out-Null
$env:PESTNEER_VISION_DATA_DIR = 'C:\PestneerVisionData'
$env:PESTNEER_VISION_RUNS_DIR = 'C:\PestneerVisionRuns'

function Export-One([string]$name, [string]$exp, [string]$fileName) {
    $checkpoint = Join-Path $env:PESTNEER_VISION_RUNS_DIR "$name/best_ckpt.pth"
    if (!(Test-Path $checkpoint)) { throw "Checkpoint bulunamadı: $checkpoint" }
    $output = Join-Path $webModels $fileName
    Push-Location $vendor
    try {
        python (Join-Path $PSScriptRoot 'export_onnx.py') -f $exp -expn $name -c $checkpoint --output-name $output --decode_in_inference -o 17
        if ($LASTEXITCODE -ne 0) { throw "$name ONNX aktarımı başarısız oldu." }
    } finally { Pop-Location }
}

if ($Model -in @('nano','both')) { Export-One 'pestneer_yolox_nano' (Join-Path $root 'exps/pestneer_yolox_nano.py') 'pestneer-vision-nano-v1.onnx' }
if ($Model -in @('tiny','both')) { Export-One 'pestneer_yolox_tiny' (Join-Path $root 'exps/pestneer_yolox_tiny.py') 'pestneer-vision-tiny-v1.onnx' }

$manifest = @{
    version = '1.0.0'
    inputSize = 640
    tileSize = 1280
    tileOverlap = 192
    confidenceThreshold = 0.22
    nmsThreshold = 0.45
    classes = @('fly','bee_wasp','moth_butterfly','beetle','cockroach','grasshopper_cricket','termite','other_insect')
    models = @{
        nano = @{ url = '/models/pestneer-vision/pestneer-vision-nano-v1.onnx'; preferredRuntime = 'wasm' }
        tiny = @{ url = '/models/pestneer-vision/pestneer-vision-tiny-v1.onnx'; preferredRuntime = 'webgpu' }
    }
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $webModels 'manifest.json') -Value $manifest -Encoding utf8
