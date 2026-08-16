import os
from pathlib import Path

import torch.nn as nn
from yolox.exp import Exp as YoloXExp


class Exp(YoloXExp):
    def __init__(self):
        super().__init__()
        self.output_dir = os.environ.get("PESTNEER_VISION_RUNS_DIR", self.output_dir)
        self.num_classes = 8
        self.depth = 0.33
        self.width = 0.25
        self.input_size = (640, 640)
        self.test_size = (640, 640)
        self.multiscale_range = 2
        self.data_dir = os.environ.get("PESTNEER_VISION_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data" / "processed" / "PestneerVision"))
        self.train_ann = "instances_train2017.json"
        self.val_ann = "instances_val2017.json"
        self.test_ann = "instances_test2017.json"
        self.data_num_workers = 0
        self.max_epoch = 80
        self.warmup_epochs = 3
        self.no_aug_epochs = 10
        self.eval_interval = 5
        self.print_interval = 20
        self.save_history_ckpt = False
        self.mosaic_prob = 0.80
        self.mixup_prob = 0.15
        self.enable_mixup = True
        self.hsv_prob = 0.80
        self.flip_prob = 0.50
        self.degrees = 15.0
        self.translate = 0.10
        self.shear = 2.0
        self.mosaic_scale = (0.60, 1.40)
        self.mixup_scale = (0.75, 1.25)
        self.test_conf = 0.15
        self.nmsthre = 0.45
        self.basic_lr_per_img = 0.01 / 64.0
        self.exp_name = os.path.splitext(os.path.basename(__file__))[0]

    def get_model(self, sublinear=False):
        def init_yolo(module):
            for child in module.modules():
                if isinstance(child, nn.BatchNorm2d):
                    child.eps = 1e-3
                    child.momentum = 0.03

        if "model" not in self.__dict__:
            from yolox.models import YOLOPAFPN, YOLOX, YOLOXHead

            in_channels = [256, 512, 1024]
            backbone = YOLOPAFPN(self.depth, self.width, in_channels=in_channels, act=self.act, depthwise=True)
            head = YOLOXHead(self.num_classes, self.width, in_channels=in_channels, act=self.act, depthwise=True)
            self.model = YOLOX(backbone, head)
        self.model.apply(init_yolo)
        self.model.head.initialize_biases(1e-2)
        return self.model

    def get_evaluator(self, batch_size, is_distributed, testdev=False, legacy=False):
        if os.name == "nt":
            import yolox.layers

            if hasattr(yolox.layers, "COCOeval_opt"):
                delattr(yolox.layers, "COCOeval_opt")
        evaluator = super().get_evaluator(batch_size, is_distributed, testdev, legacy)
        evaluator.dataloader.dataset.coco.dataset.setdefault(
            "info", {"description": "PestneerVision sticky-card validation set"}
        )
        return evaluator
