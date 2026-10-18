#!/usr/bin/env python3
"""Runtime compatibility shims for the transformers 5.x RoPE refactor.

Why this module exists
----------------------
`qwen-tts-hf` (the library under `faster-qwen3-tts`) registers a fallback
"Default" RoPE initializer, `_default_rope_parameters`, that reads
`config.rope_theta`.  Since transformers 5.15 the codec config
(`MimiConfig`, used by the Qwen3-TTS 12 Hz tokenizer encoder) no longer
exposes a `rope_theta` attribute - the value moved into
`config.rope_parameters["rope_theta"]`.  Loading the real checkpoint on
Kaggle (transformers 5.20.1, floated in by pip) therefore died with:

    AttributeError: 'MimiConfig' object has no attribute 'rope_theta'

and the supervisor restarted the workers forever (reproduced locally
against the exact wheels: transformers 5.20.1 + qwen-tts-hf 0.1.1.post1).

The fix applied here is deliberately version-robust, so it keeps working
even if pip drifts again:

1. `ROPE_INIT_FUNCTIONS["default"]` is replaced with an implementation
   that resolves the RoPE base from, in order: the `rope_theta`
   attribute, the flat `rope_parameters` dict, a per-layer nested
   `rope_parameters` dict, and finally the historical default 10000.0.
   It mirrors the upstream math exactly (same inv_freq formula).
2. `MimiConfig` gains a read-only `rope_theta` property backed by
   `rope_parameters`, so any other direct attribute access also works.
3. The shim is idempotent and reports what it did; the worker logs it.

`py/deps.py` additionally pins the author-tested dependency combo
(transformers 5.18.0) so the Kaggle install is deterministic; this module
is the safety net if that pin is ever unavailable.
"""
from __future__ import annotations

import logging

log = logging.getLogger("qtts.compat")

_APPLIED = False
DEFAULT_ROPE_THETA = 10000.0


def _rope_theta_of(config) -> float:
    """Resolve the RoPE base for any 4.x/5.x-era config object.

    Reads the instance ``__dict__`` directly: after `_patch_mimi_config`
    installs a `rope_theta` property on MimiConfig, a plain `getattr`
    here would re-enter that property and recurse forever.
    """
    store = vars(config) if hasattr(config, "__dict__") else {}
    theta = store.get("rope_theta")
    if not isinstance(theta, (int, float)) or not theta:
        cls_attr = getattr(type(config), "rope_theta", None)
        theta = cls_attr if isinstance(cls_attr, (int, float)) and cls_attr else None
    if isinstance(theta, (int, float)) and theta:
        return float(theta)
    params = store.get("rope_parameters", getattr(config, "rope_parameters", None))
    if isinstance(params, dict):
        theta = params.get("rope_theta")
        if isinstance(theta, (int, float)) and theta:
            return float(theta)
        # nested per-layer dicts: {"full_attention": {...}, ...}
        for sub in params.values():
            if isinstance(sub, dict):
                theta = sub.get("rope_theta")
                if isinstance(theta, (int, float)) and theta:
                    return float(theta)
    return DEFAULT_ROPE_THETA


def _partial_rotary_factor_of(config) -> float:
    factor = getattr(config, "partial_rotary_factor", None)
    if isinstance(factor, (int, float)) and factor:
        return float(factor)
    params = getattr(config, "rope_parameters", None)
    if isinstance(params, dict):
        factor = params.get("partial_rotary_factor")
        if isinstance(factor, (int, float)) and factor:
            return float(factor)
    return 1.0


def safe_default_rope_parameters(config, device=None, seq_len=None, layer_type=None):
    """Drop-in replacement for qwen_tts' `_default_rope_parameters`.

    Same math as upstream (unscaled RoPE, attention_scaling = 1.0), but it
    never assumes `config.rope_theta` exists.
    """
    import torch

    del seq_len, layer_type  # unscaled variant: both are irrelevant
    base = _rope_theta_of(config)
    partial_rotary_factor = _partial_rotary_factor_of(config)
    head_dim = getattr(config, "head_dim", None) or config.hidden_size // config.num_attention_heads
    dim = int(head_dim * partial_rotary_factor)
    inv_freq = 1.0 / (
        base
        ** (
            torch.arange(0, dim, 2, dtype=torch.int64).to(device=device, dtype=torch.float)
            / dim
        )
    )
    return inv_freq, 1.0


def _patch_mimi_config() -> bool:
    """Give `MimiConfig` a `rope_theta` view of `rope_parameters` (5.x-safe)."""
    try:
        from transformers import MimiConfig
    except Exception:  # noqa: BLE001 - transformers absent (mock mode)
        return False
    existing = MimiConfig.__dict__.get("rope_theta")
    if isinstance(existing, property):
        return True

    def _get_rope_theta(self):
        return _rope_theta_of(self)

    try:
        MimiConfig.rope_theta = property(_get_rope_theta)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        return False
    return True


def apply_transformers_rope_compat() -> dict:
    """Install all shims. Idempotent; returns a small report dict.

    Must run AFTER `qwen_tts` has been imported (its package __init__
    registers the fragile fallback) and BEFORE any model construction.
    """
    global _APPLIED
    report = {"registry": False, "mimi_property": False, "already": _APPLIED}
    if _APPLIED:
        return report
    try:
        from transformers.modeling_rope_utils import ROPE_INIT_FUNCTIONS

        ROPE_INIT_FUNCTIONS["default"] = safe_default_rope_parameters
        report["registry"] = True
    except Exception as e:  # noqa: BLE001
        log.warning("could not patch ROPE_INIT_FUNCTIONS: %r", e)
    # Keep the upstream module namespace consistent for any direct imports.
    try:
        import qwen_tts._transformers_compat as _qtc

        _qtc._default_rope_parameters = safe_default_rope_parameters
    except Exception:  # noqa: BLE001 - qwen_tts not installed (mock mode)
        pass
    report["mimi_property"] = _patch_mimi_config()
    _APPLIED = True
    log.info("transformers rope compat applied: %s", report)
    return report
