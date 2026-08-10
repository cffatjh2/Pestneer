from __future__ import annotations

import runpy
from pathlib import Path

import torch


original_load = torch.load


def trusted_checkpoint_load(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return original_load(*args, **kwargs)


torch.load = trusted_checkpoint_load
if not hasattr(torch.onnx, "_export"):
    torch.onnx._export = torch.onnx.export
tool = Path(__file__).resolve().parents[1] / "vendor" / "YOLOX" / "tools" / "export_onnx.py"
runpy.run_path(str(tool), run_name="__main__")
