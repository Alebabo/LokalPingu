# LokalPingu Tourism Intent Mini v2

## Purpose

This model classifies English tourism guest messages into zero or more of eleven intents:
price, location, check-in, capacity, dietary needs, cancellation, availability, payment,
transport, weather, and suitability. LokalPingu uses those intents to route messages into
deterministic reply logic. The model does not generate prose, supply facts, confirm a booking,
or act for the operator.

## Data

- 19,800 synthetic English tourism enquiries generated with a fixed seed (`20261005`).
- Every record is marked `synthetic: true` in `data/synthetic/tourism-intents-v2.jsonl`.
- Round two adds indirect requests, multi-intent messages, typing errors, and common chat abbreviations.
- No customer messages, personal data, or health data are used.
- The source hackathon brief recommends MASSIVE but provides only a dataset description,
  not training records. MASSIVE is not copied or bundled.

## Architecture

- FNV-1a feature hashing into 2,048 dimensions.
- Lowercased word unigrams, adjacent word bigrams, and character 3-5-grams.
- L2-normalized feature input.
- One linear sigmoid output per intent.
- Conservative policy thresholds, with stricter price and availability thresholds to reduce generic false positives.
- Export size: about 218 KB as TypeScript data.

## Evaluation

Threshold calibration uses 17 manually written messages. A 39-message development set was
used during round-two iteration. A separate 22-message hard free-text audit contains indirect
phrasing, multi-intent requests, abbreviations, and out-of-domain cases. On the same audit,
v1 reached 0.28 micro-F1 and 0.36 exact match; v2 reached 0.84 micro-F1 and 0.77 exact match.
V2 audit precision is 0.90 and recall is 0.79. The audit remains too small for production
claims. It only checks MVP behavior.

## Safety and limits

- English only after translation or direct English input.
- Synthetic language still does not represent real regional phrasing, code-switching, or
  speech-recognition errors well enough for deployment.
- Deterministic rules remain active and can add safety-critical flags even when the model
  misses an intent.
- Prices and business details come only from owner-saved records.
- Availability, allergies, payment, transport, weather, and accessibility remain subject to
  operator confirmation.
- The operator must review and copy every reply. LokalPingu never sends automatically.

## Reproduction

Run `scripts/train_tourism_intent_model_v2.py` from the repository root with the existing Python
3.13 model environment. The script regenerates the JSONL data, TypeScript weights, and
evaluation report deterministically.
