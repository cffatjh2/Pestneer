param(
    [ValidateSet('nano','tiny','both')][string]$Model = 'both',
    [int]$NanoBatch = 12,
    [int]$TinyBatch = 8,
    [int]$NanoEpochs = 40,
    [int]$TinyEpochs = 50,
    [switch]$SmokeTest
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'vendor/YOLOX'
$runs = Join-Path $root 'runs'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
if (!(Test-Path (Join-Path $vendor 'tools/train.py'))) {
    powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup_yolox.ps1')
}
if (!(Test-Path (Join-Path $vendor 'tools/train.py'))) { throw 'YOLOX vendor klasörü yok. scripts/setup_yolox.ps1 çalıştırın.' }
if (!(Test-Path (Join-Path $root 'data/processed/PestneerVision/annotations/instances_train2017.json'))) {
    python (Join-Path $PSScriptRoot 'prepare_dataset.py')
}
New-Item -ItemType Directory -Force $runs | Out-Null
$safeRuns = 'C:\PestneerVisionRuns'
if (Test-Path $safeRuns) {
    $existingRunsTarget = (Get-Item $safeRuns).Target
    if ($existingRunsTarget -ne $runs) { Remove-Item $safeRuns -Force }
}
if (!(Test-Path $safeRuns)) { New-Item -ItemType Junction -Path $safeRuns -Target $runs | Out-Null }
$env:PESTNEER_VISION_RUNS_DIR = $safeRuns
$dataset = Join-Path $root 'data/processed/PestneerVision'
$safeDataset = 'C:\PestneerVisionData'
if (Test-Path $safeDataset) {
    $existingTarget = (Get-Item $safeDataset).Target
    if ($existingTarget -ne $dataset) { Remove-Item $safeDataset -Force }
}
if (!(Test-Path $safeDataset)) { New-Item -ItemType Junction -Path $safeDataset -Target $dataset | Out-Null }
$env:PESTNEER_VISION_DATA_DIR = $safeDataset
$env:YOLOX_DATADIR = Split-Path -Parent $safeDataset
$common = @('-d','1','--fp16','-l','tensorboard')
$pretrainedDirectory = Join-Path $safeRuns 'pretrained'
New-Item -ItemType Directory -Force $pretrainedDirectory | Out-Null

function Train-One([string]$name, [string]$exp, [int]$batch, [int]$epochs, [string]$checkpointUrl) {
    Write-Host "PestneerVision $name eğitimi başlıyor..."
    $experimentDirectory = Join-Path $safeRuns $name
    if (Test-Path $experimentDirectory -PathType Leaf) {
        Remove-Item $experimentDirectory -Force
    }
    New-Item -ItemType Directory -Force $experimentDirectory | Out-Null
    $pretrained = Join-Path $pretrainedDirectory "$name.pth"
    if (!(Test-Path $pretrained)) {
        Write-Host "Resmi YOLOX on-egitim agirliklari indiriliyor..."
        Invoke-WebRequest -Uri $checkpointUrl -OutFile $pretrained
    }
    if ($SmokeTest) { $overrides = @('max_epoch','1','eval_interval','1','no_aug_epochs','1','warmup_epochs','0') }
    else { $overrides = @('max_epoch',"$epochs",'eval_interval','5','no_aug_epochs','8','warmup_epochs','2') }
    Push-Location $vendor
    try {
        python (Join-Path $PSScriptRoot 'train_yolox.py') -f $exp -expn $name -b $batch -c $pretrained @common @overrides
        if ($LASTEXITCODE -ne 0) { throw "$name eğitimi başarısız oldu." }
        $checkpoint = Join-Path $safeRuns "$name/best_ckpt.pth"
        if (!(Test-Path $checkpoint)) { throw "$name eğitimi checkpoint üretmeden sonlandı." }
    } finally { Pop-Location }
}

if ($Model -in @('nano','both')) { Train-One 'pestneer_yolox_nano' (Join-Path $root 'exps/pestneer_yolox_nano.py') $NanoBatch $NanoEpochs 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.pth' }
if ($Model -in @('tiny','both')) { Train-One 'pestneer_yolox_tiny' (Join-Path $root 'exps/pestneer_yolox_tiny.py') $TinyBatch $TinyEpochs 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.pth' }
