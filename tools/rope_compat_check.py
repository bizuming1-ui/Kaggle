#!/usr/bin/env python3
"""Model experiment: prove the transformers-5.x RoPE crash and its fix.

Background (verified Oct 2026 against the real wheels): with
transformers 5.20.1 + qwen-tts-hf 0.1.1.post1, loading Qwen3-TTS on
Kaggle died with

    AttributeError: 'MimiConfig' object has no attribute 'rope_theta'

because qwen_tts registers a fallback "default" RoPE initializer that
reads `config.rope_theta`, while transformers >= 5.15 moved that value
into `MimiConfig.rope_parameters`.  This script checks, in order:

  1. the upstream crash really happens on a bare `MimiConfig`
     (documentation value; a no-crash here just means upstream fixed it),
  2. `py/compat.py` makes the same call succeed for every config shape
     the loader can produce (attribute-era, dict-era, nested dicts),
     with inv_freq values identical to the upstream formula,
  3. the real 12 Hz tokenizer model (Mimi encoder + Qwen decoder)
     constructs cleanly and `restore_rope_buffers` /
     `restore_mimi_full_attention` run without error,
  4. `MimiConfig().rope_theta` resolves through the compat property.

Exits 0 with "SKIP" when torch/transformers/qwen_tts are not installed
(e.g. the browser-simulator mock stack), so it never breaks other suites.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "py"))


def main() -> int:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        import qwen_tts  # noqa: F401  (import registers the fragile shim)
    except Exception as e:  # noqa: BLE001
        print(f"SKIP rope_compat_check: {type(e).__name__}: {e}")
        return 0

    import torch
    from transformers import MimiConfig
    from transformers.modeling_rope_utils import ROPE_INIT_FUNCTIONS

    print(f"transformers {transformers.__version__}  torch {torch.__version__}")
    failures = []

    def check(name, fn):
        try:
            fn()
            print(f"  PASS {name}")
        except Exception as e:  # noqa: BLE001
            failures.append(name)
            print(f"  FAIL {name}: {type(e).__name__}: {e}")

    # -- 1) document the upstream crash ------------------------------------
    upstream_fn = ROPE_INIT_FUNCTIONS.get("default")
    try:
        upstream_fn(MimiConfig(), None)
        print("  NOTE upstream shim no longer crashes on MimiConfig (fixed upstream?)")
    except AttributeError as e:
        assert "rope_theta" in str(e), str(e)
        print(f"  PASS upstream crash reproduced: AttributeError: {e}")
    except Exception as e:  # noqa: BLE001
        print(f"  NOTE upstream shim raised {type(e).__name__}: {e}")

    # -- 2) apply the compat shim and re-test every config shape -----------
    from compat import apply_transformers_rope_compat, safe_default_rope_parameters

    report = apply_transformers_rope_compat()
    print(f"  compat report: {report}")
    assert report["registry"], "ROPE_INIT_FUNCTIONS['default'] was not replaced"

    def _expected(config, theta=10000.0):
        dim = getattr(config, "head_dim", None) or config.hidden_size // config.num_attention_heads
        return 1.0 / (theta ** (torch.arange(0, dim, 2, dtype=torch.float) / dim))

    def t_mimi():
        cfg = MimiConfig()
        inv, scale = ROPE_INIT_FUNCTIONS["default"](cfg, None)
        assert scale == 1.0 and torch.allclose(inv, _expected(cfg)), "inv_freq mismatch"
        assert cfg.rope_theta == 10000.0, "MimiConfig.rope_theta property broken"

    def t_attr_era():
        from qwen_tts.core.models.configuration_qwen3_tts import Qwen3TTSTalkerConfig

        cfg = Qwen3TTSTalkerConfig()
        assert cfg.rope_theta == 10000
        inv, _ = safe_default_rope_parameters(cfg, None)
        assert torch.allclose(inv, _expected(cfg))

    def t_dict_era():
        cfg = MimiConfig()
        cfg.rope_parameters = {"rope_type": "default", "rope_theta": 5000.0}
        inv, _ = safe_default_rope_parameters(cfg, None)
        assert torch.allclose(inv, _expected(cfg, theta=5000.0))

    def t_nested():
        cfg = MimiConfig()
        cfg.rope_parameters = {"full_attention": {"rope_type": "default", "rope_theta": 2000.0}}
        inv, _ = safe_default_rope_parameters(cfg, None)
        assert torch.allclose(inv, _expected(cfg, theta=2000.0))

    check("MimiConfig via registry", t_mimi)
    check("attribute-era config (talker)", t_attr_era)
    check("dict-era rope_parameters", t_dict_era)
    check("nested rope_parameters", t_nested)

    # -- 3) real tokenizer construction + restore hooks ---------------------
    def t_tokenizer():
        from qwen_tts._transformers_compat import restore_mimi_full_attention, restore_rope_buffers
        from qwen_tts.core.tokenizer_12hz.configuration_qwen3_tts_tokenizer_v2 import (
            Qwen3TTSTokenizerV2Config,
        )
        from qwen_tts.core.tokenizer_12hz.modeling_qwen3_tts_tokenizer_v2 import (
            Qwen3TTSTokenizerV2Model,
        )

        cfg = Qwen3TTSTokenizerV2Config(
            encoder_config={"hidden_size": 512, "num_hidden_layers": 2, "num_attention_heads": 8},
            decoder_config={"codebook_dim": 512, "hidden_size": 512, "num_hidden_layers": 2,
                            "num_attention_heads": 8, "num_key_value_heads": 8, "latent_dim": 512,
                            "decoder_dim": 512, "intermediate_size": 1024},
        )
        with torch.device("meta"):
            model = Qwen3TTSTokenizerV2Model(cfg)
        restore_rope_buffers(model)
        restore_mimi_full_attention(model)

    check("Qwen3TTSTokenizerV2Model construct + restore_*", t_tokenizer)

    if failures:
        print(f"ROPE COMPAT: FAIL ({len(failures)}): {failures}")
        return 1
    print("ROPE COMPAT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
