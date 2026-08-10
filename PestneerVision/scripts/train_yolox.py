from __future__ import annotations

import runpy
from pathlib import Path

import torch


original_load = torch.load


def trusted_checkpoint_load(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return original_load(*args, **kwargs)


torch.load = trusted_checkpoint_load
tool = Path(__file__).resolve().parents[1] / "vendor" / "YOLOX" / "tools" / "train.py"
runpy.run_path(str(tool), run_name="__main__")
