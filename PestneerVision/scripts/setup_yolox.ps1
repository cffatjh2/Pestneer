$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'vendor/YOLOX'
if (!(Test-Path (Join-Path $vendor 'tools/train.py'))) {
    Write-Host 'YOLOX vendor klonlanıyor...'
    New-Item -ItemType Directory -Force (Join-Path $root 'vendor') | Out-Null
    git clone --depth 1 https://github.com/Megvii-BaseDetection/YOLOX.git $vendor
}
$setupEnv = Join-Path $vendor 'yolox/utils/setup_env.py'
if (Test-Path $setupEnv) {
    $content = Get-Content $setupEnv -Raw
    if ($content -notmatch 'os\.name == "nt"') {
        Write-Host 'Windows NCCL yaması uygulanıyor...'
        $patched = @'
#!/usr/bin/env python3
# -*- coding:utf-8 -*-
# Copyright (c) Megvii Inc. All rights reserved.

import os
import subprocess
from loguru import logger

import cv2

from .dist import get_world_size, is_main_process

__all__ = ["configure_nccl", "configure_module", "configure_omp"]


def configure_nccl():
    """Configure multi-machine environment variables of NCCL."""
    os.environ["NCCL_LAUNCH_MODE"] = "PARALLEL"
    if os.name == "nt":
        os.environ.setdefault("NCCL_IB_HCA", "")
        os.environ.setdefault("NCCL_IB_GID_INDEX", "3")
        os.environ.setdefault("NCCL_IB_TC", "106")
        return
    try:
        os.environ["NCCL_IB_HCA"] = subprocess.getoutput(
            "pushd /sys/class/infiniband/ > /dev/null; for i in mlx5_*; "
            "do cat $i/ports/1/gid_attrs/types/* 2>/dev/null "
            "| grep v >/dev/null && echo $i ; done; popd > /dev/null"
        )
    except Exception:
        os.environ["NCCL_IB_HCA"] = ""
    os.environ["NCCL_IB_GID_INDEX"] = "3"
    os.environ["NCCL_IB_TC"] = "106"


def configure_omp(num_threads=1):
    if "OMP_NUM_THREADS" not in os.environ and get_world_size() > 1:
        os.environ["OMP_NUM_THREADS"] = str(num_threads)
        if is_main_process():
            logger.info(
                "We set `OMP_NUM_THREADS` for each process to {} to speed up.".format(
                    os.environ["OMP_NUM_THREADS"]
                )
            )


def configure_module(ulimit_value=8192):
    try:
        import resource
        rlimit = resource.getrlimit(resource.RLIMIT_NOFILE)
        resource.setrlimit(resource.RLIMIT_NOFILE, (ulimit_value, rlimit[1]))
    except Exception:
        pass
    os.environ["OPENCV_OPENCL_RUNTIME"] = "disabled"
    try:
        cv2.setNumThreads(0)
        cv2.ocl.setUseOpenCL(False)
    except Exception:
        pass
'@
        Set-Content -Path $setupEnv -Value $patched -Encoding utf8
    }
}
Push-Location $vendor
try {
    pip install -r requirements.txt -q
    pip install -e . -q
} finally {
    Pop-Location
}
Write-Host 'PestneerVision YOLOX kurulumu hazır.'
